/**
 * Seed data reproducing the worked examples from the confirmed architecture document,
 * end-to-end through the real business-logic modules and the real database:
 *
 *   Product (鳳梨酥) → Import → Landed Cost (§05.1/§05.2, ¥615/unit) → GRACE Inventory
 *   → Quotation (§37, qty300 @ ¥800) → Sales Order → Delivery (§05.6 intercompany pairing)
 *   → Invoice → Payment (§45, ¥240,000 / ¥150,000 / ¥90,000 outstanding)
 */
import "dotenv/config";
import { db, pool } from "./client";
import * as s from "./schema";
import Decimal from "decimal.js";
import { eq, sql as sqlRaw } from "drizzle-orm";
import { allocateCostItem, computeLandedCost } from "../logic/landedCost";
import { priceBreakdown } from "../logic/pricing";
import { formatDocumentNo } from "../logic/documentNumber";

async function main() {
  console.log("Seeding GRACE Trade Ledger reference dataset…");

  // Idempotent: wipe every app table first so this script can be re-run freely in dev.
  await db.execute(sqlRaw`
    truncate table
      payments, invoice_items, invoices, delivery_items, deliveries, sales_order_items, sales_orders,
      quotation_items, quotation_versions, quotations, product_pricing_policy,
      inventory_transactions, inventory_lots, cost_allocation_lines, import_cost_items, import_items, imports,
      exchange_rates, customers, suppliers, products, audit_logs, document_sequences, users,
      role_permissions, roles, warehouses, companies
    restart identity cascade
  `);

  // ---------- D1 Master ----------
  const [mox] = await db.insert(s.companies).values({
    code: "MOX", nameLocal: "摩囍", nameEn: "Moxi Co., Ltd.", country: "TW", baseCurrency: "TWD",
    taxId: "12345678", address: "台北市信義區松高路1號",
  }).returning();
  const [grc] = await db.insert(s.companies).values({
    code: "GRC", nameLocal: "GRACE", nameEn: "GRACE Co., Ltd.", country: "JP", baseCurrency: "JPY",
    taxId: "T1234567890123", address: "東京都港区南青山1-1-1",
  }).returning();
  const [lea] = await db.insert(s.companies).values({
    code: "LEA", nameLocal: "リープ株式会社", nameEn: "Leap Inc.", country: "JP", baseCurrency: "JPY",
    taxId: "T9876543210987", address: "大阪府大阪市北区梅田2-2-2",
  }).returning();

  const [whGrace] = await db.insert(s.warehouses).values({
    companyId: grc.id, code: "GRC-WH1", name: "GRACE 東京倉庫", type: "自社倉",
  }).returning();
  const [whLeapStore1] = await db.insert(s.warehouses).values({
    companyId: lea.id, code: "LEA-ST1", name: "リープ 梅田店", type: "店舗倉",
  }).returning();

  const roleDefs = [
    { code: "ADMIN", name: "Admin", description: "全部權限" },
    { code: "IMPORT_STAFF", name: "Import Staff", description: "Import／Cost／Inventory" },
    { code: "SALES_STAFF", name: "Sales Staff", description: "Customer／Quotation／Sales" },
    { code: "STORE_STAFF", name: "Store Staff", description: "自己店舖庫存" },
  ];
  const roles = await db.insert(s.roles).values(roleDefs).returning();
  const roleByCode = Object.fromEntries(roles.map((r) => [r.code, r]));

  const [adminUser] = await db.insert(s.users).values({
    companyId: grc.id, name: "System Admin", email: "admin@grace.example", roleId: roleByCode.ADMIN.id,
  }).returning();
  await db.insert(s.users).values([
    { companyId: grc.id, name: "Import Staff (GRACE)", email: "import@grace.example", roleId: roleByCode.IMPORT_STAFF.id },
    { companyId: grc.id, name: "Sales Staff (GRACE)", email: "sales@grace.example", roleId: roleByCode.SALES_STAFF.id },
    { companyId: lea.id, name: "Store Staff (梅田店)", email: "store1@leap.example", roleId: roleByCode.STORE_STAFF.id, storeWarehouseId: whLeapStore1.id },
  ]);

  // 摩囍 is GRACE's supplier; リープ and GRACE are also each other's customer — §05.6 design.
  const [supplierMox] = await db.insert(s.suppliers).values({
    code: "SUP-MOX", name: "摩囍", country: "TW", currency: "TWD", linkedCompanyId: mox.id,
  }).returning();
  const [customerLeap] = await db.insert(s.customers).values({
    code: "CUS-LEA", name: "リープ株式会社", currency: "JPY", paymentTerms: "月末締め翌月末払い",
    linkedCompanyId: lea.id,
  }).returning();

  await db.insert(s.exchangeRates).values({
    fromCurrency: "TWD", toCurrency: "JPY", rate: "5.0", rateDate: "2026-08-20", source: "manual",
  });

  const productDefs = [
    // volumeCbm = m³ per unit (carton volume ÷ units/case) — basis for BY_CBM allocation (§05.2), e.g. ocean freight.
    { productCode: "PINE-001", nameLocal: "鳳梨酥", nameZh: "鳳梨酥", nameJa: "パイナップルケーキ", unit: "個", unitsPerCase: 12, weightKg: "0.2000", volumeCbm: "0.002500", dutyRate: "5.0000", consumptionTaxRate: "10.0000", storageType: "AMBIENT" as const, shelfLifeDays: 180 },
    { productCode: "TARO-002", nameLocal: "芋圓", nameZh: "芋圓", nameJa: "タロイモ団子", unit: "包", unitsPerCase: 20, weightKg: "0.3000", volumeCbm: "0.001800", dutyRate: "5.0000", consumptionTaxRate: "10.0000", storageType: "CHILLED" as const, shelfLifeDays: 90 },
    { productCode: "TEA-003", nameLocal: "茶葉", nameZh: "茶葉", nameJa: "茶葉", unit: "罐", unitsPerCase: 24, weightKg: "0.1000", volumeCbm: "0.000900", dutyRate: "0.0000", consumptionTaxRate: "10.0000", storageType: "AMBIENT" as const, shelfLifeDays: 720 },
  ];
  const products = await db.insert(s.products).values(
    productDefs.map((p) => ({ ...p, defaultSupplierId: supplierMox.id }))
  ).returning();
  const pine = products.find((p) => p.productCode === "PINE-001")!;
  const taro = products.find((p) => p.productCode === "TARO-002")!;
  const tea = products.find((p) => p.productCode === "TEA-003")!;

  await db.insert(s.productPricingPolicy).values(
    products.map((p) => ({
      companyId: grc.id,
      productId: p.id,
      targetMarginPct: "0.3000",
      minimumMarginPct: "0.2000",
      guardMode: "WARNING_ONLY" as const,
    }))
  );

  // ---------- §29 STEP 3-6: Import + Landed Cost ----------
  const importNo = formatDocumentNo("IMP", 2026, 1);
  const [imp] = await db.insert(s.imports).values({
    importNo,
    importDate: "2026-08-20",
    etd: "2026-08-22",
    eta: "2026-09-10",
    arrivalDate: "2026-09-12",
    supplierId: supplierMox.id,
    buyerCompanyId: grc.id,
    currency: "TWD",
    exchangeRate: "5.0",
    invoiceNo: "MOX-INV-8801",
    blAwbNo: "BL20260901",
    containerNo: "TCLU1234567",
    warehouseId: whGrace.id,
    customsBroker: "○○報関株式会社",
    status: "ARRIVED",
  }).returning();

  const rate = new Decimal(5.0);
  const itemDefs = [
    { product: pine, quantity: 1000, unitPriceTwd: 100, weightKg: 200 },
    { product: taro, quantity: 500, unitPriceTwd: 150, weightKg: 150 },
    { product: tea, quantity: 300, unitPriceTwd: 200, weightKg: 30 },
  ];
  const importItems = await db.insert(s.importItems).values(
    itemDefs.map((d) => {
      const amountOriginal = new Decimal(d.unitPriceTwd).times(d.quantity);
      const amountJpy = amountOriginal.times(rate);
      return {
        importId: imp.id,
        productId: d.product.id,
        quantity: String(d.quantity),
        unitPrice: String(d.unitPriceTwd),
        amountOriginal: amountOriginal.toFixed(4),
        amountJpy: amountJpy.toFixed(4),
      };
    })
  ).returning();
  const itemIdByProductCode = Object.fromEntries(
    importItems.map((ii, idx) => [itemDefs[idx].product.productCode, ii])
  );

  // Cost items — Ocean Freight/Duty/Clearance/Port are entered manually per item (allocation_method = MANUAL),
  // Warehouse Handling Fee is allocated BY_WEIGHT to demonstrate §05.2's weight-based allocation formula.
  const manualCostDefs: { category: string; perItem: Record<string, number> }[] = [
    { category: "Ocean Freight", perItem: { "PINE-001": 40000, "TARO-002": 20000, "TEA-003": 10000 } },
    { category: "Customs Duty", perItem: { "PINE-001": 30000, "TARO-002": 18000, "TEA-003": 12000 } },
    { category: "Customs Clearance Fee", perItem: { "PINE-001": 15000, "TARO-002": 8000, "TEA-003": 5000 } },
    { category: "Port Fee", perItem: { "PINE-001": 10000, "TARO-002": 6000, "TEA-003": 4000 } },
  ];

  const allocatedByImportItem: Record<string, Decimal[]> = {
    "PINE-001": [], "TARO-002": [], "TEA-003": [],
  };

  for (const def of manualCostDefs) {
    const total = Object.values(def.perItem).reduce((a, b) => a + b, 0);
    const [costItem] = await db.insert(s.importCostItems).values({
      importId: imp.id, costCategory: def.category, amount: String(total), currency: "JPY", allocationMethod: "MANUAL",
    }).returning();

    const lines = allocateCostItem(
      { importCostItemId: costItem.id, amount: total, allocationMethod: "MANUAL" },
      Object.entries(def.perItem).map(([code, amt]) => ({
        importItemId: itemIdByProductCode[code].id, amountOriginal: 0, weightKg: 0, quantity: 0, volumeCbm: 0, manualAmount: amt,
      }))
    );
    await db.insert(s.costAllocationLines).values(
      lines.map((l) => ({
        importCostItemId: l.importCostItemId, importItemId: l.importItemId,
        allocatedAmountJpy: l.allocatedAmount.toFixed(4), allocationBasisValue: l.allocationBasisValue.toFixed(4),
      }))
    );
    for (const [code, amt] of Object.entries(def.perItem)) {
      allocatedByImportItem[code].push(new Decimal(amt));
    }
  }

  // Warehouse Handling Fee — BY_WEIGHT, computed by the same allocateCostItem() the app uses everywhere else.
  const warehouseFeeTotal = 38000;
  const [warehouseCostItem] = await db.insert(s.importCostItems).values({
    importId: imp.id, costCategory: "Warehouse Handling Fee", amount: String(warehouseFeeTotal), currency: "JPY", allocationMethod: "BY_WEIGHT",
  }).returning();
  const weightLines = allocateCostItem(
    { importCostItemId: warehouseCostItem.id, amount: warehouseFeeTotal, allocationMethod: "BY_WEIGHT" },
    itemDefs.map((d) => ({
      importItemId: itemIdByProductCode[d.product.productCode].id,
      amountOriginal: 0, weightKg: d.weightKg, quantity: 0, volumeCbm: 0,
    }))
  );
  await db.insert(s.costAllocationLines).values(
    weightLines.map((l) => ({
      importCostItemId: l.importCostItemId, importItemId: l.importItemId,
      allocatedAmountJpy: l.allocatedAmount.toFixed(4), allocationBasisValue: l.allocationBasisValue.toFixed(4),
    }))
  );
  for (const d of itemDefs) {
    const line = weightLines.find((l) => l.importItemId === itemIdByProductCode[d.product.productCode].id)!;
    allocatedByImportItem[d.product.productCode].push(line.allocatedAmount);
  }

  // Roll every allocation line + supplier amount up into Landed Unit Cost, write back to import_items,
  // and open GRACE's inventory lot at that cost — exactly §29 STEP 5-7.
  const lotsByProductCode: Record<string, { id: string; unitCost: Decimal }> = {};
  for (const d of itemDefs) {
    const ii = itemIdByProductCode[d.product.productCode];
    const landed = computeLandedCost({
      importItemId: ii.id,
      supplierAmountJpy: ii.amountJpy,
      quantity: d.quantity,
      allocatedCosts: allocatedByImportItem[d.product.productCode],
    });
    await db.update(s.importItems).set({
      landedUnitCost: landed.landedUnitCost.toFixed(4),
      landedTotalCost: landed.landedTotalCost.toFixed(4),
    }).where(eq(s.importItems.id, ii.id));

    const [lot] = await db.insert(s.inventoryLots).values({
      companyId: grc.id, warehouseId: whGrace.id, productId: d.product.id,
      lotNo: `LOT20260901-${d.product.productCode}`, sourceImportId: imp.id,
      expiryDate: "2027-03-01", quantityOnHand: String(d.quantity), unitCost: landed.landedUnitCost.toFixed(4),
      receivedDate: new Date("2026-09-12"),
    }).returning();
    lotsByProductCode[d.product.productCode] = { id: lot.id, unitCost: landed.landedUnitCost };

    await db.insert(s.inventoryTransactions).values({
      companyId: grc.id, warehouseId: whGrace.id, productId: d.product.id, lotId: lot.id,
      transactionType: "IN", quantity: String(d.quantity), unitCost: landed.landedUnitCost.toFixed(4),
      referenceType: "Import", referenceId: imp.id, createdById: adminUser.id,
    });

    console.log(`  ${d.product.productCode}: Landed Unit Cost = ¥${landed.landedUnitCost.toFixed(2)}`);
  }

  // ---------- §29 STEP 8-12: Quotation → Sales Order → Delivery → Invoice → Payment ----------
  const pineLot = lotsByProductCode["PINE-001"];
  const pineCost = pineLot.unitCost; // ¥615.00

  const quotationNo = formatDocumentNo("QT", 2026, 1);
  const [quotation] = await db.insert(s.quotations).values({
    quotationNo, sellerCompanyId: grc.id, customerId: customerLeap.id, currency: "JPY",
    paymentTerms: "月末締め翌月末払い", status: "ACCEPTED", currentVersionNo: 1,
  }).returning();
  const [qv1] = await db.insert(s.quotationVersions).values({
    quotationId: quotation.id, versionNo: 1, createdById: adminUser.id, isCurrent: true,
  }).returning();

  const quoteQty = 300;
  const quotePrice = new Decimal(800);
  const b = priceBreakdown(pineCost, quotePrice);
  await db.insert(s.quotationItems).values({
    quotationVersionId: qv1.id, productId: pine.id, quantity: String(quoteQty), unit: "個",
    unitPrice: quotePrice.toFixed(4), taxRate: "0.1000", amount: quotePrice.times(quoteQty).toFixed(4),
    costSnapshot: pineCost.toFixed(4), grossProfit: b.grossProfit.times(quoteQty).toFixed(4),
    grossMarginPct: b.grossMarginPct.toFixed(4),
  });
  console.log(`  Quotation ${quotationNo}: qty ${quoteQty} @ ¥${quotePrice} -> profit ¥${b.grossProfit.times(quoteQty)}, margin ${b.grossMarginPct.times(100).toFixed(1)}%`);

  const salesOrderNo = formatDocumentNo("SO", 2026, 25);
  const [so] = await db.insert(s.salesOrders).values({
    salesOrderNo, sourceQuotationVersionId: qv1.id, sellerCompanyId: grc.id, customerId: customerLeap.id,
    currency: "JPY", flowTemplate: "STANDARD", status: "CONFIRMED",
  }).returning();
  const [soItem] = await db.insert(s.salesOrderItems).values({
    salesOrderId: so.id, productId: pine.id, quantity: String(quoteQty), unitPrice: quotePrice.toFixed(4),
    taxRate: "0.1000", amount: quotePrice.times(quoteQty).toFixed(4), reservedQuantity: String(quoteQty),
  }).returning();

  // Delivery — deducts GRACE stock; because the customer is an intercompany company (linked_company_id),
  // the system also opens a paired inbound lot + transaction on リープ's own ledger (§05.6).
  const deliveryNo = formatDocumentNo("DO", 2026, 1);
  const [delivery] = await db.insert(s.deliveries).values({
    deliveryNo, salesOrderId: so.id, warehouseId: whGrace.id, status: "SHIPPED",
  }).returning();
  await db.insert(s.deliveryItems).values({
    deliveryId: delivery.id, salesOrderItemId: soItem.id, productId: pine.id, lotId: pineLot.id,
    quantity: String(quoteQty), unitCostAtShipment: pineCost.toFixed(4),
  });

  const [outTxn] = await db.insert(s.inventoryTransactions).values({
    companyId: grc.id, warehouseId: whGrace.id, productId: pine.id, lotId: pineLot.id,
    transactionType: "INTERCOMPANY_OUT", quantity: String(-quoteQty), unitCost: pineCost.toFixed(4),
    referenceType: "Delivery", referenceId: delivery.id, createdById: adminUser.id,
  }).returning();
  await db.update(s.inventoryLots).set({
    quantityOnHand: String(1000 - quoteQty),
  }).where(eq(s.inventoryLots.id, pineLot.id));

  const [leapLot] = await db.insert(s.inventoryLots).values({
    companyId: lea.id, warehouseId: whLeapStore1.id, productId: pine.id,
    lotNo: `LOT20260901-PINE-001-LEA`, sourceImportId: null, expiryDate: "2027-03-01",
    quantityOnHand: String(quoteQty), unitCost: quotePrice.toFixed(4), // リープ's cost basis = what they paid GRACE
  }).returning();
  await db.insert(s.inventoryTransactions).values({
    companyId: lea.id, warehouseId: whLeapStore1.id, productId: pine.id, lotId: leapLot.id,
    transactionType: "INTERCOMPANY_IN", quantity: String(quoteQty), unitCost: quotePrice.toFixed(4),
    referenceType: "Delivery", referenceId: delivery.id, linkedTransactionId: outTxn.id, createdById: adminUser.id,
  });
  console.log(`  Delivery ${deliveryNo}: GRACE -${quoteQty} PINE-001 / リープ +${quoteQty} PINE-001 (paired via linked_transaction_id)`);

  const invoiceNo = formatDocumentNo("INV", 2026, 125);
  const invSubtotal = quotePrice.times(quoteQty);
  const invTax = invSubtotal.times("0.1");
  const invTotal = invSubtotal.plus(invTax);
  const [invoice] = await db.insert(s.invoices).values({
    invoiceNo, sellerCompanyId: grc.id, customerId: customerLeap.id, salesOrderId: so.id, deliveryId: delivery.id,
    dueDate: "2026-10-31", currency: "JPY", subtotal: invSubtotal.toFixed(4), tax: invTax.toFixed(4),
    total: invTotal.toFixed(4), status: "PARTIALLY_PAID",
  }).returning();
  await db.insert(s.invoiceItems).values({
    invoiceId: invoice.id, productId: pine.id, quantity: String(quoteQty), unitPrice: quotePrice.toFixed(4),
    taxRate: "0.1000", amount: invSubtotal.toFixed(4), costSnapshot: pineCost.toFixed(4),
    grossProfit: b.grossProfit.times(quoteQty).toFixed(4), grossMarginPct: b.grossMarginPct.toFixed(4),
  });

  const paymentNo = formatDocumentNo("PAY", 2026, 1);
  const paid = new Decimal(150000);
  const outstanding = invSubtotal.minus(paid); // matches §45's ¥240,000 / ¥150,000 / ¥90,000 example
  await db.insert(s.payments).values({
    paymentNo, invoiceId: invoice.id, customerId: customerLeap.id, paymentAmount: paid.toFixed(4),
    paymentMethod: "銀行振込", bankAccount: "GRACE 三井住友銀行", outstandingAmount: outstanding.toFixed(4),
  });
  console.log(`  Invoice ${invoiceNo}: ¥${invSubtotal} / Payment ¥${paid} / Outstanding ¥${outstanding}`);

  // Advance document_sequences past the numbers this script hand-assigned (IMP 1, QT 1, SO 25, DO 1,
  // INV 125, PAY 1) so the API's nextDocumentNo() continues counting up from here, never colliding.
  await db.insert(s.documentSequences).values([
    { companyId: grc.id, documentType: "IMP", year: 2026, lastNumber: 1 },
    { companyId: grc.id, documentType: "QT", year: 2026, lastNumber: 1 },
    { companyId: grc.id, documentType: "SO", year: 2026, lastNumber: 25 },
    { companyId: grc.id, documentType: "DO", year: 2026, lastNumber: 1 },
    { companyId: grc.id, documentType: "INV", year: 2026, lastNumber: 125 },
    { companyId: grc.id, documentType: "PAY", year: 2026, lastNumber: 1 },
  ]);

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
