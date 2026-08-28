import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => uuid("id").primaryKey().defaultRandom();
const money = (name: string) => numeric(name, { precision: 18, scale: 4 });
const rate = (name: string) => numeric(name, { precision: 7, scale: 4 });
const fxRate = (name: string) => numeric(name, { precision: 18, scale: 8 });

// ============================================================
// Enums
// ============================================================
export const storageTypeEnum = pgEnum("storage_type", ["FROZEN", "CHILLED", "AMBIENT"]);
export const systemDocumentTypeEnum = pgEnum("system_document_type", ["QT", "SO", "DO", "INV", "PAY", "IMP"]);
export const importStatusEnum = pgEnum("import_status", ["DRAFT", "IN_TRANSIT", "ARRIVED", "COSTED", "CLOSED"]);
/** §05.2 — not hardcoded to one method: chosen per cost item at entry time (freight→CBM, warehouse→weight,
 *  duty→declared value, etc — 2026-08-28 business rule confirmation). */
export const allocationMethodEnum = pgEnum("allocation_method", ["BY_VALUE", "BY_WEIGHT", "BY_QTY", "BY_CBM", "MANUAL"]);
export const inventoryTxnTypeEnum = pgEnum("inventory_txn_type", [
  "IN", "OUT", "TRANSFER", "ADJUST", "SCRAP", "COUNT", "RETURN", "INTERCOMPANY_IN", "INTERCOMPANY_OUT",
]);
export const guardModeEnum = pgEnum("guard_mode", ["WARNING_ONLY", "APPROVAL_REQUIRED", "BLOCKED"]);
export const quotationStatusEnum = pgEnum("quotation_status", ["DRAFT", "SENT", "ACCEPTED", "EXPIRED", "CANCELLED"]);
export const flowTemplateEnum = pgEnum("flow_template", ["STANDARD", "PRICED_ONLY", "INVOICE_FIRST"]);
export const salesOrderStatusEnum = pgEnum("sales_order_status", [
  "DRAFT", "CONFIRMED", "PARTIALLY_DELIVERED", "DELIVERED", "CANCELLED",
]);
export const deliveryStatusEnum = pgEnum("delivery_status", ["DRAFT", "SHIPPED", "RECEIVED"]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED",
]);

// ============================================================
// D1 — Master
// ============================================================
export const companies = pgTable("companies", {
  id: id(),
  code: varchar("code", { length: 16 }).notNull().unique(),
  nameLocal: varchar("name_local", { length: 255 }).notNull(),
  nameEn: varchar("name_en", { length: 255 }).notNull(),
  country: varchar("country", { length: 8 }).notNull(),
  baseCurrency: varchar("base_currency", { length: 8 }).notNull(),
  taxId: varchar("tax_id", { length: 64 }),
  address: text("address"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const warehouses = pgTable("warehouses", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  address: text("address"),
  isActive: boolean("is_active").notNull().default(true),
});

export const roles = pgTable("roles", {
  id: id(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
});

export const rolePermissions = pgTable("role_permissions", {
  id: id(),
  roleId: uuid("role_id").notNull().references(() => roles.id),
  module: varchar("module", { length: 64 }).notNull(),
  canView: boolean("can_view").notNull().default(false),
  canEdit: boolean("can_edit").notNull().default(false),
  canApprove: boolean("can_approve").notNull().default(false),
});

export const users = pgTable("users", {
  id: id(),
  companyId: uuid("company_id").references(() => companies.id),
  name: varchar("name", { length: 128 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  roleId: uuid("role_id").notNull().references(() => roles.id),
  storeWarehouseId: uuid("store_warehouse_id").references(() => warehouses.id),
  isActive: boolean("is_active").notNull().default(true),
});

export const suppliers = pgTable("suppliers", {
  id: id(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  country: varchar("country", { length: 8 }),
  currency: varchar("currency", { length: 8 }),
  contact: text("contact"),
  paymentTerms: varchar("payment_terms", { length: 128 }),
  linkedCompanyId: uuid("linked_company_id").references(() => companies.id),
  isActive: boolean("is_active").notNull().default(true),
});

export const products = pgTable("products", {
  id: id(),
  productCode: varchar("product_code", { length: 64 }).notNull().unique(),
  nameLocal: varchar("name_local", { length: 255 }).notNull(),
  nameJa: varchar("name_ja", { length: 255 }),
  nameZh: varchar("name_zh", { length: 255 }),
  janCode: varchar("jan_code", { length: 32 }),
  category: varchar("category", { length: 128 }),
  brand: varchar("brand", { length: 128 }),
  defaultSupplierId: uuid("default_supplier_id").references(() => suppliers.id),
  countryOfOrigin: varchar("country_of_origin", { length: 8 }),
  hsCode: varchar("hs_code", { length: 32 }),
  spec: varchar("spec", { length: 255 }),
  unit: varchar("unit", { length: 32 }),
  unitsPerCase: integer("units_per_case"),
  weightKg: numeric("weight_kg", { precision: 12, scale: 4 }),
  /** m³ per unit — basis for BY_CBM allocation (typically ocean/air freight), mirrors weightKg's role for BY_WEIGHT. */
  volumeCbm: numeric("volume_cbm", { precision: 12, scale: 6 }),
  storageMethod: varchar("storage_method", { length: 255 }),
  storageType: storageTypeEnum("storage_type").notNull().default("AMBIENT"),
  shelfLifeDays: integer("shelf_life_days"),
  lotManaged: boolean("lot_managed").notNull().default(true),
  dutyRate: rate("duty_rate"),
  consumptionTaxRate: rate("consumption_tax_rate"),
  isActive: boolean("is_active").notNull().default(true),
});

export const customers = pgTable("customers", {
  id: id(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  billingAddress: text("billing_address"),
  shippingAddress: text("shipping_address"),
  contact: text("contact"),
  paymentTerms: varchar("payment_terms", { length: 128 }),
  currency: varchar("currency", { length: 8 }),
  defaultTaxRate: rate("default_tax_rate"),
  linkedCompanyId: uuid("linked_company_id").references(() => companies.id),
  isActive: boolean("is_active").notNull().default(true),
});

export const exchangeRates = pgTable("exchange_rates", {
  id: id(),
  fromCurrency: varchar("from_currency", { length: 8 }).notNull(),
  toCurrency: varchar("to_currency", { length: 8 }).notNull(),
  rate: fxRate("rate").notNull(),
  rateDate: date("rate_date").notNull(),
  source: varchar("source", { length: 64 }),
});

// ============================================================
// D6 — System
// ============================================================
export const documentSequences = pgTable("document_sequences", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  documentType: systemDocumentTypeEnum("document_type").notNull(),
  year: integer("year").notNull(),
  lastNumber: integer("last_number").notNull().default(0),
}, (t) => [unique().on(t.companyId, t.documentType, t.year)]);

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  tableName: varchar("table_name", { length: 64 }).notNull(),
  recordId: varchar("record_id", { length: 64 }).notNull(),
  action: varchar("action", { length: 16 }).notNull(),
  fieldChanged: varchar("field_changed", { length: 128 }),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedById: uuid("changed_by_id").notNull().references(() => users.id),
  changedAt: timestamp("changed_at").notNull().defaultNow(),
});

// ============================================================
// D2 — Import & Landed Cost
// ============================================================
export const imports = pgTable("imports", {
  id: id(),
  importNo: varchar("import_no", { length: 32 }).notNull().unique(),
  importDate: date("import_date"),
  etd: date("etd"),
  eta: date("eta"),
  arrivalDate: date("arrival_date"),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  buyerCompanyId: uuid("buyer_company_id").notNull().references(() => companies.id),
  sourceSalesOrderId: uuid("source_sales_order_id"), // FK added after sales_orders defined (circular) — see relations
  currency: varchar("currency", { length: 8 }).notNull(),
  exchangeRate: fxRate("exchange_rate").notNull(),
  invoiceNo: varchar("invoice_no", { length: 64 }),
  blAwbNo: varchar("bl_awb_no", { length: 64 }),
  containerNo: varchar("container_no", { length: 64 }),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  customsBroker: varchar("customs_broker", { length: 128 }),
  status: importStatusEnum("status").notNull().default("DRAFT"),
});

export const importItems = pgTable("import_items", {
  id: id(),
  importId: uuid("import_id").notNull().references(() => imports.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  quantity: money("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
  amountOriginal: money("amount_original").notNull(),
  amountJpy: money("amount_jpy").notNull(),
  landedUnitCost: money("landed_unit_cost"),
  landedTotalCost: money("landed_total_cost"),
});

export const importCostItems = pgTable("import_cost_items", {
  id: id(),
  importId: uuid("import_id").notNull().references(() => imports.id),
  costCategory: varchar("cost_category", { length: 128 }).notNull(),
  amount: money("amount").notNull(),
  currency: varchar("currency", { length: 8 }).notNull(),
  allocationMethod: allocationMethodEnum("allocation_method").notNull(),
  notes: text("notes"),
});

export const costAllocationLines = pgTable("cost_allocation_lines", {
  id: id(),
  importCostItemId: uuid("import_cost_item_id").notNull().references(() => importCostItems.id),
  importItemId: uuid("import_item_id").notNull().references(() => importItems.id),
  allocatedAmountJpy: money("allocated_amount_jpy").notNull(),
  allocationBasisValue: numeric("allocation_basis_value", { precision: 18, scale: 6 }),
});

// ============================================================
// D3 — Inventory
// ============================================================
export const inventoryLots = pgTable("inventory_lots", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  lotNo: varchar("lot_no", { length: 64 }).notNull(),
  sourceImportId: uuid("source_import_id").references(() => imports.id),
  expiryDate: date("expiry_date"),
  quantityOnHand: money("quantity_on_hand").notNull(),
  unitCost: money("unit_cost").notNull(),
  receivedDate: timestamp("received_date").notNull().defaultNow(),
});

export const inventoryTransactions = pgTable("inventory_transactions", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  lotId: uuid("lot_id").references(() => inventoryLots.id),
  transactionType: inventoryTxnTypeEnum("transaction_type").notNull(),
  quantity: money("quantity").notNull(),
  unitCost: money("unit_cost"),
  referenceType: varchar("reference_type", { length: 32 }),
  referenceId: uuid("reference_id"),
  linkedTransactionId: uuid("linked_transaction_id"),
  transactionDate: timestamp("transaction_date").notNull().defaultNow(),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
});

// ============================================================
// D4 — Pricing
// ============================================================
export const productPricingPolicy = pgTable("product_pricing_policy", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  targetMarginPct: rate("target_margin_pct").notNull(),
  minimumMarginPct: rate("minimum_margin_pct").notNull(),
  minimumSellingPrice: money("minimum_selling_price"),
  guardMode: guardModeEnum("guard_mode").notNull().default("WARNING_ONLY"),
  /** §21 Low Stock alert threshold, per company+product. */
  minimumStockQty: numeric("minimum_stock_qty", { precision: 18, scale: 4 }),
}, (t) => [unique().on(t.companyId, t.productId)]);

// ============================================================
// D5 — Sales Document Chain
// ============================================================
export const quotations = pgTable("quotations", {
  id: id(),
  quotationNo: varchar("quotation_no", { length: 32 }).notNull().unique(),
  sellerCompanyId: uuid("seller_company_id").notNull().references(() => companies.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  quotationDate: timestamp("quotation_date").notNull().defaultNow(),
  validUntil: date("valid_until"),
  currency: varchar("currency", { length: 8 }).notNull(),
  paymentTerms: varchar("payment_terms", { length: 128 }),
  deliveryTerms: varchar("delivery_terms", { length: 128 }),
  billingAddress: text("billing_address"),
  shippingAddress: text("shipping_address"),
  contactPerson: varchar("contact_person", { length: 128 }),
  status: quotationStatusEnum("status").notNull().default("DRAFT"),
  currentVersionNo: integer("current_version_no").notNull().default(1),
});

export const quotationVersions = pgTable("quotation_versions", {
  id: id(),
  quotationId: uuid("quotation_id").notNull().references(() => quotations.id),
  versionNo: integer("version_no").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  remarks: text("remarks"),
  isCurrent: boolean("is_current").notNull().default(true),
}, (t) => [unique().on(t.quotationId, t.versionNo)]);

export const quotationItems = pgTable("quotation_items", {
  id: id(),
  quotationVersionId: uuid("quotation_version_id").notNull().references(() => quotationVersions.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  quantity: money("quantity").notNull(),
  unit: varchar("unit", { length: 32 }),
  unitPrice: money("unit_price").notNull(),
  discount: money("discount").notNull().default("0"),
  taxRate: rate("tax_rate").notNull().default("0"),
  amount: money("amount").notNull(),
  costSnapshot: money("cost_snapshot").notNull(),
  grossProfit: money("gross_profit").notNull(),
  grossMarginPct: rate("gross_margin_pct").notNull(),
});

export const salesOrders = pgTable("sales_orders", {
  id: id(),
  salesOrderNo: varchar("sales_order_no", { length: 32 }).notNull().unique(),
  sourceQuotationVersionId: uuid("source_quotation_version_id").references(() => quotationVersions.id),
  sellerCompanyId: uuid("seller_company_id").notNull().references(() => companies.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  orderDate: timestamp("order_date").notNull().defaultNow(),
  deliveryDate: date("delivery_date"),
  paymentTerms: varchar("payment_terms", { length: 128 }),
  currency: varchar("currency", { length: 8 }).notNull(),
  flowTemplate: flowTemplateEnum("flow_template").notNull().default("STANDARD"),
  status: salesOrderStatusEnum("status").notNull().default("DRAFT"),
});

export const salesOrderItems = pgTable("sales_order_items", {
  id: id(),
  salesOrderId: uuid("sales_order_id").notNull().references(() => salesOrders.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  quantity: money("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
  discount: money("discount").notNull().default("0"),
  taxRate: rate("tax_rate").notNull().default("0"),
  amount: money("amount").notNull(),
  reservedQuantity: money("reserved_quantity").notNull().default("0"),
  deliveredQuantity: money("delivered_quantity").notNull().default("0"),
});

export const deliveries = pgTable("deliveries", {
  id: id(),
  deliveryNo: varchar("delivery_no", { length: 32 }).notNull().unique(),
  salesOrderId: uuid("sales_order_id").notNull().references(() => salesOrders.id),
  deliveryDate: timestamp("delivery_date").notNull().defaultNow(),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  status: deliveryStatusEnum("status").notNull().default("DRAFT"),
});

export const deliveryItems = pgTable("delivery_items", {
  id: id(),
  deliveryId: uuid("delivery_id").notNull().references(() => deliveries.id),
  salesOrderItemId: uuid("sales_order_item_id").notNull().references(() => salesOrderItems.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  lotId: uuid("lot_id").notNull().references(() => inventoryLots.id),
  quantity: money("quantity").notNull(),
  unitCostAtShipment: money("unit_cost_at_shipment").notNull(),
});

export const invoices = pgTable("invoices", {
  id: id(),
  invoiceNo: varchar("invoice_no", { length: 32 }).notNull().unique(),
  sellerCompanyId: uuid("seller_company_id").notNull().references(() => companies.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  salesOrderId: uuid("sales_order_id").references(() => salesOrders.id),
  deliveryId: uuid("delivery_id").references(() => deliveries.id),
  invoiceDate: timestamp("invoice_date").notNull().defaultNow(),
  dueDate: date("due_date"),
  currency: varchar("currency", { length: 8 }).notNull(),
  subtotal: money("subtotal").notNull(),
  discount: money("discount").notNull().default("0"),
  tax: money("tax").notNull(),
  total: money("total").notNull(),
  status: invoiceStatusEnum("status").notNull().default("DRAFT"),
});

export const invoiceItems = pgTable("invoice_items", {
  id: id(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  quantity: money("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
  taxRate: rate("tax_rate").notNull().default("0"),
  amount: money("amount").notNull(),
  costSnapshot: money("cost_snapshot").notNull(),
  grossProfit: money("gross_profit").notNull(),
  grossMarginPct: rate("gross_margin_pct").notNull(),
});

export const payments = pgTable("payments", {
  id: id(),
  paymentNo: varchar("payment_no", { length: 32 }).notNull().unique(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  paymentDate: timestamp("payment_date").notNull().defaultNow(),
  paymentAmount: money("payment_amount").notNull(),
  paymentMethod: varchar("payment_method", { length: 64 }),
  bankAccount: varchar("bank_account", { length: 128 }),
  outstandingAmount: money("outstanding_amount").notNull(),
});
