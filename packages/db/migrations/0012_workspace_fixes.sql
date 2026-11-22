-- Data fixes after the workspace split
-- 1. cancelled subscriptions (Studocu, BIXI)
UPDATE "transaction" SET "active" = false WHERE "active" AND ("label" ILIKE 'studocu%' OR "label" ILIKE 'bixi%' OR "counterparty" ILIKE 'studocu%' OR "counterparty" ILIKE 'bixi%');--> statement-breakpoint
-- 2. a ledger row always belongs to the structure of its workspace
UPDATE "transaction" SET "legal_entity_id" = "workspace_id" WHERE "legal_entity_id" <> "workspace_id";--> statement-breakpoint
UPDATE "quote" SET "legal_entity_id" = "workspace_id" WHERE "legal_entity_id" <> "workspace_id";--> statement-breakpoint
-- 3. Maïssane Freelance: clients and invoices from her freelance history (Drive « Recettes / Freelance »)
INSERT INTO "organization" ("workspace_id","default_entity_id","name","legal_name","type","status","email","website","address_line1","postal_code","city","country","notes")
SELECT le."id", le."id", c.name, c.legal, 'client', c.status::organization_status, c.email, c.website, c.addr, c.pc, c.city, c.country, 'Client freelance de Maïssane (historique des factures).'
FROM "legal_entity" le CROSS JOIN (VALUES
  ('Phinom', 'Phinom', 'former', 'youssef@firstcrestcapital.com', NULL, '2207 E 2nd street', '90803', 'Long Beach', 'US'),
  ('Medic.pub', 'Medic.Pub Solutions Inc.', 'active', NULL, 'https://medic.pub', '1150 Pierre Phaneuf', 'H7L 0C6', 'Laval', 'CA'),
  ('MyDkeys', 'IC PRO-COM Inc.', 'active', 'admin@mydkeys.ca', NULL, '1750 rue Scheffer', 'J3L 3E7', 'Chambly', 'CA'),
  ('Heeroo', 'Heeroo', 'active', 'jonathan@heeroo.com', 'https://heeroo.com', NULL, NULL, NULL, 'CA')
) AS c(name, legal, status, email, website, addr, pc, city, country)
WHERE le."code" = 'MTF' AND NOT EXISTS (SELECT 1 FROM "organization" o WHERE o."workspace_id" = le."id" AND lower(o."name") = lower(c.name));--> statement-breakpoint
INSERT INTO "transaction" ("kind","side","legal_entity_id","workspace_id","date","due_date","label","number","organization_id","status","paid_at","currency","lines","subtotal","tax_total","total","amount_paid","notes","source")
SELECT 'invoice','credit',le."id",le."id",r.d::date,(r.d::date + 30),r.label,r.num,
  (SELECT o."id" FROM "organization" o WHERE o."workspace_id" = le."id" AND lower(o."name") = lower(r.client) LIMIT 1),
  r.status, CASE WHEN r.status = 'paid' THEN r.d::date END, r.cur,
  jsonb_build_array(jsonb_build_object('id','l1','description',r.label,'quantity',1,'unitPrice',r.total)),
  r.total, 0, r.total, CASE WHEN r.status = 'paid' THEN r.total ELSE 0 END,
  r.notes, 'none'
FROM "legal_entity" le CROSS JOIN (VALUES
  ('2023-06-14','00001','Phinom','Design de l''interface web SaaS','USD',2000.00,'paid','Facture PDF : 2023-06-14 — Phinom — Facture — 00001 (Maïssane). Statut de paiement à confirmer.'),
  ('2025-06-01','0003-0625','Medic.pub','Conception du site web + gestion des documents (42 h × 90 $)','CAD',3780.00,'paid','Facture PDF : Medic.pub — Facture — site (Maïssane). Statut de paiement à confirmer.'),
  ('2025-06-20','0004-0625','Medic.pub','Gestion des profils, données médicales, sécurité (48 h × 90 $)','CAD',4320.00,'paid','Facture PDF : Medic.pub — Facture — revenu 4 (Maïssane). Montant estimé sur la facture. Statut de paiement à confirmer.'),
  ('2025-08-11','0004-0825','Medic.pub','Accès par rôles, onboarding, traduction, 36 000 diagnostics (24 h × 90 $)','CAD',2160.00,'paid','Facture PDF : Medic.pub — Facture (Maïssane). Statut de paiement à confirmer.'),
  ('2025-10-12','1025-02','MyDkeys','Identité visuelle + site web multipages (acompte 1 000 $, solde 2 500 $)','CAD',3500.00,'sent','Facture PDF : Paxeo — Facture — perso maissane (Maïssane), adressée à IC PRO-COM Inc. (MyDkeys). Statut de paiement à confirmer.'),
  ('2025-11-11','1025-03','Heeroo','Agent IA — Jalon 1 (acompte 25 % de 13 000 $)','CAD',3250.00,'sent','Facture PDF : Heeroo — Facture — jalon 1 (Maïssane). Projet total 13 000 $ TTC en 4 versements. Statut de paiement à confirmer.')
) AS r(d, num, client, label, cur, total, status, notes)
WHERE le."code" = 'MTF'
  AND NOT EXISTS (SELECT 1 FROM "transaction" t WHERE t."workspace_id" = le."id" AND t."kind" = 'invoice' AND t."number" = r.num);--> statement-breakpoint
-- informative « also with » tags for companies now present in several workspaces
UPDATE "organization" o SET "also_in" = sub.codes FROM (
  SELECT o1."id", array_agg(DISTINCT le2."code" ORDER BY le2."code") AS codes
  FROM "organization" o1
  JOIN "organization" o2 ON o2."id" <> o1."id" AND o2."workspace_id" <> o1."workspace_id" AND (lower(o2."name") = lower(o1."name") OR (o1."name" = 'MyDkeys' AND o2."name" ILIKE 'my%dkeys%') OR (o2."name" = 'MyDkeys' AND o1."name" ILIKE 'my%dkeys%'))
  JOIN "legal_entity" le2 ON le2."id" = o2."workspace_id"
  GROUP BY o1."id"
) sub WHERE o."id" = sub."id";
