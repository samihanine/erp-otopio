import { ai, aiEnabled } from "@erp/ai";
/**
 * Website CMS
 *  - `publicApi`: read-only, published content for otopio.ca (SSR), no session required.
 *  - `websiteAdmin`: AI translation of a record into other languages.
 */
import { Hono } from "hono";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@erp/db";
import { TABLES, type TableKey } from "@erp/shared";
import type { AppEnv } from "../lib/types";
import { columns, isTableKey, TABLE_MAP } from "../lib/data";

type Row = Record<string, unknown> & { translations?: Record<string, Record<string, unknown>> };

/** Merge `translations[locale]` over the base (French) fields. */
function localize<T extends Row>(row: T, locale: string): Omit<T, "translations"> & { locale: string; locales: string[] } {
  const { translations = {}, ...rest } = row;
  const t = locale !== "fr" ? (translations[locale] ?? {}) : {};
  const merged: Record<string, unknown> = { ...rest };
  for (const [k, v] of Object.entries(t)) if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) merged[k] = v;
  return { ...(merged as Omit<T, "translations">), locale, locales: ["fr", ...Object.keys(translations)] };
}

export const publicApi = new Hono<AppEnv>();

publicApi.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=600");
  c.header("Access-Control-Allow-Origin", "*");
});

const loc = (q?: string) => (q === "en" ? "en" : "fr");

publicApi.get("/artifacts", async (c) => {
  const rows = await db.select().from(schema.artifact).where(eq(schema.artifact.status, "published")).orderBy(asc(schema.artifact.position), desc(schema.artifact.startedAt));
  return c.json(rows.map((r) => localize(r as Row, loc(c.req.query("locale")))));
});

publicApi.get("/artifacts/:slug", async (c) => {
  const [r] = await db
    .select()
    .from(schema.artifact)
    .where(and(eq(schema.artifact.slug, c.req.param("slug")), eq(schema.artifact.status, "published")));
  return r ? c.json(localize(r as Row, loc(c.req.query("locale")))) : c.json({ error: "Not found" }, 404);
});

publicApi.get("/team", async (c) => {
  const rows = await db.select().from(schema.teamMember).where(eq(schema.teamMember.status, "published")).orderBy(asc(schema.teamMember.position));
  return c.json(rows.map((r) => localize(r as Row, loc(c.req.query("locale")))));
});

const articleCols = {
  id: schema.article.id,
  slug: schema.article.slug,
  title: schema.article.title,
  excerpt: schema.article.excerpt,
  coverUrl: schema.article.coverUrl,
  category: schema.article.category,
  keywords: schema.article.keywords,
  publishedAt: schema.article.publishedAt,
  readingMinutes: schema.article.readingMinutes,
  updatedAt: schema.article.updatedAt,
  translations: schema.article.translations,
  authorName: sql<string | null>`(select trim(coalesce(${schema.person.firstName},'') || ' ' || coalesce(${schema.person.lastName},'')) from ${schema.person} where ${schema.person.id} = ${schema.article.authorId})`,
};

publicApi.get("/articles", async (c) => {
  const rows = await db.select(articleCols).from(schema.article).where(eq(schema.article.status, "published")).orderBy(desc(schema.article.publishedAt));
  return c.json(rows.map((r) => localize(r as Row, loc(c.req.query("locale")))));
});

publicApi.get("/articles/:slug", async (c) => {
  const [r] = await db
    .select({ ...articleCols, content: schema.article.content })
    .from(schema.article)
    .where(and(eq(schema.article.slug, c.req.param("slug")), eq(schema.article.status, "published")));
  return r ? c.json(localize(r as Row, loc(c.req.query("locale")))) : c.json({ error: "Not found" }, 404);
});

/* ------------------------------- AI translation ------------------------------- */

export const websiteAdmin = new Hono<AppEnv>();

websiteAdmin.post("/translate/:table/:id", async (c) => {
  const key = c.req.param("table");
  if (!isTableKey(key) || !TABLES[key as TableKey].translatable) return c.json({ error: "Not translatable" }, 400);
  const target = (c.req.query("to") ?? "en").toLowerCase();
  const fields = TABLES[key as TableKey].translatable!;
  const cols = columns(key);
  const [row] = (await db.select().from(TABLE_MAP[key]).where(eq(cols.id!, c.req.param("id")))) as Row[];
  if (!row) return c.json({ error: "Not found" }, 404);
  if (!aiEnabled()) return c.json({ error: "ANTHROPIC_API_KEY manquante" }, 503);
  const source = Object.fromEntries(fields.map((f) => [f, row[f]]).filter(([, v]) => v != null && v !== ""));
  let out: Record<string, unknown>;
  try {
    out = await ai<Record<string, unknown>>(
      "traduction-site",
      `You translate website content from French to ${target}. Keep the exact same json structure and keys, translate only human-readable string values (not URLs, icon names, layout types or colors). Keep markdown formatting. Natural, professional tone for an IT agency.`,
      JSON.stringify(source),
      true,
      8000,
    );
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
  const translations = { ...(row.translations ?? {}), [target]: { ...((row.translations ?? {})[target] ?? {}), ...out } };
  const [updated] = await db.update(TABLE_MAP[key]).set({ translations, updatedAt: new Date() } as never).where(eq(cols.id!, row.id as string)).returning();
  return c.json({ row: updated });
});
