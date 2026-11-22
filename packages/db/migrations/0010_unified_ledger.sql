-- Unified ledger: invoices + bills + bank movements → "transaction" (ids preserved)
ALTER TABLE "transaction" ADD COLUMN "kind" text DEFAULT 'movement' NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "number" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "quote_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "category" "bill_category";--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "status" text DEFAULT 'paid' NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "paid_at" date;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "lines" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "taxes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "subtotal" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "tax_total" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "total" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "amount_paid" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "recurrence" "recurrence" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "payment_method" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "card_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "paid_by" text DEFAULT 'entity' NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "scope" "expense_scope" DEFAULT 'pro' NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "bank_ref" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "file_url" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "drive_file_id" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "google_doc_id" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "amount" DROP NOT NULL;--> statement-breakpoint
-- existing bank lines become movements
UPDATE "transaction" SET "total" = "amount", "subtotal" = "amount", "amount_paid" = "amount", "notes" = "note", "bank_ref" = "external_ref", "external_ref" = NULL, "paid_at" = "date", "status" = 'paid';--> statement-breakpoint
-- sales invoices
INSERT INTO "transaction" ("id","kind","side","legal_entity_id","date","label","number","organization_id","project_id","quote_id","status","due_date","paid_at","currency","lines","taxes","subtotal","tax_total","total","amount_paid","notes","external_ref","google_doc_id","file_url","source","created_at","updated_at")
SELECT i."id",'invoice','credit',i."legal_entity_id",COALESCE(i."issue_date", i."created_at"::date),COALESCE(NULLIF(i."title",''), i."number"),i."number",i."organization_id",i."project_id",i."quote_id",i."status"::text,i."due_date",i."paid_at",i."currency",i."lines",i."taxes",i."subtotal",i."tax_total",i."total",i."amount_paid",i."notes",i."external_ref",i."google_doc_id",i."file_url",'none',i."created_at",i."updated_at" FROM "invoice" i;--> statement-breakpoint
-- expenses
INSERT INTO "transaction" ("id","kind","side","legal_entity_id","date","label","number","organization_id","project_id","client_id","category","status","due_date","paid_at","currency","subtotal","tax_total","total","amount_paid","recurrence","payment_method","card_id","paid_by","scope","active","notes","external_ref","file_url","drive_file_id","source","created_at","updated_at")
SELECT b."id",'expense','debit',b."legal_entity_id",COALESCE(b."issue_date", b."created_at"::date),b."label",b."number",b."organization_id",b."project_id",b."client_id",b."category",b."status"::text,b."due_date",b."paid_at",b."currency",b."subtotal",b."tax_total",b."total",CASE WHEN b."status" = 'paid' THEN b."total" ELSE 0 END,b."recurrence",b."payment_method",b."card_id",b."paid_by",b."scope",b."active",b."notes",b."external_ref",b."file_url",b."drive_file_id",'none',b."created_at",b."updated_at" FROM "bill" b;--> statement-breakpoint
-- merge the bank line into the document it pays (first line per document)
WITH m AS (
  SELECT DISTINCT ON (COALESCE("invoice_id","bill_id")) "id", COALESCE("invoice_id","bill_id") AS doc, "bank_ref", "source", "counterparty", "date", "nature"
  FROM "transaction" WHERE "kind" = 'movement' AND COALESCE("invoice_id","bill_id") IS NOT NULL ORDER BY COALESCE("invoice_id","bill_id"), "date"
)
UPDATE "transaction" d SET "bank_ref" = m."bank_ref", "source" = m."source", "counterparty" = m."counterparty", "paid_at" = COALESCE(d."paid_at", m."date"), "nature" = m."nature"
FROM m WHERE d."id" = m.doc;--> statement-breakpoint
WITH m AS (
  SELECT DISTINCT ON (COALESCE("invoice_id","bill_id")) "id" FROM "transaction" WHERE "kind" = 'movement' AND COALESCE("invoice_id","bill_id") IS NOT NULL ORDER BY COALESCE("invoice_id","bill_id"), "date"
)
DELETE FROM "transaction" t USING m WHERE t."id" = m."id";--> statement-breakpoint
-- remaining partial payments keep a link to their document
UPDATE "transaction" SET "parent_id" = COALESCE("invoice_id","bill_id") WHERE "kind" = 'movement' AND COALESCE("invoice_id","bill_id") IS NOT NULL;--> statement-breakpoint
-- the document's own ref duplicated the bank ref (Qonto import)
UPDATE "transaction" SET "external_ref" = NULL WHERE "external_ref" IS NOT NULL AND "external_ref" = "bank_ref";--> statement-breakpoint
-- other tables pointing at invoice / bill
ALTER TABLE "document" DROP CONSTRAINT IF EXISTS "document_invoice_id_invoice_id_fk";--> statement-breakpoint
ALTER TABLE "document" DROP CONSTRAINT IF EXISTS "document_bill_id_bill_id_fk";--> statement-breakpoint
ALTER TABLE "transaction" DROP CONSTRAINT IF EXISTS "transaction_invoice_id_invoice_id_fk";--> statement-breakpoint
ALTER TABLE "transaction" DROP CONSTRAINT IF EXISTS "transaction_bill_id_bill_id_fk";--> statement-breakpoint
UPDATE "activity" SET "table_name" = 'transaction' WHERE "table_name" IN ('invoice','bill');--> statement-breakpoint
UPDATE "file" SET "table_name" = 'transaction' WHERE "table_name" IN ('invoice','bill');--> statement-breakpoint
DELETE FROM "saved_view" WHERE "table_name" IN ('invoice','bill','transaction');--> statement-breakpoint
DROP TABLE "bill" CASCADE;--> statement-breakpoint
DROP TABLE "invoice" CASCADE;--> statement-breakpoint
ALTER TABLE "transaction" DROP COLUMN "amount";--> statement-breakpoint
ALTER TABLE "transaction" DROP COLUMN "invoice_id";--> statement-breakpoint
ALTER TABLE "transaction" DROP COLUMN "bill_id";--> statement-breakpoint
ALTER TABLE "transaction" DROP COLUMN "note";--> statement-breakpoint
DROP TYPE "public"."bill_status";--> statement-breakpoint
DROP TYPE "public"."invoice_status";--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_invoice_id_transaction_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."transaction"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_bill_id_transaction_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."transaction"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_client_id_organization_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_card_id_credit_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."credit_card"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_kind_idx" ON "transaction" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "transaction_org_idx" ON "transaction" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_number_uq" ON "transaction" USING btree ("legal_entity_id","number") WHERE kind = 'invoice';--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_bank_ref_uq" ON "transaction" USING btree ("bank_ref");
