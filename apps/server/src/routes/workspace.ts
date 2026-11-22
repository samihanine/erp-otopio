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
      const inv = invoices.filter((i) => i.organizationId === o.id && i.status !== "cancelled" && i.status !== "draft" && i.status !== "lost");
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
  const live = invoices.filter((i) => i.status !== "cancelled" && i.status !== "draft" && i.status !== "lost");
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

/** Breadcrumb: chain of folders from the shared drive root to `id`. */
workspace.get("/drive/ancestors", async (c) => {
  let id = c.req.query("id") ?? "";
  const chain: { id: string; name: string; path: string | null }[] = [];
  for (let i = 0; i < 30 && id; i++) {
    const [d] = await db.select().from(schema.document).where(eq(schema.document.driveFileId, id));
    if (!d) {
      // shared drive root (not indexed as a document)
      const [any] = await db.select({ path: schema.document.path }).from(schema.document).where(eq(schema.document.driveId, id)).limit(1);
      if (any?.path) chain.unshift({ id, name: any.path.split("/")[0]!, path: any.path.split("/")[0]! });
      break;
    }
    chain.unshift({ id, name: d.title, path: d.path });
    id = d.parentId ?? "";
  }
  return c.json(chain);
});

workspace.get("/drive/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const type = c.req.query("type");
  const parent = c.req.query("parent");
  const where = [eq(schema.document.isFolder, false), sql`${schema.document.driveFileId} is not null`, sql`coalesce(${schema.document.path}, '') not like '%/_Archives/%'`];
  if (parent) {
    // restrict to the selected folder (recursively)
    const [f] = await db.select({ path: schema.document.path, driveId: schema.document.driveId }).from(schema.document).where(eq(schema.document.driveFileId, parent));
    if (f?.path) where.push(like(schema.document.path, `${f.path.replace(/[%_]/g, "\\$&")}/%`));
    else where.push(eq(schema.document.driveId, parent)); // a shared drive root
  }
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

/* ------------------------- Explorer actions (Drive) ------------------------ */

async function docByDrive(id: string) {
  const [d] = await db.select().from(schema.document).where(eq(schema.document.driveFileId, id));
  return d;
}

/** Rename and/or move a file or folder. Paths of the subtree are updated locally. */
workspace.patch("/drive/file/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; parent?: string };
  const d = await docByDrive(id);
  if (!d) return c.json({ error: "Not found" }, 404);
  const name = body.name?.trim();
  let parentPath = d.path?.split("/").slice(0, -1).join("/") ?? "";
  if (body.parent && body.parent !== d.parentId) {
    const target = await docByDrive(body.parent);
    const rootName = body.parent === d.driveId ? (d.path ?? "").split("/")[0] : null;
    if (!target?.isFolder && !rootName) return c.json({ error: "Dossier cible introuvable" }, 400);
    if (target && target.driveId !== d.driveId) return c.json({ error: "Déplacement entre drives non pris en charge" }, 400);
    if (target?.path && d.isFolder && (target.path + "/").startsWith(`${d.path}/`)) return c.json({ error: "Impossible de déplacer un dossier dans lui-même" }, 400);
    parentPath = target?.path ?? rootName!;
  }
  if (googleConfigured()) await drive.update(ADMIN, id, name ? { name } : {}, body.parent && body.parent !== d.parentId ? { add: body.parent, remove: d.parentId ?? undefined } : undefined);
  const newPath = `${parentPath}/${name ?? d.title}`;
  await db
    .update(schema.document)
    .set({ title: name ?? d.title, parentId: body.parent ?? d.parentId, path: newPath, updatedAt: new Date() })
    .where(eq(schema.document.id, d.id));
  if (d.isFolder && d.path && newPath !== d.path) {
    await db.execute(sql`update ${schema.document} set path = ${newPath} || substr(path, ${d.path.length + 1}) where path like ${`${d.path.replace(/[%_]/g, "\\$&")}/%`}`);
  }
  await db.insert(schema.activity).values({ table: "document", recordId: d.id, action: "updated", comment: name && name !== d.title ? `Renommé en « ${name} »` : `Déplacé vers ${parentPath}`, userId: c.get("user")?.id });
  return c.json({ ok: true, path: newPath });
});

/** Archive = move into the drive's "_Archives" folder (created once, kept out of searches). */
workspace.post("/drive/file/:id/archive", async (c) => {
  const id = c.req.param("id");
  const d = await docByDrive(id);
  if (!d?.driveId) return c.json({ error: "Not found" }, 404);
  const root = (d.path ?? "").split("/")[0]!;
  let [arch] = await db.select().from(schema.document).where(and(eq(schema.document.parentId, d.driveId), eq(schema.document.title, "_Archives"), eq(schema.document.isFolder, true)));
  if (!arch) {
    const f = await drive.createFolder(ADMIN, "_Archives", d.driveId);
    [arch] = await db
      .insert(schema.document)
      .values({ title: "_Archives", kind: "document", type: "free", driveFileId: f.id, driveId: d.driveId, parentId: d.driveId, path: `${root}/_Archives`, mimeType: "application/vnd.google-apps.folder", isFolder: true })
      .returning();
  }
  await drive.update(ADMIN, id, {}, { add: arch!.driveFileId!, remove: d.parentId ?? undefined });
  await db.update(schema.document).set({ parentId: arch!.driveFileId, path: `${root}/_Archives/${d.title}`, updatedAt: new Date() }).where(eq(schema.document.id, d.id));
  await db.insert(schema.activity).values({ table: "document", recordId: d.id, action: "updated", comment: `Archivé (était dans ${d.path})`, userId: c.get("user")?.id });
  return c.json({ ok: true });
});

/** Delete = move to the Drive trash (recoverable 30 days) and remove from the index. */
workspace.delete("/drive/file/:id", async (c) => {
  const id = c.req.param("id");
  const d = await docByDrive(id);
  if (!d) return c.json({ error: "Not found" }, 404);
  await drive.update(ADMIN, id, { trashed: true });
  if (d.isFolder && d.path) await db.delete(schema.document).where(like(schema.document.path, `${d.path.replace(/[%_]/g, "\\$&")}/%`));
  await db.delete(schema.document).where(eq(schema.document.id, d.id));
  return c.json({ ok: true });
});

/* ------------------------------ AI + journal ------------------------------ */

workspace.get("/digest", async (c) => {
  const [row] = await db.select().from(schema.syncState).where(eq(schema.syncState.key, "dashboard:digest"));
  return c.json(row ? JSON.parse(row.value) : null);
});

workspace.post("/sync/:job", async (c) => {
  const job = c.req.param("job");
  if (!["drive-sync", "calendar-sync", "gmail-sync", "qonto-sync", "personal-gmail-sync", "ai-sync"].includes(job)) return c.json({ error: "Unknown job" }, 400);
  await queue.add(job, { full: c.req.query("full") === "1" }, { removeOnComplete: 20, removeOnFail: 20 });
  return c.json({ ok: true });
});

/** Items needing attention: expenses / invoices without justificatif, uncategorised expenses, bank lines not matched. */
workspace.get("/alerts", async (c) => {
  const [bills, invoices, txs, ents] = await Promise.all([
    db.select().from(schema.bill),
    db.select().from(schema.invoice),
    db.select().from(schema.transaction),
    db.select().from(schema.legalEntity),
  ]);
  const code = new Map(ents.map((e) => [e.id, e.code]));
  const proBills = bills.filter((b) => b.status !== "cancelled" && b.scope === "pro" && (b.paidBy === "entity" || b.paidBy === "reimburse") && Number(b.total) > 0);
  const toReimburse = bills.filter((b) => b.paidBy === "reimburse" && b.status !== "paid" && b.status !== "cancelled");
  const missing = proBills.filter((b) => !b.fileUrl);
  const uncategorised = proBills.filter((b) => b.category === "other");
  const invMissing = invoices.filter((i) => !["draft", "cancelled", "lost"].includes(i.status) && !i.fileUrl);
  const billIds = new Set(txs.map((t) => t.billId).filter(Boolean));
  const unmatchedTx = txs.filter((t) => t.source === "qonto" && t.nature === "operating" && (t.side === "debit" ? !t.billId : !t.invoiceId));
  const slim = (b: (typeof bills)[number]) => ({ id: b.id, label: b.label, date: b.issueDate, amount: Number(b.total), currency: b.currency, entity: code.get(b.legalEntityId) ?? "" });
  return c.json({
    total: missing.length + uncategorised.length + invMissing.length + unmatchedTx.length,
    billsWithoutReceipt: { count: missing.length, items: missing.sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate))).slice(0, 8).map(slim) },
    billsUncategorised: { count: uncategorised.length, items: uncategorised.slice(0, 8).map(slim) },
    invoicesWithoutFile: { count: invMissing.length, items: invMissing.slice(0, 8).map((i) => ({ id: i.id, label: i.number, date: i.issueDate, amount: Number(i.total), currency: i.currency, entity: code.get(i.legalEntityId) ?? "" })) },
    bankUnmatched: { count: unmatchedTx.length, items: unmatchedTx.slice(0, 8).map((t) => ({ id: t.id, label: t.label, date: t.date, amount: Number(t.amount), currency: t.currency, entity: code.get(t.legalEntityId) ?? "" })) },
    toReimburse: { count: toReimburse.length, total: Math.round(toReimburse.reduce((a, b) => a + Number(b.total), 0) * 100) / 100, items: toReimburse.slice(0, 8).map(slim) },
    linkedBills: billIds.size,
  });
});

/** AI spend (Claude): month total vs budget, per feature, per day (30 d), recent errors. */
workspace.get("/ai-usage", async (c) => {
  const since = new Date(Date.now() - 30 * 864e5);
  const rows = await db.select().from(schema.aiUsage).where(gte(schema.aiUsage.createdAt, since)).orderBy(desc(schema.aiUsage.createdAt));
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const month = rows.filter((r) => r.createdAt >= monthStart);
  const sum = (rs: typeof rows) => rs.reduce((a, r) => a + Number(r.cost), 0);
  const byFeature = new Map<string, { calls: number; cost: number; input: number; output: number; errors: number }>();
  for (const r of month) {
    const f = byFeature.get(r.feature) ?? { calls: 0, cost: 0, input: 0, output: 0, errors: 0 };
    f.calls++;
    f.cost += Number(r.cost);
    f.input += r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens;
    f.output += r.outputTokens;
    if (!r.ok) f.errors++;
    byFeature.set(r.feature, f);
  }
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.createdAt.toISOString().slice(0, 10), (byDay.get(r.createdAt.toISOString().slice(0, 10)) ?? 0) + Number(r.cost));
  return c.json({
    model: process.env.AI_MODEL || "claude-haiku-5-5",
    enabled: Boolean(process.env.ANTHROPIC_API_KEY),
    budget: Number(process.env.AI_MONTHLY_BUDGET_USD || 10),
    month: { cost: sum(month), calls: month.length },
    last30: { cost: sum(rows), calls: rows.length },
    byFeature: [...byFeature.entries()].map(([feature, v]) => ({ feature, ...v })).sort((a, b) => b.cost - a.cost),
    byDay: [...byDay.entries()].map(([day, cost]) => ({ day, cost })).sort((a, b) => a.day.localeCompare(b.day)),
    errors: rows.filter((r) => !r.ok).slice(0, 10).map((r) => ({ at: r.createdAt, feature: r.feature, error: r.error })),
  });
});

workspace.get("/jobs", async (c) => {
  const jobs = await queue.getJobs(["active", "waiting", "delayed", "completed", "failed"], 0, 60);
  return c.json(
    jobs
      .filter(Boolean)
      .map((j) => ({ id: j.id, name: j.name, state: j.failedReason ? "failed" : j.finishedOn ? "completed" : j.processedOn ? "active" : "waiting", error: j.failedReason ?? null, at: j.finishedOn ?? j.processedOn ?? j.timestamp, result: j.returnvalue ? JSON.stringify(j.returnvalue).slice(0, 300) : null }))
      .sort((a, b) => b.at - a.at),
  );
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
