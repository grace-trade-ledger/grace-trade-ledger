/** §42-46 Invoice ／ Payment — pulls straight from Delivery or Sales Order, never re-typed. */
import { Router } from "express";
import { eq, and } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "../db/client";
import * as s from "../db/schema";
import { priceBreakdown } from "../logic/pricing";
import { nextDocumentNo } from "../repo/documentSequence";

export const invoicesRouter = Router();

invoicesRouter.get("/", async (_req, res) => res.json(await db.select().from(s.invoices)));

invoicesRouter.get("/:id", async (req, res) => {
  const [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, req.params.id));
  if (!inv) return res.status(404).json({ error: "not found" });
  const items = await db.select().from(s.invoiceItems).where(eq(s.invoiceItems.invoiceId, inv.id));
  const payments = await db.select().from(s.payments).where(eq(s.payments.invoiceId, inv.id));
  res.json({ ...inv, items, payments });
});

/**
 * §42 — body: { salesOrderId, deliveryId?, dueDate? }
 * With deliveryId: bills exactly what was shipped (unit cost snapshot = unit_cost_at_shipment).
 * Without deliveryId (INVOICE_FIRST template, §06.1 "先請款後出貨"): bills the full Sales Order.
 */
invoicesRouter.post("/", async (req, res) => {
  const body = req.body as { salesOrderId: string; deliveryId?: string; dueDate?: string };
  const [so] = await db.select().from(s.salesOrders).where(eq(s.salesOrders.id, body.salesOrderId));
  if (!so) return res.status(404).json({ error: "sales order not found" });

  if (body.deliveryId) {
    const already = await db.select().from(s.invoices).where(eq(s.invoices.deliveryId, body.deliveryId));
    if (already.length > 0) {
      return res.status(409).json({ error: "此出貨單已開立請款單 / この出荷はすでに請求済みです", invoiceNo: already[0].invoiceNo });
    }
  }

  let lineSource: { productId: string; quantity: string; unitPrice: string; taxRate: string; costSnapshot: string }[];

  if (body.deliveryId) {
    const dItems = await db.select().from(s.deliveryItems).where(eq(s.deliveryItems.deliveryId, body.deliveryId));
    const soItems = await db.select().from(s.salesOrderItems).where(eq(s.salesOrderItems.salesOrderId, so.id));
    lineSource = dItems.map((di) => {
      const soItem = soItems.find((it) => it.id === di.salesOrderItemId)!;
      return { productId: di.productId, quantity: di.quantity, unitPrice: soItem.unitPrice, taxRate: soItem.taxRate, costSnapshot: di.unitCostAtShipment };
    });
  } else {
    const soItems = await db.select().from(s.salesOrderItems).where(eq(s.salesOrderItems.salesOrderId, so.id));
    lineSource = soItems.map((it) => ({ productId: it.productId, quantity: it.quantity, unitPrice: it.unitPrice, taxRate: it.taxRate, costSnapshot: "0" }));
  }

  let subtotal = new Decimal(0);
  let tax = new Decimal(0);
  const itemRows = lineSource.map((l) => {
    const amount = new Decimal(l.unitPrice).times(l.quantity);
    const lineTax = amount.times(l.taxRate);
    subtotal = subtotal.plus(amount);
    tax = tax.plus(lineTax);
    const b = priceBreakdown(l.costSnapshot, l.unitPrice);
    return {
      productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate,
      amount: amount.toFixed(4), costSnapshot: l.costSnapshot,
      grossProfit: b.grossProfit.times(l.quantity).toFixed(4), grossMarginPct: b.grossMarginPct.toFixed(4),
    };
  });

  const invoiceNo = await nextDocumentNo(so.sellerCompanyId, "INV");
  const [invoice] = await db.insert(s.invoices).values({
    invoiceNo, sellerCompanyId: so.sellerCompanyId, customerId: so.customerId, salesOrderId: so.id,
    deliveryId: body.deliveryId, dueDate: body.dueDate, currency: so.currency,
    subtotal: subtotal.toFixed(4), tax: tax.toFixed(4), total: subtotal.plus(tax).toFixed(4), status: "ISSUED",
  }).returning();
  const items = await db.insert(s.invoiceItems).values(itemRows.map((r) => ({ ...r, invoiceId: invoice.id }))).returning();

  res.status(201).json({ ...invoice, items, payments: [] });
});

/** §44-45 — records a payment and recomputes Outstanding Amount / Invoice status. */
invoicesRouter.post("/:id/payments", async (req, res) => {
  const invoiceId = req.params.id;
  const [invoice] = await db.select().from(s.invoices).where(eq(s.invoices.id, invoiceId));
  if (!invoice) return res.status(404).json({ error: "not found" });
  const body = req.body as { paymentAmount: number; paymentDate?: string; paymentMethod?: string; bankAccount?: string };

  const existing = await db.select().from(s.payments).where(eq(s.payments.invoiceId, invoiceId));
  const paidSoFar = existing.reduce((a, p) => a.plus(p.paymentAmount), new Decimal(0));
  const newPaid = paidSoFar.plus(body.paymentAmount);
  const outstanding = new Decimal(invoice.total).minus(newPaid);

  const paymentNo = await nextDocumentNo(invoice.sellerCompanyId, "PAY");
  const [payment] = await db.insert(s.payments).values({
    paymentNo, invoiceId, customerId: invoice.customerId, paymentDate: body.paymentDate ? new Date(body.paymentDate) : undefined,
    paymentAmount: String(body.paymentAmount), paymentMethod: body.paymentMethod, bankAccount: body.bankAccount,
    outstandingAmount: outstanding.toFixed(4),
  }).returning();

  const status = outstanding.lessThanOrEqualTo(0) ? "PAID" : "PARTIALLY_PAID";
  await db.update(s.invoices).set({ status }).where(eq(s.invoices.id, invoiceId));

  res.status(201).json({ payment, outstanding: outstanding.toFixed(4), invoiceStatus: status });
});
