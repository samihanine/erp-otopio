/** Clients dashboard, Drive explorer, dashboard digest and automation journal. */
import { Hono } from "hono";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, like, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@erp/db";
import { drive, FOLDER, googleConfigured } from "@erp/google";
import { round2, toCAD } from "@erp/shared";
import type { AppEnv } from "../lib/types";
import { queue } from "../lib/queue";

export const workspace = new Hono<AppEnv>();
const ADMIN = "contact@otopio.ca";

/* ------------------------------- Clients ---------------------------------- */

workspace.get("/clients", async (c) => {
  const orgs = await db.select().from(schema.organization).where(inArray(schema.organization.type, ["client"])).orderBy(asc(schema.organization.name));
  const [invoices, projects, comms] = await Promise.all([
    db.select().from(schema.invoice),
    db.select().from(schema.project),
    db.select({ org: schema.communication.organizationId, last: sql<string>`max(${schema.communication.occurredAt})`, n: sql<number>`count(*)::int` }).from(schema.communication).groupBy(schema.communication.organizationId),
  ]);
  return c.json(
    orgs.map((o) => {
      const inv = invoices.filter((i) => i.organizationId === o.id && i.status !== "cancelled" && i.status !== "draft");
      return {
        ...o,
        revenueCAD: round2(inv.reduce((a, i) => a + toCAD(i.subtotal, i.currency), 0)),
        outstandingCAD: round2(inv.filter((i) => ["sent", "partial", "overdue"].includes(i.status)).reduce((a, i) => a + toCAD(i.total - i.amountPaid, i.currency), 0)),
        activeProjects: projects.filter((p) => p.organizationId === o.id && ["in_progress", "planned", "maintenance"].includes(p.status)).length,
        lastContact: comms.find((x) => x.org === o.id)?.last ?? null,
        communications: comms.find((x) => x.org === o.id)?.n ?? 0,
      };
    }),
  );
});

workspace.get("/clients/:id", async (c) => {
  const id = c.req.param("id");
  const [org] = await db.select().from(schema.organization).where(eq(schema.organization.id, id));
  if (!org) return c.json({ error: "Not found" }, 404);
  const [people, projects, invoices, quotes, comms, tickets, docs, events, tx] = await Promise.all([
    db.select().from(schema.person).where(eq(schema.person.organizationId, id)),
    db.select().from(schema.project).where(eq(schema.project.organizationId, id)).orderBy(desc(schema.project.startDate)),
    db.select().from(schema.invoice).where(eq(schema.invoice.organizationId, id)).orderBy(desc(schema.invoice.issueDate)),
    db.select().from(schema.quote).where(eq(schema.quote.organizationId, id)).orderBy(desc(schema.quote.issueDate)),
    db.select().from(schema.communication).where(eq(schema.communication.organizationId, id)).orderBy(desc(schema.communication.occurredAt)).limit(40),
    db.select().from(schema.ticket).where(eq(schema.ticket.organizationId, id)).orderBy(desc(schema.ticket.createdAt)),
    db.select().from(schema.document).where(and(eq(schema.document.organizationId, id), eq(schema.document.isFolder, false))).orderBy(desc(schema.document.modifiedAt)).limit(60),
    db.select().from(schema.event).where(eq(schema.event.organizationId, id)).orderBy(desc(schema.event.startAt)).limit(200),
    db.select().from(schema.transaction),
  ]);
  const projectIds = projects.map((p) => p.id);
  const tasks = projectIds.length ? await db.select().from(schema.task).where(inArray(schema.task.projectId, projectIds)) : [];
  const live = invoices.filter((i) => i.status !== "cancelled" && i.status !== "draft");
  const cur = org.defaultEntityId ? (await db.select({ c: schema.legalEntity.currency }).from(schema.legalEntity).where(eq(schema.legalEntity.id, org.defaultEntityId)))[0]?.c ?? "CAD" : "CAD";
  const conv = (a: number, from: string) => (from === cur ? a : cur === "CAD" ? toCAD(a, from) : a);
  const now = Date.now();
  const pastMeetings = events.filter((e) => e.endAt.getTime() < now && !e.isPrivate);
  // dedupe same meeting across calendars
  const seen = new Set<string>();
  const meetingMinutes = pastMeetings.reduce((a, e) => {
    if (seen.has(e.googleEventId ?? e.id)) return a;
    seen.add(e.googleEventId ?? e.id);
    return a + (e.endAt.getTime() - e.startAt.getTime()) / 60000;
  }, 0);
  return c.json({
    org,
    currency: cur,
    kpis: {
      invoiced: round2(live.reduce((a, i) => a + conv(i.subtotal, i.currency), 0)),
      collected: round2(live.reduce((a, i) => a + conv(i.amountPaid, i.currency), 0)),
      outstanding: round2(live.filter((i) => ["sent", "partial", "overdue"].includes(i.status)).reduce((a, i) => a + conv(i.total - i.amountPaid, i.currency), 0)),
      quotesOpen: round2(quotes.filter((q) => q.status === "sent").reduce((a, q) => a + conv(q.subtotal, q.currency), 0)),
      quotesAccepted: round2(quotes.filter((q) => q.status === "accepted").reduce((a, q) => a + conv(q.subtotal, q.currency), 0)),
      hoursSpent: round2(tasks.reduce((a, t) => a + (t.spentHours ?? 0), 0)),
      hoursEstimated: round2(tasks.reduce((a, t) => a + (t.estimateHours ?? 0), 0)),
      meetingHours: round2(meetingMinutes / 60),
      openTasks: tasks.filter((t) => !["done", "cancelled"].includes(t.status)).length,
      openTickets: tickets.filter((t) => !["resolved", "closed"].includes(t.status)).length,
    },
    people,
    projects,
    invoices,
    quotes,
    communications: comms,
    tickets,
    tasks: tasks.filter((t) => !["done", "cancelled"].includes(t.status)).sort((a, b) => String(a.dueDate ?? "9").localeCompare(String(b.dueDate ?? "9"))).slice(0, 12),
    documents: docs,
    upcoming: events.filter((e) => e.startAt.getTime() >= now).sort((a, b) => a.startAt.getTime() - b.startAt.getTime()).slice(0, 6),
    driveUrl: org.driveFolderId ? `https://drive.google.com/drive/folders/${org.driveFolderId}` : null,
    payments: tx.filter((t) => live.some((i) => i.id === t.invoiceId)),
  });
});

workspace.post("/clients/:id/folder", async (c) => {
  await queue.add("client-folder", { organizationId: c.req.param("id") }, { removeOnComplete: 20 });
  return c.json({ ok: true });
});

/* ----------------------------- Drive explorer ----------------------------- */

workspace.get("/drive/roots", async (c) => {
  const rows = await db
    .select({ driveId: schema.document.driveId, path: schema.document.path })
    .from(schema.document)
    .where(sql`${schema.document.driveId} is not null`)
    .groupBy(schema.document.driveId, schema.document.path)
    .limit(5000);
  const roots = new Map<string, string>();
  for (const r of rows) if (r.driveId && r.path && !roots.has(r.driveId)) roots.set(r.driveId, r.path.split("/")[0]!);
  return c.json([...roots.entries()].map(([id, name]) => ({ id, name })));
});

workspace.get("/drive/children", async (c) => {
  const parent = c.req.query("parent");
  if (!parent) return c.json({ error: "parent required" }, 400);
  const rows = await db.select().from(schema.document).where(eq(schema.document.parentId, parent)).orderBy(desc(schema.document.isFolder), asc(schema.document.title));
  return c.json(rows);
});

workspace.get("/drive/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const type = c.req.query("type");
  const where = [eq(schema.document.isFolder, false), sql`${schema.document.driveFileId} is not null`];
  if (type === "pdf") where.push(eq(schema.document.mimeType, "application/pdf"));
  if (type === "doc") where.push(or(like(schema.document.mimeType, "application/vnd.google-apps.document"), like(schema.document.mimeType, "%wordprocessingml%"))!);
  if (type === "sheet") where.push(or(like(schema.document.mimeType, "application/vnd.google-apps.spreadsheet"), like(schema.document.mimeType, "%spreadsheetml%"))!);
  if (type === "media") where.push(or(like(schema.document.mimeType, "image/%"), like(schema.document.mimeType, "video/%"))!);
  let ids: string[] | null = null;
  if (q) {
    // full-text search through Drive (content), merged with title/path matches
    if (googleConfigured()) {
      const esc = q.replace(/'/g, "\\'");
      const hits = await drive.list(ADMIN, `trashed=false and (name contains '${esc}' or fullText contains '${esc}')`, { corpora: "allDrives" }).catch(() => []);
      ids = hits.map((h) => h.id);
    }
    where.push(or(ilike(schema.document.title, `%${q}%`), ilike(schema.document.path, `%${q}%`), ...(ids?.length ? [inArray(schema.document.driveFileId, ids)] : []))!);
  }
  const rows = await db.select().from(schema.document).where(and(...where)).orderBy(desc(schema.document.modifiedAt)).limit(200);
  return c.json(rows);
});

/* ------------------------------ AI + journal ------------------------------ */

workspace.get("/digest", async (c) => {
  const [row] = await db.select().from(schema.syncState).where(eq(schema.syncState.key, "dashboard:digest"));
  return c.json(row ? JSON.parse(row.value) : null);
});

workspace.post("/sync/:job", async (c) => {
  const job = c.req.param("job");
  if (!["drive-sync", "calendar-sync", "gmail-sync", "ai-sync"].includes(job)) return c.json({ error: "Unknown job" }, 400);
  await queue.add(job, {}, { removeOnComplete: 20, removeOnFail: 20 });
  return c.json({ ok: true });
});

workspace.get("/automation", async (c) => {
  const rows = await db
    .select()
    .from(schema.activity)
    .where(like(schema.activity.action, "automation:%"))
    .orderBy(desc(schema.activity.createdAt))
    .limit(200);
  const states = await db.select().from(schema.syncState);
  return c.json({ entries: rows, sync: states.filter((s) => !s.key.startsWith("dashboard")).map((s) => ({ key: s.key, updatedAt: s.updatedAt })) });
});

workspace.post("/automation/:id/undo", async (c) => {
  const [a] = await db.select().from(schema.activity).where(eq(schema.activity.id, c.req.param("id")));
  const undo = (a?.changes as { undo?: { deleteRecord?: { table: string; id: string }; trashDriveFile?: string | null; renameDriveFile?: { id: string; name: string } } } | null)?.undo;
  if (!a || !undo) return c.json({ error: "Rien à annuler" }, 400);
  if (undo.deleteRecord) {
    const t = undo.deleteRecord.table === "communication" ? schema.communication : undo.deleteRecord.table === "bill" ? schema.bill : null;
    if (t) await db.delete(t).where(eq(t.id, undo.deleteRecord.id));
  }
  if (undo.trashDriveFile && googleConfigured()) await drive.update(ADMIN, undo.trashDriveFile, { trashed: true } as never).catch(() => {});
  if (undo.renameDriveFile && googleConfigured()) await drive.update(ADMIN, undo.renameDriveFile.id, { name: undo.renameDriveFile.name }).catch(() => {});
  await db.update(schema.activity).set({ action: a.action.replace("automation:", "automation-undone:") }).where(eq(schema.activity.id, a.id));
  return c.json({ ok: true });
});

export { FOLDER, gte, lt, isNull };
