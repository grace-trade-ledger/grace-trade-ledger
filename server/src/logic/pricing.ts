/**
 * §05.4 售價計算機：Markup 與 Gross Margin 的區分
 * §05.5 最低售價保護（Minimum Margin Guard）
 *
 * Suggested Selling Price = Total Cost ÷ ( 1 − Target Gross Margin % )
 * Markup %       = ( Price − Cost ) ÷ Cost
 * Gross Margin % = ( Price − Cost ) ÷ Price
 */
import Decimal from "decimal.js";

export type GuardMode = "WARNING_ONLY" | "APPROVAL_REQUIRED" | "BLOCKED";

export interface PriceBreakdown {
  cost: Decimal;
  price: Decimal;
  grossProfit: Decimal;
  markupPct: Decimal; // e.g. 0.2 = 20%
  grossMarginPct: Decimal; // e.g. 0.1667 = 16.67%
}

export function priceBreakdown(cost: Decimal.Value, price: Decimal.Value): PriceBreakdown {
  const c = new Decimal(cost);
  const p = new Decimal(price);
  const grossProfit = p.minus(c);
  const markupPct = c.isZero() ? new Decimal(0) : grossProfit.dividedBy(c);
  const grossMarginPct = p.isZero() ? new Decimal(0) : grossProfit.dividedBy(p);
  return { cost: c, price: p, grossProfit, markupPct, grossMarginPct };
}

/** Suggested Selling Price = Total Cost ÷ ( 1 − Target Gross Margin % ), rounded to nearest whole currency unit. */
export function suggestedSellingPrice(
  totalCost: Decimal.Value,
  targetGrossMarginPct: Decimal.Value
): Decimal {
  const cost = new Decimal(totalCost);
  const margin = new Decimal(targetGrossMarginPct);
  if (margin.greaterThanOrEqualTo(1)) {
    throw new Error("targetGrossMarginPct must be < 1 (100%)");
  }
  return cost.dividedBy(new Decimal(1).minus(margin)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

export interface GuardEvaluation {
  ok: boolean;
  belowMinimum: boolean;
  grossMarginPct: Decimal;
  minimumMarginPct: Decimal;
  guardMode: GuardMode;
  /** what the UI/API should do */
  action: "ALLOW" | "WARN" | "REQUIRE_APPROVAL" | "BLOCK";
  message?: string;
}

/**
 * §05.5 — evaluate a proposed price against the product's minimum-margin policy.
 *
 * Business rule (confirmed 2026-08-28): system-wide default is WARNING_ONLY — a below-minimum
 * price only shows a warning pill (action: "WARN", ok: true). It never blocks the quotation and
 * never requires approval. APPROVAL_REQUIRED / BLOCKED exist and work per-product
 * (`product_pricing_policy.guard_mode`) for if that's ever wanted for a specific product later,
 * but nothing in the seed data or UI currently turns them on.
 */
export function evaluateMinimumMarginGuard(
  cost: Decimal.Value,
  price: Decimal.Value,
  minimumMarginPct: Decimal.Value,
  guardMode: GuardMode
): GuardEvaluation {
  const { grossMarginPct } = priceBreakdown(cost, price);
  const minMargin = new Decimal(minimumMarginPct);
  const belowMinimum = grossMarginPct.lessThan(minMargin);

  if (!belowMinimum) {
    return {
      ok: true,
      belowMinimum: false,
      grossMarginPct,
      minimumMarginPct: minMargin,
      guardMode,
      action: "ALLOW",
    };
  }

  const message = "毛利率低於最低設定 / 粗利率が最低設定を下回っています";
  switch (guardMode) {
    case "WARNING_ONLY":
      return { ok: true, belowMinimum: true, grossMarginPct, minimumMarginPct: minMargin, guardMode, action: "WARN", message };
    case "APPROVAL_REQUIRED":
      return { ok: false, belowMinimum: true, grossMarginPct, minimumMarginPct: minMargin, guardMode, action: "REQUIRE_APPROVAL", message };
    case "BLOCKED":
      return { ok: false, belowMinimum: true, grossMarginPct, minimumMarginPct: minMargin, guardMode, action: "BLOCK", message };
  }
}
