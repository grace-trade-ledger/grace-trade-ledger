CREATE TYPE "public"."allocation_method" AS ENUM('BY_VALUE', 'BY_WEIGHT', 'BY_QTY', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('DRAFT', 'SHIPPED', 'RECEIVED');--> statement-breakpoint
CREATE TYPE "public"."flow_template" AS ENUM('STANDARD', 'PRICED_ONLY', 'INVOICE_FIRST');--> statement-breakpoint
CREATE TYPE "public"."guard_mode" AS ENUM('WARNING_ONLY', 'APPROVAL_REQUIRED', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('DRAFT', 'IN_TRANSIT', 'ARRIVED', 'COSTED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."inventory_txn_type" AS ENUM('IN', 'OUT', 'TRANSFER', 'ADJUST', 'SCRAP', 'COUNT', 'RETURN', 'INTERCOMPANY_IN', 'INTERCOMPANY_OUT');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('DRAFT', 'ISSUED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."quotation_status" AS ENUM('DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."sales_order_status" AS ENUM('DRAFT', 'CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."storage_type" AS ENUM('FROZEN', 'CHILLED', 'AMBIENT');--> statement-breakpoint
CREATE TYPE "public"."system_document_type" AS ENUM('QT', 'SO', 'DO', 'INV', 'PAY', 'IMP');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_name" varchar(64) NOT NULL,
	"record_id" varchar(64) NOT NULL,
	"action" varchar(16) NOT NULL,
	"field_changed" varchar(128),
	"old_value" text,
	"new_value" text,
	"changed_by_id" uuid NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(16) NOT NULL,
	"name_local" varchar(255) NOT NULL,
	"name_en" varchar(255) NOT NULL,
	"country" varchar(8) NOT NULL,
	"base_currency" varchar(8) NOT NULL,
	"tax_id" varchar(64),
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "cost_allocation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_cost_item_id" uuid NOT NULL,
	"import_item_id" uuid NOT NULL,
	"allocated_amount_jpy" numeric(18, 4) NOT NULL,
	"allocation_basis_value" numeric(18, 6)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"billing_address" text,
	"shipping_address" text,
	"contact" text,
	"payment_terms" varchar(128),
	"currency" varchar(8),
	"default_tax_rate" numeric(7, 4),
	"linked_company_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "customers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_no" varchar(32) NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"delivery_date" timestamp DEFAULT now() NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"status" "delivery_status" DEFAULT 'DRAFT' NOT NULL,
	CONSTRAINT "deliveries_delivery_no_unique" UNIQUE("delivery_no")
);
--> statement-breakpoint
CREATE TABLE "delivery_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"sales_order_item_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_cost_at_shipment" numeric(18, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"document_type" "system_document_type" NOT NULL,
	"year" integer NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "document_sequences_company_id_document_type_year_unique" UNIQUE("company_id","document_type","year")
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_currency" varchar(8) NOT NULL,
	"to_currency" varchar(8) NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"rate_date" date NOT NULL,
	"source" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "import_cost_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"cost_category" varchar(128) NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"currency" varchar(8) NOT NULL,
	"allocation_method" "allocation_method" NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "import_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"amount_original" numeric(18, 4) NOT NULL,
	"amount_jpy" numeric(18, 4) NOT NULL,
	"landed_unit_cost" numeric(18, 4),
	"landed_total_cost" numeric(18, 4)
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_no" varchar(32) NOT NULL,
	"import_date" date,
	"etd" date,
	"eta" date,
	"arrival_date" date,
	"supplier_id" uuid NOT NULL,
	"buyer_company_id" uuid NOT NULL,
	"source_sales_order_id" uuid,
	"currency" varchar(8) NOT NULL,
	"exchange_rate" numeric(18, 8) NOT NULL,
	"invoice_no" varchar(64),
	"bl_awb_no" varchar(64),
	"container_no" varchar(64),
	"warehouse_id" uuid NOT NULL,
	"customs_broker" varchar(128),
	"status" "import_status" DEFAULT 'DRAFT' NOT NULL,
	CONSTRAINT "imports_import_no_unique" UNIQUE("import_no")
);
--> statement-breakpoint
CREATE TABLE "inventory_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"lot_no" varchar(64) NOT NULL,
	"source_import_id" uuid,
	"expiry_date" date,
	"quantity_on_hand" numeric(18, 4) NOT NULL,
	"unit_cost" numeric(18, 4) NOT NULL,
	"received_date" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"lot_id" uuid,
	"transaction_type" "inventory_txn_type" NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_cost" numeric(18, 4),
	"reference_type" varchar(32),
	"reference_id" uuid,
	"linked_transaction_id" uuid,
	"transaction_date" timestamp DEFAULT now() NOT NULL,
	"created_by_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"tax_rate" numeric(7, 4) DEFAULT '0' NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"cost_snapshot" numeric(18, 4) NOT NULL,
	"gross_profit" numeric(18, 4) NOT NULL,
	"gross_margin_pct" numeric(7, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_no" varchar(32) NOT NULL,
	"seller_company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"sales_order_id" uuid,
	"delivery_id" uuid,
	"invoice_date" timestamp DEFAULT now() NOT NULL,
	"due_date" date,
	"currency" varchar(8) NOT NULL,
	"subtotal" numeric(18, 4) NOT NULL,
	"discount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"tax" numeric(18, 4) NOT NULL,
	"total" numeric(18, 4) NOT NULL,
	"status" "invoice_status" DEFAULT 'DRAFT' NOT NULL,
	CONSTRAINT "invoices_invoice_no_unique" UNIQUE("invoice_no")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_no" varchar(32) NOT NULL,
	"invoice_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"payment_date" timestamp DEFAULT now() NOT NULL,
	"payment_amount" numeric(18, 4) NOT NULL,
	"payment_method" varchar(64),
	"bank_account" varchar(128),
	"outstanding_amount" numeric(18, 4) NOT NULL,
	CONSTRAINT "payments_payment_no_unique" UNIQUE("payment_no")
);
--> statement-breakpoint
CREATE TABLE "product_pricing_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"target_margin_pct" numeric(7, 4) NOT NULL,
	"minimum_margin_pct" numeric(7, 4) NOT NULL,
	"minimum_selling_price" numeric(18, 4),
	"guard_mode" "guard_mode" DEFAULT 'WARNING_ONLY' NOT NULL,
	CONSTRAINT "product_pricing_policy_company_id_product_id_unique" UNIQUE("company_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_code" varchar(64) NOT NULL,
	"name_local" varchar(255) NOT NULL,
	"name_ja" varchar(255),
	"name_zh" varchar(255),
	"jan_code" varchar(32),
	"category" varchar(128),
	"brand" varchar(128),
	"default_supplier_id" uuid,
	"country_of_origin" varchar(8),
	"hs_code" varchar(32),
	"spec" varchar(255),
	"unit" varchar(32),
	"units_per_case" integer,
	"weight_kg" numeric(12, 4),
	"storage_method" varchar(255),
	"storage_type" "storage_type" DEFAULT 'AMBIENT' NOT NULL,
	"shelf_life_days" integer,
	"lot_managed" boolean DEFAULT true NOT NULL,
	"duty_rate" numeric(7, 4),
	"consumption_tax_rate" numeric(7, 4),
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "products_product_code_unique" UNIQUE("product_code")
);
--> statement-breakpoint
CREATE TABLE "quotation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_version_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit" varchar(32),
	"unit_price" numeric(18, 4) NOT NULL,
	"discount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(7, 4) DEFAULT '0' NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"cost_snapshot" numeric(18, 4) NOT NULL,
	"gross_profit" numeric(18, 4) NOT NULL,
	"gross_margin_pct" numeric(7, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_id" uuid NOT NULL,
	"remarks" text,
	"is_current" boolean DEFAULT true NOT NULL,
	CONSTRAINT "quotation_versions_quotation_id_version_no_unique" UNIQUE("quotation_id","version_no")
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_no" varchar(32) NOT NULL,
	"seller_company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"quotation_date" timestamp DEFAULT now() NOT NULL,
	"valid_until" date,
	"currency" varchar(8) NOT NULL,
	"payment_terms" varchar(128),
	"delivery_terms" varchar(128),
	"billing_address" text,
	"shipping_address" text,
	"contact_person" varchar(128),
	"status" "quotation_status" DEFAULT 'DRAFT' NOT NULL,
	"current_version_no" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "quotations_quotation_no_unique" UNIQUE("quotation_no")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"module" varchar(64) NOT NULL,
	"can_view" boolean DEFAULT false NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL,
	"can_approve" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sales_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"discount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(7, 4) DEFAULT '0' NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"reserved_quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
	"delivered_quantity" numeric(18, 4) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_order_no" varchar(32) NOT NULL,
	"source_quotation_version_id" uuid,
	"seller_company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_date" timestamp DEFAULT now() NOT NULL,
	"delivery_date" date,
	"payment_terms" varchar(128),
	"currency" varchar(8) NOT NULL,
	"flow_template" "flow_template" DEFAULT 'STANDARD' NOT NULL,
	"status" "sales_order_status" DEFAULT 'DRAFT' NOT NULL,
	CONSTRAINT "sales_orders_sales_order_no_unique" UNIQUE("sales_order_no")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"country" varchar(8),
	"currency" varchar(8),
	"contact" text,
	"payment_terms" varchar(128),
	"linked_company_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "suppliers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"name" varchar(128) NOT NULL,
	"email" varchar(255) NOT NULL,
	"role_id" uuid NOT NULL,
	"store_warehouse_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(64) NOT NULL,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocation_lines" ADD CONSTRAINT "cost_allocation_lines_import_cost_item_id_import_cost_items_id_fk" FOREIGN KEY ("import_cost_item_id") REFERENCES "public"."import_cost_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_allocation_lines" ADD CONSTRAINT "cost_allocation_lines_import_item_id_import_items_id_fk" FOREIGN KEY ("import_item_id") REFERENCES "public"."import_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_linked_company_id_companies_id_fk" FOREIGN KEY ("linked_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_sales_order_item_id_sales_order_items_id_fk" FOREIGN KEY ("sales_order_item_id") REFERENCES "public"."sales_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_cost_items" ADD CONSTRAINT "import_cost_items_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_items" ADD CONSTRAINT "import_items_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_items" ADD CONSTRAINT "import_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_buyer_company_id_companies_id_fk" FOREIGN KEY ("buyer_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_source_import_id_imports_id_fk" FOREIGN KEY ("source_import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_seller_company_id_companies_id_fk" FOREIGN KEY ("seller_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_pricing_policy" ADD CONSTRAINT "product_pricing_policy_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_pricing_policy" ADD CONSTRAINT "product_pricing_policy_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_default_supplier_id_suppliers_id_fk" FOREIGN KEY ("default_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_version_id_quotation_versions_id_fk" FOREIGN KEY ("quotation_version_id") REFERENCES "public"."quotation_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_seller_company_id_companies_id_fk" FOREIGN KEY ("seller_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_source_quotation_version_id_quotation_versions_id_fk" FOREIGN KEY ("source_quotation_version_id") REFERENCES "public"."quotation_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_seller_company_id_companies_id_fk" FOREIGN KEY ("seller_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_linked_company_id_companies_id_fk" FOREIGN KEY ("linked_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_store_warehouse_id_warehouses_id_fk" FOREIGN KEY ("store_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;