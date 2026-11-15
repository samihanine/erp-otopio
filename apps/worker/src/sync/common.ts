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

/** Contact directory used to attach emails/events to people and organizations. */
export async function directory() {
  const [orgs, people] = await Promise.all([db.select().from(schema.organization), db.select().from(schema.person)]);
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

/* ----------------------------- OpenAI (cheap) ----------------------------- */
const OPENAI_KEY = () => process.env.OPENAI_API_KEY ?? process.env.OPENIA_API_KEY ?? "";
export const aiEnabled = () => Boolean(OPENAI_KEY());
export async function ai<T = string>(system: string, user: string, json = false): Promise<T> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${OPENAI_KEY()}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-6-luna",
      messages: [
        { role: "system", content: system + (json ? "\nRéponds uniquement en JSON." : "") },
        { role: "user", content: user.slice(0, 24_000) },
      ],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const j = (await res.json()) as { choices?: { message: { content: string } }[]; error?: { message: string } };
  if (!j.choices) throw new Error(`OpenAI: ${j.error?.message}`);
  const content = j.choices[0]!.message.content;
  return (json ? JSON.parse(content) : content) as T;
}

export { sql };
