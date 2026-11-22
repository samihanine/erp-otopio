/**
 * Workspaces = structures (Otopio Inc., Megascale, Sami Freelance, Maïssane Freelance).
 * Every business row carries a workspace_id; the SPA sends the current one in the `x-workspace` header.
 * Access: `workspace_member` rows (email or "*@domain"), roles admin | member | viewer.
 */
import type { MiddlewareHandler } from "hono";
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db, schema } from "@erp/db";
import type { AppEnv } from "./types";

export type Workspace = typeof schema.legalEntity.$inferSelect & { role: Role };
export type Role = "admin" | "member" | "viewer";
const RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2 };

/** Workspaces an email can open, with the best role granted (direct email beats nothing, wildcard counts too). */
export async function accessibleWorkspaces(email: string | null | undefined): Promise<Workspace[]> {
  if (!email) return [];
  const e = email.toLowerCase();
  const domain = e.split("@")[1] ?? "";
  const rows = await db
    .select({ ws: schema.legalEntity, role: schema.workspaceMember.role })
    .from(schema.workspaceMember)
    .innerJoin(schema.legalEntity, eq(schema.legalEntity.id, schema.workspaceMember.workspaceId))
    .where(or(eq(schema.workspaceMember.email, e), eq(schema.workspaceMember.email, `*@${domain}`)));
  const best = new Map<string, Workspace>();
  for (const r of rows) {
    const role = (["admin", "member", "viewer"].includes(r.role) ? r.role : "member") as Role;
    const cur = best.get(r.ws.id);
    if (!cur || RANK[role] > RANK[cur.role]) best.set(r.ws.id, { ...r.ws, role });
  }
  const order = ["OTP", "MGS", "SHF", "MTF"];
  return [...best.values()].sort((a, b) => (order.indexOf(a.code) + 1 || 99) - (order.indexOf(b.code) + 1 || 99));
}

/** Is this email allowed to sign in at all (member of a workspace or invited to a client portal)? */
export async function isKnownEmail(email: string) {
  const e = email.toLowerCase();
  if ((await accessibleWorkspaces(e)).length) return true;
  const [p] = await db.select({ id: schema.portalAccess.id }).from(schema.portalAccess).where(and(eq(schema.portalAccess.email, e), eq(schema.portalAccess.active, true))).limit(1);
  return Boolean(p);
}

/** Resolves the current workspace from `x-workspace` (id or slug) / `?ws=`; first accessible one by default. */
export const workspaceGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const list = await accessibleWorkspaces(user.email);
  if (!list.length) return c.json({ error: "Aucun espace de travail", portal: true }, 403);
  const wanted = c.req.header("x-workspace") ?? c.req.query("ws");
  const ws = wanted ? list.find((w) => w.id === wanted || w.slug === wanted || w.code === wanted) : list[0];
  if (!ws) return c.json({ error: "Accès refusé à cet espace de travail" }, 403);
  if (ws.role === "viewer" && c.req.method !== "GET" && !c.req.path.includes("/views")) return c.json({ error: "Accès en lecture seule" }, 403);
  c.set("ws", ws);
  c.set("workspaces", list);
  return next();
};

export const wsOf = (c: { get: (k: "ws") => Workspace | null }) => {
  const ws = c.get("ws");
  if (!ws) throw new Error("No workspace in context");
  return ws;
};

/** `column = current workspace` (no-op for tables without workspace_id). */
export function inWs(cols: Record<string, PgColumn | undefined>, wsId: string): SQL | undefined {
  const col = cols.workspaceId ?? (cols.code && cols.legalName ? cols.id : undefined);
  return col ? eq(col, wsId) : undefined;
}

export const inWsList = (col: PgColumn, ids: string[]) => inArray(col, ids);

/** Modules (sidebar tabs) that can be turned off per workspace. */
export const MODULES = ["home", "calendar", "clients", "db", "docs", "finance", "taxes", "website", "social"] as const;
