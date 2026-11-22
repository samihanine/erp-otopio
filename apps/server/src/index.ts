import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { db, schema, sql } from "@erp/db";
import { eq, or, sql as dsql } from "drizzle-orm";
import { auth, authEnabledProviders, ensureAdmin } from "./lib/auth";
import { env } from "./lib/env";
import type { AppEnv } from "./lib/types";
import { activity, data, search } from "./routes/data";
import { views } from "./routes/views";
import { finance } from "./routes/finance";
import { documents } from "./routes/documents";
import { integrations } from "./routes/integrations";
import { files } from "./routes/files";
import { redisOk } from "./lib/queue";
import { internalKey, mcp, wellKnown } from "./routes/mcp";
import { workspace } from "./routes/workspace";
import { publicApi, websiteAdmin } from "./routes/website";
import { workspaceGuard } from "./lib/workspace";
import { workspaces } from "./routes/workspaces";
import { portal } from "./routes/portal";

const app = new Hono<AppEnv>();

app.use("*", logger());
app.use("/api/*", cors({ origin: [env.appUrl], credentials: true }));

app.get("/api/health", async (c) => {
  let dbOk = false;
  try {
    await sql`select 1`;
    dbOk = true;
  } catch {}
  return c.json({ ok: dbOk, db: dbOk, redis: await redisOk(), env: env.appEnv, version: process.env.GIT_SHA ?? "dev" }, dbOk ? 200 : 503);
});

app.get("/api/auth/providers", (c) => c.json(authEnabledProviders()));
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// MCP (OAuth 2.1 + JSON-RPC) — has its own bearer auth
app.route("/.well-known", wellKnown);
app.route("/api/mcp", mcp);
// Public, read-only website content (otopio.ca SSR)
app.route("/api/public", publicApi);

// Session guard for every other API route
app.use("/api/*", async (c, next) => {
  if (c.req.header("x-internal") === internalKey) return next();
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", session.user);
  c.set("session", session.session);
  return next();
});

app.get("/api/me", (c) => c.json(c.get("user")));
// client portal (no workspace membership needed — access checked per client)
app.route("/api/portal", portal);
// workspace list / settings (membership checked inside)
app.route("/api/workspaces", workspaces);
// every other route works inside the current workspace (x-workspace header)
app.use("/api/*", async (c, next) => {
  if (c.req.header("x-internal") === internalKey && !c.get("user")) {
    const w = c.req.header("x-workspace") ?? "OTP";
    const [e] = await db.select().from(schema.legalEntity).where(or(eq(schema.legalEntity.code, w), eq(schema.legalEntity.slug, w), dsql`${schema.legalEntity.id}::text = ${w}`));
    if (!e) return c.json({ error: "Unknown workspace" }, 400);
    c.set("ws", { ...e, role: "admin" });
    return next();
  }
  return workspaceGuard(c, next);
});
app.route("/api/data", data);
app.route("/api/search", search);
app.route("/api/activity", activity);
app.route("/api/views", views);
app.route("/api/finance", finance);
app.route("/api/documents", documents);
app.route("/api/integrations", integrations);
app.route("/api/files", files);
app.route("/api/ws", workspace);
app.route("/api/website", websiteAdmin);
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// Optional: serve the built SPA when STATIC_DIR is set (single-container mode)
if (process.env.STATIC_DIR) {
  app.use("/*", serveStatic({ root: process.env.STATIC_DIR }));
  app.get("*", serveStatic({ path: `${process.env.STATIC_DIR}/index.html` }));
}

await ensureAdmin().catch((e) => console.error("[auth] ensureAdmin failed", e));

console.log(`[server] listening on :${env.port} (${env.appEnv})`);
export default { port: env.port, fetch: app.fetch, idleTimeout: 60 };
