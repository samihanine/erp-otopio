CREATE TYPE "public"."communication_direction" AS ENUM('inbound', 'outbound', 'internal');--> statement-breakpoint
CREATE TYPE "public"."communication_type" AS ENUM('email', 'google_meet', 'teams', 'zoom', 'phone', 'whatsapp', 'sms', 'linkedin', 'in_person', 'other');--> statement-breakpoint
CREATE TABLE "communication" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"type" "communication_type" DEFAULT 'email' NOT NULL,
	"direction" "communication_direction" DEFAULT 'outbound' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_minutes" integer,
	"person_id" uuid,
	"organization_id" uuid,
	"project_id" uuid,
	"participants" text[] DEFAULT '{}' NOT NULL,
	"mailbox" text,
	"meeting_url" text,
	"source_url" text,
	"external_id" text,
	"attachments" text[] DEFAULT '{}' NOT NULL,
	"attachment_url" text,
	"summary" text,
	"next_steps" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communication" ADD CONSTRAINT "communication_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication" ADD CONSTRAINT "communication_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "communication_person_idx" ON "communication" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "communication_org_idx" ON "communication" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "communication_date_idx" ON "communication" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_external_uq" ON "communication" USING btree ("external_id");