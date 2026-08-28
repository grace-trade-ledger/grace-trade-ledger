/** §16-19 售價計算器 — a thin HTTP wrapper around src/logic/pricing.ts. */
import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";
import { priceBreakdown, suggestedSellingPrice, evaluateMinimumMarginGuard } from "../logic/pricing";

export const pricingRouter = Router();

pricingRouter.post("/calculate", async (req, res) => {
  const { companyId, productId, cost, price, additionalCost } = req.body as {
    companyId: string; productId: string; cost: number; price?: number; additionalCost?: number;
  };

  const [policy] = await db
    .select()
    .from(s.productPricingPolicy)
    .where(and(eq(s.productPricingPolicy.companyId, companyId), eq(s.productPricingPolicy.productId, productId)));

  const totalCost = cost + (additionalCost ?? 0);
  const suggested = policy ? suggestedSellingPrice(totalCost, policy.targetMarginPct) : null;

  if (price === undefined) {
    return res.json({
      cost: totalCost,
      targetMarginPct: policy?.targetMarginPct ?? null,
      suggestedPrice: suggested?.toNumber() ?? null,
    });
  }

  const breakdown = priceBreakdown(totalCost, price);
  const guard = policy
    ? evaluateMinimumMarginGuard(totalCost, price, policy.minimumMarginPct, policy.guardMode)
    : null;

  res.json({
    cost: breakdown.cost.toNumber(),
    price: breakdown.price.toNumber(),
    grossProfit: breakdown.grossProfit.toNumber(),
    markupPct: breakdown.markupPct.toNumber(),
    grossMarginPct: breakdown.grossMarginPct.toNumber(),
    suggestedPrice: suggested?.toNumber() ?? null,
    guard,
  });
});
