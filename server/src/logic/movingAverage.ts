/**
 * §05.3 移動平均成本 (Moving Average Cost)
 *
 * New Average Cost = ( Qty_old × Cost_old + Qty_new × Cost_new ) ÷ ( Qty_old + Qty_new )
 */
import Decimal from "decimal.js";

export interface MovingAverageInput {
  qtyOld: Decimal.Value;
  costOld: Decimal.Value;
  qtyNew: Decimal.Value;
  costNew: Decimal.Value;
}

export interface MovingAverageResult {
  newQty: Decimal;
  newAverageCost: Decimal;
}

export function computeMovingAverage(input: MovingAverageInput): MovingAverageResult {
  const qtyOld = new Decimal(input.qtyOld);
  const costOld = new Decimal(input.costOld);
  const qtyNew = new Decimal(input.qtyNew);
  const costNew = new Decimal(input.costNew);

  const newQty = qtyOld.plus(qtyNew);
  if (newQty.isZero()) {
    return { newQty, newAverageCost: new Decimal(0) };
  }
  const newAverageCost = qtyOld
    .times(costOld)
    .plus(qtyNew.times(costNew))
    .dividedBy(newQty);

  return { newQty, newAverageCost };
}

/**
 * Apply an outbound movement (delivery / scrap / etc). Average cost is unchanged by an
 * outbound movement under the moving-average method — only quantity_on_hand decreases.
 */
export function applyOutbound(qtyOnHand: Decimal.Value, qtyOut: Decimal.Value): Decimal {
  const remaining = new Decimal(qtyOnHand).minus(qtyOut);
  if (remaining.lessThan(0)) {
    throw new Error("Available Stock 不足 — insufficient stock for this outbound movement");
  }
  return remaining;
}
