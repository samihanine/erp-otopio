import { eq, sql } from "drizzle-orm";
import { db, schema } from "@erp/db";

export const ADMIN = "contact@otopio.ca";
export const MEMBERS = (process.env.MAILBOXES ?? "sami@otopio.ca,contact@otopio.ca,maissane@otopio.ca,noah@otopio.ca").split(",");
export const GENERIC = new Set(["gmail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr", "yahoo.com", "yahoo.fr", "live.fr", "live.com", "free.fr", "icloud.com", "me.com", "videotron.ca"]);
export const AUTOMATED = /(no-?reply|do-?not-?reply|nepasrepondre|notifications?@|notify@|mailer@|alerts?@|calendar-notification|bounce|postmaster|newsletter)/i;

export async function getState(key: string) {
  const [r] = await db.select().from(schema.syncState).where(eq(schema.syncState.key, key));
  return r?.value ?? null;
}
export async function setState(key: string, value: string) {
  await db.insert(schema.syncState).values({ key, value }).onConflictDoUpdate({ target: schema.syncState.key, set: { value, updatedAt: new Date() } });
}

/** Automation journal (shown in Settings → Journal, undo for created records). */
export async function log(kind: string, table: string, recordId: string, comment: string, undo?: Record<string, unknown>) {
  await db.insert(schema.activity).values({ table, recordId, action: `automation:${kind}`, comment, changes: undo ? ({ undo } as never) : null }).catch(() => {});
}

const host = (u?: string | null) => (u ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? "";

/* ------------------------------ Workspaces ------------------------------ */
export type Ws = typeof schema.legalEntity.$inferSelect;
export const COMPANIES = new Set(["OTP", "MGS"]);
export async function workspaces() {
  return db.select().from(schema.legalEntity);
}
export async function wsByCode(code: string) {
  const [w] = await db.select().from(schema.legalEntity).where(eq(schema.legalEntity.code, code));
  return w ?? null;
}

/**
 * Contact directory used to attach emails/events to people and organizations (all workspaces).
 * A company present in several workspaces matches its Otopio Inc. / Megascale record first (mail on @otopio.ca).
 */
export async function directory() {
  const [orgsRaw, peopleRaw, wss] = await Promise.all([db.select().from(schema.organization), db.select().from(schema.person), workspaces()]);
  const company = new Set(wss.filter((w) => COMPANIES.has(w.code)).map((w) => w.id));
  // freelance first, companies last → companies win in the maps below
  const rank = (wsId: string) => (company.has(wsId) ? 1 : 0);
  const orgs = [...orgsRaw].sort((a, b) => rank(a.workspaceId) - rank(b.workspaceId));
  const people = [...peopleRaw].sort((a, b) => rank(a.workspaceId) - rank(b.workspaceId));
  const byEmail = new Map<string, typeof people[number]>();
  for (const p of people) if (p.email) byEmail.set(p.email.toLowerCase(), p);
  const byDomain = new Map<string, typeof orgs[number]>();
  for (const o of orgs) {
    if (o.type === "internal") continue;
    for (const d of [host(o.website), (o.email ?? "").split("@")[1]?.toLowerCase() ?? ""]) if (d && !GENERIC.has(d)) byDomain.set(d, o);
  }
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  for (const p of people) {
    const d = p.email?.split("@")[1]?.toLowerCase();
    const o = p.organizationId ? orgById.get(p.organizationId) : null;
    if (d && o && o.type !== "internal" && !GENERIC.has(d) && !d.endsWith("otopio.ca") && !byDomain.has(d)) byDomain.set(d, o);
  }
  const projects = await db.select().from(schema.project);
  const activeProjectOf = (orgId: string) =>
    projects.filter((p) => p.organizationId === orgId && ["in_progress", "planned", "maintenance"].includes(p.status)).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0] ?? null;
  const match = (emails: string[]) => {
    let person: typeof people[number] | null = null;
    let org: typeof orgs[number] | null = null;
    for (const e of emails) {
      const p = byEmail.get(e);
      if (p && !person && !e.endsWith("@otopio.ca")) person = p;
      const o = (p?.organizationId && orgById.get(p.organizationId)) || byDomain.get(e.split("@")[1] ?? "") || null;
      if (o && o.type !== "internal" && !org) org = o;
    }
    return { person, org, project: org ? activeProjectOf(org.id) : null };
  };
  return { orgs, people, byEmail, byDomain, orgById, match };
}

/* ------------------------- Claude (cheap, tracked) ------------------------- */
import { ai as claude, aiEnabled } from "@erp/ai";
export { aiEnabled };
export function ai<T = string>(system: string, user: string, json = false, feature = "divers"): Promise<T> {
  return claude<T>(feature, system, user, json);
}

export { sql };
