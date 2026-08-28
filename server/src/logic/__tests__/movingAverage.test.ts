import { describe, it, expect } from "vitest";
import { computeMovingAverage, applyOutbound } from "../movingAverage";

describe("§05.3 Moving Average Cost — worked example", () => {
  it("100×600 + 200×650 / 300 = 633.33", () => {
    const { newQty, newAverageCost } = computeMovingAverage({
      qtyOld: 100,
      costOld: 600,
      qtyNew: 200,
      costNew: 650,
    });
    expect(newQty.toNumber()).toBe(300);
    expect(newAverageCost.toDecimalPlaces(2).toNumber()).toBe(633.33);
  });
});

describe("Outbound movement", () => {
  it("reduces quantity_on_hand without changing average cost", () => {
    const remaining = applyOutbound(300, 120);
    expect(remaining.toNumber()).toBe(180);
  });

  it("§06.2 — rejects an outbound larger than Available Stock", () => {
    expect(() => applyOutbound(50, 120)).toThrow(/Available Stock/);
  });
});
