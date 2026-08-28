ALTER TYPE "public"."allocation_method" ADD VALUE 'BY_CBM' BEFORE 'MANUAL';--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "volume_cbm" numeric(12, 6);