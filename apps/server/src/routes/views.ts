import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@erp/db";
import type { AppEnv } from "../lib/types";
import { isTableKey } from "../lib/data";

export const views = new Hono<AppEnv>();

views.get("/", async (c) => {
  const table = c.req.query("table");
  const rows = await db
    .select()
    .from(schema.savedView)
    .where(table ? eq(schema.savedView.table, table) : undefined)
    .orderBy(asc(schema.savedView.table), asc(schema.savedView.position), asc(schema.savedView.createdAt));
  return c.json(rows);
});

views.post("/", async (c) => {
  const b = (await c.req.json()) as { table: string; name: string; type: string; icon?: string; config: never };
  if (!isTableKey(b.table)) return c.json({ error: "Unknown table" }, 400);
  const existing = await db.select({ id: schema.savedView.id }).from(schema.savedView).where(eq(schema.savedView.table, b.table));
  const [row] = await db
    .insert(schema.savedView)
    .values({ table: b.table, name: b.name || "Nouvelle vue", type: b.type ?? "table", icon: b.icon, config: b.config, position: existing.length + 1, createdBy: c.get("user")?.id })
    .returning();
  return c.json(row, 201);
});

views.patch("/:id", async (c) => {
  const b = (await c.req.json()) as Partial<{ name: string; type: string; icon: string; config: never; position: number }>;
  const set: Record<string, unknown> = {};
  for (const k of ["name", "type", "icon", "config", "position"] as const) if (b[k] !== undefined) set[k] = b[k];
  const [row] = await db.update(schema.savedView).set(set).where(eq(schema.savedView.id, c.req.param("id"))).returning();
  return row ? c.json(row) : c.json({ error: "Not found" }, 404);
});

views.delete("/:id", async (c) => {
  await db.delete(schema.savedView).where(and(eq(schema.savedView.id, c.req.param("id"))));
  return c.json({ ok: true });
});
