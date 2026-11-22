/** Workspace list, settings (modules, website…) and members — admins of a workspace manage it. */
import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@erp/db";
import type { AppEnv } from "../lib/types";
import { accessibleWorkspaces, MODULES } from "../lib/workspace";

export const workspaces = new Hono<AppEnv>();

const pub = (w: Awaited<ReturnType<typeof accessibleWorkspaces>>[number]) => ({
  id: w.id,
  code: w.code,
  slug: w.slug,
  name: w.name,
  legalName: w.legalName,
  country: w.country,
  currency: w.currency,
  color: w.color,
  role: w.role,
  disabledModules: w.disabledModules,
  websiteDomain: w.websiteDomain,
  mailboxes: w.mailboxes,
  drive: w.drive,
});

workspaces.get("/", async (c) => {
  const list = await accessibleWorkspaces(c.get("user")?.email);
  return c.json({ workspaces: list.map(pub), modules: MODULES });
});

async function adminOf(c: { get: (k: "user") => { email: string } | null }, id: string) {
  const list = await accessibleWorkspaces(c.get("user")?.email);
  const ws = list.find((w) => w.id === id);
  return ws?.role === "admin" ? ws : null;
}

workspaces.patch("/:id", async (c) => {
  const ws = await adminOf(c, c.req.param("id"));
  if (!ws) return c.json({ error: "Réservé aux administrateurs de l'espace" }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Partial<{ name: string; color: string; disabledModules: string[]; websiteDomain: string | null; mailboxes: string[] }>;
  const set: Record<string, unknown> = {};
  if (typeof b.name === "string" && b.name.trim()) set.name = b.name.trim();
  if (typeof b.color === "string") set.color = b.color;
  if (Array.isArray(b.disabledModules)) set.disabledModules = b.disabledModules.filter((m) => (MODULES as readonly string[]).includes(m) && m !== "home");
  if (b.websiteDomain !== undefined) set.websiteDomain = b.websiteDomain?.trim() || null;
  if (Array.isArray(b.mailboxes)) set.mailboxes = b.mailboxes.map((m) => m.trim().toLowerCase()).filter(Boolean);
  if (!Object.keys(set).length) return c.json({ ok: true });
  await db.update(schema.legalEntity).set(set).where(eq(schema.legalEntity.id, ws.id));
  return c.json({ ok: true });
});

workspaces.get("/:id/members", async (c) => {
  const list = await accessibleWorkspaces(c.get("user")?.email);
  if (!list.some((w) => w.id === c.req.param("id"))) return c.json({ error: "Forbidden" }, 403);
  const rows = await db.select().from(schema.workspaceMember).where(eq(schema.workspaceMember.workspaceId, c.req.param("id"))).orderBy(asc(schema.workspaceMember.email));
  return c.json(rows);
});

const ROLES = ["admin", "member", "viewer"];
const validEmail = (e: string) => /^(\*|[^@\s]+)@[^@\s]+\.[^@\s]+$/.test(e);

workspaces.post("/:id/members", async (c) => {
  const ws = await adminOf(c, c.req.param("id"));
  if (!ws) return c.json({ error: "Réservé aux administrateurs de l'espace" }, 403);
  const b = (await c.req.json()) as { email: string; role?: string };
  const email = (b.email ?? "").trim().toLowerCase();
  if (!validEmail(email)) return c.json({ error: "Email invalide (ou *@domaine.com)" }, 400);
  const role = ROLES.includes(b.role ?? "") ? b.role! : "member";
  const [row] = await db
    .insert(schema.workspaceMember)
    .values({ workspaceId: ws.id, email, role })
    .onConflictDoUpdate({ target: [schema.workspaceMember.workspaceId, schema.workspaceMember.email], set: { role, updatedAt: new Date() } })
    .returning();
  return c.json(row, 201);
});

workspaces.patch("/:id/members/:mid", async (c) => {
  const ws = await adminOf(c, c.req.param("id"));
  if (!ws) return c.json({ error: "Réservé aux administrateurs de l'espace" }, 403);
  const { role } = (await c.req.json()) as { role: string };
  if (!ROLES.includes(role)) return c.json({ error: "Rôle inconnu" }, 400);
  const [m] = await db.select().from(schema.workspaceMember).where(and(eq(schema.workspaceMember.id, c.req.param("mid")), eq(schema.workspaceMember.workspaceId, ws.id)));
  if (!m) return c.json({ error: "Not found" }, 404);
  if (m.email === c.get("user")?.email.toLowerCase() && role !== "admin") return c.json({ error: "Impossible de retirer ton propre rôle admin" }, 400);
  await db.update(schema.workspaceMember).set({ role, updatedAt: new Date() }).where(eq(schema.workspaceMember.id, m.id));
  return c.json({ ok: true });
});

workspaces.delete("/:id/members/:mid", async (c) => {
  const ws = await adminOf(c, c.req.param("id"));
  if (!ws) return c.json({ error: "Réservé aux administrateurs de l'espace" }, 403);
  const [m] = await db.select().from(schema.workspaceMember).where(and(eq(schema.workspaceMember.id, c.req.param("mid")), eq(schema.workspaceMember.workspaceId, ws.id)));
  if (!m) return c.json({ error: "Not found" }, 404);
  if (m.email === c.get("user")?.email.toLowerCase()) return c.json({ error: "Impossible de te retirer toi-même" }, 400);
  await db.delete(schema.workspaceMember).where(eq(schema.workspaceMember.id, m.id));
  return c.json({ ok: true });
});
