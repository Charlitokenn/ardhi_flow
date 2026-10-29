ALTER TABLE "commission_settings" ADD COLUMN "default_cancellation_fee_percent" numeric DEFAULT '10' NOT NULL;--> statement-breakpoint
ALTER TABLE "plots" ADD COLUMN "price_per_sqm" numeric;