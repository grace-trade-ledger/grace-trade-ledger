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
  for (const ci of costItems) {
    allocationLines.push(
      ...(await db.select().from(s.costAllocationLines).where(eq(s.costAllocationLines.importCostItemId, ci.id)))
    );
  }
  res.json({ ...imp, items, costItems, allocationLines });
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
