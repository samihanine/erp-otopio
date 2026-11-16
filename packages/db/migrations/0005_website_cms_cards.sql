CREATE TYPE "public"."card_brand" AS ENUM('visa', 'mastercard', 'amex', 'interac', 'paypal', 'apple_pay', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_scope" AS ENUM('pro', 'perso', 'mixed');--> statement-breakpoint
ALTER TYPE "public"."bill_category" ADD VALUE 'subscription';--> statement-breakpoint
ALTER TYPE "public"."bill_category" ADD VALUE 'transport';--> statement-breakpoint
ALTER TYPE "public"."bill_category" ADD VALUE 'flight';--> statement-breakpoint
ALTER TYPE "public"."bill_category" ADD VALUE 'accommodation';--> statement-breakpoint
ALTER TYPE "public"."bill_category" ADD VALUE 'restaurant';--> statement-breakpoint
ALTER TYPE "public"."bill_category" ADD VALUE 'groceries';--> statement-breakpoint
ALTER TYPE "public"."bill_category" ADD VALUE 'shopping';--> statement-breakpoint
ALTER TYPE "public"."bill_category" ADD VALUE 'concert';--> statement-breakpoint
ALTER TYPE "public"."bill_category" ADD VALUE 'leisure';--> statement-breakpoint
ALTER TYPE "public"."bill_category" ADD VALUE 'health';--> statement-breakpoint
ALTER TYPE "public"."bill_category" ADD VALUE 'housing';--> statement-breakpoint
ALTER TYPE "public"."bill_category" ADD VALUE 'utilities';--> statement-breakpoint
ALTER TYPE "public"."bill_category" ADD VALUE 'telecom';--> statement-breakpoint
ALTER TYPE "public"."bill_category" ADD VALUE 'education';--> statement-breakpoint
ALTER TYPE "public"."bill_category" ADD VALUE 'bank_fees';--> statement-breakpoint
ALTER TYPE "public"."bill_category" ADD VALUE 'taxes';--> statement-breakpoint
ALTER TYPE "public"."bill_category" ADD VALUE 'gift';--> statement-breakpoint
CREATE TABLE "artifact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"customer" text,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"description" text,
	"image_url" text,
	"url" text,
	"started_at" date,
	"ended_at" date,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"lucide_icon" text,
	"hex_color" text,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"organization_id" uuid,
	"project_id" uuid,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "credit_card" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"brand" "card_brand" DEFAULT 'visa' NOT NULL,
	"last4" text,
	"issuer" text,
	"holder" text,
	"expiry" text,
	"legal_entity_id" uuid,
	"scope" "expense_scope" DEFAULT 'perso' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"bio" text,
	"group_key" text DEFAULT 'team' NOT NULL,
	"image_url" text,
	"linkedin" text,
	"status" "content_status" DEFAULT 'published' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"person_id" uuid,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_member_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "reading_minutes" integer;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "translations" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "bill" ADD COLUMN "card_id" uuid;--> statement-breakpoint
ALTER TABLE "bill" ADD COLUMN "scope" "expense_scope" DEFAULT 'pro' NOT NULL;--> statement-breakpoint
ALTER TABLE "bill" ADD COLUMN "active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card" ADD CONSTRAINT "credit_card_legal_entity_id_legal_entity_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_card_id_credit_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."credit_card"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_external_ref_uq" ON "bill" USING btree ("external_ref");