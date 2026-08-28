/**
 * §40-41, §52 Sales Order → Delivery.
 * Delivery picks stock FEFO (earliest expiry first — food, §12), deducts GRACE's ledger, and —
 * because §05.6 treats an intercompany customer as "the same transaction, the other company's
 * view" — automatically opens the paired inbound lot on the buyer company's own ledger too.
 *
 * Business rule (confirmed 2026-08-28) — moving average cost and intercompany transfers:
 *   - An intercompany sale (e.g. GRACE → リープ) is an OUTBOUND movement on the seller's own
 *     books, not a new purchase. Outbound movements never blend cost (see applyOutbound in
 *     ../logic/movingAverage.ts) — they only reduce quantity_on_hand. So GRACE's own moving
 *     average cost (a weighted average across GRACE's own lots — see currentUnitCost() in
 *     quotations.ts) is mathematically untouched by shipping to リープ. Seller cost recorded on
 *     the delivery item (`unitCostAtShipment`, below) is always the SELLER's own landed cost
 *     (`lot.unitCost`), never the sale price.
 *   - On the buyer's side, the sale is a genuine receipt: it opens a brand-new lot on the buyer
 *     company's *own* inventory_lots (a different companyId — a completely separate ledger), and
 *     that lot's cost is the *intercompany sales price* (`soItem.unitPrice`), not the seller's
 *     landed cost. GRACE's Landed Cost and the GRACE→リープ transfer price are intentionally two
 *     separate numbers that are never conflated: GRACE's own P&L uses (sale price − landed cost)
 *     as its gross profit; リープ's own downstream costing (its own moving average, computed the
 *     same way from its own lots) is built entirely on the transfer price it actually paid.
 */
import { Router } from "express";
import { eq, and, asc, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "../db/client";
import * as s from "../db/schema";
import { applyOutbound } from "../logic/movingAverage";
import { nextDocumentNo } from "../repo/documentSequence";

export const salesOrdersRouter = Router();

salesOrdersRouter.get("/", async (_req, res) => res.json(await db.select().from(s.salesOrders)));

salesOrdersRouter.get("/:id", async (req, res) => {
  const [so] = await db.select().from(s.salesOrders).where(eq(s.salesOrders.id, req.params.id));
  if (!so) return res.status(404).json({ error: "not found" });
  const items = await db.select().from(s.salesOrderItems).where(eq(s.salesOrderItems.salesOrderId, so.id));
  const deliveries = await db.select().from(s.deliveries).where(eq(s.deliveries.salesOrderId, so.id));
  res.json({ ...so, items, deliveries });
});

/** Direct creation — for the "已確定價格：略過報價" path (§06.1), skipping Quotation entirely. */
salesOrdersRouter.post("/", async (req, res) => {
  const body = req.body as {
    sellerCompanyId: string; customerId: string; currency: string; paymentTerms?: string;
    flowTemplate?: "STANDARD" | "PRICED_ONLY" | "INVOICE_FIRST";
    items: { productId: string; quantity: number; unitPrice: number; discount?: number; taxRate?: number }[];
  };
  const salesOrderNo = await nextDocumentNo(body.sellerCompanyId, "SO");
  const [so] = await db.insert(s.salesOrders).values({
    salesOrderNo, sellerCompanyId: body.sellerCompanyId, customerId: body.customerId, currency: body.currency,
    paymentTerms: body.paymentTerms, flowTemplate: body.flowTemplate ?? "PRICED_ONLY", status: "CONFIRMED",
  }).returning();
  const items = await db.insert(s.salesOrderItems).values(
    body.items.map((it) => {
      const amount = new Decimal(it.unitPrice).minus(it.discount ?? 0).times(it.quantity);
      return {
        salesOrderId: so.id, productId: it.productId, quantity: String(it.quantity), unitPrice: String(it.unitPrice),
        discount: String(it.discount ?? 0), taxRate: String(it.taxRate ?? 0), amount: amount.toFixed(4),
        reservedQuantity: String(it.quantity),
      };
    })
  ).returning();
  res.status(201).json({ ...so, items });
});

interface DeliveryItemBody { salesOrderItemId: string; quantity?: number; }

salesOrdersRouter.post("/:id/deliveries", async (req, res) => {
  const salesOrderId = req.params.id;
  const body = req.body as { warehouseId: string; createdById: string; items?: DeliveryItemBody[] };
  const [so] = await db.select().from(s.salesOrders).where(eq(s.salesOrders.id, salesOrderId));
  if (!so) return res.status(404).json({ error: "not found" });
  const [customer] = await db.select().from(s.customers).where(eq(s.customers.id, so.customerId));

  const soItems = await db.select().from(s.salesOrderItems).where(eq(s.salesOrderItems.salesOrderId, salesOrderId));
  const requestedItems: DeliveryItemBody[] = body.items?.length
    ? body.items
    : soItems.map((it) => ({ salesOrderItemId: it.id }));
  const toShip = requestedItems
    .map((line) => {
      const soItem = soItems.find((it) => it.id === line.salesOrderItemId)!;
      const remaining = new Decimal(soItem.quantity).minus(soItem.deliveredQuantity);
      const qty = line.quantity !== undefined ? new Decimal(line.quantity) : remaining;
      return { soItem, qty };
    });

  if (toShip.every(({ qty }) => qty.lessThanOrEqualTo(0))) {
    return res.status(400).json({ error: "沒有可出貨的數量 / 出荷可能な数量がありません（すでに全量出荷済みの可能性）" });
  }

  const deliveryNo = await nextDocumentNo(so.sellerCompanyId, "DO");
  const [delivery] = await db.insert(s.deliveries).values({
    deliveryNo, salesOrderId, warehouseId: body.warehouseId, status: "SHIPPED",
  }).returning();

  const isIntercompany = !!customer.linkedCompanyId;
  const deliveryItemsOut = [];

  for (const { soItem, qty } of toShip) {
    if (qty.lessThanOrEqualTo(0)) continue;

    const lots = await db.select().from(s.inventoryLots).where(
      and(eq(s.inventoryLots.companyId, so.sellerCompanyId), eq(s.inventoryLots.productId, soItem.productId))
    );
    const fefo = lots
      .filter((l) => new Decimal(l.quantityOnHand).greaterThan(0))
      .sort((a, b) => {
        const ae = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
        const be = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
        return ae - be;
      });

    let remainingToShip = qty;
    for (const lot of fefo) {
      if (remainingToShip.lessThanOrEqualTo(0)) break;
      const available = new Decimal(lot.quantityOnHand);
      const take = Decimal.min(available, remainingToShip);

      await db.update(s.inventoryLots).set({
        quantityOnHand: applyOutbound(lot.quantityOnHand, take).toFixed(4),
      }).where(eq(s.inventoryLots.id, lot.id));

      const [di] = await db.insert(s.deliveryItems).values({
        deliveryId: delivery.id, salesOrderItemId: soItem.id, productId: soItem.productId, lotId: lot.id,
        quantity: take.toFixed(4), unitCostAtShipment: lot.unitCost,
      }).returning();
      deliveryItemsOut.push(di);

      const [outTxn] = await db.insert(s.inventoryTransactions).values({
        companyId: so.sellerCompanyId, warehouseId: body.warehouseId, productId: soItem.productId, lotId: lot.id,
        transactionType: isIntercompany ? "INTERCOMPANY_OUT" : "OUT", quantity: take.negated().toFixed(4),
        unitCost: lot.unitCost, referenceType: "Delivery", referenceId: delivery.id, createdById: body.createdById,
      }).returning();

      if (isIntercompany && customer.linkedCompanyId) {
        // §05.6 — paired inbound lot on the buyer company's own ledger, same action, no re-entry.
        const [buyerLot] = await db.insert(s.inventoryLots).values({
          companyId: customer.linkedCompanyId, warehouseId: body.warehouseId, productId: soItem.productId,
          lotNo: `${lot.lotNo}-IC-${delivery.deliveryNo}`, quantityOnHand: take.toFixed(4),
          unitCost: soItem.unitPrice, expiryDate: lot.expiryDate,
        }).returning();
        await db.insert(s.inventoryTransactions).values({
          companyId: customer.linkedCompanyId, warehouseId: body.warehouseId, productId: soItem.productId,
          lotId: buyerLot.id, transactionType: "INTERCOMPANY_IN", quantity: take.toFixed(4),
          unitCost: soItem.unitPrice, referenceType: "Delivery", referenceId: delivery.id,
          linkedTransactionId: outTxn.id, createdById: body.createdById,
        });
      }

      remainingToShip = remainingToShip.minus(take);
    }

    if (remainingToShip.greaterThan(0)) {
      return res.status(409).json({
        error: "Available Stock 不足 / 在庫不足",
        productId: soItem.productId,
        shortBy: remainingToShip.toFixed(4),
      });
    }

    await db.update(s.salesOrderItems).set({
      deliveredQuantity: new Decimal(soItem.deliveredQuantity).plus(qty).toFixed(4),
    }).where(eq(s.salesOrderItems.id, soItem.id));
  }

  const refreshedItems = await db.select().from(s.salesOrderItems).where(eq(s.salesOrderItems.salesOrderId, salesOrderId));
  const fullyDelivered = refreshedItems.every((it) => new Decimal(it.deliveredQuantity).greaterThanOrEqualTo(it.quantity));
  await db.update(s.salesOrders).set({
    status: fullyDelivered ? "DELIVERED" : "PARTIALLY_DELIVERED",
  }).where(eq(s.salesOrders.id, salesOrderId));

  res.status(201).json({ ...delivery, items: deliveryItemsOut, intercompany: isIntercompany });
});
