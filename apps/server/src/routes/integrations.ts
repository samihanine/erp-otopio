import { Hono } from "hono";
import { eq, like } from "drizzle-orm";
import { db, schema } from "@erp/db";
import type { AppEnv } from "../lib/types";
import { env, r2Configured } from "../lib/env";
import { redisOk } from "../lib/queue";
import { authEnabledProviders } from "../lib/auth";

export const integrations = new Hono<AppEnv>();

integrations.get("/status", async (c) => {
  const entities = await db.select({ id: schema.legalEntity.id, name: schema.legalEntity.name, provider: schema.legalEntity.accountingProvider }).from(schema.legalEntity);
  return c.json({
    google: { connected: authEnabledProviders().google, scope: "Gmail · Drive · Docs" },
    github: { connected: Boolean(env.githubToken), org: env.githubOrg },
    cloudflare: { connected: Boolean(env.cloudflareToken) },
    r2: { connected: r2Configured(), bucket: env.r2.bucket },
    redis: { connected: await redisOk() },
    qonto: { connected: env.qonto, entities: entities.filter((e) => e.provider === "qonto") },
    quickbooks: { connected: env.quickbooks, entities: entities.filter((e) => e.provider === "quickbooks") },
    website: { connected: Boolean(env.cloudflareToken), domain: "otopio.ca" },
  });
});

const gh = async (path: string) => {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "otopio-erp", ...(env.githubToken ? { authorization: `Bearer ${env.githubToken}` } : {}) },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
};

/** Repo card on project pages. Works for public repos without a token. */
integrations.get("/github/:owner/:repo", async (c) => {
  const full = `${c.req.param("owner")}/${c.req.param("repo")}`;
  try {
    const [repo, commits] = await Promise.all([gh(`/repos/${full}`), gh(`/repos/${full}/commits?per_page=5`)]);
    return c.json({
      connected: true,
      repo: { name: repo.full_name, private: repo.private, url: repo.html_url, description: repo.description, defaultBranch: repo.default_branch, pushedAt: repo.pushed_at, language: repo.language, openIssues: repo.open_issues_count, stars: repo.stargazers_count },
      commits: (commits as { sha: string; html_url: string; commit: { message: string; author: { name: string; date: string } } }[]).map((x) => ({ sha: x.sha.slice(0, 7), url: x.html_url, message: x.commit.message.split("\n")[0], author: x.commit.author.name, date: x.commit.author.date })),
    });
  } catch (e) {
    return c.json({ connected: false, repo: { name: full, url: `https://github.com/${full}` }, commits: [], error: (e as Error).message });
  }
});

/**
 * Website analytics. Real data will come from Cloudflare Web Analytics (GraphQL)
 * once CLOUDFLARE_API_TOKEN is set; until then a deterministic demo series.
 */
integrations.get("/website/analytics", async (c) => {
  const days = Math.min(Number(c.req.query("days") ?? 30), 365);
  let seed = 42;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 864e5);
    const weekday = d.getDay() % 6 === 0 ? 0.55 : 1;
    const visitors = Math.round((120 + i * 1.8 + rand() * 60) * weekday);
    return { date: d.toISOString().slice(0, 10), visitors, pageviews: Math.round(visitors * (2.1 + rand() * 0.8)) };
  });
  const sum = (k: "visitors" | "pageviews") => series.reduce((a, s) => a + s[k], 0);
  return c.json({
    demo: !env.cloudflareToken,
    domain: "otopio.ca",
    totals: { visitors: sum("visitors"), pageviews: sum("pageviews"), bounceRate: 0.46, avgDuration: 94 },
    series,
    pages: [
      { path: "/", views: Math.round(sum("pageviews") * 0.38) },
      { path: "/expertises/intelligence-artificielle", views: Math.round(sum("pageviews") * 0.14) },
      { path: "/realisations", views: Math.round(sum("pageviews") * 0.11) },
      { path: "/blog/agents-ia-pme-par-ou-commencer", views: Math.round(sum("pageviews") * 0.09) },
      { path: "/contact", views: Math.round(sum("pageviews") * 0.07) },
      { path: "/expertises/technologies-quantiques", views: Math.round(sum("pageviews") * 0.05) },
    ],
    referrers: [
      { source: "Google", visitors: Math.round(sum("visitors") * 0.44) },
      { source: "Direct", visitors: Math.round(sum("visitors") * 0.27) },
      { source: "LinkedIn", visitors: Math.round(sum("visitors") * 0.15) },
      { source: "ChatGPT / Perplexity", visitors: Math.round(sum("visitors") * 0.08) },
      { source: "Bing", visitors: Math.round(sum("visitors") * 0.04) },
    ],
    countries: [
      { code: "CA", visitors: Math.round(sum("visitors") * 0.58) },
      { code: "FR", visitors: Math.round(sum("visitors") * 0.29) },
      { code: "US", visitors: Math.round(sum("visitors") * 0.07) },
      { code: "BE", visitors: Math.round(sum("visitors") * 0.03) },
    ],
    devices: [
      { device: "desktop", share: 0.61 },
      { device: "mobile", share: 0.35 },
      { device: "tablet", share: 0.04 },
    ],
  });
});

/* ---------------- Personal Google account (e.g. a @gmail.com mailbox) ---------------- */
// Uses PERSONAL_GOOGLE_CLIENT_ID/SECRET if set, else the login OAuth client (its consent screen must be "External").
const pg = () => ({
  id: process.env.PERSONAL_GOOGLE_CLIENT_ID || env.googleClientId,
  secret: process.env.PERSONAL_GOOGLE_CLIENT_SECRET || env.googleClientSecret,
  redirect: `${env.appUrl.replace(/\/$/, "")}/api/integrations/google-personal/callback`,
});
const PERSONAL_SCOPES = ["openid", "email", "https://mail.google.com/", "https://www.googleapis.com/auth/gmail.settings.basic", "https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/calendar"];

async function aesKey() {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`personal-google:${env.authSecret}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(v: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(JSON.stringify(v))));
  return Buffer.from(new Uint8Array([...iv, ...ct])).toString("base64");
}
async function unseal<T>(s: string): Promise<T> {
  const b = new Uint8Array(Buffer.from(s, "base64"));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, await aesKey(), b.slice(12));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}
const stateKey = (k: string) => `personal-google:${k}`;
async function putState(key: string, value: string) {
  await db.insert(schema.syncState).values({ key, value }).onConflictDoUpdate({ target: schema.syncState.key, set: { value, updatedAt: new Date() } });
}
async function readState(key: string) {
  const [r] = await db.select().from(schema.syncState).where(eq(schema.syncState.key, key));
  return r?.value ?? null;
}

integrations.get("/google-personal/connect", async (c) => {
  const cfg = pg();
  if (!cfg.id) return c.text("OAuth client not configured", 500);
  const nonce = crypto.randomUUID();
  await putState(stateKey(`nonce:${nonce}`), c.get("user")!.email);
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({ client_id: cfg.id, redirect_uri: cfg.redirect, response_type: "code", scope: PERSONAL_SCOPES.join(" "), access_type: "offline", prompt: "consent select_account", include_granted_scopes: "true", state: nonce }).toString();
  return c.redirect(u.toString());
});

integrations.get("/google-personal/callback", async (c) => {
  const cfg = pg();
  const nonce = c.req.query("state") ?? "";
  const owner = await readState(stateKey(`nonce:${nonce}`));
  if (!owner || owner !== c.get("user")!.email) return c.text("Invalid state", 400);
  await db.delete(schema.syncState).where(eq(schema.syncState.key, stateKey(`nonce:${nonce}`)));
  if (c.req.query("error")) return c.redirect(`/settings?google=${encodeURIComponent(c.req.query("error")!)}`);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: c.req.query("code") ?? "", client_id: cfg.id, client_secret: cfg.secret, redirect_uri: cfg.redirect, grant_type: "authorization_code" }),
  });
  const t = (await r.json()) as { refresh_token?: string; access_token?: string; id_token?: string; scope?: string; error?: string };
  if (!t.refresh_token || !t.access_token) return c.text(`Google n'a pas renvoyé de refresh token (${t.error ?? "?"})`, 400);
  const info = (await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${t.access_token}` } })).json()) as { email?: string };
  const email = (info.email ?? "unknown").toLowerCase();
  await putState(stateKey(`${owner}:${email}`), await seal({ email, refreshToken: t.refresh_token, scope: t.scope, at: new Date().toISOString() }));
  return c.redirect(`/settings?google=connected&account=${encodeURIComponent(email)}`);
});

/** Accounts connected by the current user. */
integrations.get("/google-personal", async (c) => {
  const rows = await db.select().from(schema.syncState).where(like(schema.syncState.key, stateKey(`${c.get("user")!.email}:%`)));
  return c.json(rows.map((r) => ({ email: r.key.split(":").slice(2).join(":"), updatedAt: r.updatedAt })));
});

/** Short-lived access token (1h) for one of the current user's connected accounts. */
integrations.get("/google-personal/token", async (c) => {
  let email = (c.req.query("email") ?? "").toLowerCase();
  if (!email) {
    // default: the only connected account (or the n-th one with ?index=)
    const rows = await db.select().from(schema.syncState).where(like(schema.syncState.key, stateKey(`${c.get("user")!.email}:%`)));
    const r = rows[Number(c.req.query("index") ?? 0)];
    email = r ? r.key.split(":").slice(2).join(":") : "";
  }
  const sealed = await readState(stateKey(`${c.get("user")!.email}:${email}`));
  if (!sealed) return c.json({ error: "Not connected" }, 404);
  const { refreshToken } = await unseal<{ refreshToken: string }>(sealed);
  const cfg = pg();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: cfg.id, client_secret: cfg.secret, grant_type: "refresh_token" }),
  });
  const t = (await r.json()) as { access_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!t.access_token) return c.json({ error: t.error ?? "refresh failed" }, 502);
  return c.json({ email, accessToken: t.access_token, expiresIn: t.expires_in, scope: t.scope });
});

integrations.delete("/google-personal", async (c) => {
  const email = (c.req.query("email") ?? "").toLowerCase();
  await db.delete(schema.syncState).where(eq(schema.syncState.key, stateKey(`${c.get("user")!.email}:${email}`)));
  return c.json({ ok: true });
});
