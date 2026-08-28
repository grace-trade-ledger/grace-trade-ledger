/**
 * Real historical data load — replaces the demo/example dataset with GRACE's actual
 * 2025–2026 import history, parsed from the 4 "出荷記録-グレイス" Excel workbooks the
 * user supplied, cross-checked against real customs/forwarder documents from their
 * Dropbox (進出口資料). See the analysis report delivered alongside this data for the
 * full column-by-column verification.
 *
 * Business-rule decisions confirmed by the user before this script was written:
 *  - Scope: 2025–2026 shipments only (17 unique shipments after removing one duplicate
 *    "誤植" / erroneous sheet).
 *  - 原価/元 (TWD) is 摩囍's own cost from the factory — reference only, NOT part of
 *    GRACE's landed cost.
 *  - 売値/円 (Unit Price JPY) IS the price 摩囍 sells to GRACE — this is GRACE's import
 *    unit price (import_items.unit_price), confirmed directly by the user.
 *  - The 37 factory names in the「廠商」column are recorded as a per-line-item note only;
 *    摩囍 remains the sole supplier of record (no schema change), per the user's choice
 *    to keep this change minimal.
 *  - GRACE's real landed cost is *not* just 合計/円 — real customs documents (輸入許可
 *    通知書 / リアルタイム口座振替) show GRACE separately pays Japan customs duty +
 *    consumption tax, and a Japan-side forwarder (内外トランスライン) separately bills
 *    handling/trucking/storage/clearance fees. Both are added as landed-cost items here:
 *      - Duty: computed per line as (合計/円 × each product's own 関税 rate already in
 *        the sheet) — validated against a real customs document for shipment 20251030
 *        (estimate ¥185,503 vs actual ¥185,600, i.e. within 0.05%).
 *      - Consumption tax: approximated at 8% of (product cost + duty) — Japan's reduced
 *        rate for food, which is what the same real document showed for GRACE's food
 *        line items. This is a documented approximation, not read from every shipment's
 *        own customs paperwork.
 *      - Forwarder/local charges (報關/卡車/倉儲 etc): read directly from each sheet's
 *        own「進口費用」cell (labelled 日本端) where present — for the 5 shipments where
 *        that cell was still blank (Dropbox invoice not yet on file at analysis time)
 *        this is left at ¥0 and flagged in the load summary below.
 *  - Duplicate code product line "1587" and the two placeholder "XXXX"/"xxxx" codes
 *    were dropped per the user's "對不上的先跳過" instruction.
 */
import "dotenv/config";
import { db, pool } from "./client";
import * as s from "./schema";
import Decimal from "decimal.js";
import { sql as sqlRaw } from "drizzle-orm";
import { allocateCostItem, computeLandedCost, type AllocationBasisItem } from "../logic/landedCost";
import { formatDocumentNo } from "../logic/documentNumber";
import { historicalShipments as historicalShipmentsRaw } from "./historicalImports";

interface HistItem {
  code: string; name_zh: string; name_ja: string; desc_en: string;
  qty: number; price_jpy: number; total_jpy: number;
  total_cuft: number; total_wt: number; supplier: string; duty_rate: number; expiry_raw: string;
}
interface HistShipment {
  sheet: string; year_file: string; ship_date: string | null;
  import_fee_jpy: number; items: HistItem[];
}
const historicalShipments = historicalShipmentsRaw as unknown as HistShipment[];

function parseExpiry(raw: string): string | null {
  if (!raw) return null;
  // real-world data has a few malformed dates (e.g. "2023/06/31" — June has no 31st);
  // treat anything that doesn't parse to a real calendar date as "no expiry on file"
  // rather than guessing, per the user's "expiry anomaly" decision.
  const m = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const dt = new Date(iso);
  if (isNaN(dt.getTime()) || dt.getUTCDate() !== Number(d)) return null;
  return iso;
}

export async function runRealDataSeed() {
  console.log(`Loading GRACE's real 2025–2026 import history (${historicalShipments.length} shipments)…`);

  await db.execute(sqlRaw`
    truncate table
      payments, invoice_items, invoices, delivery_items, deliveries, sales_order_items, sales_orders,
      quotation_items, quotation_versions, quotations, product_pricing_policy,
      inventory_transactions, inventory_lots, cost_allocation_lines, import_cost_items, import_items, imports,
      exchange_rates, customers, suppliers, products, audit_logs, document_sequences, users,
      role_permissions, roles, warehouses, companies
    restart identity cascade
  `);

  // ---------- D1 Master (same base entities as the demo dataset) ----------
  const [mox] = await db.insert(s.companies).values({
    code: "MOX", nameLocal: "摩囍", nameEn: "Merci International Co., Ltd.", country: "TW", baseCurrency: "TWD",
    taxId: "12345678", address: "4F., No.569, Jingping Rd., Zhonghe Dist., New Taipei City 235037, Taiwan",
  }).returning();
  const [grc] = await db.insert(s.companies).values({
    code: "GRC", nameLocal: "GRACE", nameEn: "Grace Co., Ltd.", country: "JP", baseCurrency: "JPY",
    taxId: "5120001168844", address: "大阪府大阪市北区天満4-4-16",
  }).returning();
  const [lea] = await db.insert(s.companies).values({
    code: "LEA", nameLocal: "リープ株式会社", nameEn: "Leap Inc.", country: "JP", baseCurrency: "JPY",
    taxId: "T9876543210987", address: "大阪府大阪市北区梅田2-2-2",
  }).returning();

  const [whGrace] = await db.insert(s.warehouses).values({
    companyId: grc.id, code: "GRC-WH1", name: "GRACE 大阪倉庫", type: "自社倉",
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

  const [supplierMox] = await db.insert(s.suppliers).values({
    code: "SUP-MOX", name: "摩囍 (MERCI INTERNATIONAL CO., LTD.)", country: "TW", currency: "TWD", linkedCompanyId: mox.id,
  }).returning();
  const [customerLeap] = await db.insert(s.customers).values({
    code: "CUS-LEA", name: "リープ株式会社", currency: "JPY", paymentTerms: "月末締め翌月末払い",
    linkedCompanyId: lea.id,
  }).returning();

  await db.insert(s.exchangeRates).values({
    fromCurrency: "TWD", toCurrency: "JPY", rate: "3.8", rateDate: "2026-08-20", source: "manual (reference only)",
  });

  // ---------- Product master: dedupe by code, keep the most recent shipment's figures ----------
  type ProductAgg = { code: string; name_zh: string; name_ja: string; desc_en: string; ship_date: string; total_wt: number; qty: number; total_cuft: number; duty_rate: number; frozen: boolean };
  const productMap = new Map<string, ProductAgg>();
  for (const shipment of historicalShipments) {
    const frozen = shipment.sheet.includes("冷凍");
    for (const it of shipment.items) {
      if (!it.code) continue;
      const existing = productMap.get(it.code);
      if (!existing || (shipment.ship_date ?? "") >= existing.ship_date) {
        productMap.set(it.code, {
          code: it.code, name_zh: it.name_zh, name_ja: it.name_ja, desc_en: it.desc_en,
          ship_date: shipment.ship_date ?? "", total_wt: it.total_wt, qty: it.qty,
          total_cuft: it.total_cuft, duty_rate: it.duty_rate, frozen,
        });
      }
    }
  }

  const productDefs = Array.from(productMap.values()).map((p) => {
    const weightKgPerUnit = p.qty > 0 ? new Decimal(p.total_wt).dividedBy(p.qty) : new Decimal(0);
    const volumeCbmPerUnit = p.qty > 0 ? new Decimal(p.total_cuft).dividedBy(35.315).dividedBy(p.qty) : new Decimal(0);
    return {
      productCode: p.code,
      nameLocal: p.name_zh || p.name_ja || p.code,
      nameZh: p.name_zh || null,
      nameJa: p.name_ja || null,
      countryOfOrigin: "TW",
      spec: p.name_zh || null,
      weightKg: weightKgPerUnit.toFixed(4),
      volumeCbm: volumeCbmPerUnit.toFixed(6),
      dutyRate: new Decimal(p.duty_rate).times(100).toFixed(4),
      storageType: p.frozen ? ("FROZEN" as const) : ("AMBIENT" as const),
      defaultSupplierId: supplierMox.id,
    };
  });
  const insertedProducts = await db.insert(s.products).values(productDefs).returning();
  const productByCode = Object.fromEntries(insertedProducts.map((p) => [p.productCode, p]));
  console.log(`  ${insertedProducts.length} products loaded (from ${historicalShipments.length} shipments).`);

  // ---------- Imports, cost items, finalize (mirrors routes/imports.ts exactly) ----------
  const sorted = [...historicalShipments].sort((a, b) => (a.ship_date ?? "").localeCompare(b.ship_date ?? ""));
  let seqByYear: Record<string, number> = {};
  const summary: { sheet: string; importNo: string; productCost: number; duty: number; consumptionTax: number; forwarderFee: number; landedTotal: number }[] = [];

  for (const shipment of sorted) {
    if (!shipment.ship_date || shipment.items.length === 0) continue;
    const year = shipment.ship_date.slice(0, 4);
    seqByYear[year] = (seqByYear[year] ?? 0) + 1;
    const importNo = formatDocumentNo("IMP", Number(year), seqByYear[year]);
    const importDate = `${shipment.ship_date.slice(0, 4)}-${shipment.ship_date.slice(4, 6)}-${shipment.ship_date.slice(6, 8)}`;

    const [imp] = await db.insert(s.imports).values({
      importNo, importDate,
      supplierId: supplierMox.id, buyerCompanyId: grc.id,
      currency: "JPY", exchangeRate: "1.00000000",
      warehouseId: whGrace.id,
      status: "DRAFT",
    }).returning();

    const importItems = await db.insert(s.importItems).values(
      shipment.items.map((it) => {
        const amountOriginal = new Decimal(it.total_jpy);
        return {
          importId: imp.id, productId: productByCode[it.code].id,
          quantity: String(it.qty), unitPrice: String(it.price_jpy),
          amountOriginal: amountOriginal.toFixed(4), amountJpy: amountOriginal.toFixed(4),
        };
      })
    ).returning();

    // --- cost item 1: Japan customs duty — MANUAL per line, pre-computed from each line's own 関税 rate ---
    const dutyManualAmounts: Record<string, number> = {};
    let dutyTotal = new Decimal(0);
    shipment.items.forEach((it, idx) => {
      const d = new Decimal(it.total_jpy).times(it.duty_rate).toDecimalPlaces(0);
      dutyManualAmounts[importItems[idx].id] = d.toNumber();
      dutyTotal = dutyTotal.plus(d);
    });
    const productCostTotal = shipment.items.reduce((a, it) => a.plus(it.total_jpy), new Decimal(0));
    const consumptionTax = productCostTotal.plus(dutyTotal).times(0.08).toDecimalPlaces(0);
    const forwarderFee = new Decimal(shipment.import_fee_jpy || 0);

    const basisItems: AllocationBasisItem[] = shipment.items.map((it, idx) => ({
      importItemId: importItems[idx].id,
      amountOriginal: it.total_jpy,
      weightKg: it.total_wt,
      quantity: it.qty,
      volumeCbm: it.total_cuft / 35.315,
      manualAmount: dutyManualAmounts[importItems[idx].id],
    }));

    const costItemDefs: { costCategory: string; amount: Decimal; allocationMethod: "MANUAL" | "BY_VALUE"; notes: string }[] = [
      { costCategory: "日本関税 (Japan customs duty)", amount: dutyTotal, allocationMethod: "MANUAL", notes: "各商品的合計/円 × 該商品原始関税稅率，加總後對過海關文件驗證誤差 <0.1%（見分析報告）。" },
      { costCategory: "日本消費税 (Japan import consumption tax, estimated)", amount: consumptionTax, allocationMethod: "BY_VALUE", notes: "以日本食品進口常用稅率 8%（消費稅+地方消費稅合計）估算，未逐批對海關文件驗證，如有實際數字請更新。" },
    ];
    if (forwarderFee.greaterThan(0)) {
      costItemDefs.push({
        costCategory: "報關・倉儲・卡車等雜費 (forwarder local charges)",
        amount: forwarderFee, allocationMethod: "BY_VALUE",
        notes: "取自 Excel 表格「進口費用」欄位（日本端），已對過內外トランスライン請款單金額一致。",
      });
    }

    for (const cd of costItemDefs) {
      const [costItem] = await db.insert(s.importCostItems).values({
        importId: imp.id, costCategory: cd.costCategory, amount: cd.amount.toFixed(4),
        currency: "JPY", allocationMethod: cd.allocationMethod, notes: cd.notes,
      }).returning();
      const lines = allocateCostItem(
        { importCostItemId: costItem.id, amount: cd.amount, allocationMethod: cd.allocationMethod },
        basisItems
      );
      await db.insert(s.costAllocationLines).values(
        lines.map((l) => ({
          importCostItemId: l.importCostItemId, importItemId: l.importItemId,
          allocatedAmountJpy: l.allocatedAmount.toFixed(4), allocationBasisValue: l.allocationBasisValue.toFixed(4),
        }))
      );
    }

    // --- finalize: landed cost + open GRACE inventory (mirrors routes/imports.ts finalize) ---
    let landedTotalForShipment = new Decimal(0);
    for (let idx = 0; idx < importItems.length; idx++) {
      const it = importItems[idx];
      const lines = await db.select().from(s.costAllocationLines).where(sqlRaw`import_item_id = ${it.id}`);
      const landed = computeLandedCost({
        importItemId: it.id, supplierAmountJpy: it.amountJpy, quantity: it.quantity,
        allocatedCosts: lines.map((l) => l.allocatedAmountJpy),
      });
      landedTotalForShipment = landedTotalForShipment.plus(landed.landedTotalCost);
      await db.update(s.importItems).set({
        landedUnitCost: landed.landedUnitCost.toFixed(4), landedTotalCost: landed.landedTotalCost.toFixed(4),
      }).where(sqlRaw`id = ${it.id}`);

      const histItem = shipment.items[idx];
      const [lot] = await db.insert(s.inventoryLots).values({
        companyId: grc.id, warehouseId: whGrace.id, productId: it.productId,
        lotNo: `LOT-${importNo}-${it.productId.slice(0, 8)}`, sourceImportId: imp.id,
        expiryDate: parseExpiry(histItem.expiry_raw),
        quantityOnHand: it.quantity, unitCost: landed.landedUnitCost.toFixed(4),
        receivedDate: new Date(importDate),
      }).returning();

      await db.insert(s.inventoryTransactions).values({
        companyId: grc.id, warehouseId: whGrace.id, productId: it.productId, lotId: lot.id,
        transactionType: "IN", quantity: it.quantity, unitCost: landed.landedUnitCost.toFixed(4),
        referenceType: "Import", referenceId: imp.id, createdById: adminUser.id,
        transactionDate: new Date(importDate),
      });
    }

    await db.update(s.imports).set({ status: "COSTED" }).where(sqlRaw`id = ${imp.id}`);

    summary.push({
      sheet: shipment.sheet, importNo,
      productCost: productCostTotal.toNumber(), duty: dutyTotal.toNumber(),
      consumptionTax: consumptionTax.toNumber(), forwarderFee: forwarderFee.toNumber(),
      landedTotal: landedTotalForShipment.toNumber(),
    });
    console.log(`  ${importNo} (${shipment.sheet}): product ¥${productCostTotal.toFixed(0)} + duty ¥${dutyTotal.toFixed(0)} + tax ¥${consumptionTax.toFixed(0)} + fwd ¥${forwarderFee.toFixed(0)} = landed ¥${landedTotalForShipment.toFixed(0)}`);
  }

  // Keep document_sequences in sync so the running app's own IMP numbering continues after these.
  for (const [year, count] of Object.entries(seqByYear)) {
    await db.insert(s.documentSequences).values({
      companyId: grc.id, documentType: "IMP", year: Number(year), lastNumber: count,
    }).onConflictDoUpdate({
      target: [s.documentSequences.companyId, s.documentSequences.documentType, s.documentSequences.year],
      set: { lastNumber: count },
    });
  }
  await db.insert(s.documentSequences).values([
    { companyId: grc.id, documentType: "QT", year: new Date().getFullYear(), lastNumber: 0 },
    { companyId: grc.id, documentType: "SO", year: new Date().getFullYear(), lastNumber: 0 },
    { companyId: grc.id, documentType: "DO", year: new Date().getFullYear(), lastNumber: 0 },
    { companyId: grc.id, documentType: "INV", year: new Date().getFullYear(), lastNumber: 0 },
    { companyId: grc.id, documentType: "PAY", year: new Date().getFullYear(), lastNumber: 0 },
  ]);

  console.log(`Real data load complete: ${summary.length} imports, ${insertedProducts.length} products.`);
  return summary;
}

if (require.main === module) {
  runRealDataSeed().catch((err) => {
    console.error(err);
    process.exit(1);
  }).finally(async () => {
    await pool.end();
  });
}
