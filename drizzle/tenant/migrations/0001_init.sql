CREATE TYPE "public"."account_type" AS ENUM('Bank Account', 'Mobile Wallet');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('APPROVED', 'REJECTED', 'PENDING');--> statement-breakpoint
CREATE TYPE "public"."commission_payout_status" AS ENUM('PENDING', 'PAID', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."contact_type" AS ENUM('CLIENT', 'LAND_SELLER', 'AUDITOR', 'ICT_SUPPORT', 'SURVEYOR', 'SALES_AGENT');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('ACTIVE', 'DELINQUENT', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('MALE', 'FEMALE');--> statement-breakpoint
CREATE TYPE "public"."id_type" AS ENUM('NATIONAL_ID', 'PASSPORT', 'DRIVER_LICENSE', 'VOTER_ID');--> statement-breakpoint
CREATE TYPE "public"."payment_direction" AS ENUM('IN', 'OUT');--> statement-breakpoint
CREATE TYPE "public"."plot_availability" AS ENUM('AVAILABLE', 'SOLD');--> statement-breakpoint
CREATE TYPE "public"."purchase_plan" AS ENUM('FLAT_RATE', 'DOWNPAYMENT');--> statement-breakpoint
CREATE TYPE "public"."relationship" AS ENUM('PARENT', 'SIBLING', 'SPOUSE', 'FRIEND', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."sms_campaign_status" AS ENUM('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."sms_campaign_type" AS ENUM('PAYMENT_REMINDER', 'OVERDUE_NOTICE', 'FULLY_PAID_THANKYOU', 'MARKETING', 'GENERAL', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."sms_message_status" AS ENUM('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'UNDELIVERED', 'EXPIRED');--> statement-breakpoint
ALTER TABLE "buyers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "installments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "buyers" CASCADE;--> statement-breakpoint
DROP TABLE "installments" CASCADE;--> statement-breakpoint
DROP TYPE "public"."installment_status";--> statement-breakpoint
CREATE TYPE "public"."installment_status" AS ENUM('DUE', 'PARTIAL', 'PAID');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_name" varchar(255) NOT NULL,
	"account_number" varchar(20) NOT NULL,
	"bank_name" varchar(255) NOT NULL,
	"account_type" "account_type" NOT NULL,
	"telco_name" varchar(100),
	"telco_number" varchar(20),
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "accounts_account_number_unique" UNIQUE("account_number")
);
--> statement-breakpoint
CREATE TABLE "commission_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"sales_agent_contact_id" uuid NOT NULL,
	"tranche_number" integer NOT NULL,
	"amount" numeric NOT NULL,
	"target_month" date NOT NULL,
	"status" "commission_payout_status" DEFAULT 'PENDING' NOT NULL,
	"triggering_payment_id" uuid,
	"paid_at" timestamp with time zone,
	"paid_month" date,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "commission_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"default_commission_percent" numeric DEFAULT '5' NOT NULL,
	"default_payout_months" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"mobile_number" text,
	"alt_mobile_number" text,
	"email" text,
	"gender" "gender",
	"contact_type" "contact_type" DEFAULT 'CLIENT',
	"id_type" "id_type",
	"id_number" text,
	"regions" varchar,
	"district" varchar,
	"ward" text,
	"street" text,
	"first_NOK_Name" text,
	"first_NOK_Mobile" text,
	"first_NOK_Relationship" "relationship",
	"second_NOK_Name" text,
	"second_NOK_Mobile" text,
	"second_NOK_Relationship" "relationship",
	"clientPhoto" text,
	"added_by" text,
	"sms_opt_out" boolean DEFAULT false NOT NULL,
	"clerk_user_id" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "contacts_clientPhoto_unique" UNIQUE("clientPhoto"),
	CONSTRAINT "contacts_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "contract_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"message" text,
	"meta" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contract_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"installment_no" integer NOT NULL,
	"original_due_date" date NOT NULL,
	"due_date" date NOT NULL,
	"rescheduled_count" integer DEFAULT 0 NOT NULL,
	"amount_due" numeric NOT NULL,
	"amount_paid" numeric DEFAULT '0' NOT NULL,
	"penalty_amount" numeric DEFAULT '0' NOT NULL,
	"waived_amount" numeric DEFAULT '0' NOT NULL,
	"status" "installment_status" DEFAULT 'DUE' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contract_payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"installment_id" uuid NOT NULL,
	"amount" numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contract_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"client_contact_id" uuid NOT NULL,
	"direction" "payment_direction" NOT NULL,
	"amount" numeric NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" text,
	"reference" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "plot_sale_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plot_id" uuid NOT NULL,
	"client_contact_id" uuid NOT NULL,
	"created_by" text,
	"status" "contract_status" DEFAULT 'ACTIVE' NOT NULL,
	"start_date" date NOT NULL,
	"term_months" integer NOT NULL,
	"total_contract_value" numeric NOT NULL,
	"purchase_plan" "purchase_plan" DEFAULT 'FLAT_RATE' NOT NULL,
	"downpayment_percent" numeric,
	"downpayment_amount" numeric DEFAULT '0' NOT NULL,
	"financed_amount" numeric NOT NULL,
	"cancellation_fee_percent" numeric NOT NULL,
	"grace_days" integer DEFAULT 0 NOT NULL,
	"delinquent_days_threshold" integer DEFAULT 1 NOT NULL,
	"delinquent_since" timestamp with time zone,
	"sales_agent_contact_id" uuid,
	"commission_percent" numeric DEFAULT '0' NOT NULL,
	"commission_amount" numeric DEFAULT '0' NOT NULL,
	"commission_payout_months" integer DEFAULT 1 NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancellation_fee_amount" numeric,
	"refunded_amount" numeric,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_name" text NOT NULL,
	"project_details" text,
	"acquisition_date" date NOT NULL,
	"sqm_bought" numeric,
	"acquisition_value" numeric NOT NULL,
	"region" text,
	"district" text,
	"ward" text DEFAULT '',
	"project_owner" text,
	"committment_amount" numeric,
	"lga_fee" numeric,
	"street" text,
	"tp_number" text,
	"tp_status" text,
	"survey_status" text,
	"survey_number" text,
	"original_contract_pdf" text,
	"supplier_name" uuid,
	"mwenyekiti_name" text,
	"mwenyekiti_mobile" text,
	"mtendaji_name" text,
	"mtendaji_mobile" text,
	"number_of_plots" integer NOT NULL,
	"tp_url" text,
	"survey_url" text,
	"added_by" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sms_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "sms_campaign_type" NOT NULL,
	"template_body" text NOT NULL,
	"sender_id" text,
	"status" "sms_campaign_status" DEFAULT 'DRAFT' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"created_by" text,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sms_delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"status" text NOT NULL,
	"raw_payload" jsonb,
	"received_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sms_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid,
	"contact_id" uuid,
	"contract_id" uuid,
	"installment_id" uuid,
	"phone_number" text NOT NULL,
	"body" text NOT NULL,
	"provider_message_id" text,
	"status" "sms_message_status" DEFAULT 'QUEUED' NOT NULL,
	"cost" numeric,
	"segments_count" integer DEFAULT 1 NOT NULL,
	"error_reason" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "plots" DROP CONSTRAINT "plots_reference_unique";--> statement-breakpoint
ALTER TABLE "plots" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "plots" ADD COLUMN "plot_number" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "plots" ADD COLUMN "surveyed_plot_number" varchar(50);--> statement-breakpoint
ALTER TABLE "plots" ADD COLUMN "availability" "plot_availability" DEFAULT 'AVAILABLE' NOT NULL;--> statement-breakpoint
ALTER TABLE "plots" ADD COLUMN "active_contract_id" uuid;--> statement-breakpoint
ALTER TABLE "plots" ADD COLUMN "unsurveyed_size" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "plots" ADD COLUMN "surveyed_size" numeric;--> statement-breakpoint
ALTER TABLE "plots" ADD COLUMN "project_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "plots" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "plots" ADD COLUMN "is_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plots" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_contract_id_plot_sale_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."plot_sale_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_sales_agent_contact_id_contacts_id_fk" FOREIGN KEY ("sales_agent_contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_triggering_payment_id_contract_payments_id_fk" FOREIGN KEY ("triggering_payment_id") REFERENCES "public"."contract_payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_contract_id_plot_sale_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."plot_sale_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_installments" ADD CONSTRAINT "contract_installments_contract_id_plot_sale_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."plot_sale_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_payment_allocations" ADD CONSTRAINT "contract_payment_allocations_payment_id_contract_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."contract_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_payment_allocations" ADD CONSTRAINT "contract_payment_allocations_installment_id_contract_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."contract_installments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_payments" ADD CONSTRAINT "contract_payments_contract_id_plot_sale_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."plot_sale_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_payments" ADD CONSTRAINT "contract_payments_client_contact_id_contacts_id_fk" FOREIGN KEY ("client_contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot_sale_contracts" ADD CONSTRAINT "plot_sale_contracts_plot_id_plots_id_fk" FOREIGN KEY ("plot_id") REFERENCES "public"."plots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot_sale_contracts" ADD CONSTRAINT "plot_sale_contracts_client_contact_id_contacts_id_fk" FOREIGN KEY ("client_contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot_sale_contracts" ADD CONSTRAINT "plot_sale_contracts_sales_agent_contact_id_contacts_id_fk" FOREIGN KEY ("sales_agent_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_delivery_events" ADD CONSTRAINT "sms_delivery_events_message_id_sms_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."sms_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_campaign_id_sms_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."sms_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_contract_id_plot_sale_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."plot_sale_contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_installment_id_contract_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."contract_installments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commission_payouts_contract_idx" ON "commission_payouts" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "commission_payouts_agent_idx" ON "commission_payouts" USING btree ("sales_agent_contact_id");--> statement-breakpoint
CREATE INDEX "commission_payouts_status_idx" ON "commission_payouts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_payouts_contract_tranche_unique" ON "commission_payouts" USING btree ("contract_id","tranche_number");--> statement-breakpoint
CREATE INDEX "contract_events_contract_idx" ON "contract_events" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "contract_installments_contract_idx" ON "contract_installments" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "contract_installments_due_idx" ON "contract_installments" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "contract_installments_contract_due_idx" ON "contract_installments" USING btree ("contract_id","due_date");--> statement-breakpoint
CREATE INDEX "contract_installments_status_due_idx" ON "contract_installments" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "contract_payment_allocations_payment_idx" ON "contract_payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "contract_payment_allocations_installment_idx" ON "contract_payment_allocations" USING btree ("installment_id");--> statement-breakpoint
CREATE INDEX "contract_payments_contract_idx" ON "contract_payments" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "contract_payments_client_idx" ON "contract_payments" USING btree ("client_contact_id");--> statement-breakpoint
CREATE INDEX "contract_payments_received_idx" ON "contract_payments" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "plot_sale_contracts_plot_idx" ON "plot_sale_contracts" USING btree ("plot_id");--> statement-breakpoint
CREATE INDEX "plot_sale_contracts_client_idx" ON "plot_sale_contracts" USING btree ("client_contact_id");--> statement-breakpoint
CREATE INDEX "plot_sale_contracts_status_idx" ON "plot_sale_contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "plot_sale_contracts_agent_idx" ON "plot_sale_contracts" USING btree ("sales_agent_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plot_sale_contracts_one_active_per_plot" ON "plot_sale_contracts" USING btree ("plot_id") WHERE status IN ('ACTIVE', 'DELINQUENT');--> statement-breakpoint
CREATE INDEX "sms_delivery_events_message_idx" ON "sms_delivery_events" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "sms_messages_campaign_idx" ON "sms_messages" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "sms_messages_contact_idx" ON "sms_messages" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "sms_messages_contract_idx" ON "sms_messages" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "sms_messages_status_idx" ON "sms_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sms_messages_provider_id_idx" ON "sms_messages" USING btree ("provider_message_id");--> statement-breakpoint
ALTER TABLE "plots" ADD CONSTRAINT "plots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plots" ADD CONSTRAINT "plots_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plots_project_idx" ON "plots" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "plots_contact_idx" ON "plots" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "plots_active_contract_idx" ON "plots" USING btree ("active_contract_id");--> statement-breakpoint
CREATE INDEX "plots_availability_idx" ON "plots" USING btree ("availability");--> statement-breakpoint
ALTER TABLE "plots" DROP COLUMN "reference";--> statement-breakpoint
ALTER TABLE "plots" DROP COLUMN "location";--> statement-breakpoint
ALTER TABLE "plots" DROP COLUMN "price_total";--> statement-breakpoint
ALTER TABLE "plots" DROP COLUMN "buyer_id";