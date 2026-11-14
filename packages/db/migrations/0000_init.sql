CREATE TYPE "public"."accounting_provider" AS ENUM('qonto', 'quickbooks', 'none', 'other');--> statement-breakpoint
CREATE TYPE "public"."bill_category" AS ENUM('software', 'hosting', 'ai', 'subcontracting', 'legal', 'accounting', 'marketing', 'office', 'travel', 'other');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('to_pay', 'scheduled', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('idea', 'draft', 'review', 'scheduled', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('template', 'document');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('quote', 'invoice', 'contract', 'sow', 'nda', 'report', 'free');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."organization_status" AS ENUM('active', 'former', 'prospect', 'no_contact', 'lost');--> statement-breakpoint
CREATE TYPE "public"."organization_type" AS ENUM('client', 'lead', 'supplier', 'partner', 'internal', 'other');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('idea', 'planned', 'in_progress', 'on_hold', 'delivered', 'maintenance', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'accepted', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."recurrence" AS ENUM('none', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."social_network" AS ENUM('linkedin', 'instagram', 'x', 'facebook', 'tiktok', 'youtube');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ticket_category" AS ENUM('bug', 'feature', 'content', 'support', 'billing', 'other');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('new', 'triaged', 'in_progress', 'waiting_client', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."transaction_side" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_name" text NOT NULL,
	"record_id" uuid NOT NULL,
	"action" text NOT NULL,
	"changes" jsonb,
	"comment" text,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"status" "content_status" DEFAULT 'idea' NOT NULL,
	"excerpt" text,
	"content" text,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"target_query" text,
	"cover_url" text,
	"author_id" uuid,
	"published_at" date,
	"seo_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "bill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"number" text,
	"legal_entity_id" uuid NOT NULL,
	"organization_id" uuid,
	"project_id" uuid,
	"category" "bill_category" DEFAULT 'software' NOT NULL,
	"status" "bill_status" DEFAULT 'to_pay' NOT NULL,
	"recurrence" "recurrence" DEFAULT 'none' NOT NULL,
	"issue_date" date,
	"due_date" date,
	"paid_at" date,
	"currency" text NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tax_total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"payment_method" text,
	"file_url" text,
	"drive_file_id" text,
	"external_ref" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"kind" "document_kind" DEFAULT 'document' NOT NULL,
	"type" "document_type" DEFAULT 'free' NOT NULL,
	"icon" text,
	"content" text,
	"template_id" uuid,
	"organization_id" uuid,
	"project_id" uuid,
	"google_doc_id" text,
	"file_url" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"table_name" text,
	"record_id" uuid,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"title" text,
	"legal_entity_id" uuid NOT NULL,
	"organization_id" uuid,
	"project_id" uuid,
	"quote_id" uuid,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"issue_date" date,
	"due_date" date,
	"paid_at" date,
	"currency" text NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"taxes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tax_total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"amount_paid" numeric(14, 2) DEFAULT 0 NOT NULL,
	"notes" text,
	"external_ref" text,
	"google_doc_id" text,
	"file_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_entity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text NOT NULL,
	"legal_form" text,
	"country" text NOT NULL,
	"currency" text NOT NULL,
	"address_line1" text,
	"address_line2" text,
	"postal_code" text,
	"city" text,
	"region" text,
	"email" text,
	"phone" text,
	"registration_number" text,
	"tax_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_taxes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bank_details" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payment_terms" text,
	"legal_mentions" text,
	"invoice_prefix" text NOT NULL,
	"quote_prefix" text NOT NULL,
	"next_invoice_number" integer DEFAULT 1 NOT NULL,
	"next_quote_number" integer DEFAULT 1 NOT NULL,
	"accounting_provider" "accounting_provider" DEFAULT 'none' NOT NULL,
	"accounting_connected" boolean DEFAULT false NOT NULL,
	"color" text DEFAULT '#1c3266' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_entity_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"type" "organization_type" DEFAULT 'client' NOT NULL,
	"status" "organization_status" DEFAULT 'prospect' NOT NULL,
	"industry" text,
	"website" text,
	"email" text,
	"phone" text,
	"address_line1" text,
	"postal_code" text,
	"city" text,
	"country" text,
	"registration_number" text,
	"vat_number" text,
	"logo_url" text,
	"first_met_at" date,
	"default_entity_id" uuid,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text,
	"phone" text,
	"job_title" text,
	"linkedin_url" text,
	"avatar_url" text,
	"organization_id" uuid,
	"user_id" text,
	"is_primary_contact" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"network" "social_network" DEFAULT 'linkedin' NOT NULL,
	"status" "content_status" DEFAULT 'idea' NOT NULL,
	"content" text,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"url" text,
	"image_url" text,
	"article_id" uuid,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"organization_id" uuid,
	"legal_entity_id" uuid,
	"lead_id" uuid,
	"status" "project_status" DEFAULT 'planned' NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"start_date" date,
	"due_date" date,
	"budget" numeric(14, 2),
	"currency" text DEFAULT 'CAD' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"website_url" text,
	"github_repo" text,
	"description" text,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"organization_id" uuid,
	"contact_id" uuid,
	"project_id" uuid,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"issue_date" date,
	"valid_until" date,
	"currency" text NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"taxes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tax_total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"introduction" text,
	"scope" text,
	"terms" text,
	"google_doc_id" text,
	"file_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_view" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_name" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'table' NOT NULL,
	"icon" text,
	"config" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"project_id" uuid,
	"assignee_id" uuid,
	"ticket_id" uuid,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"labels" text[] DEFAULT '{}' NOT NULL,
	"estimate_hours" numeric(8, 2),
	"spent_hours" numeric(8, 2) DEFAULT 0 NOT NULL,
	"start_date" date,
	"due_date" date,
	"completed_at" date,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "ticket_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"project_id" uuid,
	"organization_id" uuid,
	"requester_id" uuid,
	"assignee_id" uuid,
	"status" "ticket_status" DEFAULT 'new' NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"category" "ticket_category" DEFAULT 'support' NOT NULL,
	"client_visible" boolean DEFAULT true NOT NULL,
	"due_date" date,
	"resolved_at" date,
	"description" text,
	"acceptance_criteria" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"date" date NOT NULL,
	"label" text NOT NULL,
	"counterparty" text,
	"side" "transaction_side" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"source" "accounting_provider" DEFAULT 'none' NOT NULL,
	"external_ref" text,
	"invoice_id" uuid,
	"bill_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'member' NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_author_id_person_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_legal_entity_id_legal_entity_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_legal_entity_id_legal_entity_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_default_entity_id_legal_entity_id_fk" FOREIGN KEY ("default_entity_id") REFERENCES "public"."legal_entity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_author_id_person_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_legal_entity_id_legal_entity_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_lead_id_person_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_legal_entity_id_legal_entity_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_contact_id_person_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_id_person_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_requester_id_person_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_assignee_id_person_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_legal_entity_id_legal_entity_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_bill_id_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bill"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_record_idx" ON "activity" USING btree ("table_name","record_id");--> statement-breakpoint
CREATE INDEX "bill_entity_idx" ON "bill" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE INDEX "bill_org_idx" ON "bill" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_number_uq" ON "invoice" USING btree ("legal_entity_id","number");--> statement-breakpoint
CREATE INDEX "invoice_org_idx" ON "invoice" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invoice_status_idx" ON "invoice" USING btree ("status");--> statement-breakpoint
CREATE INDEX "organization_type_idx" ON "organization" USING btree ("type");--> statement-breakpoint
CREATE INDEX "organization_name_idx" ON "organization" USING btree ("name");--> statement-breakpoint
CREATE INDEX "person_org_idx" ON "person" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "project_org_idx" ON "project" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "project_status_idx" ON "project" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_number_uq" ON "quote" USING btree ("legal_entity_id","number");--> statement-breakpoint
CREATE INDEX "saved_view_table_idx" ON "saved_view" USING btree ("table_name");--> statement-breakpoint
CREATE INDEX "task_project_idx" ON "task" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "task_status_idx" ON "task" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ticket_project_idx" ON "ticket" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "transaction_entity_idx" ON "transaction" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE INDEX "transaction_date_idx" ON "transaction" USING btree ("date");