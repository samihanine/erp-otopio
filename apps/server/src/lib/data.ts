import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  like,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  not,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db, schema } from "@erp/db";
import { computeTotals, getField, TABLES, type FieldDef, type TableKey } from "@erp/shared";

export const TABLE_MAP: Record<TableKey, PgTable> = {
  organization: schema.organization,
  person: schema.person,
  communication: schema.communication,
  project: schema.project,
  task: schema.task,
  ticket: schema.ticket,
  quote: schema.quote,
  invoice: schema.invoice,
  bill: schema.bill,
  transaction: schema.transaction,
  article: schema.article,
  post: schema.post,
  document: schema.document,
  event: schema.event,
  legal_entity: schema.legalEntity,
};

export const isTableKey = (k: string): k is TableKey => k in TABLE_MAP;

export function columns(table: TableKey) {
  return getTableColumns(TABLE_MAP[table]) as unknown as Record<string, PgColumn>;
}

export type Filter = { field: string; op: string; value?: unknown };
export type Sort = { field: string; dir: "asc" | "desc" };

const startOf = (unit: "week" | "month" | "year") => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (unit === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (unit === "month") d.setDate(1);
  if (unit === "year") d.setMonth(0, 1);
  return d;
};
const addTo = (d: Date, unit: "week" | "month" | "year") => {
  const n = new Date(d);
  if (unit === "week") n.setDate(n.getDate() + 7);
  if (unit === "month") n.setMonth(n.getMonth() + 1);
  if (unit === "year") n.setFullYear(n.getFullYear() + 1);
  return n;
};
const iso = (d: Date) => d.toISOString().slice(0, 10);

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (v == null || v === "") return [];
  return [String(v)];
}

function buildCondition(table: TableKey, f: Filter): SQL | undefined {
  const field = getField(table, f.field);
  const col = columns(table)[f.field];
  if (!field || !col) return undefined;
  const v = f.value;
  const isText = ["text", "longtext", "url", "email", "phone", "repo"].includes(field.type);
  const isDateTime = field.type === "datetime" || f.field === "createdAt" || f.field === "updatedAt";
  const asDate = (d: Date) => (isDateTime ? d : iso(d));

  switch (f.op) {
    case "contains":
      if (field.type === "tags") return sql`exists (select 1 from unnest(${col}) t where t ilike ${`%${String(v ?? "")}%`})`;
      return ilike(col, `%${String(v ?? "")}%`);
    case "not_contains":
      return or(isNull(col), not(ilike(col, `%${String(v ?? "")}%`)));
    case "eq":
      if (v == null || v === "") return undefined;
      return isText ? ilike(col, String(v)) : eq(col, v);
    case "neq":
      if (v == null || v === "") return undefined;
      return or(isNull(col), ne(col, v));
    case "gt":
      return v == null || v === "" ? undefined : gt(col, v);
    case "gte":
      return v == null || v === "" ? undefined : gte(col, v);
    case "lt":
      return v == null || v === "" ? undefined : lt(col, v);
    case "lte":
      return v == null || v === "" ? undefined : lte(col, v);
    case "before":
      return v ? lt(col, isDateTime ? new Date(String(v)) : String(v)) : undefined;
    case "after":
      return v ? gt(col, isDateTime ? new Date(String(v)) : String(v)) : undefined;
    case "in": {
      const a = arr(v);
      return a.length ? inArray(col, a) : undefined;
    }
    case "not_in": {
      const a = arr(v);
      return a.length ? or(isNull(col), not(inArray(col, a))) : undefined;
    }
    case "is_empty":
      if (field.type === "tags" || field.type === "lines") return or(isNull(col), sql`cardinality(${col}) = 0`);
      return isText ? or(isNull(col), eq(col, "")) : isNull(col);
    case "is_not_empty":
      if (field.type === "lines") return sql`jsonb_array_length(${col}) > 0`;
      if (field.type === "tags") return sql`cardinality(${col}) > 0`;
      return isText ? and(isNotNull(col), ne(col, "")) : isNotNull(col);
    case "this_week":
    case "this_month":
    case "this_year": {
      const unit = f.op.replace("this_", "") as "week" | "month" | "year";
      const s = startOf(unit);
      return and(gte(col, asDate(s)), lt(col, asDate(addTo(s, unit))));
    }
    case "past_due":
      return lt(col, iso(new Date()));
    case "is_true":
      return eq(col, true);
    case "is_false":
      return or(isNull(col), eq(col, false));
    default:
      return undefined;
  }
}

export function buildWhere(table: TableKey, filters: Filter[], mode: "and" | "or", search?: string): SQL | undefined {
  const conds = filters.map((f) => buildCondition(table, f)).filter(Boolean) as SQL[];
  let where: SQL | undefined = conds.length ? (mode === "or" ? or(...conds) : and(...conds)) : undefined;
  if (search?.trim()) {
    const cols = columns(table);
    const searchConds = TABLES[table].searchFields.map((k) => cols[k]).filter(Boolean).map((c) => ilike(c!, `%${search.trim()}%`));
    if (searchConds.length) where = where ? and(where, or(...searchConds)) : or(...searchConds);
  }
  return where;
}

export function buildOrder(table: TableKey, sorts: Sort[]) {
  const cols = columns(table);
  const def = TABLES[table].defaultSort;
  const list = sorts.length ? sorts : def ? [def] : [];
  const out = list.filter((s) => cols[s.field]).map((s) => (s.dir === "desc" ? sql`${cols[s.field]} desc nulls last` : sql`${cols[s.field]} asc nulls last`));
  if (cols.createdAt) out.push(desc(cols.createdAt) as never);
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Relation labels                                                           */
/* -------------------------------------------------------------------------- */

export function labelExpr(table: TableKey) {
  const cols = columns(table);
  if (table === "person") return sql<string>`trim(concat(${cols.firstName}, ' ', coalesce(${cols.lastName}, '')))`;
  if (table === "ticket") return sql<string>`concat('#', ${cols.number}, ' ', ${cols.title})`;
  return sql<string>`${cols[TABLES[table].primary]}::text`;
}

export type RefMap = Record<string, Record<string, { label: string; color?: string | null }>>;

/** Collects labels for every relation value present in rows: { table: { id: {label} } } */
export async function resolveRefs(table: TableKey, rows: Record<string, unknown>[]): Promise<RefMap> {
  const relFields = TABLES[table].fields.filter((f) => f.type === "relation" && f.relation);
  const byTable = new Map<TableKey, Set<string>>();
  for (const f of relFields) {
    for (const r of rows) {
      const v = r[f.key];
      if (typeof v === "string") {
        if (!byTable.has(f.relation!)) byTable.set(f.relation!, new Set());
        byTable.get(f.relation!)!.add(v);
      }
    }
  }
  const refs: RefMap = {};
  await Promise.all(
    [...byTable.entries()].map(async ([t, ids]) => {
      const cols = columns(t);
      const extra: Record<string, PgColumn> = t === "legal_entity" ? { color: cols.color! } : {};
      const res = await db
        .select({ id: cols.id!, label: labelExpr(t), ...extra })
        .from(TABLE_MAP[t])
        .where(inArray(cols.id!, [...ids]));
      refs[t] = Object.fromEntries(res.map((r) => [String(r.id), { label: String(r.label), color: (r as { color?: string }).color }]));
    }),
  );
  return refs;
}

/* -------------------------------------------------------------------------- */
/*  Write sanitation                                                          */
/* -------------------------------------------------------------------------- */

const writableTypes = new Set<FieldDef["type"]>(["text", "longtext", "number", "currency", "percent", "date", "datetime", "select", "tags", "relation", "checkbox", "url", "email", "phone", "repo", "lines"]);

/** Keeps only known, writable fields and coerces values to the column type. */
export function sanitize(table: TableKey, input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const def = TABLES[table];
  const extraKeys = table === "quote" || table === "invoice" ? ["taxes", "introduction", "scope", "terms"] : table === "legal_entity" ? ["taxIds", "defaultTaxes", "bankDetails"] : [];
  for (const [k, raw] of Object.entries(input)) {
    if (extraKeys.includes(k)) {
      out[k] = raw;
      continue;
    }
    const f = def.fields.find((x) => x.key === k);
    if (!f || f.readOnly || !writableTypes.has(f.type)) continue;
    let v: unknown = raw;
    if (v === "" && f.type !== "text" && f.type !== "longtext") v = null;
    switch (f.type) {
      case "number":
      case "currency":
      case "percent":
        v = v == null ? null : Number(v);
        if (typeof v === "number" && Number.isNaN(v)) v = null;
        break;
      case "checkbox":
        v = Boolean(v);
        break;
      case "tags":
        v = Array.isArray(v) ? v.map(String).filter(Boolean) : [];
        break;
      case "datetime":
        v = v ? new Date(String(v)) : null;
        break;
      case "date":
        v = v ? String(v).slice(0, 10) : null;
        break;
    }
    out[k] = v;
  }
  return out;
}

/** Recomputes money totals for documents whenever lines or taxes change. */
export async function withComputedTotals(table: TableKey, data: Record<string, unknown>, existing?: Record<string, unknown>) {
  if (table !== "quote" && table !== "invoice") return data;
  if (!("lines" in data) && !("taxes" in data) && existing) return data;
  const lines = (data.lines ?? existing?.lines ?? []) as never[];
  let taxes = (data.taxes ?? existing?.taxes) as { code: string; label: string; rate: number }[] | undefined;
  if (!taxes) {
    const entityId = (data.legalEntityId ?? existing?.legalEntityId) as string | undefined;
    if (entityId) {
      const [e] = await db.select({ t: schema.legalEntity.defaultTaxes }).from(schema.legalEntity).where(eq(schema.legalEntity.id, entityId));
      taxes = e?.t ?? [];
    }
  }
  const t = computeTotals(lines, taxes ?? []);
  return { ...data, lines, taxes: t.taxes, subtotal: t.subtotal, taxTotal: t.taxTotal, total: t.total };
}

/** Next document number for an entity: prefix with {YYYY} → F-2026-005.
 *  The year comes from the document date, so back-dated invoices get their own year's sequence. */
export async function nextNumber(kind: "invoice" | "quote", entityId: string, date?: unknown) {
  const [e] = await db.select().from(schema.legalEntity).where(eq(schema.legalEntity.id, entityId));
  if (!e) throw new Error("Unknown legal entity");
  const current = new Date().getFullYear();
  const y = date ? Number(String(date).slice(0, 4)) : current;
  const year = Number.isFinite(y) && y > 1990 ? y : current;
  const prefix = (kind === "invoice" ? e.invoicePrefix : e.quotePrefix).replace("{YYYY}", String(year));
  const t = kind === "invoice" ? schema.invoice : schema.quote;
  const existing = await db.select({ number: t.number }).from(t).where(and(eq(t.legalEntityId, entityId), like(t.number, `${prefix}%`)));
  const maxExisting = existing.reduce((m, r) => Math.max(m, Number(r.number.slice(prefix.length)) || 0), 0);
  if (year !== current) return { number: `${prefix}${String(maxExisting + 1).padStart(3, "0")}`, currency: e.currency, taxes: e.defaultTaxes };
  const n = Math.max(kind === "invoice" ? e.nextInvoiceNumber : e.nextQuoteNumber, maxExisting + 1);
  await db
    .update(schema.legalEntity)
    .set(kind === "invoice" ? { nextInvoiceNumber: n + 1 } : { nextQuoteNumber: n + 1 })
    .where(eq(schema.legalEntity.id, entityId));
  return { number: `${prefix}${String(n).padStart(3, "0")}`, currency: e.currency, taxes: e.defaultTaxes };
}

export { asc, desc };
