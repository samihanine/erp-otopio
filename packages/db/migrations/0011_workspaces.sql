-- Workspaces: one independent workspace per structure (Otopio Inc., Megascale, Sami Freelance, Maïssane Freelance).
-- Every business row gets a workspace_id; companies used by several structures are duplicated (one record per workspace).
CREATE TABLE "portal_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"invited_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "article" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "communication" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_card" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "uploaded_by" text;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "legal_entity" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "legal_entity" ADD COLUMN "disabled_modules" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_entity" ADD COLUMN "website_domain" text;--> statement-breakpoint
ALTER TABLE "legal_entity" ADD COLUMN "drive" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_entity" ADD COLUMN "mailboxes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "also_in" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "saved_view" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "team_member" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint

-- ===================================================================== structures
INSERT INTO "legal_entity" ("code","name","legal_name","legal_form","country","currency","region","city","email","invoice_prefix","quote_prefix","legal_mentions","color") VALUES
  ('OTP','Otopio Inc.','Otopio Inc.',NULL,'CA','CAD','QC','Montréal','contact@otopio.ca','F-{YYYY}-','D-{YYYY}-',NULL,'#1c3266'),
  ('MGS','Megascale','Megascale Technologie SARL','SARL','FR','EUR',NULL,NULL,'megascale.technologie@gmail.com','F-{YYYY}-','D-{YYYY}-',NULL,'#7c3aed'),
  ('SHF','Sami Freelance','Sami Hanine','Travailleur autonome (Québec)','CA','CAD','QC','Montréal','sami.hanine22@gmail.com','SH-{YYYY}-','SH-D{YYYY}-','Petit fournisseur — non inscrit aux fichiers de la TPS et de la TVQ. Aucune taxe facturée.','#0f766e'),
  ('MTF','Maïssane Freelance','Maïssane Touati','Travailleuse autonome (Québec)','CA','CAD','QC','Montréal','maissane.t69@gmail.com','MT-{YYYY}-','MT-D{YYYY}-','Petit fournisseur — non inscrite aux fichiers de la TPS et de la TVQ. Aucune taxe facturée.','#be185d')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
UPDATE "legal_entity" SET "slug" = CASE "code" WHEN 'OTP' THEN 'otopio' WHEN 'MGS' THEN 'megascale' WHEN 'SHF' THEN 'sami' WHEN 'MTF' THEN 'maissane' ELSE lower("code") END;--> statement-breakpoint
UPDATE "legal_entity" SET "name" = 'Sami Freelance' WHERE "code" = 'SHF';--> statement-breakpoint
UPDATE "legal_entity" SET "name" = 'Maïssane Freelance', "email" = 'maissane.t69@gmail.com' WHERE "code" = 'MTF';--> statement-breakpoint
UPDATE "legal_entity" SET "website_domain" = 'otopio.ca', "mailboxes" = '{contact@otopio.ca,sami@otopio.ca,maissane@otopio.ca,noah@otopio.ca}' WHERE "code" = 'OTP';--> statement-breakpoint
UPDATE "legal_entity" SET "website_domain" = 'megascale.otopio.ca', "mailboxes" = '{megascale.technologie@gmail.com}' WHERE "code" = 'MGS';--> statement-breakpoint
UPDATE "legal_entity" SET "disabled_modules" = '{website,social}', "mailboxes" = '{sami.hanine22@gmail.com}', "drive" = '{"personalEmail":"sami.hanine22@gmail.com"}' WHERE "code" = 'SHF';--> statement-breakpoint
UPDATE "legal_entity" SET "disabled_modules" = '{website,social}', "mailboxes" = '{maissane.t69@gmail.com}', "drive" = '{"personalEmail":"maissane.t69@gmail.com"}' WHERE "code" = 'MTF';--> statement-breakpoint

-- ===================================================================== access
INSERT INTO "workspace_member" ("workspace_id","email","role") SELECT "id",'sami.hanine22@gmail.com','admin' FROM "legal_entity" WHERE "code" IN ('OTP','MGS','SHF','MTF');--> statement-breakpoint
INSERT INTO "workspace_member" ("workspace_id","email","role") SELECT "id",'maissane.t69@gmail.com', CASE WHEN "code" = 'MTF' THEN 'admin' ELSE 'member' END FROM "legal_entity" WHERE "code" IN ('OTP','MGS','MTF');--> statement-breakpoint
INSERT INTO "workspace_member" ("workspace_id","email","role") SELECT "id",'*@otopio.ca','member' FROM "legal_entity" WHERE "code" IN ('OTP','MGS');--> statement-breakpoint
INSERT INTO "workspace_member" ("workspace_id","email","role") SELECT "id",'megascale.technologie@gmail.com','member' FROM "legal_entity" WHERE "code" IN ('OTP','MGS');--> statement-breakpoint

-- ===================================================================== finance rows
UPDATE "transaction" SET "workspace_id" = "legal_entity_id";--> statement-breakpoint
UPDATE "quote" SET "workspace_id" = "legal_entity_id";--> statement-breakpoint

-- Expenses paid personally for the business (scope pro, not phone / personal life):
--   card in EUR from April 2026 → Megascale ; card in CAD from January 2026 → Otopio Inc. ; both « à rembourser ».
-- Card currency: French bank → EUR, else the currency of the card's structure, else the expense currency (USD → CAD).
WITH x AS (
  SELECT t."id",
    CASE
      WHEN c."issuer" ~* '(cr[ée]dit agricole|crcam|boursorama|bnp|soci[ée]t[ée] g[ée]n[ée]rale|lcl|caisse d.[ée]pargne|banque postale|qonto|shine|revolut|n26|fortuneo|hello ?bank|cic)' THEN 'EUR'
      WHEN ce."currency" IS NOT NULL AND ce."code" IN ('OTP','MGS') THEN ce."currency"
      WHEN t."currency" IN ('EUR','CAD') THEN t."currency"
      ELSE 'CAD'
    END AS card_cur
  FROM "transaction" t
  JOIN "legal_entity" le ON le."id" = t."legal_entity_id"
  LEFT JOIN "credit_card" c ON c."id" = t."card_id"
  LEFT JOIN "legal_entity" ce ON ce."id" = c."legal_entity_id"
  WHERE t."kind" = 'expense' AND t."scope" = 'pro' AND le."code" IN ('SHF','MTF')
    AND coalesce(t."category"::text, 'other') IN ('software','hosting','ai','subcontracting','legal','accounting','marketing','office','travel','other','subscription','education','bank_fees')
), target AS (
  SELECT x."id", CASE WHEN x.card_cur = 'EUR' AND t."date" >= '2026-04-01' THEN 'MGS' WHEN x.card_cur = 'CAD' AND t."date" >= '2026-01-01' THEN 'OTP' END AS code
  FROM x JOIN "transaction" t ON t."id" = x."id"
)
UPDATE "transaction" t SET
  "legal_entity_id" = le."id",
  "workspace_id" = le."id",
  "paid_by" = 'reimburse',
  "status" = CASE WHEN t."status" IN ('paid','to_pay','scheduled') THEN 'to_pay' ELSE t."status" END,
  "notes" = concat_ws(E'\n', nullif(t."notes", ''), 'Payée avec une carte personnelle — à rembourser (migration workspaces).')
FROM target JOIN "legal_entity" le ON le."code" = target.code
WHERE target."id" = t."id" AND target.code IS NOT NULL;--> statement-breakpoint

-- Personal-life spending booked on a company → back to the payer's freelance workspace (card holder)
WITH p AS (
  SELECT t."id", CASE WHEN c."holder" ~* 'ma[iï]ssane|touati' OR c."label" ~* 'ma[iï]ssane' THEN 'MTF' ELSE 'SHF' END AS code
  FROM "transaction" t JOIN "legal_entity" le ON le."id" = t."legal_entity_id" JOIN "credit_card" c ON c."id" = t."card_id"
  WHERE t."kind" = 'expense' AND t."scope" = 'perso' AND le."code" IN ('OTP','MGS')
)
UPDATE "transaction" t SET "legal_entity_id" = le."id", "workspace_id" = le."id"
FROM p JOIN "legal_entity" le ON le."code" = p.code WHERE p."id" = t."id";--> statement-breakpoint

-- bank movements attached to a document follow it
UPDATE "transaction" m SET "workspace_id" = d."workspace_id", "legal_entity_id" = d."legal_entity_id"
FROM "transaction" d WHERE m."parent_id" = d."id" AND m."workspace_id" <> d."workspace_id";--> statement-breakpoint

-- ===================================================================== projects
UPDATE "project" SET "workspace_id" = "legal_entity_id" WHERE "legal_entity_id" IS NOT NULL;--> statement-breakpoint
UPDATE "project" p SET "workspace_id" = sub.ws FROM (
  SELECT "project_id", (array_agg("workspace_id" ORDER BY n DESC))[1] AS ws FROM (
    SELECT "project_id", "workspace_id", count(*) n FROM (
      SELECT "project_id", "workspace_id" FROM "transaction" WHERE "project_id" IS NOT NULL
      UNION ALL SELECT "project_id", "workspace_id" FROM "quote" WHERE "project_id" IS NOT NULL
    ) a GROUP BY 1, 2
  ) b GROUP BY 1
) sub WHERE p."id" = sub."project_id" AND p."workspace_id" IS NULL;--> statement-breakpoint

-- ===================================================================== companies (one record per workspace)
CREATE TEMP TABLE "_org_ws" ON COMMIT DROP AS
SELECT org, ws, count(*)::int AS n FROM (
  SELECT "organization_id" AS org, "workspace_id" AS ws FROM "transaction" WHERE "organization_id" IS NOT NULL
  UNION ALL SELECT "client_id", "workspace_id" FROM "transaction" WHERE "client_id" IS NOT NULL
  UNION ALL SELECT "organization_id", "workspace_id" FROM "quote" WHERE "organization_id" IS NOT NULL
  UNION ALL SELECT "organization_id", "workspace_id" FROM "project" WHERE "organization_id" IS NOT NULL AND "workspace_id" IS NOT NULL
) a GROUP BY 1, 2;--> statement-breakpoint

-- primary workspace: a company (Otopio Inc. / Megascale) when one uses it — its Drive folder stays there — else the freelance, then most used; else default structure, else country (FR → Megascale), else Otopio Inc.
UPDATE "organization" o SET "workspace_id" = sub.ws FROM (
  SELECT DISTINCT ON (ow.org) ow.org, ow.ws FROM "_org_ws" ow JOIN "legal_entity" le ON le."id" = ow.ws
  ORDER BY ow.org, (le."code" IN ('OTP','MGS')) DESC, ow.n DESC, le."code"
) sub WHERE o."id" = sub.org;--> statement-breakpoint
UPDATE "organization" SET "workspace_id" = "default_entity_id" WHERE "workspace_id" IS NULL AND "default_entity_id" IS NOT NULL;--> statement-breakpoint
UPDATE "organization" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'MGS')
  WHERE "workspace_id" IS NULL AND (upper(coalesce("country", '')) IN ('FR','FRANCE') OR "vat_number" ~* '^FR');--> statement-breakpoint
UPDATE "organization" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'OTP') WHERE "workspace_id" IS NULL;--> statement-breakpoint

CREATE TEMP TABLE "_org_clone" ON COMMIT DROP AS
SELECT ow.org, ow.ws, gen_random_uuid() AS new_id FROM "_org_ws" ow JOIN "organization" o ON o."id" = ow.org WHERE ow.ws <> o."workspace_id";--> statement-breakpoint
INSERT INTO "organization"
SELECT (jsonb_populate_record(NULL::"organization", to_jsonb(o) || jsonb_build_object('id', c.new_id, 'workspace_id', c.ws, 'drive_folder_id', NULL, 'default_entity_id', c.ws))).*
FROM "_org_clone" c JOIN "organization" o ON o."id" = c.org;--> statement-breakpoint
-- informative link: « also client of … »
UPDATE "organization" o SET "also_in" = sub.codes FROM (
  SELECT g.id, array_agg(DISTINCT le."code" ORDER BY le."code") AS codes FROM (
    SELECT c.org AS id, c.ws FROM "_org_clone" c
    UNION ALL SELECT c.new_id, o."workspace_id" FROM "_org_clone" c JOIN "organization" o ON o."id" = c.org
    UNION ALL SELECT c.new_id, c2.ws FROM "_org_clone" c JOIN "_org_clone" c2 ON c2.org = c.org AND c2.ws <> c.ws
  ) g JOIN "legal_entity" le ON le."id" = g.ws GROUP BY g.id
) sub WHERE o."id" = sub.id;--> statement-breakpoint
UPDATE "organization" o SET "also_in" = array_remove(o."also_in", le."code") FROM "legal_entity" le WHERE le."id" = o."workspace_id";--> statement-breakpoint

-- contacts: follow their company; a copy in every workspace where the company was duplicated
UPDATE "person" p SET "workspace_id" = o."workspace_id" FROM "organization" o WHERE o."id" = p."organization_id";--> statement-breakpoint
UPDATE "person" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'OTP') WHERE "workspace_id" IS NULL;--> statement-breakpoint
CREATE TEMP TABLE "_person_clone" ON COMMIT DROP AS
SELECT p."id" AS person, c.ws, c.new_id AS org_new, gen_random_uuid() AS new_id FROM "person" p JOIN "_org_clone" c ON c.org = p."organization_id";--> statement-breakpoint
INSERT INTO "person"
SELECT (jsonb_populate_record(NULL::"person", to_jsonb(p) || jsonb_build_object('id', pc.new_id, 'workspace_id', pc.ws, 'organization_id', pc.org_new, 'user_id', NULL))).*
FROM "_person_clone" pc JOIN "person" p ON p."id" = pc.person;--> statement-breakpoint

-- repoint finance rows / projects to the company record of their own workspace
UPDATE "transaction" t SET "organization_id" = c.new_id FROM "_org_clone" c WHERE c.org = t."organization_id" AND c.ws = t."workspace_id";--> statement-breakpoint
UPDATE "transaction" t SET "client_id" = c.new_id FROM "_org_clone" c WHERE c.org = t."client_id" AND c.ws = t."workspace_id";--> statement-breakpoint
UPDATE "quote" q SET "organization_id" = c.new_id FROM "_org_clone" c WHERE c.org = q."organization_id" AND c.ws = q."workspace_id";--> statement-breakpoint
UPDATE "quote" q SET "contact_id" = pc.new_id FROM "_person_clone" pc WHERE pc.person = q."contact_id" AND pc.ws = q."workspace_id";--> statement-breakpoint
UPDATE "project" p SET "workspace_id" = o."workspace_id" FROM "organization" o WHERE p."workspace_id" IS NULL AND o."id" = p."organization_id";--> statement-breakpoint
UPDATE "project" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'OTP') WHERE "workspace_id" IS NULL;--> statement-breakpoint
UPDATE "project" p SET "organization_id" = c.new_id FROM "_org_clone" c WHERE c.org = p."organization_id" AND c.ws = p."workspace_id";--> statement-breakpoint
UPDATE "project" p SET "lead_id" = pc.new_id FROM "_person_clone" pc WHERE pc.person = p."lead_id" AND pc.ws = p."workspace_id";--> statement-breakpoint
UPDATE "project" SET "legal_entity_id" = "workspace_id";--> statement-breakpoint

UPDATE "task" t SET "workspace_id" = p."workspace_id" FROM "project" p WHERE p."id" = t."project_id";--> statement-breakpoint
UPDATE "task" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'OTP') WHERE "workspace_id" IS NULL;--> statement-breakpoint
UPDATE "ticket" t SET "workspace_id" = p."workspace_id" FROM "project" p WHERE p."id" = t."project_id";--> statement-breakpoint
UPDATE "ticket" t SET "workspace_id" = o."workspace_id" FROM "organization" o WHERE t."workspace_id" IS NULL AND o."id" = t."organization_id";--> statement-breakpoint
UPDATE "ticket" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'OTP') WHERE "workspace_id" IS NULL;--> statement-breakpoint
UPDATE "ticket" t SET "organization_id" = c.new_id FROM "_org_clone" c WHERE c.org = t."organization_id" AND c.ws = t."workspace_id";--> statement-breakpoint
UPDATE "ticket" t SET "requester_id" = pc.new_id FROM "_person_clone" pc WHERE pc.person = t."requester_id" AND pc.ws = t."workspace_id";--> statement-breakpoint

-- ===================================================================== communications & calendar
-- personal mailboxes belong to their owner's workspace; @otopio.ca mail follows the company (Megascale clients included)
CREATE TEMP TABLE "_mailbox_ws" ON COMMIT DROP AS
SELECT m.mailbox, le."id" AS ws FROM (VALUES ('megascale.technologie@gmail.com','MGS'),('sami.hanine22@gmail.com','SHF'),('maissane.t69@gmail.com','MTF')) AS m(mailbox, code)
JOIN "legal_entity" le ON le."code" = m.code;--> statement-breakpoint
UPDATE "communication" c SET "workspace_id" = m.ws FROM "_mailbox_ws" m WHERE lower(c."mailbox") = m.mailbox;--> statement-breakpoint
-- company with a record in that personal workspace → use it
UPDATE "communication" c SET "organization_id" = oc.new_id FROM "_org_clone" oc WHERE oc.org = c."organization_id" AND oc.ws = c."workspace_id";--> statement-breakpoint
-- otherwise: the company's workspace, preferring Otopio Inc. / Megascale for mail received on @otopio.ca
UPDATE "communication" c SET "workspace_id" = sub.ws, "organization_id" = sub.oid FROM (
  SELECT DISTINCT ON (c2."id") c2."id", cand.ws, cand.oid
  FROM "communication" c2
  JOIN (
    SELECT o."id" AS org, o."workspace_id" AS ws, o."id" AS oid FROM "organization" o
    UNION ALL SELECT oc.org, oc.ws, oc.new_id FROM "_org_clone" oc
  ) cand ON cand.org = c2."organization_id"
  JOIN "legal_entity" le ON le."id" = cand.ws
  WHERE c2."workspace_id" IS NULL
  ORDER BY c2."id", (le."code" IN ('OTP','MGS')) DESC, (cand.oid = cand.org) DESC
) sub WHERE c."id" = sub."id";--> statement-breakpoint
UPDATE "communication" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'OTP') WHERE "workspace_id" IS NULL;--> statement-breakpoint
UPDATE "communication" c SET "person_id" = pc.new_id FROM "_person_clone" pc WHERE pc.person = c."person_id" AND pc.ws = c."workspace_id";--> statement-breakpoint

UPDATE "event" e SET "workspace_id" = m.ws FROM "_mailbox_ws" m WHERE lower(e."calendar_owner") = m.mailbox;--> statement-breakpoint
UPDATE "event" e SET "organization_id" = oc.new_id FROM "_org_clone" oc WHERE oc.org = e."organization_id" AND oc.ws = e."workspace_id";--> statement-breakpoint
UPDATE "event" e SET "workspace_id" = sub.ws, "organization_id" = sub.oid FROM (
  SELECT DISTINCT ON (e2."id") e2."id", cand.ws, cand.oid
  FROM "event" e2
  JOIN (
    SELECT o."id" AS org, o."workspace_id" AS ws, o."id" AS oid FROM "organization" o
    UNION ALL SELECT oc.org, oc.ws, oc.new_id FROM "_org_clone" oc
  ) cand ON cand.org = e2."organization_id"
  JOIN "legal_entity" le ON le."id" = cand.ws
  WHERE e2."workspace_id" IS NULL
  ORDER BY e2."id", (le."code" IN ('OTP','MGS')) DESC, (cand.oid = cand.org) DESC
) sub WHERE e."id" = sub."id";--> statement-breakpoint
UPDATE "event" e SET "workspace_id" = p."workspace_id" FROM "project" p WHERE e."workspace_id" IS NULL AND p."id" = e."project_id";--> statement-breakpoint
UPDATE "event" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'OTP') WHERE "workspace_id" IS NULL;--> statement-breakpoint
UPDATE "event" e SET "person_id" = pc.new_id FROM "_person_clone" pc WHERE pc.person = e."person_id" AND pc.ws = e."workspace_id";--> statement-breakpoint

-- ===================================================================== cards (a copy per workspace using it)
UPDATE "credit_card" SET "workspace_id" = "legal_entity_id" WHERE "legal_entity_id" IS NOT NULL;--> statement-breakpoint
UPDATE "credit_card" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = CASE WHEN "holder" ~* 'ma[iï]ssane|touati' OR "label" ~* 'ma[iï]ssane' THEN 'MTF' ELSE 'SHF' END) WHERE "workspace_id" IS NULL;--> statement-breakpoint
CREATE TEMP TABLE "_card_clone" ON COMMIT DROP AS
SELECT DISTINCT t."card_id" AS card, t."workspace_id" AS ws FROM "transaction" t JOIN "credit_card" c ON c."id" = t."card_id" WHERE t."workspace_id" <> c."workspace_id";--> statement-breakpoint
ALTER TABLE "_card_clone" ADD COLUMN new_id uuid DEFAULT gen_random_uuid();--> statement-breakpoint
INSERT INTO "credit_card"
SELECT (jsonb_populate_record(NULL::"credit_card", to_jsonb(c) || jsonb_build_object('id', cc.new_id, 'workspace_id', cc.ws, 'legal_entity_id', cc.ws))).*
FROM "_card_clone" cc JOIN "credit_card" c ON c."id" = cc.card;--> statement-breakpoint
UPDATE "transaction" t SET "card_id" = cc.new_id FROM "_card_clone" cc WHERE cc.card = t."card_id" AND cc.ws = t."workspace_id";--> statement-breakpoint

-- ===================================================================== documents / Drive index
UPDATE "document" d SET "workspace_id" = t."workspace_id" FROM "transaction" t WHERE t."id" = coalesce(d."invoice_id", d."bill_id");--> statement-breakpoint
UPDATE "document" d SET "workspace_id" = q."workspace_id" FROM "quote" q WHERE d."workspace_id" IS NULL AND q."id" = d."quote_id";--> statement-breakpoint
UPDATE "document" d SET "workspace_id" = o."workspace_id" FROM "organization" o WHERE d."workspace_id" IS NULL AND o."id" = d."organization_id";--> statement-breakpoint
UPDATE "document" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'MGS') WHERE "workspace_id" IS NULL AND "path" ~* '^[^/]+/[^/]+/megascale(/|$)';--> statement-breakpoint
UPDATE "document" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'MTF') WHERE "workspace_id" IS NULL AND "path" ~* '^[^/]+/[^/]+/freelance' AND "path" ~* 'ma[iï]ssane';--> statement-breakpoint
UPDATE "document" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'SHF') WHERE "workspace_id" IS NULL AND "path" ~* '^[^/]+/[^/]+/freelance';--> statement-breakpoint
UPDATE "document" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'OTP') WHERE "workspace_id" IS NULL;--> statement-breakpoint
-- document templates are available in every workspace
INSERT INTO "document"
SELECT (jsonb_populate_record(NULL::"document", to_jsonb(d) || jsonb_build_object('id', gen_random_uuid(), 'workspace_id', le."id", 'drive_file_id', NULL))).*
FROM "document" d CROSS JOIN "legal_entity" le
WHERE d."kind" = 'template' AND le."code" IN ('MGS','SHF','MTF') AND le."id" <> d."workspace_id";--> statement-breakpoint

-- website / marketing content and saved views: Otopio Inc.
UPDATE "article" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'OTP');--> statement-breakpoint
UPDATE "artifact" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'OTP');--> statement-breakpoint
UPDATE "team_member" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'OTP');--> statement-breakpoint
UPDATE "post" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'OTP');--> statement-breakpoint
UPDATE "saved_view" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'OTP');--> statement-breakpoint
UPDATE "file" f SET "workspace_id" = t."workspace_id" FROM "transaction" t WHERE f."table_name" = 'transaction' AND t."id" = f."record_id";--> statement-breakpoint
UPDATE "file" f SET "workspace_id" = o."workspace_id" FROM "organization" o WHERE f."workspace_id" IS NULL AND f."table_name" = 'organization' AND o."id" = f."record_id";--> statement-breakpoint
UPDATE "file" SET "workspace_id" = (SELECT "id" FROM "legal_entity" WHERE "code" = 'OTP') WHERE "workspace_id" IS NULL;--> statement-breakpoint

-- ===================================================================== Maïssane's Anthropic receipts (Visa •9010, maissane@otopio.ca) → Otopio Inc., à rembourser
INSERT INTO "organization" ("name","type","status","website","workspace_id","notes")
SELECT 'Anthropic','supplier','active','https://www.anthropic.com', le."id", 'Fournisseur IA (Claude).' FROM "legal_entity" le
WHERE le."code" = 'OTP' AND NOT EXISTS (SELECT 1 FROM "organization" o WHERE o."workspace_id" = le."id" AND o."name" ILIKE 'anthropic%');--> statement-breakpoint
INSERT INTO "transaction" ("kind","side","legal_entity_id","workspace_id","date","label","number","organization_id","category","status","currency","subtotal","tax_total","total","taxes","paid_by","scope","external_ref","notes")
SELECT 'expense','debit',le."id",le."id",r.d::date,'Anthropic — ' || r.item,r.num,
  (SELECT o."id" FROM "organization" o WHERE o."workspace_id" = le."id" AND o."name" ILIKE 'anthropic%' ORDER BY o."created_at" LIMIT 1),
  'ai','to_pay','CAD',r.ht,r.tps,r.ttc,
  jsonb_build_array(jsonb_build_object('code','TPS','label','TPS','rate',0.05,'amount',r.tps)),
  'reimburse','pro','gmail:' || r.msg,
  'Payé avec la carte personnelle de Maïssane (Visa •9010) — à rembourser. Reçu dans maissane@otopio.ca.'
FROM "legal_entity" le CROSS JOIN (VALUES
  ('2026-05-26','BX64WFS8-0001','Claude Pro',28.00,1.40,29.40,'19e65d012ec79196'),
  ('2026-06-21','BX64WFS8-0002','crédits d''usage',20.00,1.00,21.00,'19eedc385d951553'),
  ('2026-06-26','BX64WFS8-0003','Claude Pro',28.00,1.40,29.40,'19f05ae77379e9da'),
  ('2026-07-11','BX64WFS8-0004','crédits d''usage',20.00,1.00,21.00,'19f530f371ec6383'),
  ('2026-07-11','BX64WFS8-0005','crédits d''usage',25.00,1.25,26.25,'19f5390a6e9dbcb4'),
  ('2026-07-15','BX64WFS8-0006','crédits d''usage',63.00,3.15,66.15,'19f6822c62d5a763'),
  ('2026-07-26','BX64WFS8-0007','Claude Pro',28.00,1.40,29.40,'19fa02defa236ff9'),
  ('2026-08-26','BX64WFS8-0008','Claude Pro',28.00,1.40,29.40,'1a03fd236bd2fef7'),
  ('2026-09-27','BX64WFS8-0009','Claude Pro',28.00,1.40,29.40,'1a0e43f542c4d5c8'),
  ('2026-10-26','BX64WFS8-0010','Claude Pro',28.00,1.40,29.40,'1a179f6017792828')
) AS r(d, num, item, ht, tps, ttc, msg)
WHERE le."code" = 'OTP'
  AND NOT EXISTS (SELECT 1 FROM "transaction" t WHERE t."external_ref" = 'gmail:' || r.msg OR (t."kind" = 'expense' AND t."number" = r.num)
    OR (t."kind" = 'expense' AND t."label" ILIKE '%anthropic%' AND t."date" = r.d::date AND t."total" = r.ttc));--> statement-breakpoint

-- ===================================================================== constraints
ALTER TABLE "article" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "artifact" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "communication" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_card" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "person" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "post" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_view" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "team_member" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "portal_access" ADD CONSTRAINT "portal_access_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_access" ADD CONSTRAINT "portal_access_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_access_uq" ON "portal_access" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "portal_access_email_idx" ON "portal_access" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_member_uq" ON "workspace_member" USING btree ("workspace_id","email");--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication" ADD CONSTRAINT "communication_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card" ADD CONSTRAINT "credit_card_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_workspace_id_legal_entity_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."legal_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entity" ADD CONSTRAINT "legal_entity_slug_unique" UNIQUE("slug");
