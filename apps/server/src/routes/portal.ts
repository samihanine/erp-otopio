/**
 * Client portal — a client contact (invited by email) sees its client record read-only
 * (projects, quotes, invoices, shared files) and can drop files, which land in « À trier » for the team.
 */
import { Hono } from "hono";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@erp/db";
import { drive, FOLDER } from "@erp/google";
import { round2 } from "@erp/shared";
import { renderDocumentHtml } from "@erp/shared";
import type { AppEnv } from "../lib/types";
import { accessibleWorkspaces } from "../lib/workspace";
import { CATEGORY_FOLDERS, clientSubfolder, TO_SORT } from "../lib/client-drive";
import { driveSubject } from "../lib/drive-access";
import { buildRenderInput } from "./documents";

export const portal = new Hono<AppEnv>();

const ws = async (id: string) => (await db.select().from(schema.legalEntity).where(eq(schema.legalEntity.id, id)))[0]!;

/** Client records this email can open in the portal. */
async function portalClients(email: string) {
  return db
    .select({ id: schema.organization.id, name: schema.organization.name, logoUrl: schema.organization.logoUrl, workspaceId: schema.organization.workspaceId, wsName: schema.legalEntity.name, wsColor: schema.legalEntity.color })
    .from(schema.portalAccess)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.portalAccess.organizationId))
    .innerJoin(schema.legalEntity, eq(schema.legalEntity.id, schema.organization.workspaceId))
    .where(and(eq(schema.portalAccess.email, email.toLowerCase()), eq(schema.portalAccess.active, true)))
    .orderBy(asc(schema.organization.name));
}

portal.get("/me", async (c) => {
  const user = c.get("user")!;
  const [clients, wss] = await Promise.all([portalClients(user.email), accessibleWorkspaces(user.email)]);
  if (clients.length) await db.update(schema.portalAccess).set({ lastLoginAt: new Date() }).where(eq(schema.portalAccess.email, user.email.toLowerCase()));
  return c.json({ email: user.email, name: user.name, clients, member: wss.length > 0 });
});

/** guard: the client must be one of the portal user's */
portal.use("/clients/:orgId/*", async (c, next) => {
  const user = c.get("user")!;
  const ok = (await portalClients(user.email)).some((o) => o.id === c.req.param("orgId"));
  if (!ok) return c.json({ error: "Accès refusé" }, 403);
  return next();
});
portal.use("/clients/:orgId", async (c, next) => {
  const ok = (await portalClients(c.get("user")!.email)).some((o) => o.id === c.req.param("orgId"));
  if (!ok) return c.json({ error: "Accès refusé" }, 403);
  return next();
});

const LIVE = (s: string) => !["draft", "cancelled", "lost"].includes(s);

/** Same shape as the team's client view, without internal data (communications, notes, AI summary, expenses). */
portal.get("/clients/:orgId", async (c) => {
  const id = c.req.param("orgId");
  const [org] = await db.select().from(schema.organization).where(eq(schema.organization.id, id));
  if (!org) return c.json({ error: "Not found" }, 404);
  const w = await ws(org.workspaceId);
  const [people, projects, invoices, quotes, tickets, docs, events] = await Promise.all([
    db.select({ id: schema.person.id, firstName: schema.person.firstName, lastName: schema.person.lastName, email: schema.person.email, phone: schema.person.phone, jobTitle: schema.person.jobTitle, isPrimaryContact: schema.person.isPrimaryContact }).from(schema.person).where(eq(schema.person.organizationId, id)),
    db.select().from(schema.project).where(eq(schema.project.organizationId, id)).orderBy(desc(schema.project.startDate)),
    db.select().from(schema.transaction).where(and(eq(schema.transaction.kind, "invoice"), eq(schema.transaction.organizationId, id))).orderBy(desc(schema.transaction.date)),
    db.select().from(schema.quote).where(eq(schema.quote.organizationId, id)).orderBy(desc(schema.quote.issueDate)),
    db.select().from(schema.ticket).where(and(eq(schema.ticket.organizationId, id), eq(schema.ticket.clientVisible, true))).orderBy(desc(schema.ticket.createdAt)),
    db.select().from(schema.document).where(and(eq(schema.document.organizationId, id), eq(schema.document.isFolder, false), isNotNull(schema.document.driveFileId))).orderBy(desc(schema.document.modifiedAt)).limit(200),
    db.select().from(schema.event).where(and(eq(schema.event.organizationId, id), eq(schema.event.isPrivate, false))).orderBy(desc(schema.event.startAt)).limit(50),
  ]);
  const projectIds = projects.map((p) => p.id);
  const tasks = projectIds.length ? await db.select().from(schema.task).where(inArray(schema.task.projectId, projectIds)) : [];
  const live = invoices.filter((i) => LIVE(i.status));
  const visibleQuotes = quotes.filter((q) => q.status !== "draft");
  const cleanProject = ({ budget: _b, ...p }: (typeof projects)[number]) => p;
  const strip = <T extends { notes?: unknown; aiSummary?: unknown }>(r: T) => ({ ...r, notes: null, aiSummary: null });
  const now = Date.now();
  return c.json({
    portal: true,
    org: { ...strip(org), tags: [], alsoIn: [] },
    workspace: { name: w.name, legalName: w.legalName, color: w.color, email: w.email },
    currency: w.currency,
    kpis: {
      invoiced: round2(live.reduce((a, i) => a + i.subtotal, 0)),
      collected: round2(live.reduce((a, i) => a + i.amountPaid, 0)),
      outstanding: round2(live.filter((i) => ["sent", "partial", "overdue"].includes(i.status)).reduce((a, i) => a + i.total - i.amountPaid, 0)),
      quotesOpen: round2(visibleQuotes.filter((q) => q.status === "sent").reduce((a, q) => a + q.subtotal, 0)),
      quotesAccepted: round2(visibleQuotes.filter((q) => q.status === "accepted").reduce((a, q) => a + q.subtotal, 0)),
      hoursSpent: 0,
      hoursEstimated: 0,
      meetingHours: 0,
      openTasks: tasks.filter((t) => !["done", "cancelled"].includes(t.status)).length,
      openTickets: tickets.filter((t) => !["resolved", "closed"].includes(t.status)).length,
    },
    people,
    projects: projects.map(cleanProject),
    invoices: live.map((i) => ({ ...strip(i), issueDate: i.date, title: i.label })),
    quotes: visibleQuotes.map((q) => ({ ...q, scope: null, terms: null })),
    communications: [],
    tickets,
    tasks: tasks.filter((t) => !["done", "cancelled"].includes(t.status)).slice(0, 12).map((t) => ({ ...t, description: null, spentHours: 0, estimateHours: null })),
    documents: docs.filter((d) => d.status !== "to_sort" || d.uploadedBy),
    upcoming: events.filter((e) => e.startAt.getTime() >= now).sort((a, b) => a.startAt.getTime() - b.startAt.getTime()).slice(0, 6).map((e) => ({ ...e, notes: null })),
    driveUrl: null,
    payments: [],
    uploads: docs.filter((d) => d.uploadedBy),
  });
});

/** Printable quote / invoice of this client. */
portal.get("/clients/:orgId/:kind/:id/html", async (c) => {
  const kind = c.req.param("kind");
  if (kind !== "quote" && kind !== "invoice") return c.json({ error: "Unknown kind" }, 400);
  const orgId = c.req.param("orgId");
  const id = c.req.param("id");
  const [rec] =
    kind === "quote"
      ? await db.select({ org: schema.quote.organizationId, ws: schema.quote.workspaceId, status: schema.quote.status }).from(schema.quote).where(eq(schema.quote.id, id))
      : await db.select({ org: schema.transaction.organizationId, ws: schema.transaction.workspaceId, status: schema.transaction.status }).from(schema.transaction).where(and(eq(schema.transaction.id, id), eq(schema.transaction.kind, "invoice")));
  if (!rec || rec.org !== orgId || rec.status === "draft") return c.json({ error: "Not found" }, 404);
  const input = await buildRenderInput(kind, id, c.req.query("locale") === "en" ? "en" : "fr", rec.ws);
  if (!input) return c.json({ error: "Not found" }, 404);
  return c.html(renderDocumentHtml(input));
});

/** Download a file of the client folder. */
portal.get("/clients/:orgId/files/:fileId", async (c) => {
  const [d] = await db.select().from(schema.document).where(and(eq(schema.document.driveFileId, c.req.param("fileId")), eq(schema.document.organizationId, c.req.param("orgId"))));
  if (!d || d.isFolder) return c.json({ error: "Not found" }, 404);
  const w = await ws(d.workspaceId);
  const subject = await driveSubject(w);
  const isNative = (d.mimeType ?? "").startsWith("application/vnd.google-apps.");
  const { gfetch, SCOPES } = await import("@erp/google");
  const url = isNative
    ? `https://www.googleapis.com/drive/v3/files/${d.driveFileId}/export?mimeType=application/pdf`
    : `https://www.googleapis.com/drive/v3/files/${d.driveFileId}?alt=media&supportsAllDrives=true`;
  const r = await gfetch<Response>(subject, SCOPES.drive, url, { raw: true });
  const name = isNative ? `${d.title}.pdf` : d.title;
  return new Response(r.body, { headers: { "content-type": isNative ? "application/pdf" : (d.mimeType ?? "application/octet-stream"), "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` } });
});

/** Files dropped by the client (or by the team for this client) → Drive « À trier » + document rows « à trier ». */
export async function storeUploads(orgId: string, form: FormData, uploadedBy: string) {
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) throw new Error("Aucun fichier");
  if (files.some((f) => f.size > 50 * 1024 * 1024)) throw new Error("Fichier trop volumineux (50 Mo max)");
  const category = String(form.get("category") ?? "other");
  const cat = CATEGORY_FOLDERS[category] ? category : "other";
  const baseName = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim() || null;
  const [org] = await db.select().from(schema.organization).where(eq(schema.organization.id, orgId));
  if (!org) throw new Error("Client introuvable");
  const w = await ws(org.workspaceId);
  const { subject, folderId } = await clientSubfolder({ ...w }, orgId, TO_SORT);
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const [i, f] of files.entries()) {
    const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")) : "";
    const label = baseName ? (files.length > 1 ? `${baseName} (${i + 1})` : baseName) : f.name.replace(/\.[^.]+$/, "");
    const name = `${today} — ${org.name} — ${label}${ext}`.replace(/[\/]/g, "-");
    const up = await drive.upload(subject, name, folderId, new Uint8Array(await f.arrayBuffer()), f.type || "application/octet-stream");
    const [row] = await db
      .insert(schema.document)
      .values({
        workspaceId: org.workspaceId,
        organizationId: orgId,
        title: name,
        kind: "document",
        type: cat === "invoice" ? "invoice" : cat === "quote" ? "quote" : cat === "legal" ? "contract" : "free",
        driveFileId: up.id,
        driveId: w.drive?.root ?? w.drive?.folderId ?? up.driveId ?? null,
        parentId: folderId,
        path: null,
        mimeType: up.mimeType,
        size: f.size,
        webViewLink: up.webViewLink ?? null,
        isFolder: false,
        modifiedAt: new Date(),
        status: "to_sort",
        category: cat,
        description,
        uploadedBy,
      })
      .onConflictDoNothing()
      .returning();
    if (row) out.push(row);
  }
  await db.insert(schema.activity).values({ table: "organization", recordId: orgId, action: "comment", comment: `${uploadedBy} a déposé ${files.length} fichier${files.length > 1 ? "s" : ""} (${CATEGORY_FOLDERS[cat]}) — à trier` });
  return out;
}

portal.post("/clients/:orgId/upload", async (c) => {
  try {
    const rows = await storeUploads(c.req.param("orgId"), await c.req.formData(), c.get("user")!.email);
    return c.json(rows, 201);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

export { FOLDER, sql };
