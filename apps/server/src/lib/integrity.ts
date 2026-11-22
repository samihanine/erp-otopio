/**
 * Consistency checks of one workspace (Settings › Système), with an automatic fix for cross-workspace links.
 * A workspace must only reference its own companies, contacts, projects and cards.
 */
import { sql } from "drizzle-orm";
import { db } from "@erp/db";
import type { Workspace } from "./workspace";

type Check = { key: string; label: string; level: "ok" | "warn" | "error"; count: number; items: string[]; fixable?: boolean };

/** [table, column, target table] — references that must stay inside the workspace */
const REFS: [string, string, string][] = [
  ["transaction", "organization_id", "organization"],
  ["transaction", "client_id", "organization"],
  ["transaction", "project_id", "project"],
  ["transaction", "card_id", "credit_card"],
  ["quote", "organization_id", "organization"],
  ["quote", "contact_id", "person"],
  ["quote", "project_id", "project"],
  ["project", "organization_id", "organization"],
  ["project", "lead_id", "person"],
  ["person", "organization_id", "organization"],
  ["communication", "organization_id", "organization"],
  ["communication", "person_id", "person"],
  ["communication", "project_id", "project"],
  ["event", "organization_id", "organization"],
  ["event", "person_id", "person"],
  ["event", "project_id", "project"],
  ["ticket", "organization_id", "organization"],
  ["ticket", "project_id", "project"],
  ["task", "project_id", "project"],
  ["task", "assignee_id", "person"],
  ["ticket", "requester_id", "person"],
  ["ticket", "assignee_id", "person"],
  ["document", "organization_id", "organization"],
  ["document", "project_id", "project"],
];

const rows = async <T>(q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as T[];

export async function integrity(ws: Workspace) {
  const id = ws.id;
  const checks: Check[] = [];

  const cross: string[] = [];
  let crossN = 0;
  for (const [t, c, target] of REFS) {
    const r = await rows<{ n: number }>(sql.raw(`select count(*)::int n from "${t}" a join "${target}" b on b.id = a."${c}" where a.workspace_id = '${id}' and b.workspace_id <> a.workspace_id`));
    if (r[0]!.n) {
      crossN += r[0]!.n;
      cross.push(`${t}.${c} → ${target} : ${r[0]!.n}`);
    }
  }
  checks.push({ key: "cross", label: "Liens vers un autre espace de travail", level: crossN ? "error" : "ok", count: crossN, items: cross, fixable: crossN > 0 });

  const ent = await rows<{ n: number }>(sql`select count(*)::int n from "transaction" where workspace_id = ${id} and legal_entity_id <> workspace_id`);
  checks.push({ key: "entity", label: "Transactions rattachées à une autre structure", level: ent[0]!.n ? "error" : "ok", count: ent[0]!.n, items: [], fixable: ent[0]!.n > 0 });

  const dup = await rows<{ name: string; n: number }>(sql`select min(name) as name, count(*)::int n from organization where workspace_id = ${id} group by lower(trim(name)) having count(*) > 1 order by 1`);
  checks.push({ key: "dup-orgs", label: "Entreprises en double (même nom)", level: dup.length ? "warn" : "ok", count: dup.length, items: dup.map((d) => `${d.name} ×${d.n}`) });

  const inv = await rows<{ number: string }>(sql`select coalesce(number, label) as number from "transaction" where workspace_id = ${id} and kind = 'invoice' and organization_id is null and status <> 'cancelled'`);
  checks.push({ key: "inv-client", label: "Factures sans client", level: inv.length ? "warn" : "ok", count: inv.length, items: inv.map((i) => i.number) });

  const num = await rows<{ number: string; n: number }>(sql`select number, count(*)::int n from "transaction" where workspace_id = ${id} and kind = 'invoice' and number is not null group by number having count(*) > 1`);
  checks.push({ key: "inv-dup", label: "Numéros de facture en double", level: num.length ? "error" : "ok", count: num.length, items: num.map((x) => `${x.number} ×${x.n}`) });

  const exp = await rows<{ label: string; date: string }>(sql`select label, date::text from "transaction" where workspace_id = ${id} and kind = 'expense' and total = 0 and status <> 'cancelled' order by date desc limit 20`);
  checks.push({ key: "exp-zero", label: "Dépenses sans montant", level: exp.length ? "warn" : "ok", count: exp.length, items: exp.map((e) => `${e.date} ${e.label}`) });

  // business expenses paid personally that the split rules would route to a company
  if (ws.code === "SHF" || ws.code === "MTF") {
    const r = await rows<{ label: string; date: string; currency: string }>(sql`select label, date::text, currency from "transaction" where workspace_id = ${id} and kind = 'expense' and scope = 'pro' and coalesce(category::text,'other') in ('software','hosting','ai','subcontracting','legal','accounting','marketing','office','travel','other') and ((currency = 'EUR' and date >= '2026-04-01') or (currency = 'CAD' and date >= '2026-01-01')) order by date desc limit 30`);
    checks.push({ key: "routing", label: "Dépenses pro 2026 encore dans le freelance (à vérifier)", level: r.length ? "warn" : "ok", count: r.length, items: r.map((x) => `${x.date} ${x.label} (${x.currency})`) });
  }

  const subs = await rows<{ label: string; date: string }>(
    sql`select label, date::text from "transaction" where workspace_id = ${id} and kind = 'expense' and active and date < now() - (case recurrence when 'yearly' then interval '13 months' when 'quarterly' then interval '4 months' else interval '45 days' end) order by date`,
  );
  checks.push({ key: "subs", label: "Abonnements « en cours » sans prélèvement récent", level: subs.length ? "warn" : "ok", count: subs.length, items: subs.map((s) => `${s.label} (dernier ${s.date})`) });

  const drive = ws.drive ?? {};
  const storage = [drive.root, drive.folderId, drive.clients, drive.admin].filter(Boolean) as string[];
  const outside = storage.length
    ? await rows<{ n: number }>(sql.raw(`select count(*)::int n from document where workspace_id = '${id}' and drive_file_id is not null and drive_id is not null and drive_id not in (${storage.map((s) => `'${s}'`).join(",")})`))
    : [{ n: 0 }];
  checks.push({
    key: "drive",
    label: storage.length ? "Fichiers indexés hors du Drive de l'espace" : "Drive de l'espace non configuré (compte Google à connecter ?)",
    level: !storage.length ? "warn" : outside[0]!.n ? "warn" : "ok",
    count: storage.length ? outside[0]!.n : 1,
    items: [],
  });

  const toSort = await rows<{ n: number }>(sql`select count(*)::int n from document where workspace_id = ${id} and status = 'to_sort'`);
  checks.push({ key: "uploads", label: "Fichiers déposés par des clients à trier", level: toSort[0]!.n ? "warn" : "ok", count: toSort[0]!.n, items: [] });

  return { workspace: ws.name, at: new Date().toISOString(), checks };
}

/** Re-points cross-workspace links: same-name company / same-email contact of the workspace (copied if missing); projects & cards unlinked. */
export async function fixIntegrity(ws: Workspace) {
  const id = ws.id;
  let fixed = 0;
  await db.execute(sql`update "transaction" set legal_entity_id = workspace_id where workspace_id = ${id} and legal_entity_id <> workspace_id`);
  for (const [t, c, target] of REFS) {
    const bad = await rows<{ rid: string; tid: string }>(sql.raw(`select a.id as rid, b.id as tid from "${t}" a join "${target}" b on b.id = a."${c}" where a.workspace_id = '${id}' and b.workspace_id <> a.workspace_id`));
    for (const b of bad) {
      let to: string | null = null;
      if (target === "organization") {
        const [same] = await rows<{ id: string }>(sql`select o2.id from organization o1 join organization o2 on lower(o2.name) = lower(o1.name) and o2.workspace_id = ${id} where o1.id = ${b.tid} limit 1`);
        to = same?.id ?? null;
        if (!to) {
          const [copy] = await rows<{ id: string }>(
            sql`insert into organization select (jsonb_populate_record(null::organization, to_jsonb(o) || jsonb_build_object('id', gen_random_uuid(), 'workspace_id', ${id}::uuid, 'default_entity_id', ${id}::uuid, 'drive_folder_id', null))).* from organization o where o.id = ${b.tid} returning id`,
          );
          to = copy!.id;
        }
      } else if (target === "person") {
        const [same] = await rows<{ id: string }>(
          sql`select p2.id from person p1 join person p2 on p2.workspace_id = ${id} and (lower(p2.email) = lower(p1.email) or (p1.email is null and lower(p2.first_name || coalesce(p2.last_name,'')) = lower(p1.first_name || coalesce(p1.last_name,'')))) where p1.id = ${b.tid} limit 1`,
        );
        to = same?.id ?? null;
        if (!to) {
          // a copy of the contact in this workspace (its company: the same-name company of this workspace, if any)
          const [copy] = await rows<{ id: string }>(
            sql`insert into person select (jsonb_populate_record(null::person, to_jsonb(p) || jsonb_build_object('id', gen_random_uuid(), 'workspace_id', ${id}::uuid, 'user_id', null, 'organization_id', (select o2.id from organization o1 join organization o2 on lower(o2.name) = lower(o1.name) and o2.workspace_id = ${id} where o1.id = p.organization_id limit 1)))).* from person p where p.id = ${b.tid} returning id`,
          );
          to = copy!.id;
        }
      }
      await db.execute(sql.raw(`update "${t}" set "${c}" = ${to ? `'${to}'` : "null"} where id = '${b.rid}'`));
      fixed++;
    }
  }
  return { fixed };
}

/** Once per version: fix cross-workspace links in every workspace (server boot). */
export async function autoFixAll() {
  const key = "integrity:autofix:v1";
  const done = (await db.execute(sql`select 1 from sync_state where key = ${key}`)) as unknown as unknown[];
  if (done.length) return;
  const wss = (await db.execute(sql`select * from legal_entity`)) as unknown as Record<string, unknown>[];
  let total = 0;
  for (const w of wss) total += (await fixIntegrity({ id: String(w.id) } as Workspace)).fixed;
  await db.execute(sql`insert into sync_state (key, value) values (${key}, ${String(total)}) on conflict (key) do update set value = excluded.value`);
  console.log(`[integrity] cross-workspace links fixed: ${total}`);
}
