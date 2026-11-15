import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { sql } from "@erp/db";
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
app.route("/api/data", data);
app.route("/api/search", search);
app.route("/api/activity", activity);
app.route("/api/views", views);
app.route("/api/finance", finance);
app.route("/api/documents", documents);
app.route("/api/integrations", integrations);
app.route("/api/files", files);
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// Optional: serve the built SPA when STATIC_DIR is set (single-container mode)
if (process.env.STATIC_DIR) {
  app.use("/*", serveStatic({ root: process.env.STATIC_DIR }));
  app.get("*", serveStatic({ path: `${process.env.STATIC_DIR}/index.html` }));
}

await ensureAdmin().catch((e) => console.error("[auth] ensureAdmin failed", e));

console.log(`[server] listening on :${env.port} (${env.appEnv})`);
export default { port: env.port, fetch: app.fetch, idleTimeout: 60 };
