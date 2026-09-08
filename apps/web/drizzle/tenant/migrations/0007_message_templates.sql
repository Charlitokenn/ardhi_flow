CREATE TYPE "public"."message_template_channel" AS ENUM('SMS', 'WHATSAPP');--> statement-breakpoint
CREATE TYPE "public"."reminder_timing" AS ENUM('UPCOMING', 'DUE_TODAY', 'PAST_DUE');--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "sms_campaign_type" NOT NULL,
	"reminder_timing" "reminder_timing",
	"channel" "message_template_channel" DEFAULT 'SMS' NOT NULL,
	"body" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "message_templates_category_idx" ON "message_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "message_templates_is_deleted_idx" ON "message_templates" USING btree ("is_deleted");--> statement-breakpoint
-- Seeds the three default templates (see docs/specs/0002-message-templates)
-- directly in the migration rather than a separate first-run seeding step —
-- there is no such step in provision-tenant.ts today (it only runs
-- migrations), and putting the inserts here means both a newly provisioned
-- tenant AND every already-provisioned tenant (via the migration fan-out
-- job, scripts/migrate-tenants.ts) get them the same way, exactly once.
INSERT INTO "message_templates" ("name", "category", "reminder_timing", "channel", "body", "is_default", "is_active")
VALUES
	('Past Due Payment Reminder', 'PAYMENT_REMINDER', 'PAST_DUE', 'SMS', 'Habari {firstName}, {dueItems} Tafadhari fanya malipo kuepuka tozo za adhabu au kuvunjwa kwa mkataba.', true, true),
	('Installment Due Today Reminder', 'PAYMENT_REMINDER', 'DUE_TODAY', 'SMS', 'Habari {firstName}, {dueItems} Tafadhari fanya malipo kuepuka tozo za adhabu au kuvunjwa kwa mkataba.', true, true),
	('Upcoming Installment Reminder', 'PAYMENT_REMINDER', 'UPCOMING', 'SMS', 'Habari {firstName}, {dueItems} Tafadhali fanya malipo kwa wakati kuepuka tozo za adhabu au kuvunjwa kwa mkataba.', true, true);