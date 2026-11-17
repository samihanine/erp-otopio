ALTER TABLE "bill" ADD COLUMN "paid_by" text DEFAULT 'entity' NOT NULL;--> statement-breakpoint
ALTER TABLE "bill" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "bill" ADD CONSTRAINT "bill_client_id_organization_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;