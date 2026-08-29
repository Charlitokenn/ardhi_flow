-- Turns a contract from "one plot" into a bucket that can hold several
-- plots (always within a single project). See contractPlots in
-- drizzle/tenant/schema.ts for the full design notes.
--
-- Ordered as an expand -> backfill -> contract migration so it's safe to
-- run against tenants that already have live contracts/installments:
-- new columns land nullable, get backfilled from the data that's about to
-- be retired, THEN get locked to NOT NULL and constrained. The old
-- plot_sale_contracts.plot_id column (and everything built on it) is only
-- dropped at the very end, once nothing below still reads it.

-- 1. The new bucket table. Empty at this point, so its own NOT NULL
-- columns are no issue yet.
CREATE TABLE "contract_plots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"plot_id" uuid NOT NULL,
	"allocated_value" numeric NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancellation_fee_amount" numeric,
	"refunded_amount" numeric,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "contract_plots" ADD CONSTRAINT "contract_plots_contract_id_plot_sale_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."plot_sale_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_plots" ADD CONSTRAINT "contract_plots_plot_id_plots_id_fk" FOREIGN KEY ("plot_id") REFERENCES "public"."plots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_plots" ADD CONSTRAINT "contract_plots_id_plot_id_unique" UNIQUE("id","plot_id");--> statement-breakpoint
CREATE INDEX "contract_plots_contract_idx" ON "contract_plots" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "contract_plots_plot_idx" ON "contract_plots" USING btree ("plot_id");--> statement-breakpoint

-- 2. New columns added nullable first — existing rows have nothing to put
-- there yet. Backfilled in steps 3-5, then locked down in step 6.
ALTER TABLE "plot_sale_contracts" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "contract_installments" ADD COLUMN "contract_plot_id" uuid;--> statement-breakpoint
ALTER TABLE "contract_installments" ADD COLUMN "plot_id" uuid;--> statement-breakpoint

-- 3. Backfill plot_sale_contracts.project_id from the plot each existing
-- contract is (for a few more statements) still linked to via plot_id.
UPDATE "plot_sale_contracts" SET "project_id" = "plots"."project_id"
FROM "plots"
WHERE "plots"."id" = "plot_sale_contracts"."plot_id";--> statement-breakpoint

-- 4. Backfill the bucket itself: every existing contract becomes a
-- single-plot bucket, carrying over its old plot_id and using its full
-- total_contract_value as that one plot's allocated_value (a contract's
-- value and its one plot's value are the same thing until this migration).
INSERT INTO "contract_plots" ("contract_id", "plot_id", "allocated_value", "cancelled_at", "created_at", "updated_at")
SELECT "id", "plot_id", "total_contract_value",
    CASE
        WHEN "status" IN ('ACTIVE', 'DELINQUENT') THEN NULL
        ELSE COALESCE("cancelled_at", "completed_at", "updated_at", "created_at", now())
    END,
    "created_at", "updated_at"
FROM "plot_sale_contracts";--> statement-breakpoint

-- 5. Backfill contract_installments' new plot-scoping columns. Joining on
-- contract_id alone is safe here — at this point every contract has
-- exactly one contract_plots row (step 4), so the join can't be ambiguous.
-- Multi-plot buckets only start existing after this migration ships.
UPDATE "contract_installments" SET
    "contract_plot_id" = "contract_plots"."id",
    "plot_id" = "contract_plots"."plot_id"
FROM "contract_plots"
WHERE "contract_plots"."contract_id" = "contract_installments"."contract_id";--> statement-breakpoint

-- 6. Every row now has a value in all three columns — lock them down.
ALTER TABLE "plot_sale_contracts" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contract_installments" ALTER COLUMN "contract_plot_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contract_installments" ALTER COLUMN "plot_id" SET NOT NULL;--> statement-breakpoint

-- 7. Constraints/indexes for the newly-locked columns.
ALTER TABLE "plot_sale_contracts" ADD CONSTRAINT "plot_sale_contracts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plot_sale_contracts_project_idx" ON "plot_sale_contracts" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "contract_installments" ADD CONSTRAINT "contract_installments_contract_plot_id_contract_plots_id_fk" FOREIGN KEY ("contract_plot_id") REFERENCES "public"."contract_plots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_installments" ADD CONSTRAINT "contract_installments_plot_id_plots_id_fk" FOREIGN KEY ("plot_id") REFERENCES "public"."plots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_installments" ADD CONSTRAINT "contract_installments_contract_plot_plot_fk" FOREIGN KEY ("contract_plot_id","plot_id") REFERENCES "public"."contract_plots"("id","plot_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_installments_contract_plot_idx" ON "contract_installments" USING btree ("contract_plot_id");--> statement-breakpoint
CREATE INDEX "contract_installments_plot_idx" ON "contract_installments" USING btree ("plot_id");--> statement-breakpoint

-- 8. The "a plot can only be in one live bucket at a time" guarantee, now
-- living on contract_plots instead of plot_sale_contracts — see the
-- contract_plots_plot_active_unique comment in schema.ts for why this uses
-- cancelled_at rather than the parent contract's own status.
CREATE UNIQUE INDEX "contract_plots_plot_active_unique" ON "contract_plots" USING btree ("plot_id") WHERE cancelled_at IS NULL;--> statement-breakpoint

-- 9. Retire the old single-plot column and everything built on it — only
-- now that every read of it above is done.
ALTER TABLE "plot_sale_contracts" DROP CONSTRAINT "plot_sale_contracts_plot_id_plots_id_fk";--> statement-breakpoint
DROP INDEX "plot_sale_contracts_plot_idx";--> statement-breakpoint
DROP INDEX "plot_sale_contracts_one_active_per_plot";--> statement-breakpoint
ALTER TABLE "plot_sale_contracts" DROP COLUMN "plot_id";
