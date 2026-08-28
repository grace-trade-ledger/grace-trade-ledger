import { describe, it, expect } from "vitest";
import { priceBreakdown, suggestedSellingPrice, evaluateMinimumMarginGuard } from "../pricing";

describe("§05.4 Markup vs Gross Margin — worked example", () => {
  it("cost ¥500, +20% markup → price ¥600, margin 16.67% (NOT 20%)", () => {
    const b = priceBreakdown(500, 600);
    expect(b.markupPct.times(100).toNumber()).toBe(20);
    expect(b.grossMarginPct.times(100).toDecimalPlaces(2).toNumber()).toBe(16.67);
  });

  it("Landed Cost ¥480 + other ¥30 = ¥510 total, target margin 30% → suggested price ¥729", () => {
    const totalCost = 480 + 30;
    const price = suggestedSellingPrice(totalCost, 0.3);
    expect(price.toNumber()).toBe(729); // 510 / 0.7 = 728.57.. -> rounds to 729
  });

  it("鳳梨酥 quotation example: qty 300 @ ¥800, cost ¥615 → profit ¥55,500, margin 23.1%", () => {
    const b = priceBreakdown(615, 800);
    const qty = 300;
    const sales = b.price.times(qty);
    const grossProfit = b.grossProfit.times(qty);
    expect(sales.toNumber()).toBe(240000);
    expect(grossProfit.toNumber()).toBe(55500);
    expect(b.grossMarginPct.times(100).toDecimalPlaces(1).toNumber()).toBe(23.1);
  });
});

describe("§05.5 Minimum Margin Guard — worked example", () => {
  it("cost ¥500, target 30%, min 20%, price ¥580 (13.8%) → below minimum", () => {
    const evalResult = evaluateMinimumMarginGuard(500, 580, 0.2, "WARNING_ONLY");
    expect(evalResult.belowMinimum).toBe(true);
    expect(evalResult.grossMarginPct.times(100).toDecimalPlaces(1).toNumber()).toBe(13.8);
    expect(evalResult.action).toBe("WARN");
    expect(evalResult.ok).toBe(true); // warning only still allows the quotation to be issued
  });

  it("APPROVAL_REQUIRED blocks issuance until approved", () => {
    const evalResult = evaluateMinimumMarginGuard(500, 580, 0.2, "APPROVAL_REQUIRED");
    expect(evalResult.action).toBe("REQUIRE_APPROVAL");
    expect(evalResult.ok).toBe(false);
  });

  it("BLOCKED prevents creating the quotation entirely", () => {
    const evalResult = evaluateMinimumMarginGuard(500, 580, 0.2, "BLOCKED");
    expect(evalResult.action).toBe("BLOCK");
    expect(evalResult.ok).toBe(false);
  });

  it("a price at or above the minimum margin always passes, regardless of guard_mode", () => {
    const evalResult = evaluateMinimumMarginGuard(500, 700, 0.2, "BLOCKED");
    expect(evalResult.belowMinimum).toBe(false);
    expect(evalResult.action).toBe("ALLOW");
  });
});
