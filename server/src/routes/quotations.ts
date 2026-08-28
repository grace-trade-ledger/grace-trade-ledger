/** §35-39 Quotation — versioned, auto profit calc, one-click convert to Sales Order. */
import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "../db/client";
import * as s from "../db/schema";
import { priceBreakdown } from "../logic/pricing";
import { nextDocumentNo } from "../repo/documentSequence";

export const quotationsRouter = Router();

interface QuoteItemBody { productId: string; quantity: number; unitPrice: number; unit?: string; discount?: number; taxRate?: number; }
interface CreateQuoteBody {
  sellerCompanyId: string; customerId: string; currency: string;
  validUntil?: string; paymentTerms?: string; deliveryTerms?: string;
  billingAddress?: string; shippingAddress?: string; contactPerson?: string;
  createdById: string; items: QuoteItemBody[];
}

async function currentUnitCost(companyId: string, productId: string): Promise<Decimal> {
  // §05.3 — use the company's current moving-average cost: weighted average across open lots.
  const lots = await db.select().from(s.inventoryLots).where(
    and(eq(s.inventoryLots.companyId, companyId), eq(s.inventoryLots.productId, productId))
  );
  const open = lots.filter((l) => new Decimal(l.quantityOnHand).greaterThan(0));
  if (open.length === 0) return new Decimal(0);
  const totalQty = open.reduce((a, l) => a.plus(l.quantityOnHand), new Decimal(0));
  const totalCost = open.reduce((a, l) => a.plus(new Decimal(l.quantityOnHand).times(l.unitCost)), new Decimal(0));
  return totalQty.isZero() ? new Decimal(0) : totalCost.dividedBy(totalQty);
}

async function buildItemRows(sellerCompanyId: string, quotationVersionId: string, items: QuoteItemBody[]) {
  const rows = [];
  for (const it of items) {
    const cost = await currentUnitCost(sellerCompanyId, it.productId);
    const b = priceBreakdown(cost, it.unitPrice);
    const amount = new Decimal(it.unitPrice).minus(it.discount ?? 0).times(it.quantity);
    rows.push({
      quotationVersionId, productId: it.productId, quantity: String(it.quantity), unit: it.unit,
      unitPrice: String(it.unitPrice), discount: String(it.discount ?? 0), taxRate: String(it.taxRate ?? 0),
      amount: amount.toFixed(4), costSnapshot: cost.toFixed(4),
      grossProfit: b.grossProfit.times(it.quantity).toFixed(4), grossMarginPct: b.grossMarginPct.toFixed(4),
    });
  }
  return rows;
}

quotationsRouter.get("/", async (_req, res) => res.json(await db.select().from(s.quotations)));

quotationsRouter.get("/:id", async (req, res) => {
  const [q] = await db.select().from(s.quotations).where(eq(s.quotations.id, req.params.id));
  if (!q) return res.status(404).json({ error: "not found" });
  const versions = await db.select().from(s.quotationVersions).where(eq(s.quotationVersions.quotationId, q.id)).orderBy(desc(s.quotationVersions.versionNo));
  const currentVersion = versions.find((v) => v.isCurrent) ?? versions[0];
  const items = currentVersion
    ? await db.select().from(s.quotationItems).where(eq(s.quotationItems.quotationVersionId, currentVersion.id))
    : [];
  res.json({ ...q, versions, currentItems: items });
});

quotationsRouter.post("/", async (req, res) => {
  const body = req.body as CreateQuoteBody;
  const quotationNo = await nextDocumentNo(body.sellerCompanyId, "QT");
  const [q] = await db.insert(s.quotations).values({
    quotationNo, sellerCompanyId: body.sellerCompanyId, customerId: body.customerId, currency: body.currency,
    validUntil: body.validUntil, paymentTerms: body.paymentTerms, deliveryTerms: body.deliveryTerms,
    billingAddress: body.billingAddress, shippingAddress: body.shippingAddress, contactPerson: body.contactPerson,
    status: "DRAFT", currentVersionNo: 1,
  }).returning();
  const [v1] = await db.insert(s.quotationVersions).values({
    quotationId: q.id, versionNo: 1, createdById: body.createdById, isCurrent: true,
  }).returning();
  const itemRows = await buildItemRows(body.sellerCompanyId, v1.id, body.items);
  const items = await db.insert(s.quotationItems).values(itemRows).returning();
  res.status(201).json({ ...q, version: v1, items });
});

/** §38 版本管理 — never overwrite; mark the previous version not-current, insert a new one. */
quotationsRouter.post("/:id/versions", async (req, res) => {
  const quotationId = req.params.id;
  const [q] = await db.select().from(s.quotations).where(eq(s.quotations.id, quotationId));
  if (!q) return res.status(404).json({ error: "not found" });
  const body = req.body as { createdById: string; remarks?: string; items: QuoteItemBody[] };

  await db.update(s.quotationVersions).set({ isCurrent: false }).where(eq(s.quotationVersions.quotationId, quotationId));
  const nextVersionNo = q.currentVersionNo + 1;
  const [v] = await db.insert(s.quotationVersions).values({
    quotationId, versionNo: nextVersionNo, createdById: body.createdById, remarks: body.remarks, isCurrent: true,
  }).returning();
  const itemRows = await buildItemRows(q.sellerCompanyId, v.id, body.items);
  const items = await db.insert(s.quotationItems).values(itemRows).returning();
  await db.update(s.quotations).set({ currentVersionNo: nextVersionNo }).where(eq(s.quotations.id, quotationId));
  res.status(201).json({ version: v, items });
});

/** §39 報價轉訂單 — carries every product/qty/price over, no re-entry. */
quotationsRouter.post("/:id/convert-to-sales-order", async (req, res) => {
  const quotationId = req.params.id;
  const [q] = await db.select().from(s.quotations).where(eq(s.quotations.id, quotationId));
  if (!q) return res.status(404).json({ error: "not found" });
  const [version] = await db.select().from(s.quotationVersions).where(
    and(eq(s.quotationVersions.quotationId, quotationId), eq(s.quotationVersions.isCurrent, true))
  );
  const items = await db.select().from(s.quotationItems).where(eq(s.quotationItems.quotationVersionId, version.id));

  const salesOrderNo = await nextDocumentNo(q.sellerCompanyId, "SO");
  const [so] = await db.insert(s.salesOrders).values({
    salesOrderNo, sourceQuotationVersionId: version.id, sellerCompanyId: q.sellerCompanyId,
    customerId: q.customerId, currency: q.currency, paymentTerms: q.paymentTerms,
    flowTemplate: "STANDARD", status: "CONFIRMED",
  }).returning();
  const soItems = await db.insert(s.salesOrderItems).values(
    items.map((it) => ({
      salesOrderId: so.id, productId: it.productId, quantity: it.quantity, unitPrice: it.unitPrice,
      discount: it.discount, taxRate: it.taxRate, amount: it.amount, reservedQuantity: it.quantity,
    }))
  ).returning();
  await db.update(s.quotations).set({ status: "ACCEPTED" }).where(eq(s.quotations.id, quotationId));

  res.status(201).json({ ...so, items: soItems });
});
