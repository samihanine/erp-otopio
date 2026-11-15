/** AI summaries (OpenAI cheap model): email threads, client relationship, weekly dashboard digest. */
import { and, desc, eq, gte, isNull, like, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@erp/db";
import { gmail, header, textBody } from "@erp/google";
import { ai, aiEnabled, setState } from "./common";

const SYSTEM = "Tu es l'assistant de l'agence Otopio. Rédige en français, concis, factuel, sans formules de politesse.";

export async function summarizeCommunications(limit = 25) {
  if (!aiEnabled()) return 0;
  const rows = await db
    .select()
    .from(schema.communication)
    .where(and(isNull(schema.communication.aiSummary), like(schema.communication.externalId, "gmail:%")))
    .orderBy(desc(schema.communication.occurredAt))
    .limit(limit);
  let n = 0;
  for (const c of rows) {
    const tid = c.externalId!.slice(6);
    const t = await gmail.thread(c.mailbox ?? "contact@otopio.ca", tid, "full").catch(() => null);
    if (!t) {
      await db.update(schema.communication).set({ aiSummary: "" }).where(eq(schema.communication.id, c.id));
      continue;
    }
    const text = t.messages.map((m) => `De: ${header(m, "From")} — ${header(m, "Date")}\n${textBody(m).slice(0, 3000)}`).join("\n---\n");
    const r = await ai<{ summary: string; nextSteps: string }>(SYSTEM, `Résume ce fil de courriels en 2-3 phrases, puis liste les prochaines étapes (ou "" s'il n'y en a pas).\nJSON: {"summary": string, "nextSteps": string}\n\n${text}`, true).catch(() => null);
    if (!r) continue;
    await db
      .update(schema.communication)
      .set({ aiSummary: r.summary, ...(c.nextSteps ? {} : { nextSteps: r.nextSteps || null }) })
      .where(eq(schema.communication.id, c.id));
    n++;
  }
  return n;
}

export async function summarizeClients() {
  if (!aiEnabled()) return 0;
  const orgs = await db
    .select()
    .from(schema.organization)
    .where(and(eq(schema.organization.type, "client"), eq(schema.organization.status, "active"), or(isNull(schema.organization.aiSummaryAt), lt(schema.organization.aiSummaryAt, new Date(Date.now() - 20 * 3600e3)))))
    .limit(15);
  let n = 0;
  for (const o of orgs) {
    const [comms, projects, invoices, tickets] = await Promise.all([
      db.select().from(schema.communication).where(eq(schema.communication.organizationId, o.id)).orderBy(desc(schema.communication.occurredAt)).limit(15),
      db.select().from(schema.project).where(eq(schema.project.organizationId, o.id)),
      db.select().from(schema.invoice).where(eq(schema.invoice.organizationId, o.id)),
      db.select().from(schema.ticket).where(eq(schema.ticket.organizationId, o.id)),
    ]);
    const ctx = [
      `Client: ${o.name} (${o.industry ?? ""}) — notes: ${o.notes ?? ""}`,
      `Projets: ${projects.map((p) => `${p.name} [${p.status}, ${p.progress}%, échéance ${p.dueDate ?? "?"}]`).join("; ")}`,
      `Factures: ${invoices.map((i) => `${i.number} ${i.status} ${i.total} ${i.currency} (payé ${i.amountPaid})`).join("; ")}`,
      `Tickets ouverts: ${tickets.filter((t) => !["resolved", "closed"].includes(t.status)).map((t) => t.title).join("; ")}`,
      `Derniers échanges:\n${comms.map((c) => `- ${c.occurredAt.toISOString().slice(0, 10)} ${c.type} « ${c.subject} » ${c.aiSummary ?? c.summary?.slice(0, 200) ?? ""}`).join("\n")}`,
    ].join("\n");
    const summary = await ai<string>(SYSTEM, `Fais un point de situation sur ce client en 4 à 6 puces courtes : état des projets, argent (facturé / dû), derniers échanges, risques, prochaine action recommandée.\n\n${ctx}`).catch(() => null);
    if (!summary) continue;
    await db.update(schema.organization).set({ aiSummary: summary, aiSummaryAt: new Date() }).where(eq(schema.organization.id, o.id));
    n++;
  }
  return n;
}

export async function dashboardDigest() {
  if (!aiEnabled()) return false;
  const since = new Date(Date.now() - 7 * 864e5);
  const [comms, tasks, invoices, bills, events] = await Promise.all([
    db.select().from(schema.communication).where(gte(schema.communication.occurredAt, since)).orderBy(desc(schema.communication.occurredAt)).limit(60),
    db.select().from(schema.task).where(sql`${schema.task.status} not in ('done','cancelled')`),
    db.select().from(schema.invoice).where(sql`${schema.invoice.status} in ('sent','partial','overdue')`),
    db.select().from(schema.bill).where(gte(schema.bill.createdAt, since)),
    db.select().from(schema.event).where(and(gte(schema.event.startAt, new Date()), lt(schema.event.startAt, new Date(Date.now() + 7 * 864e5)), eq(schema.event.isPrivate, false))),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const ctx = [
    `Aujourd'hui: ${today}`,
    `Échanges des 7 derniers jours:\n${comms.map((c) => `- ${c.occurredAt.toISOString().slice(0, 10)} ${c.type} « ${c.subject} » ${c.aiSummary ?? ""}`).join("\n")}`,
    `Tâches ouvertes en retard: ${tasks.filter((t) => t.dueDate && t.dueDate < today).map((t) => `${t.title} (${t.dueDate})`).join("; ")}`,
    `Factures non payées: ${invoices.map((i) => `${i.number} ${i.total - i.amountPaid} ${i.currency} échéance ${i.dueDate ?? "?"}`).join("; ")}`,
    `Nouvelles dépenses: ${bills.map((b) => `${b.label} ${b.total} ${b.currency}`).join("; ")}`,
    `Réunions à venir: ${events.map((e) => `${e.startAt.toISOString().slice(0, 16)} ${e.title} (${e.calendarOwner})`).join("; ")}`,
  ].join("\n\n");
  const digest = await ai<string>(
    SYSTEM,
    `Rédige le point hebdomadaire de l'équipe en markdown très court (max 120 mots) avec 3 sections : **Cette semaine**, **À surveiller** (retards, impayés), **Agenda**.\n\n${ctx}`,
  ).catch(() => null);
  if (!digest) return false;
  await setState("dashboard:digest", JSON.stringify({ digest, at: new Date().toISOString() }));
  return true;
}
