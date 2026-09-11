CREATE TABLE "import_item_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_item_id" uuid NOT NULL,
	"quantity_delta" numeric(18, 4) DEFAULT '0' NOT NULL,
	"cost_delta" numeric(18, 4) DEFAULT '0' NOT NULL,
	"landed_unit_cost_before" numeric(18, 4) NOT NULL,
	"landed_unit_cost_after" numeric(18, 4) NOT NULL,
	"reason" text NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_item_corrections" ADD CONSTRAINT "import_item_corrections_import_item_id_import_items_id_fk" FOREIGN KEY ("import_item_id") REFERENCES "public"."import_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_item_corrections" ADD CONSTRAINT "import_item_corrections_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;