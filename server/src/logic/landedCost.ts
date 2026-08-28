/**
 * §05.1 Landed Cost 計算邏輯 ／ §05.2 成本分攤方式 (Cost Allocation)
 *
 * Landed Unit Cost =
 *   ( Σ Supplier Purchase Price
 *   + Σ Ocean/Air Freight + Insurance
 *   + Σ Customs Duty + Import Consumption Tax
 *   + Σ Customs Clearance + Port/Terminal Fee
 *   + Σ Warehouse Receiving/Handling/Storage + Delivery Fee
 *   + Σ Inspection/Document/Other Import Cost )
 *   ÷ Quantity
 */
import Decimal from "decimal.js";

export type AllocationMethod = "BY_VALUE" | "BY_WEIGHT" | "BY_QTY" | "BY_CBM" | "MANUAL";

export interface AllocationBasisItem {
  /** import_item id (or any stable key) */
  importItemId: string;
  amountOriginal: Decimal.Value; // for BY_VALUE basis
  weightKg: Decimal.Value; // for BY_WEIGHT basis
  quantity: Decimal.Value; // for BY_QTY basis
  volumeCbm: Decimal.Value; // for BY_CBM basis
  /** required only when allocationMethod === "MANUAL" */
  manualAmount?: Decimal.Value;
}

export interface CostItemToAllocate {
  importCostItemId: string;
  amount: Decimal.Value;
  allocationMethod: AllocationMethod;
}

export interface AllocationResultLine {
  importCostItemId: string;
  importItemId: string;
  allocatedAmount: Decimal;
  allocationBasisValue: Decimal;
}

/**
 * §05.2 — allocate one cost item's amount across import items by the chosen method.
 * Allocated Amount(item) = Cost Item Amount × ( Item Basis Value ÷ Σ Basis Value )
 */
export function allocateCostItem(
  costItem: CostItemToAllocate,
  items: AllocationBasisItem[]
): AllocationResultLine[] {
  const amount = new Decimal(costItem.amount);

  if (costItem.allocationMethod === "MANUAL") {
    return items
      .filter((i) => i.manualAmount !== undefined)
      .map((i) => ({
        importCostItemId: costItem.importCostItemId,
        importItemId: i.importItemId,
        allocatedAmount: new Decimal(i.manualAmount!),
        allocationBasisValue: new Decimal(i.manualAmount!),
      }));
  }

  const basisOf = (i: AllocationBasisItem): Decimal => {
    switch (costItem.allocationMethod) {
      case "BY_VALUE":
        return new Decimal(i.amountOriginal);
      case "BY_WEIGHT":
        return new Decimal(i.weightKg);
      case "BY_QTY":
        return new Decimal(i.quantity);
      case "BY_CBM":
        return new Decimal(i.volumeCbm);
      default:
        throw new Error(`Unsupported allocation method: ${costItem.allocationMethod}`);
    }
  };

  const basisValues = items.map(basisOf);
  const totalBasis = basisValues.reduce((a, b) => a.plus(b), new Decimal(0));

  if (totalBasis.isZero()) {
    throw new Error(
      `Cannot allocate cost item ${costItem.importCostItemId}: total basis value is zero for method ${costItem.allocationMethod}`
    );
  }

  let allocatedSoFar = new Decimal(0);
  return items.map((item, idx) => {
    const basisValue = basisValues[idx];
    const isLast = idx === items.length - 1;
    // last line takes the rounding remainder so allocated lines always sum exactly to `amount`
    const allocated = isLast
      ? amount.minus(allocatedSoFar)
      : amount.times(basisValue).dividedBy(totalBasis).toDecimalPlaces(4);
    allocatedSoFar = allocatedSoFar.plus(allocated);
    return {
      importCostItemId: costItem.importCostItemId,
      importItemId: item.importItemId,
      allocatedAmount: allocated,
      allocationBasisValue: basisValue,
    };
  });
}

export interface ImportItemCostInput {
  importItemId: string;
  supplierAmountJpy: Decimal.Value; // amount_jpy on the import_item (converted at import's exchange_rate)
  quantity: Decimal.Value;
  allocatedCosts: Decimal.Value[]; // every allocation line's allocatedAmount for this item, across all cost items
}

export interface LandedCostResult {
  importItemId: string;
  landedTotalCost: Decimal;
  landedUnitCost: Decimal;
}

/** §05.1 — combine supplier cost + all allocated cost-item shares into the Landed Unit Cost. */
export function computeLandedCost(input: ImportItemCostInput): LandedCostResult {
  const quantity = new Decimal(input.quantity);
  if (quantity.lessThanOrEqualTo(0)) {
    throw new Error(`quantity must be > 0 for import item ${input.importItemId}`);
  }
  const totalAllocated = input.allocatedCosts.reduce<Decimal>(
    (a, b) => a.plus(new Decimal(b)),
    new Decimal(0)
  );
  const landedTotalCost = new Decimal(input.supplierAmountJpy).plus(totalAllocated);
  const landedUnitCost = landedTotalCost.dividedBy(quantity);
  return { importItemId: input.importItemId, landedTotalCost, landedUnitCost };
}
