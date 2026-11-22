/** Clients dashboard, Drive explorer, dashboard digest and automation journal. */
import { Hono } from "hono";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, like, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@erp/db";
import { drive, FOLDER, googleConfigured } from "@erp/google";
import { round2, toCAD } from "@erp/shared";
import type { AppEnv } from "../lib/types";
import { queue } from "../lib/queue";
import { loadLedger } from "../lib/ledger";
import { wsOf } from "../lib/workspace";
import { driveSubject } from "../lib/drive-access";
import { CATEGORY_FOLDERS, clientSubfolder } from "../lib/client-drive";
import { mailLayout, sendMail, esc } from "../lib/mail";
import { storeUploads } from "./portal";
import { env } from "../lib/env";
import { fixIntegrity, integrity } from "../lib/integrity";

export const workspace = new Hono<AppEnv>();
const ADMIN = "contact@otopio.ca";

/* ------------------------------- Clients ---------------------------------- */

workspace.get("/clients", async (c) => {
  const ws = wsOf(c);
  const orgs = await db.select().from(schema.organization).where(and(eq(schema.organization.workspaceId, ws.id), inArray(schema.organization.type, ["client"]))).orderBy(asc(schema.organization.name));
  const [invoices, projects, comms] = await Promise.all([
    db.select().from(schema.transaction).where(and(eq(schema.transaction.workspaceId, ws.id), eq(schema.transaction.kind, "invoice"))),
    db.select().from(schema.project).where(eq(schema.project.workspaceId, ws.id)),
    db.select({ org: schema.communication.organizationId, last: sql<string>`max(${schema.communication.occurredAt})`, n: sql<number>`count(*)::int` }).from(schema.communication).where(eq(schema.communication.workspaceId, ws.id)).groupBy(schema.communication.organizationId),
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
  const ws = wsOf(c);
  const [org] = await db.select().from(schema.organization).where(and(eq(schema.organization.id, id), eq(schema.organization.workspaceId, ws.id)));
  if (!org) return c.json({ error: "Not found" }, 404);
  const [people, projects, invoices, quotes, comms, tickets, docs, events, tx] = await Promise.all([
    db.select().from(schema.person).where(eq(schema.person.organizationId, id)),
    db.select().from(schema.project).where(eq(schema.project.organizationId, id)).orderBy(desc(schema.project.startDate)),
    db.select().from(schema.transaction).where(and(eq(schema.transaction.kind, "invoice"), eq(schema.transaction.organizationId, id))).orderBy(desc(schema.transaction.date)),
    db.select().from(schema.quote).where(eq(schema.quote.organizationId, id)).orderBy(desc(schema.quote.issueDate)),
    db.select().from(schema.communication).where(eq(schema.communication.organizationId, id)).orderBy(desc(schema.communication.occurredAt)).limit(40),
    db.select().from(schema.ticket).where(eq(schema.ticket.organizationId, id)).orderBy(desc(schema.ticket.createdAt)),
    db.select().from(schema.document).where(and(eq(schema.document.organizationId, id), eq(schema.document.isFolder, false))).orderBy(desc(schema.document.modifiedAt)).limit(60),
    db.select().from(schema.event).where(eq(schema.event.organizationId, id)).orderBy(desc(schema.event.startAt)).limit(200),
    loadLedger(ws.id),
  ]);
  const projectIds = projects.map((p) => p.id);
  const tasks = projectIds.length ? await db.select().from(schema.task).where(inArray(schema.task.projectId, projectIds)) : [];
  const live = invoices.filter((i) => i.status !== "cancelled" && i.status !== "draft" && i.status !== "lost");
  const cur = ws.currency;
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
    invoices: invoices.map((i) => ({ ...i, issueDate: i.date, title: i.label })),
    quotes,
    communications: comms,
    tickets,
    tasks: tasks.filter((t) => !["done", "cancelled"].includes(t.status)).sort((a, b) => String(a.dueDate ?? "9").localeCompare(String(b.dueDate ?? "9"))).slice(0, 12),
    documents: docs,
    upcoming: events.filter((e) => e.startAt.getTime() >= now).sort((a, b) => a.startAt.getTime() - b.startAt.getTime()).slice(0, 6),
    driveUrl: org.driveFolderId ? `https://drive.google.com/drive/folders/${org.driveFolderId}` : null,
    payments: tx.cash.filter((t) => live.some((i) => i.id === t.invoiceId)),
    uploads: await db.select().from(schema.document).where(and(eq(schema.document.organizationId, id), sql`${schema.document.uploadedBy} is not null`)).orderBy(desc(schema.document.createdAt)).limit(100),
    portal: await db.select().from(schema.portalAccess).where(eq(schema.portalAccess.organizationId, id)).orderBy(asc(schema.portalAccess.email)),
  });
});

workspace.post("/clients/:id/folder", async (c) => {
  const [org] = await db.select({ id: schema.organization.id }).from(schema.organization).where(and(eq(schema.organization.id, c.req.param("id")), eq(schema.organization.workspaceId, wsOf(c).id)));
  if (!org) return c.json({ error: "Not found" }, 404);
  await queue.add("client-folder", { organizationId: c.req.param("id") }, { removeOnComplete: 20 });
  return c.json({ ok: true });
});

/* ------------------------------ Client portal ------------------------------ */

async function orgInWs(id: string, wsId: string) {
  const [o] = await db.select().from(schema.organization).where(and(eq(schema.organization.id, id), eq(schema.organization.workspaceId, wsId)));
  return o;
}

async function sendInvite(email: string, orgName: string, wsName: string) {
  const url = `${env.appUrl.replace(/\/$/, "")}/portail?email=${encodeURIComponent(email)}`;
  return sendMail(
    email,
    `Ton espace client ${orgName} — ${wsName}`,
    mailLayout(
      `Ton espace client ${orgName}`,
      `${esc(wsName)} t'a ouvert un accès à ton espace client : suivi des projets, devis, factures et fichiers partagés. Tu peux aussi y déposer des documents.<br><br>Connexion sans mot de passe : un lien de connexion t'est envoyé par courriel, ou connecte-toi avec Google (même adresse).`,
      { label: "Ouvrir mon espace client", url },
    ),
  );
}

workspace.post("/clients/:id/portal", async (c) => {
  const ws = wsOf(c);
  const org = await orgInWs(c.req.param("id"), ws.id);
  if (!org) return c.json({ error: "Not found" }, 404);
  const b = (await c.req.json()) as { email: string; send?: boolean };
  const email = (b.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "Email invalide" }, 400);
  const [row] = await db
    .insert(schema.portalAccess)
    .values({ workspaceId: ws.id, organizationId: org.id, email, active: true })
    .onConflictDoUpdate({ target: [schema.portalAccess.organizationId, schema.portalAccess.email], set: { active: true, updatedAt: new Date() } })
    .returning();
  let sent = false;
  if (b.send !== false) {
    sent = await sendInvite(email, org.name, ws.name).catch((e) => {
      console.warn("[portal] invite failed", (e as Error).message);
      return false;
    });
    if (sent) await db.update(schema.portalAccess).set({ invitedAt: new Date() }).where(eq(schema.portalAccess.id, row!.id));
  }
  return c.json({ ...row, sent }, 201);
});

workspace.post("/clients/:id/portal/:pid/resend", async (c) => {
  const ws = wsOf(c);
  const org = await orgInWs(c.req.param("id"), ws.id);
  const [p] = await db.select().from(schema.portalAccess).where(and(eq(schema.portalAccess.id, c.req.param("pid")), eq(schema.portalAccess.workspaceId, ws.id)));
  if (!org || !p) return c.json({ error: "Not found" }, 404);
  const sent = await sendInvite(p.email, org.name, ws.name);
  if (sent) await db.update(schema.portalAccess).set({ invitedAt: new Date() }).where(eq(schema.portalAccess.id, p.id));
  return c.json({ ok: true, sent });
});

workspace.patch("/clients/:id/portal/:pid", async (c) => {
  const { active } = (await c.req.json()) as { active: boolean };
  await db.update(schema.portalAccess).set({ active: Boolean(active), updatedAt: new Date() }).where(and(eq(schema.portalAccess.id, c.req.param("pid")), eq(schema.portalAccess.workspaceId, wsOf(c).id)));
  return c.json({ ok: true });
});

workspace.delete("/clients/:id/portal/:pid", async (c) => {
  await db.delete(schema.portalAccess).where(and(eq(schema.portalAccess.id, c.req.param("pid")), eq(schema.portalAccess.workspaceId, wsOf(c).id)));
  return c.json({ ok: true });
});

/** The team can drop files for a client too (same « À trier » flow). */
workspace.post("/clients/:id/upload", async (c) => {
  const org = await orgInWs(c.req.param("id"), wsOf(c).id);
  if (!org) return c.json({ error: "Not found" }, 404);
  try {
    return c.json(await storeUploads(org.id, await c.req.formData(), c.get("user")!.email), 201);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

/** Files waiting to be sorted (all clients of the workspace). */
workspace.get("/uploads", async (c) => {
  const rows = await db
    .select({ doc: schema.document, org: schema.organization.name })
    .from(schema.document)
    .leftJoin(schema.organization, eq(schema.organization.id, schema.document.organizationId))
    .where(and(eq(schema.document.workspaceId, wsOf(c).id), eq(schema.document.status, "to_sort")))
    .orderBy(desc(schema.document.createdAt));
  return c.json(rows.map((r) => ({ ...r.doc, organizationName: r.org })));
});

/** File an uploaded document: move it into the client's category folder (optionally renamed). */
workspace.post("/uploads/:id/sort", async (c) => {
  const ws = wsOf(c);
  const [d] = await db.select().from(schema.document).where(and(eq(schema.document.id, c.req.param("id")), eq(schema.document.workspaceId, ws.id)));
  if (!d?.organizationId || !d.driveFileId) return c.json({ error: "Not found" }, 404);
  const b = (await c.req.json().catch(() => ({}))) as { category?: string; name?: string };
  const cat = b.category && CATEGORY_FOLDERS[b.category] ? b.category : (d.category ?? "other");
  try {
    const { subject, folderId } = await clientSubfolder(ws, d.organizationId, CATEGORY_FOLDERS[cat] ?? "Autres");
    const f = await drive.update(subject, d.driveFileId, b.name?.trim() ? { name: b.name.trim() } : {}, { add: folderId, remove: d.parentId ?? undefined });
    await db.update(schema.document).set({ status: "sorted", category: cat, parentId: folderId, title: f.name ?? d.title, updatedAt: new Date() }).where(eq(schema.document.id, d.id));
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

/* ----------------------------- Drive explorer ----------------------------- */

/** Top-level folders shown in the explorer: the two shared drives (Otopio Inc.) or « Clients » / « Administratif » of the workspace root. */
async function explorerRoots(ws: ReturnType<typeof wsOf>) {
  const base = ws.drive?.root ?? ws.drive?.folderId;
  if (base) {
    const rows = await db
      .select({ id: schema.document.driveFileId, name: schema.document.title })
      .from(schema.document)
      .where(and(eq(schema.document.workspaceId, ws.id), eq(schema.document.parentId, base), eq(schema.document.isFolder, true)));
    const order = ["Clients", "Administratif"];
    return rows
      .filter((r) => r.id && !r.name.startsWith("_"))
      .map((r) => ({ id: r.id!, name: r.name }))
      .sort((a, b) => (order.indexOf(a.name) + 1 || 9) - (order.indexOf(b.name) + 1 || 9) || a.name.localeCompare(b.name));
  }
  const ids = [ws.drive?.clients, ws.drive?.admin].filter(Boolean) as string[];
  const rows = await db
    .select({ driveId: schema.document.driveId, path: schema.document.path })
    .from(schema.document)
    .where(and(sql`${schema.document.driveId} is not null`, eq(schema.document.workspaceId, ws.id), ...(ids.length ? [inArray(schema.document.driveId, ids)] : [])))
    .groupBy(schema.document.driveId, schema.document.path)
    .limit(5000);
  const roots = new Map<string, string>();
  for (const r of rows) if (r.driveId && r.path && !roots.has(r.driveId)) roots.set(r.driveId, r.path.split("/")[0]!);
  return [...roots.entries()].map(([id, name]) => ({ id, name }));
}

workspace.get("/drive/roots", async (c) => c.json(await explorerRoots(wsOf(c))));

workspace.get("/drive/children", async (c) => {
  const parent = c.req.query("parent");
  if (!parent) return c.json({ error: "parent required" }, 400);
  const rows = await db.select().from(schema.document).where(and(eq(schema.document.parentId, parent), eq(schema.document.workspaceId, wsOf(c).id))).orderBy(desc(schema.document.isFolder), asc(schema.document.title));
  return c.json(rows);
});

/** Breadcrumb: chain of folders from the shared drive root to `id`. */
workspace.get("/drive/ancestors", async (c) => {
  let id = c.req.query("id") ?? "";
  const chain: { id: string; name: string; path: string | null }[] = [];
  const base = wsOf(c).drive?.root ?? wsOf(c).drive?.folderId;
  for (let i = 0; i < 30 && id; i++) {
    if (base && id === base) break; // « Clients » / « Administratif » are the top of the breadcrumb
    const [d] = await db.select().from(schema.document).where(and(eq(schema.document.driveFileId, id), eq(schema.document.workspaceId, wsOf(c).id)));
    if (!d) {
      // shared drive root (not indexed as a document)
      const [any] = await db.select({ path: schema.document.path }).from(schema.document).where(and(eq(schema.document.driveId, id), eq(schema.document.workspaceId, wsOf(c).id))).limit(1);
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
  const ws = wsOf(c);
  const where = [eq(schema.document.workspaceId, ws.id), eq(schema.document.isFolder, false), sql`${schema.document.driveFileId} is not null`, sql`coalesce(${schema.document.path}, '') not like '%/_Archives/%'`];
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
      const hits = await drive.list(await driveSubject(ws), `trashed=false and (name contains '${esc}' or fullText contains '${esc}')`, { corpora: "allDrives" }).catch(() => []);
      ids = hits.map((h) => h.id);
    }
    where.push(or(ilike(schema.document.title, `%${q}%`), ilike(schema.document.path, `%${q}%`), ...(ids?.length ? [inArray(schema.document.driveFileId, ids)] : []))!);
  }
  const rows = await db.select().from(schema.document).where(and(...where)).orderBy(desc(schema.document.modifiedAt)).limit(200);
  return c.json(rows);
});

/* ------------------------- Explorer actions (Drive) ------------------------ */

async function docByDrive(id: string, wsId: string) {
  const [d] = await db.select().from(schema.document).where(and(eq(schema.document.driveFileId, id), eq(schema.document.workspaceId, wsId)));
  return d;
}

/** Rename and/or move a file or folder. Paths of the subtree are updated locally. */
workspace.patch("/drive/file/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; parent?: string };
  const d = await docByDrive(id, wsOf(c).id);
  if (!d) return c.json({ error: "Not found" }, 404);
  const name = body.name?.trim();
  let parentPath = d.path?.split("/").slice(0, -1).join("/") ?? "";
  if (body.parent && body.parent !== d.parentId) {
    const target = await docByDrive(body.parent, wsOf(c).id);
    const rootName = body.parent === d.driveId ? (d.path ?? "").split("/")[0] : null;
    if (!target?.isFolder && !rootName) return c.json({ error: "Dossier cible introuvable" }, 400);
    if (target && target.driveId !== d.driveId) return c.json({ error: "Déplacement entre drives non pris en charge" }, 400);
    if (target?.path && d.isFolder && (target.path + "/").startsWith(`${d.path}/`)) return c.json({ error: "Impossible de déplacer un dossier dans lui-même" }, 400);
    parentPath = target?.path ?? rootName!;
  }
  if (googleConfigured()) await drive.update(await driveSubject(wsOf(c)), id, name ? { name } : {}, body.parent && body.parent !== d.parentId ? { add: body.parent, remove: d.parentId ?? undefined } : undefined);
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

/** Create a folder (parent = folder id or shared drive id). Returns the existing one if the name is taken. */
workspace.post("/drive/folder", async (c) => {
  const { parent, name } = (await c.req.json()) as { parent: string; name: string };
  const ws = wsOf(c);
  const [dup] = await db.select().from(schema.document).where(and(eq(schema.document.workspaceId, ws.id), eq(schema.document.parentId, parent), eq(schema.document.title, name), eq(schema.document.isFolder, true)));
  if (dup) return c.json({ id: dup.driveFileId, existed: true });
  const p = await docByDrive(parent, wsOf(c).id);
  let driveId = p?.driveId ?? null;
  let parentPath = p?.path ?? null;
  if (!p) {
    // shared drive root
    const [any] = await db.select({ path: schema.document.path }).from(schema.document).where(and(eq(schema.document.driveId, parent), eq(schema.document.workspaceId, ws.id))).limit(1);
    if (!any?.path) return c.json({ error: "Parent introuvable" }, 400);
    driveId = parent;
    parentPath = any.path.split("/")[0]!;
  }
  const f = await drive.createFolder(await driveSubject(ws), name, parent);
  await db.insert(schema.document).values({ workspaceId: ws.id, title: name, kind: "document", type: "free", driveFileId: f.id, driveId, parentId: parent, path: `${parentPath}/${name}`, mimeType: FOLDER, isFolder: true });
  return c.json({ id: f.id, existed: false }, 201);
});

/** Rename a shared drive (and rewrite the indexed paths). */
workspace.post("/drive/shared/:id/rename", async (c) => {
  const id = c.req.param("id");
  const { name } = (await c.req.json()) as { name: string };
  const [any] = await db.select({ path: schema.document.path }).from(schema.document).where(and(eq(schema.document.driveId, id), eq(schema.document.workspaceId, wsOf(c).id))).limit(1);
  const old = any?.path?.split("/")[0];
  if (!old) return c.json({ error: "Drive introuvable" }, 404);
  await drive.updateSharedDrive(ADMIN, id, { name });
  await db.execute(sql`update ${schema.document} set path = ${name} || substr(path, ${old.length + 1}) where drive_id = ${id} and (path = ${old} or path like ${`${old.replace(/[%_]/g, "\$&")}/%`})`);
  return c.json({ ok: true, from: old, to: name });
});

/** Archive = move into the drive's "_Archives" folder (created once, kept out of searches). */
workspace.post("/drive/file/:id/archive", async (c) => {
  const id = c.req.param("id");
  const d = await docByDrive(id, wsOf(c).id);
  if (!d?.driveId) return c.json({ error: "Not found" }, 404);
  const root = (d.path ?? "").split("/")[0]!;
  const subject = await driveSubject(wsOf(c));
  let [arch] = await db.select().from(schema.document).where(and(eq(schema.document.parentId, d.driveId), eq(schema.document.title, "_Archives"), eq(schema.document.isFolder, true)));
  if (!arch) {
    const f = await drive.createFolder(subject, "_Archives", d.driveId);
    [arch] = await db
      .insert(schema.document)
      .values({ workspaceId: d.workspaceId, title: "_Archives", kind: "document", type: "free", driveFileId: f.id, driveId: d.driveId, parentId: d.driveId, path: `${root}/_Archives`, mimeType: "application/vnd.google-apps.folder", isFolder: true })
      .returning();
  }
  await drive.update(subject, id, {}, { add: arch!.driveFileId!, remove: d.parentId ?? undefined });
  await db.update(schema.document).set({ parentId: arch!.driveFileId, path: `${root}/_Archives/${d.title}`, updatedAt: new Date() }).where(eq(schema.document.id, d.id));
  await db.insert(schema.activity).values({ table: "document", recordId: d.id, action: "updated", comment: `Archivé (était dans ${d.path})`, userId: c.get("user")?.id });
  return c.json({ ok: true });
});

/** Delete = move to the Drive trash (recoverable 30 days) and remove from the index. */
workspace.delete("/drive/file/:id", async (c) => {
  const id = c.req.param("id");
  const d = await docByDrive(id, wsOf(c).id);
  if (!d) return c.json({ error: "Not found" }, 404);
  await drive.update(await driveSubject(wsOf(c)), id, { trashed: true });
  if (d.isFolder && d.path) await db.delete(schema.document).where(like(schema.document.path, `${d.path.replace(/[%_]/g, "\\$&")}/%`));
  await db.delete(schema.document).where(eq(schema.document.id, d.id));
  return c.json({ ok: true });
});

/* ------------------------------- Integrity ------------------------------- */

workspace.get("/integrity", async (c) => c.json(await integrity(wsOf(c))));
workspace.post("/integrity/fix", async (c) => {
  if (wsOf(c).role !== "admin") return c.json({ error: "Réservé aux administrateurs" }, 403);
  return c.json(await fixIntegrity(wsOf(c)));
});

/* ------------------------------ AI + journal ------------------------------ */

workspace.get("/digest", async (c) => {
  const ws = wsOf(c);
  const [row] = await db.select().from(schema.syncState).where(eq(schema.syncState.key, `dashboard:digest:${ws.code}`));
  const [legacy] = ws.code === "OTP" && !row ? await db.select().from(schema.syncState).where(eq(schema.syncState.key, "dashboard:digest")) : [];
  const r = row ?? legacy;
  return c.json(r ? JSON.parse(r.value) : null);
});

workspace.post("/sync/:job", async (c) => {
  const job = c.req.param("job");
  if (!["drive-sync", "calendar-sync", "gmail-sync", "qonto-sync", "personal-gmail-sync", "ai-sync"].includes(job)) return c.json({ error: "Unknown job" }, 400);
  await queue.add(job, { full: c.req.query("full") === "1", workspaceId: wsOf(c).id }, { removeOnComplete: 20, removeOnFail: 20 });
  return c.json({ ok: true });
});

/** Items needing attention: expenses / invoices without justificatif, uncategorised expenses, bank lines not matched. */
workspace.get("/alerts", async (c) => {
  const ws = wsOf(c);
  const [ledger, ents] = await Promise.all([loadLedger(ws.id), db.select().from(schema.legalEntity).where(eq(schema.legalEntity.id, ws.id))]);
  const { expenses: bills, invoices, cash: txs } = ledger;
  const code = new Map(ents.map((e) => [e.id, e.code]));
  const proBills = bills.filter((b) => b.status !== "cancelled" && b.scope === "pro" && (b.paidBy === "entity" || b.paidBy === "reimburse") && Number(b.total) > 0);
  const toReimburse = bills.filter((b) => b.paidBy === "reimburse" && b.status !== "paid" && b.status !== "cancelled");
  const missing = proBills.filter((b) => !b.fileUrl);
  const uncategorised = proBills.filter((b) => b.category === "other");
  const invMissing = invoices.filter((i) => !["draft", "cancelled", "lost"].includes(i.status) && !i.fileUrl);
  const billIds = new Set(txs.map((t) => t.billId).filter(Boolean));
  const unmatchedTx = txs.filter((t) => t.source === "qonto" && t.nature === "operating" && !t.docId);
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
  const rows = await db.select().from(schema.aiUsage).where(gte(schema.aiUsage.createdAt, since)).orderBy(desc(schema.aiUsage.createdAt)); // shared AI budget (all workspaces)
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
    const t = undo.deleteRecord.table === "communication" ? schema.communication : undo.deleteRecord.table === "bill" || undo.deleteRecord.table === "transaction" ? schema.transaction : null;
    if (t) await db.delete(t).where(eq(t.id, undo.deleteRecord.id));
  }
  if (undo.trashDriveFile && googleConfigured()) await drive.update(ADMIN, undo.trashDriveFile, { trashed: true } as never).catch(() => {});
  if (undo.renameDriveFile && googleConfigured()) await drive.update(ADMIN, undo.renameDriveFile.id, { name: undo.renameDriveFile.name }).catch(() => {});
  await db.update(schema.activity).set({ action: a.action.replace("automation:", "automation-undone:") }).where(eq(schema.activity.id, a.id));
  return c.json({ ok: true });
});

export { FOLDER, gte, lt, isNull };
