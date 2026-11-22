import { Hono } from "hono";
import { and, count, eq, ilike, inArray, sql } from "drizzle-orm";
import { db, schema } from "@erp/db";
import { TABLES, type TableKey } from "@erp/shared";
import {
  buildOrder,
  buildWhere,
  columns,
  isTableKey,
  labelExpr,
  nextNumber,
  resolveRefs,
  sanitize,
  TABLE_MAP,
  withComputedTotals,
  type Filter,
  type Sort,
} from "../lib/data";
import type { AppEnv } from "../lib/types";
import { queue } from "../lib/queue";
import { inWs, wsOf } from "../lib/workspace";

/** Side effects to Google (Drive folders, Calendar) handled by the worker */
async function afterWrite(key: TableKey, row: Record<string, unknown>, before?: Record<string, unknown>, deleted = false) {
  try {
    if (key === "organization" && !deleted && row.type === "client" && (!before || before.name !== row.name || before.type !== row.type))
      await queue.add("client-folder", { organizationId: row.id }, { removeOnComplete: 20, removeOnFail: 20 });
    if (key === "event") {
      if (deleted && row.googleEventId) await queue.add("event-push", { action: "delete", owner: row.calendarOwner, googleEventId: row.googleEventId }, { removeOnComplete: 20 });
      else if (!deleted) await queue.add("event-push", { action: before ? "update" : "create", id: row.id }, { removeOnComplete: 20 });
    }
  } catch (e) {
    console.warn("[afterWrite]", (e as Error).message);
  }
}

export const data = new Hono<AppEnv>();

/** GET /api/data/_counts → { table: count } for the sidebar */
data.get("/_counts", async (c) => {
  const entries = await Promise.all(
    (Object.keys(TABLE_MAP) as TableKey[]).map(async (k) => {
      const [r] = await db.select({ n: count() }).from(TABLE_MAP[k]).where(inWs(columns(k), wsOf(c).id));
      return [k, r?.n ?? 0] as const;
    }),
  );
  return c.json(Object.fromEntries(entries));
});

function parseJSON<T>(v: string | undefined, fallback: T): T {
  if (!v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

async function logActivity(table: string, recordId: string, action: string, userId: string | undefined, changes?: Record<string, { from: unknown; to: unknown }>) {
  try {
    await db.insert(schema.activity).values({ table, recordId, action, userId, changes });
  } catch (e) {
    console.warn("[activity] failed", e);
  }
}

/** GET /api/data/:table?filters=[]&mode=and&sorts=[]&search=&limit=&offset= */
data.get("/:table", async (c) => {
  const key = c.req.param("table");
  if (!isTableKey(key)) return c.json({ error: "Unknown table" }, 404);
  const filters = parseJSON<Filter[]>(c.req.query("filters"), []);
  const sorts = parseJSON<Sort[]>(c.req.query("sorts"), []);
  const mode = c.req.query("mode") === "or" ? "or" : "and";
  const limit = Math.min(Number(c.req.query("limit") ?? 500), 2000);
  const offset = Number(c.req.query("offset") ?? 0);
  const where = and(inWs(columns(key), wsOf(c).id), buildWhere(key, filters, mode, c.req.query("search")));
  const table = TABLE_MAP[key];

  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select()
      .from(table)
      .where(where)
      .orderBy(...buildOrder(key, sorts))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(table).where(where),
  ]);
  const refs = await resolveRefs(key, rows as Record<string, unknown>[]);
  return c.json({ rows, total, refs });
});

/** GET /api/data/:table/options?q=&ids=a,b → [{id,label}] for relation pickers */
data.get("/:table/options", async (c) => {
  const key = c.req.param("table");
  if (!isTableKey(key)) return c.json({ error: "Unknown table" }, 404);
  const cols = columns(key);
  const q = c.req.query("q")?.trim();
  const ids = c.req.query("ids")?.split(",").filter(Boolean);
  const lbl = labelExpr(key);
  const subtitleKey = TABLES[key].subtitle;
  const sub = subtitleKey && cols[subtitleKey] && TABLES[key].fields.find((f) => f.key === subtitleKey)?.type !== "relation" ? sql<string>`${cols[subtitleKey]}::text` : sql<string>`null`;
  const scope = c.req.query("scope") === "employees" && key === "person" ? sql`${cols.email} ilike '%@otopio.ca'` : undefined;
  const where = and(
    inWs(cols, wsOf(c).id),
    ids?.length ? inArray(cols.id!, ids) : and(scope, q ? sql`${lbl} ilike ${`%${q}%`}` : undefined),
  );
  const rows = await db
    .select({ id: cols.id!, label: lbl, subtitle: sub })
    .from(TABLE_MAP[key])
    .where(where)
    .orderBy(lbl)
    .limit(50);
  return c.json(rows);
});

data.get("/:table/:id", async (c) => {
  const key = c.req.param("table");
  if (!isTableKey(key)) return c.json({ error: "Unknown table" }, 404);
  const cols = columns(key);
  const [row] = await db.select().from(TABLE_MAP[key]).where(and(eq(cols.id!, c.req.param("id")), inWs(cols, wsOf(c).id)));
  if (!row) return c.json({ error: "Not found" }, 404);
  const refs = await resolveRefs(key, [row as Record<string, unknown>]);
  return c.json({ row, refs });
});

/** Related records pointing to this record (e.g. tasks of a project). */
data.get("/:table/:id/related", async (c) => {
  const key = c.req.param("table");
  if (!isTableKey(key)) return c.json({ error: "Unknown table" }, 404);
  const id = c.req.param("id");
  const out: { table: TableKey; field: string; rows: unknown[]; total: number }[] = [];
  for (const t of Object.values(TABLES)) {
    for (const f of t.fields) {
      if (f.type !== "relation" || f.relation !== key) continue;
      const col = columns(t.key)[f.key];
      if (!col) continue;
      const rows = await db
        .select()
        .from(TABLE_MAP[t.key])
        .where(and(eq(col, id), inWs(columns(t.key), wsOf(c).id)))
        .orderBy(...buildOrder(t.key, []))
        .limit(50);
      if (rows.length) out.push({ table: t.key, field: f.key, rows, total: rows.length });
    }
  }
  return c.json(out);
});

data.post("/:table", async (c) => {
  const key = c.req.param("table");
  if (!isTableKey(key)) return c.json({ error: "Unknown table" }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  let values = sanitize(key, body);
  const ws = wsOf(c);
  if (key === "legal_entity") return c.json({ error: "Les structures se créent depuis les paramètres" }, 400);
  values.workspaceId = ws.id;
  if (key === "transaction" || key === "quote" || key === "project") values.legalEntityId = ws.id;
  if (key === "organization") values.defaultEntityId = ws.id;
  if (key === "credit_card") values.legalEntityId = ws.id;

  if (key === "transaction") {
    values.kind ??= "expense";
    values.side ??= values.kind === "invoice" ? "credit" : "debit";
    values.date ??= new Date().toISOString().slice(0, 10);
    values.status ??= values.kind === "invoice" ? "draft" : values.kind === "expense" ? "to_pay" : "paid";
    // personal expenses default to the freelance activity
    if (!values.legalEntityId && (values.scope === "perso" || values.scope === "mixed")) {
      const [shf] = await db.select({ id: schema.legalEntity.id }).from(schema.legalEntity).where(eq(schema.legalEntity.code, "SHF"));
      if (shf) values.legalEntityId = shf.id;
    }
  }
  if (key === "quote" || (key === "transaction" && values.kind === "invoice")) {
    if (!values.legalEntityId) {
      const [first] = await db.select({ id: schema.legalEntity.id }).from(schema.legalEntity).where(eq(schema.legalEntity.code, "OTP"));
      values.legalEntityId = first?.id;
    }
    if (!values.number) {
      const n = await nextNumber(key === "quote" ? "quote" : "invoice", values.legalEntityId as string, key === "quote" ? values.issueDate : values.date);
      values.number = n.number;
      values.currency ??= n.currency;
      values.taxes ??= n.taxes;
    }
    values.currency ??= "CAD";
    values = await withComputedTotals(key, values);
  }
  if (key === "transaction") {
    if (!values.legalEntityId) {
      const [first] = await db.select({ id: schema.legalEntity.id }).from(schema.legalEntity).where(eq(schema.legalEntity.code, "OTP"));
      values.legalEntityId = first?.id;
    }
    values.currency ??= "CAD";
  }
  if ((key === "article" || key === "artifact" || key === "team_member") && !values.slug) {
    const title = String(values.title ?? values.name ?? key);
    values.slug = `${title
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const primary = TABLES[key].primary;
  if (values[primary] == null || values[primary] === "") values[primary] = key === "person" ? "Nouveau contact" : "Sans titre";

  try {
    if (key === "event") {
      values.calendarOwner ??= c.get("user")?.email ?? "contact@otopio.ca";
      values.startAt ??= new Date();
      values.endAt ??= new Date(new Date(values.startAt as string).getTime() + 3600_000);
    }
    const [row] = await db.insert(TABLE_MAP[key]).values(values as never).returning();
    const r = row as Record<string, unknown>;
    await afterWrite(key, r);
    await logActivity(key, String(r.id), "created", c.get("user")?.id);
    const refs = await resolveRefs(key, [r]);
    return c.json({ row, refs }, 201);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

data.patch("/:table/:id", async (c) => {
  const key = c.req.param("table");
  if (!isTableKey(key)) return c.json({ error: "Unknown table" }, 404);
  const id = c.req.param("id");
  const cols = columns(key);
  const [existing] = await db.select().from(TABLE_MAP[key]).where(and(eq(cols.id!, id), inWs(cols, wsOf(c).id)));
  if (!existing) return c.json({ error: "Not found" }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  let values = sanitize(key, body);
  values = await withComputedTotals(key, values, existing as Record<string, unknown>);
  const ex = existing as Record<string, unknown>;
  const todayIso = new Date().toISOString().slice(0, 10);
  if (key === "task" && values.status === "done" && !ex.completedAt && values.completedAt === undefined) values.completedAt = todayIso;
  if (key === "ticket" && (values.status === "resolved" || values.status === "closed") && !ex.resolvedAt) values.resolvedAt = todayIso;
  if (key === "transaction" && values.status === "paid" && !ex.paidAt) {
    values.paidAt = todayIso;
    if (values.amountPaid === undefined) values.amountPaid = ex.total;
  }
  if (!Object.keys(values).length) return c.json({ row: existing });

  try {
    const [row] = await db.update(TABLE_MAP[key]).set(values as never).where(eq(cols.id!, id)).returning();
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, v] of Object.entries(values)) {
      const before = (existing as Record<string, unknown>)[k];
      if (JSON.stringify(before) !== JSON.stringify(v) && k !== "lines" && k !== "taxes") changes[k] = { from: before, to: v };
    }
    if (Object.keys(changes).length) await logActivity(key, id, "updated", c.get("user")?.id, changes);
    if (Object.keys(changes).length) await afterWrite(key, row as Record<string, unknown>, existing as Record<string, unknown>);
    const refs = await resolveRefs(key, [row as Record<string, unknown>]);
    return c.json({ row, refs });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

data.delete("/:table/:id", async (c) => {
  const key = c.req.param("table");
  if (!isTableKey(key)) return c.json({ error: "Unknown table" }, 404);
  const cols = columns(key);
  try {
    if (key === "legal_entity") return c.json({ error: "Impossible de supprimer une structure" }, 400);
    const [old] = await db.select().from(TABLE_MAP[key]).where(and(eq(cols.id!, c.req.param("id")), inWs(cols, wsOf(c).id)));
    if (!old) return c.json({ error: "Not found" }, 404);
    await db.delete(TABLE_MAP[key]).where(eq(cols.id!, c.req.param("id")));
    if (old) await afterWrite(key, old as Record<string, unknown>, undefined, true);
    await logActivity(key, c.req.param("id"), "deleted", c.get("user")?.id);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

/* -------------------------------------------------------------------------- */
/*  Global search (⌘K)                                                        */
/* -------------------------------------------------------------------------- */

export const search = new Hono<AppEnv>();
search.get("/", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) return c.json([]);
  const keys = (Object.keys(TABLES) as TableKey[]).filter((k) => k !== "legal_entity");
  const results = await Promise.all(
    keys.map(async (k) => {
      const cols = columns(k);
      const conds = TABLES[k].searchFields.map((f) => cols[f]).filter(Boolean).map((col) => ilike(col!, `%${q}%`));
      const rows = await db
        .select({ id: cols.id!, label: labelExpr(k) })
        .from(TABLE_MAP[k])
        .where(and(inWs(cols, wsOf(c).id), conds.length ? sql`(${sql.join(conds, sql` or `)})` : undefined))
        .limit(6);
      return rows.map((r) => ({ table: k, id: r.id, label: r.label }));
    }),
  );
  return c.json(results.flat());
});

/* -------------------------------------------------------------------------- */
/*  Activity                                                                  */
/* -------------------------------------------------------------------------- */

export const activity = new Hono<AppEnv>();
/** the record must belong to the current workspace */
activity.use("/:table/:id", async (c, next) => {
  const key = c.req.param("table");
  if (isTableKey(key)) {
    const cols = columns(key);
    const [r] = await db.select({ id: cols.id! }).from(TABLE_MAP[key]).where(and(eq(cols.id!, c.req.param("id")), inWs(cols, wsOf(c).id)));
    if (!r) return c.json({ error: "Not found" }, 404);
  }
  return next();
});
activity.get("/:table/:id", async (c) => {
  const rows = await db
    .select({
      id: schema.activity.id,
      action: schema.activity.action,
      changes: schema.activity.changes,
      comment: schema.activity.comment,
      createdAt: schema.activity.createdAt,
      userName: schema.user.name,
      userImage: schema.user.image,
    })
    .from(schema.activity)
    .leftJoin(schema.user, eq(schema.user.id, schema.activity.userId))
    .where(and(eq(schema.activity.table, c.req.param("table")), eq(schema.activity.recordId, c.req.param("id"))))
    .orderBy(sql`${schema.activity.createdAt} desc`)
    .limit(50);
  return c.json(rows);
});
activity.post("/:table/:id", async (c) => {
  const { comment } = (await c.req.json()) as { comment: string };
  if (!comment?.trim()) return c.json({ error: "Empty comment" }, 400);
  const [row] = await db
    .insert(schema.activity)
    .values({ table: c.req.param("table"), recordId: c.req.param("id"), action: "comment", comment: comment.trim(), userId: c.get("user")?.id })
    .returning();
  return c.json(row, 201);
});
