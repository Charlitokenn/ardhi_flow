CREATE TYPE "public"."rotation_kind" AS ENUM('scheduled', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."rotation_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "key_rotation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "rotation_kind" NOT NULL,
	"from_key_id" text NOT NULL,
	"to_key_id" text NOT NULL,
	"status" "rotation_status" DEFAULT 'running' NOT NULL,
	"tenants_total" integer NOT NULL,
	"tenants_done" integer DEFAULT 0 NOT NULL,
	"tenants_failed" integer DEFAULT 0 NOT NULL,
	"note" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "key_rotation_runs_one_running_idx" ON "key_rotation_runs" USING btree ("status") WHERE "key_rotation_runs"."status" = 'running';