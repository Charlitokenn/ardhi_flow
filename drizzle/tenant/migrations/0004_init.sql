CREATE TABLE "company_settings" (
	"id" uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"slogan" text,
	"primary_color" text,
	"email" text,
	"mobile_number" text,
	"address" text,
	"website" text,
	"signer_title" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
