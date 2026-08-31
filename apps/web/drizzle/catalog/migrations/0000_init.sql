CREATE TYPE "public"."provisioning_status" AS ENUM('pending', 'provisioning', 'active', 'failed', 'suspended');--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_org_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orgs_clerk_org_id_unique" UNIQUE("clerk_org_id")
);
--> statement-breakpoint
CREATE TABLE "provisioning_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"event" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"neon_project_id" text NOT NULL,
	"neon_project_name" text NOT NULL,
	"region" text DEFAULT 'aws-eu-central-1' NOT NULL,
	"encrypted_connection_string" text NOT NULL,
	"schema_version" integer DEFAULT 0 NOT NULL,
	"status" "provisioning_status" DEFAULT 'pending' NOT NULL,
	"r2_prefix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_projects_org_id_unique" UNIQUE("org_id"),
	CONSTRAINT "tenant_projects_neon_project_id_unique" UNIQUE("neon_project_id")
);
