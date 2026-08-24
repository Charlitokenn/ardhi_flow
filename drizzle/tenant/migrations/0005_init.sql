CREATE TYPE "public"."acquisition_payment_plan" AS ENUM('CASH', 'INSTALLMENT');--> statement-breakpoint
CREATE TYPE "public"."vendor_job_status" AS ENUM('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."expense_category" ADD VALUE 'VENDOR_JOB_PAYMENT' BEFORE 'SALARY';--> statement-breakpoint
CREATE TABLE "project_acquisition_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acquisition_id" uuid NOT NULL,
	"installment_no" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount_due" numeric NOT NULL,
	"amount_paid" numeric DEFAULT '0' NOT NULL,
	"status" "installment_status" DEFAULT 'DUE' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_acquisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"seller_contact_id" uuid NOT NULL,
	"deal_date" date NOT NULL,
	"total_purchase_value" numeric NOT NULL,
	"payment_plan" "acquisition_payment_plan" DEFAULT 'CASH' NOT NULL,
	"description" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vendor_job_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"allocated_amount" numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vendor_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_contact_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"agreed_amount" numeric NOT NULL,
	"status" "vendor_job_status" DEFAULT 'ASSIGNED' NOT NULL,
	"start_date" date,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DROP INDEX "plot_sale_contracts_one_active_per_plot";--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "vendor_job_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "acquisition_installment_id" uuid;--> statement-breakpoint
ALTER TABLE "project_acquisition_installments" ADD CONSTRAINT "project_acquisition_installments_acquisition_id_project_acquisitions_id_fk" FOREIGN KEY ("acquisition_id") REFERENCES "public"."project_acquisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_acquisitions" ADD CONSTRAINT "project_acquisitions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_acquisitions" ADD CONSTRAINT "project_acquisitions_seller_contact_id_contacts_id_fk" FOREIGN KEY ("seller_contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_job_projects" ADD CONSTRAINT "vendor_job_projects_job_id_vendor_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."vendor_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_job_projects" ADD CONSTRAINT "vendor_job_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_jobs" ADD CONSTRAINT "vendor_jobs_vendor_contact_id_contacts_id_fk" FOREIGN KEY ("vendor_contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_acquisition_installments_acquisition_idx" ON "project_acquisition_installments" USING btree ("acquisition_id");--> statement-breakpoint
CREATE INDEX "project_acquisition_installments_due_idx" ON "project_acquisition_installments" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "project_acquisition_installments_status_due_idx" ON "project_acquisition_installments" USING btree ("status","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "project_acquisition_installments_unique" ON "project_acquisition_installments" USING btree ("acquisition_id","installment_no");--> statement-breakpoint
CREATE INDEX "project_acquisitions_project_idx" ON "project_acquisitions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_acquisitions_seller_idx" ON "project_acquisitions" USING btree ("seller_contact_id");--> statement-breakpoint
CREATE INDEX "vendor_job_projects_job_idx" ON "vendor_job_projects" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "vendor_job_projects_project_idx" ON "vendor_job_projects" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_job_projects_unique" ON "vendor_job_projects" USING btree ("job_id","project_id");--> statement-breakpoint
CREATE INDEX "vendor_jobs_vendor_idx" ON "vendor_jobs" USING btree ("vendor_contact_id");--> statement-breakpoint
CREATE INDEX "vendor_jobs_status_idx" ON "vendor_jobs" USING btree ("status");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendor_job_id_vendor_jobs_id_fk" FOREIGN KEY ("vendor_job_id") REFERENCES "public"."vendor_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_acquisition_installment_id_project_acquisition_installments_id_fk" FOREIGN KEY ("acquisition_installment_id") REFERENCES "public"."project_acquisition_installments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_vendor_job_idx" ON "expenses" USING btree ("vendor_job_id");--> statement-breakpoint
CREATE INDEX "expenses_acquisition_installment_idx" ON "expenses" USING btree ("acquisition_installment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plot_sale_contracts_one_active_per_plot" ON "plot_sale_contracts" USING btree ("plot_id") WHERE status
            IN ('ACTIVE', 'DELINQUENT');