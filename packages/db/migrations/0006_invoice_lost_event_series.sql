ALTER TYPE "public"."invoice_status" ADD VALUE 'lost' BEFORE 'cancelled';--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "recurrence" text;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "notes" text;--> statement-breakpoint
CREATE INDEX "event_series_idx" ON "event" USING btree ("series_id");