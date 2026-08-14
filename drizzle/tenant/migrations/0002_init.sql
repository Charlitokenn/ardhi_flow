CREATE TYPE "public"."expense_category" AS ENUM('LAND_ACQUISITION', 'SALES_COMMISSION', 'SALARY', 'RENT', 'UTILITIES', 'MARKETING', 'PROFESSIONAL_FEES', 'TRANSPORT', 'OFFICE_SUPPLIES', 'OTHER');--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "expense_category" NOT NULL,
	"description" text,
	"amount" numeric NOT NULL,
	"account_id" uuid,
	"payee_contact_id" uuid,
	"project_id" uuid,
	"commission_payout_id" uuid,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" text,
	"reference" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "contract_payments" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payee_contact_id_contacts_id_fk" FOREIGN KEY ("payee_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_commission_payout_id_commission_payouts_id_fk" FOREIGN KEY ("commission_payout_id") REFERENCES "public"."commission_payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category");--> statement-breakpoint
CREATE INDEX "expenses_project_idx" ON "expenses" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "expenses_payee_idx" ON "expenses" USING btree ("payee_contact_id");--> statement-breakpoint
CREATE INDEX "expenses_account_idx" ON "expenses" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "expenses_paid_idx" ON "expenses" USING btree ("paid_at");--> statement-breakpoint
CREATE INDEX "expenses_commission_payout_idx" ON "expenses" USING btree ("commission_payout_id");--> statement-breakpoint
ALTER TABLE "contract_payments" ADD CONSTRAINT "contract_payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_payments_account_idx" ON "contract_payments" USING btree ("account_id");