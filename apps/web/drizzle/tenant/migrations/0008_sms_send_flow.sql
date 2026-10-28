CREATE TABLE "sms_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"api_token_encrypted" text NOT NULL,
	"sender_id" text NOT NULL,
	"webhook_key" text NOT NULL,
	"webhook_verify_token_encrypted" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "sms_settings_singleton_unique" UNIQUE("singleton")
);
--> statement-breakpoint
ALTER TABLE "sms_campaigns" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "sms_campaigns" ADD COLUMN "audience" jsonb DEFAULT '{"segment":"ALL_CLIENTS","reminderTiming":null,"includeContactIds":[],"excludeContactIds":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sms_campaigns" ADD COLUMN "skipped" jsonb;--> statement-breakpoint
ALTER TABLE "sms_campaigns" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sms_campaigns" ADD COLUMN "sent_by" text;--> statement-breakpoint
ALTER TABLE "sms_campaigns" ADD COLUMN "is_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sms_delivery_events" ADD COLUMN "source" text DEFAULT 'webhook' NOT NULL;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD COLUMN "batch_ref" text;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD COLUMN "submit_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD COLUMN "last_polled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD COLUMN "provider_status" text;--> statement-breakpoint
CREATE INDEX "sms_messages_batch_ref_idx" ON "sms_messages" USING btree ("batch_ref");--> statement-breakpoint
CREATE INDEX "sms_messages_status_last_polled_idx" ON "sms_messages" USING btree ("status","last_polled_at");--> statement-breakpoint
-- Hand written: sms_campaigns.template_id is left without a Drizzle-level FK
-- (message_templates is declared after sms_campaigns in schema.ts, so it is a
-- forward reference, same pattern as plots.active_contract_id). The real
-- constraint lives only here. See docs/specs/0004-sms-send-flow.
ALTER TABLE "sms_campaigns" ADD CONSTRAINT "sms_campaigns_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;
