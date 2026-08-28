/** §20 Dashboard — Import / Inventory / Sales / Profit at a glance, scoped by company. */
import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/client";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (req, res) => {
  const { companyId } = req.query as { companyId?: string };
  const companyFilter = companyId ? sql`and buyer_company_id = ${companyId}` : sql``;
  const invCompanyFilter = companyId ? sql`and company_id = ${companyId}` : sql``;
  const sellerFilter = companyId ? sql`and seller_company_id = ${companyId}` : sql``;

  const [importStats] = (await db.execute(sql`
    select count(*) as import_count, coalesce(sum(amount_jpy), 0) as import_amount
    from imports i join import_items ii on ii.import_id = i.id
    where date_trunc('month', i.import_date) = date_trunc('month', current_date) ${companyFilter}
  `) as any).rows;

  const [invStats] = (await db.execute(sql`
    select coalesce(sum(quantity_on_hand), 0) as total_qty,
           coalesce(sum(quantity_on_hand * unit_cost), 0) as total_value
    from inventory_lots where quantity_on_hand > 0 ${invCompanyFilter}
  `) as any).rows;

  const topInventory = (await db.execute(sql`
    select p.product_code, p.name_local, p.name_ja, p.name_zh, sum(l.quantity_on_hand * l.unit_cost) as value
    from inventory_lots l join products p on p.id = l.product_id
    where l.quantity_on_hand > 0 ${invCompanyFilter}
    group by p.product_code, p.name_local, p.name_ja, p.name_zh order by value desc limit 10
  `)).rows;

  const [salesStats] = (await db.execute(sql`
    select coalesce(sum(total), 0) as sales_incl_tax, coalesce(sum(subtotal), 0) as sales,
      coalesce(sum(subtotal - (
        select coalesce(sum(cost_snapshot * quantity),0) from invoice_items where invoice_id = invoices.id
      )), 0) as gross_profit
    from invoices
    where date_trunc('month', invoice_date) = date_trunc('month', current_date) ${sellerFilter}
  `) as any).rows;

  const expiring = (await db.execute(sql`
    select p.product_code, l.lot_no, l.expiry_date, (l.expiry_date - current_date) as days_left
    from inventory_lots l join products p on p.id = l.product_id
    where l.quantity_on_hand > 0 and l.expiry_date <= current_date + interval '30 days' ${invCompanyFilter}
    order by l.expiry_date asc limit 10
  `)).rows;

  const salesAmount = Number(salesStats.sales); // pre-tax (subtotal) — the basis Gross Margin is defined on, §17
  const grossProfit = Number(salesStats.gross_profit);

  res.json({
    import: { count: Number(importStats.import_count), amountJpy: Number(importStats.import_amount) },
    inventory: { totalQty: Number(invStats.total_qty), totalValue: Number(invStats.total_value), top10: topInventory },
    sales: {
      amountJpy: Number(salesStats.sales_incl_tax),
      amountExTaxJpy: salesAmount,
      grossProfit,
      grossMarginPct: salesAmount > 0 ? grossProfit / salesAmount : 0,
    },
    alerts: { expiring },
  });
});
