CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"meet_url" text,
	"calendar_owner" text NOT NULL,
	"organizer" text,
	"attendees" text[] DEFAULT '{}' NOT NULL,
	"organization_id" uuid,
	"project_id" uuid,
	"person_id" uuid,
	"google_event_id" text,
	"html_link" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communication" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "communication" ADD COLUMN "ai_summary" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "drive_file_id" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "drive_id" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "path" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "size" integer;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "web_view_link" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "thumbnail_link" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "is_folder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "modified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "quote_id" uuid;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "bill_id" uuid;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "communication_id" uuid;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "drive_folder_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "ai_summary" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "ai_summary_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_google_uq" ON "event" USING btree ("calendar_owner","google_event_id");--> statement-breakpoint
CREATE INDEX "event_start_idx" ON "event" USING btree ("start_at");--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_bill_id_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bill"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_drive_file_id_unique" UNIQUE("drive_file_id");