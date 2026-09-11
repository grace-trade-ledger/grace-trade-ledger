/**
 * Import 案件 — §05, §06 STEP 3-7 of the confirmed architecture doc.
 * Create → add cost items (auto-allocated) → finalize (Landed Cost written back + GRACE inventory opened).
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "../db/client";
import * as s from "../db/schema";
import { allocateCostItem, computeLandedCost, type AllocationMethod } from "../logic/landedCost";
import { nextDocumentNo } from "../repo/documentSequence";

export const importsRouter = Router();

importsRouter.get("/", async (_req, res) => {
  res.json(await db.select().from(s.imports).orderBy(s.imports.importNo));
});

importsRouter.get("/:id", async (req, res) => {
  const [imp] = await db.select().from(s.imports).where(eq(s.imports.id, req.params.id));
  if (!imp) return res.status(404).json({ error: "not found" });
  const items = await db.select().from(s.importItems).where(eq(s.importItems.importId, imp.id));
  const costItems = await db.select().from(s.importCostItems).where(eq(s.importCostItems.importId, imp.id));
  const allocationLines = [];
  const corrections = [];
  for (const ci of costItems) {
    allocationLines.push(
      ...(await db.select().from(s.costAllocationLines).where(eq(s.costAllocationLines.importCostItemId, ci.id)))
    );
  }
  for (const it of items) {
    corrections.push(
      ...(await db.select().from(s.importItemCorrections).where(eq(s.importItemCorrections.importItemId, it.id)))
    );
  }
  res.json({ ...imp, items, costItems, allocationLines, corrections });
});

interface CreateImportItemBody {
  productId: string;
  quantity: number;
  unitPrice: number;
}
interface CreateImportBody {
  importDate?: string; etd?: string; eta?: string; arrivalDate?: string;
  supplierId: string; buyerCompanyId: string; currency: string; exchangeRate: number;
  invoiceNo?: string; blAwbNo?: string; containerNo?: string; warehouseId: string; customsBroker?: string;
  items: CreateImportItemBody[];
}

/**
 * Business rule (confirmed 2026-08-28): the exchange rate used for landed cost is *this specific
 * import's own recorded rate* — never a monthly average, never the rate on the day it's paid.
 * It is written once here and never updated by any other endpoint in this file, and `amountJpy`
 * (item.amountOriginal × this rate) is computed and stored right here too — so re-reading an old
 * import always reconstructs exactly the landed cost that was calculated at the time, even if
 * today's real-world FX rate has since moved on.
 */
importsRouter.post("/", async (req, res) => {
  const body = req.body as CreateImportBody;
  const importNo = await nextDocumentNo(body.buyerCompanyId, "IMP");
  const rate = new Decimal(body.exchangeRate);

  const [imp] = await db.insert(s.imports).values({
    importNo,
    importDate: body.importDate, etd: body.etd, eta: body.eta, arrivalDate: body.arrivalDate,
    supplierId: body.supplierId, buyerCompanyId: body.buyerCompanyId, currency: body.currency,
    exchangeRate: rate.toFixed(8), invoiceNo: body.invoiceNo, blAwbNo: body.blAwbNo,
    containerNo: body.containerNo, warehouseId: body.warehouseId, customsBroker: body.customsBroker,
    status: "DRAFT",
  }).returning();

  const items = await db.insert(s.importItems).values(
    body.items.map((it) => {
      const amountOriginal = new Decimal(it.unitPrice).times(it.quantity);
      return {
        importId: imp.id, productId: it.productId, quantity: String(it.quantity),
        unitPrice: String(it.unitPrice), amountOriginal: amountOriginal.toFixed(4),
        amountJpy: amountOriginal.times(rate).toFixed(4),
      };
    })
  ).returning();

  res.status(201).json({ ...imp, items });
});

interface AddCostItemBody {
  costCategory: string;
  amount: number;
  currency: string;
  allocationMethod: AllocationMethod;
  notes?: string;
  /** required when allocationMethod === "MANUAL": { importItemId: amount } */
  manualAmounts?: Record<string, number>;
}

importsRouter.post("/:id/cost-items", async (req, res) => {
  const body = req.body as AddCostItemBody;
  const importId = req.params.id;
  const items = await db.select().from(s.importItems).where(eq(s.importItems.importId, importId));
  if (items.length === 0) return res.status(400).json({ error: "import has no items yet" });

  // BY_WEIGHT needs each product's weight_kg, BY_CBM needs volume_cbm — join in.
  const products = await db.select().from(s.products);
  const productById = Object.fromEntries(products.map((p) => [p.id, p]));

  const [costItem] = await db.insert(s.importCostItems).values({
    importId, costCategory: body.costCategory, amount: String(body.amount), currency: body.currency,
    allocationMethod: body.allocationMethod, notes: body.notes,
  }).returning();

  const basisItems = items.map((it) => ({
    importItemId: it.id,
    amountOriginal: it.amountOriginal,
    weightKg: new Decimal(productById[it.productId]?.weightKg ?? 0).times(it.quantity).toString(),
    volumeCbm: new Decimal(productById[it.productId]?.volumeCbm ?? 0).times(it.quantity).toString(),
    quantity: it.quantity,
    manualAmount: body.manualAmounts?.[it.id],
  }));

  const lines = allocateCostItem(
    { importCostItemId: costItem.id, amount: body.amount, allocationMethod: body.allocationMethod },
    basisItems
  );

  const inserted = await db.insert(s.costAllocationLines).values(
    lines.map((l) => ({
      importCostItemId: l.importCostItemId, importItemId: l.importItemId,
      allocatedAmountJpy: l.allocatedAmount.toFixed(4), allocationBasisValue: l.allocationBasisValue.toFixed(4),
    }))
  ).returning();

  res.status(201).json({ costItem, allocationLines: inserted });
});

/**
 * Edit an import item's quantity/unit price BEFORE finalize (status DRAFT only — once an import
 * is finalized its landed cost is already written into inventory, and corrections from that point
 * on go through the /correct endpoint below instead, which keeps an audit trail rather than
 * silently overwriting numbers that inventory/valuation already depends on).
 * Recomputes amountOriginal/amountJpy using the import's own recorded exchange rate.
 */
interface UpdateImportItemBody { quantity?: number; unitPrice?: number; }
importsRouter.put("/:id/items/:itemId", async (req, res) => {
  const { id: importId, itemId } = req.params;
  const [imp] = await db.select().from(s.imports).where(eq(s.imports.id, importId));
  if (!imp) return res.status(404).json({ error: "import not found" });
  if (imp.status !== "DRAFT") {
    return res.status(400).json({
      error: "Import 已經不是草稿狀態,數量／單價無法直接修改。若已完成 Finalize,請改用「更正」功能。",
    });
  }
  const [item] = await db.select().from(s.importItems).where(eq(s.importItems.id, itemId));
  if (!item || item.importId !== importId) return res.status(404).json({ error: "import item not found" });

  const body = req.body as UpdateImportItemBody;
  const quantity = new Decimal(body.quantity ?? item.quantity);
  const unitPrice = new Decimal(body.unitPrice ?? item.unitPrice);
  if (quantity.lessThanOrEqualTo(0)) return res.status(400).json({ error: "quantity must be > 0" });
  const rate = new Decimal(imp.exchangeRate);
  const amountOriginal = unitPrice.times(quantity);

  const [updated] = await db.update(s.importItems).set({
    quantity: quantity.toString(), unitPrice: unitPrice.toString(),
    amountOriginal: amountOriginal.toFixed(4), amountJpy: amountOriginal.times(rate).toFixed(4),
  }).where(eq(s.importItems.id, itemId)).returning();

  res.json(updated);
});

/**
 * Remove a cost item added by mistake BEFORE finalize (e.g. freight amount entered wrong) —
 * DRAFT only. Deletes its allocation lines too, then the correct amount can be re-added via the
 * existing "新增成本項目" step.
 */
importsRouter.delete("/:id/cost-items/:costItemId", async (req, res) => {
  const { id: importId, costItemId } = req.params;
  const [imp] = await db.select().from(s.imports).where(eq(s.imports.id, importId));
  if (!imp) return res.status(404).json({ error: "import not found" });
  if (imp.status !== "DRAFT") {
    return res.status(400).json({ error: "Import 已經不是草稿狀態,成本項目無法刪除。" });
  }
  const [costItem] = await db.select().from(s.importCostItems).where(eq(s.importCostItems.id, costItemId));
  if (!costItem || costItem.importId !== importId) return res.status(404).json({ error: "cost item not found" });

  await db.delete(s.costAllocationLines).where(eq(s.costAllocationLines.importCostItemId, costItemId));
  await db.delete(s.importCostItems).where(eq(s.importCostItems.id, costItemId));
  res.status(204).send();
});

/**
 * Correct an import item AFTER finalize (status COSTED) — e.g. the real freight invoice came in
 * different from the estimate, or the received quantity count was off. Never edits the original
 * import_items numbers silently: writes an audit row (import_item_corrections) with the before/
 * after landed unit cost, updates the item's running total, and pushes the delta into the
 * inventory lot + an ADJUST inventory transaction so stock value stays consistent.
 */
interface CorrectImportItemBody { quantityDelta?: number; costDelta?: number; reason: string; createdById: string; }
importsRouter.post("/:id/items/:itemId/correct", async (req, res) => {
  const { id: importId, itemId } = req.params;
  const body = req.body as CorrectImportItemBody;
  if (!body.reason?.trim()) return res.status(400).json({ error: "reason is required" });
  if (!body.createdById) return res.status(400).json({ error: "createdById is required (audit trail)" });

  const [imp] = await db.select().from(s.imports).where(eq(s.imports.id, importId));
  if (!imp) return res.status(404).json({ error: "import not found" });
  if (imp.status !== "COSTED") {
    return res.status(400).json({ error: "Import 尚未 Finalize,請直接修改數量／單價即可,不需要用更正功能。" });
  }
  const [item] = await db.select().from(s.importItems).where(eq(s.importItems.id, itemId));
  if (!item || item.importId !== importId) return res.status(404).json({ error: "import item not found" });
  if (item.landedUnitCost === null) return res.status(400).json({ error: "this item has no landed cost yet" });

  const quantityDelta = new Decimal(body.quantityDelta ?? 0);
  const costDelta = new Decimal(body.costDelta ?? 0);
  const newQuantity = new Decimal(item.quantity).plus(quantityDelta);
  if (newQuantity.lessThanOrEqualTo(0)) return res.status(400).json({ error: "corrected quantity must stay > 0" });

  const landedUnitCostBefore = new Decimal(item.landedUnitCost);
  const newLandedTotalCost = new Decimal(item.landedTotalCost ?? 0).plus(costDelta);
  const landedUnitCostAfter = newLandedTotalCost.dividedBy(newQuantity);

  await db.update(s.importItems).set({
    quantity: newQuantity.toString(),
    landedTotalCost: newLandedTotalCost.toFixed(4),
    landedUnitCost: landedUnitCostAfter.toFixed(4),
  }).where(eq(s.importItems.id, itemId));

  const [correction] = await db.insert(s.importItemCorrections).values({
    importItemId: itemId,
    quantityDelta: quantityDelta.toString(),
    costDelta: costDelta.toFixed(4),
    landedUnitCostBefore: landedUnitCostBefore.toFixed(4),
    landedUnitCostAfter: landedUnitCostAfter.toFixed(4),
    reason: body.reason.trim(),
    createdById: body.createdById,
  }).returning();

  // Keep the inventory lot this import opened in sync: re-value it at the corrected unit cost,
  // and if the on-hand quantity itself changed, move it and record a normal ADJUST transaction
  // (so stock history shows exactly what happened and when, same as any other stock movement).
  const [lot] = await db.select().from(s.inventoryLots).where(eq(s.inventoryLots.sourceImportId, importId));
  if (lot) {
    const newLotQty = new Decimal(lot.quantityOnHand).plus(quantityDelta);
    await db.update(s.inventoryLots).set({
      quantityOnHand: newLotQty.toFixed(4), unitCost: landedUnitCostAfter.toFixed(4),
    }).where(eq(s.inventoryLots.id, lot.id));

    if (!quantityDelta.isZero()) {
      await db.insert(s.inventoryTransactions).values({
        companyId: lot.companyId, warehouseId: lot.warehouseId, productId: lot.productId, lotId: lot.id,
        transactionType: "ADJUST", quantity: quantityDelta.toString(), unitCost: landedUnitCostAfter.toFixed(4),
        referenceType: "ImportCorrection", referenceId: correction.id, createdById: body.createdById,
      });
    }
  }

  res.status(201).json({ correction, landedUnitCostAfter: landedUnitCostAfter.toFixed(4), landedTotalCostAfter: newLandedTotalCost.toFixed(4) });
});

/** §29 STEP 5-7 — roll allocations into Landed Unit Cost and open GRACE inventory. */
importsRouter.post("/:id/finalize", async (req, res) => {
  const importId = req.params.id;
  const [imp] = await db.select().from(s.imports).where(eq(s.imports.id, importId));
  if (!imp) return res.status(404).json({ error: "not found" });

  const items = await db.select().from(s.importItems).where(eq(s.importItems.importId, importId));
  const createdById = req.body.createdById as string;
  if (!createdById) return res.status(400).json({ error: "createdById is required (audit trail)" });

  const results = [];
  for (const it of items) {
    const lines = await db.select().from(s.costAllocationLines).where(eq(s.costAllocationLines.importItemId, it.id));
    const landed = computeLandedCost({
      importItemId: it.id, supplierAmountJpy: it.amountJpy, quantity: it.quantity,
      allocatedCosts: lines.map((l) => l.allocatedAmountJpy),
    });
    await db.update(s.importItems).set({
      landedUnitCost: landed.landedUnitCost.toFixed(4), landedTotalCost: landed.landedTotalCost.toFixed(4),
    }).where(eq(s.importItems.id, it.id));

    const [lot] = await db.insert(s.inventoryLots).values({
      companyId: imp.buyerCompanyId, warehouseId: imp.warehouseId, productId: it.productId,
      lotNo: `LOT-${imp.importNo}-${it.productId.slice(0, 8)}`, sourceImportId: imp.id,
      quantityOnHand: it.quantity, unitCost: landed.landedUnitCost.toFixed(4),
    }).returning();

    await db.insert(s.inventoryTransactions).values({
      companyId: imp.buyerCompanyId, warehouseId: imp.warehouseId, productId: it.productId, lotId: lot.id,
      transactionType: "IN", quantity: it.quantity, unitCost: landed.landedUnitCost.toFixed(4),
      referenceType: "Import", referenceId: imp.id, createdById,
    });

    results.push({ importItemId: it.id, landedUnitCost: landed.landedUnitCost.toFixed(4), lotId: lot.id });
  }

  await db.update(s.imports).set({ status: "COSTED" }).where(eq(s.imports.id, importId));
  res.json({ importId, status: "COSTED", results });
});
