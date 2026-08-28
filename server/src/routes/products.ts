import { Router } from "express";
import { eq, and } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "../db/client";
import * as s from "../db/schema";

export const productsRouter = Router();

productsRouter.get("/", async (_req, res) => {
  const rows = await db.select().from(s.products).orderBy(s.products.productCode);
  res.json(rows);
});

productsRouter.get("/:id", async (req, res) => {
  const [row] = await db.select().from(s.products).where(eq(s.products.id, req.params.id));
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
});

productsRouter.post("/", async (req, res) => {
  const [row] = await db.insert(s.products).values(req.body).returning();
  res.status(201).json(row);
});

/** §05.3 — company's current moving-average cost for this product, across all open lots. */
productsRouter.get("/:id/current-cost", async (req, res) => {
  const { companyId } = req.query as { companyId?: string };
  if (!companyId) return res.status(400).json({ error: "companyId is required" });
  const lots = await db.select().from(s.inventoryLots).where(
    and(eq(s.inventoryLots.companyId, companyId), eq(s.inventoryLots.productId, req.params.id))
  );
  const open = lots.filter((l) => new Decimal(l.quantityOnHand).greaterThan(0));
  const totalQty = open.reduce((a, l) => a.plus(l.quantityOnHand), new Decimal(0));
  const totalCost = open.reduce((a, l) => a.plus(new Decimal(l.quantityOnHand).times(l.unitCost)), new Decimal(0));
  const cost = totalQty.isZero() ? new Decimal(0) : totalCost.dividedBy(totalQty);
  res.json({ productId: req.params.id, companyId, quantityOnHand: totalQty.toFixed(4), currentUnitCost: cost.toFixed(4) });
});

productsRouter.put("/:id", async (req, res) => {
  const [row] = await db.update(s.products).set(req.body).where(eq(s.products.id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
});
