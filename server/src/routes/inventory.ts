/** §11-13, §21 — Inventory query + Low Stock / Expiry alerts. */
import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";

export const inventoryRouter = Router();

inventoryRouter.get("/", async (req, res) => {
  const { companyId, warehouseId, productId } = req.query as Record<string, string | undefined>;
  const conditions = [];
  if (companyId) conditions.push(eq(s.inventoryLots.companyId, companyId));
  if (warehouseId) conditions.push(eq(s.inventoryLots.warehouseId, warehouseId));
  if (productId) conditions.push(eq(s.inventoryLots.productId, productId));

  const rows = await db
    .select()
    .from(s.inventoryLots)
    .where(conditions.length ? and(...conditions) : undefined);
  res.json(rows);
});

/** §21 Expiry alert — 30 days = warn, 7 days = urgent. */
inventoryRouter.get("/alerts/expiry", async (req, res) => {
  const { companyId } = req.query as Record<string, string | undefined>;
  const rows = await db.execute(sql`
    select l.*, p.product_code, p.name_local,
      (l.expiry_date - current_date) as days_until_expiry
    from inventory_lots l
    join products p on p.id = l.product_id
    where l.quantity_on_hand > 0
      and l.expiry_date is not null
      and l.expiry_date <= current_date + interval '30 days'
      ${companyId ? sql`and l.company_id = ${companyId}` : sql``}
    order by l.expiry_date asc
  `);
  const items = (rows as any).rows.map((r: any) => ({
    ...r,
    severity: Number(r.days_until_expiry) <= 7 ? "URGENT" : "WARN",
  }));
  res.json(items);
});

/** §21 Low Stock alert — total on-hand per product/company below product_pricing_policy.minimum_stock_qty. */
inventoryRouter.get("/alerts/low-stock", async (req, res) => {
  const { companyId } = req.query as Record<string, string | undefined>;
  const rows = await db.execute(sql`
    select pp.company_id, pp.product_id, p.product_code, p.name_local,
      pp.minimum_stock_qty,
      coalesce(sum(l.quantity_on_hand), 0) as on_hand
    from product_pricing_policy pp
    join products p on p.id = pp.product_id
    left join inventory_lots l on l.product_id = pp.product_id and l.company_id = pp.company_id
    where pp.minimum_stock_qty is not null
      ${companyId ? sql`and pp.company_id = ${companyId}` : sql``}
    group by pp.company_id, pp.product_id, p.product_code, p.name_local, pp.minimum_stock_qty
    having coalesce(sum(l.quantity_on_hand), 0) < pp.minimum_stock_qty
  `);
  res.json((rows as any).rows);
});
