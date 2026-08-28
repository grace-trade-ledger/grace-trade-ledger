import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { allocateCostItem, computeLandedCost } from "../landedCost";

describe("§05.1 Landed Cost — 鳳梨酥 worked example", () => {
  it("500 + 40 + 30 + 15 + 10 + 20 = 615 per unit", () => {
    const result = computeLandedCost({
      importItemId: "pine-001",
      supplierAmountJpy: new Decimal(500).times(1000), // ¥500 × 1,000 units
      quantity: 1000,
      allocatedCosts: [40 * 1000, 30 * 1000, 15 * 1000, 10 * 1000, 20 * 1000], // freight/duty/clearance/port/warehouse totals for this item
    });
    expect(result.landedUnitCost.toNumber()).toBeCloseTo(615, 6);
    expect(result.landedTotalCost.toNumber()).toBe(615000);
  });
});

describe("§05.2 Cost Allocation — by_weight 40% example", () => {
  it("¥100,000 ocean freight, item A = 40% of weight → ¥40,000", () => {
    const lines = allocateCostItem(
      { importCostItemId: "freight-1", amount: 100000, allocationMethod: "BY_WEIGHT" },
      [
        { importItemId: "A", amountOriginal: 0, weightKg: 400, quantity: 0, volumeCbm: 0 },
        { importItemId: "B", amountOriginal: 0, weightKg: 600, quantity: 0, volumeCbm: 0 },
      ]
    );
    const a = lines.find((l) => l.importItemId === "A")!;
    expect(a.allocatedAmount.toNumber()).toBe(40000);
    const total = lines.reduce((s, l) => s.plus(l.allocatedAmount), new Decimal(0));
    expect(total.toNumber()).toBe(100000); // lines always sum exactly to the cost item amount
  });

  it("by_value allocates proportionally to purchase amount", () => {
    const lines = allocateCostItem(
      { importCostItemId: "duty-1", amount: 45000, allocationMethod: "BY_VALUE" },
      [
        { importItemId: "A", amountOriginal: 300000, weightKg: 0, quantity: 0, volumeCbm: 0 },
        { importItemId: "B", amountOriginal: 700000, weightKg: 0, quantity: 0, volumeCbm: 0 },
      ]
    );
    expect(lines[0].allocatedAmount.toNumber()).toBeCloseTo(13500, 4);
    expect(lines[1].allocatedAmount.toNumber()).toBeCloseTo(31500, 4);
  });

  it("manual allocation uses the given amounts as-is", () => {
    const lines = allocateCostItem(
      { importCostItemId: "misc-1", amount: 999, allocationMethod: "MANUAL" },
      [
        { importItemId: "A", amountOriginal: 0, weightKg: 0, quantity: 0, volumeCbm: 0, manualAmount: 400 },
        { importItemId: "B", amountOriginal: 0, weightKg: 0, quantity: 0, volumeCbm: 0, manualAmount: 599 },
      ]
    );
    expect(lines[0].allocatedAmount.toNumber()).toBe(400);
    expect(lines[1].allocatedAmount.toNumber()).toBe(599);
  });

  it("throws when total basis value is zero (e.g. weights not entered)", () => {
    expect(() =>
      allocateCostItem(
        { importCostItemId: "x", amount: 100, allocationMethod: "BY_WEIGHT" },
        [{ importItemId: "A", amountOriginal: 0, weightKg: 0, quantity: 0, volumeCbm: 0 }]
      )
    ).toThrow();
  });

  it("by_cbm allocates proportionally to shipped volume (e.g. ocean freight)", () => {
    const lines = allocateCostItem(
      { importCostItemId: "freight-cbm-1", amount: 60000, allocationMethod: "BY_CBM" },
      [
        { importItemId: "A", amountOriginal: 0, weightKg: 0, quantity: 0, volumeCbm: 2 },
        { importItemId: "B", amountOriginal: 0, weightKg: 0, quantity: 0, volumeCbm: 1 },
      ]
    );
    const a = lines.find((l) => l.importItemId === "A")!;
    const b = lines.find((l) => l.importItemId === "B")!;
    expect(a.allocatedAmount.toNumber()).toBeCloseTo(40000, 4); // 2/3 of volume
    expect(b.allocatedAmount.toNumber()).toBeCloseTo(20000, 4); // 1/3 of volume
    const total = lines.reduce((s, l) => s.plus(l.allocatedAmount), new Decimal(0));
    expect(total.toNumber()).toBe(60000);
  });
});
