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
    cloudflare: { connected: Boolean(cfHeaders()) },
    r2: { connected: r2Configured(), bucket: env.r2.bucket },
    redis: { connected: await redisOk() },
    qonto: { connected: env.qonto, entities: entities.filter((e) => e.provider === "qonto") },
    quickbooks: { connected: env.quickbooks, entities: entities.filter((e) => e.provider === "quickbooks") },
    website: { connected: Boolean(cfHeaders()), domain: "otopio.ca" },
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
/* ------------------------- Website analytics (Cloudflare) ------------------------- */
const CF_ZONES = (process.env.CLOUDFLARE_SITE_ZONES ?? "otopio.ca,otopio.fr,otopio.net").split(",").map((z) => z.trim()).filter(Boolean);
const cfHeaders = (): Record<string, string> | null => {
  if (process.env.CLOUDFLARE_API_KEY && process.env.CLOUDFLARE_EMAIL) return { "X-Auth-Email": process.env.CLOUDFLARE_EMAIL, "X-Auth-Key": process.env.CLOUDFLARE_API_KEY };
  if (env.cloudflareToken) return { authorization: `Bearer ${env.cloudflareToken}` };
  return null;
};
let zoneIds: Record<string, string> | null = null;
async function cfZones(h: Record<string, string>) {
  if (zoneIds) return zoneIds;
  const r = (await (await fetch("https://api.cloudflare.com/client/v4/zones?per_page=50", { headers: h })).json()) as { result?: { id: string; name: string }[] };
  zoneIds = Object.fromEntries((r.result ?? []).filter((z) => CF_ZONES.includes(z.name)).map((z) => [z.name, z.id]));
  return zoneIds;
}
type DayRow = { dimensions: { date: string }; sum: { requests: number; pageViews: number; countryMap: { clientCountryName: string; requests: number }[]; browserMap: { pageViews: number; uaBrowserFamily: string }[] }; uniq: { uniques: number } };
const BOT_PATH = /^\/(\.|wp-|cdn-cgi|xmlrpc|admin\.php|vendor|phpmyadmin|cgi-bin)|\.(php|env|bak|sql|ini|log)$/i;

async function zoneAnalytics(h: Record<string, string>, zoneId: string, days: number) {
  const day = (d: number) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  const q = (withPaths: number) => ({
    query: `query($z:String!,$s:Date!,$e:Date!,$t0:Time!,$t1:Time!){viewer{zones(filter:{zoneTag:$z}){d:httpRequests1dGroups(limit:400,filter:{date_geq:$s,date_leq:$e},orderBy:[date_ASC]){dimensions{date} sum{requests pageViews countryMap{clientCountryName requests} browserMap{pageViews uaBrowserFamily}} uniq{uniques}} ${withPaths ? `p:httpRequestsAdaptiveGroups(limit:40,filter:{datetime_geq:$t0,datetime_leq:$t1,requestSource:"eyeball",edgeResponseContentTypeName:"html",edgeResponseStatus:200},orderBy:[count_DESC]){count dimensions{clientRequestPath}}` : ""}}}}`,
    variables: { z: zoneId, s: day(days - 1), e: day(0), t0: new Date(Date.now() - withPaths * 864e5).toISOString(), t1: new Date().toISOString() },
  });
  for (const pd of [Math.min(days, 7), 1, 0]) {
    const r = (await (await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(q(pd)) })).json()) as {
      data?: { viewer: { zones: { d: DayRow[]; p?: { count: number; dimensions: { clientRequestPath: string } }[] }[] } };
      errors?: unknown[];
    };
    const z = r.data?.viewer.zones[0];
    if (z && !r.errors?.length) return { days: z.d, paths: z.p ?? [], pathDays: pd };
  }
  return { days: [] as DayRow[], paths: [], pathDays: 0 };
}

integrations.get("/website/analytics", async (c) => {
  const days = Math.min(Math.max(Number(c.req.query("days") ?? 30), 1), 365);
  const zone = c.req.query("zone") ?? "all";
  const h = cfHeaders();
  if (!h) return c.json({ demo: true, error: "Cloudflare non configuré", zones: CF_ZONES });
  const ids = await cfZones(h);
  const names = zone === "all" ? Object.keys(ids) : Object.keys(ids).filter((n) => n === zone);
  const results = await Promise.all(names.map(async (n) => ({ name: n, ...(await zoneAnalytics(h, ids[n]!, days)) })));
  const byDate = new Map<string, { date: string; visitors: number; pageviews: number; requests: number }>();
  const countries = new Map<string, number>();
  const browsers = new Map<string, number>();
  const paths = new Map<string, number>();
  const perZone: { name: string; visitors: number; pageviews: number }[] = [];
  for (const r of results) {
    let zv = 0;
    let zp = 0;
    for (const d of r.days) {
      const k = d.dimensions.date;
      const cur = byDate.get(k) ?? { date: k, visitors: 0, pageviews: 0, requests: 0 };
      cur.visitors += d.uniq.uniques;
      cur.pageviews += d.sum.pageViews;
      cur.requests += d.sum.requests;
      byDate.set(k, cur);
      zv += d.uniq.uniques;
      zp += d.sum.pageViews;
      for (const cm of d.sum.countryMap) countries.set(cm.clientCountryName, (countries.get(cm.clientCountryName) ?? 0) + cm.requests);
      for (const b of d.sum.browserMap) browsers.set(b.uaBrowserFamily, (browsers.get(b.uaBrowserFamily) ?? 0) + b.pageViews);
    }
    for (const p of r.paths) {
      const path = p.dimensions.clientRequestPath;
      if (BOT_PATH.test(path)) continue;
      const key = zone === "all" && results.length > 1 ? `${r.name}${path}` : path;
      paths.set(key, (paths.get(key) ?? 0) + p.count);
    }
    perZone.push({ name: r.name, visitors: zv, pageviews: zp });
  }
  const series = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const total = (k: "visitors" | "pageviews" | "requests") => series.reduce((a, s) => a + s[k], 0);
  const totalPv = [...browsers.values()].reduce((a, b) => a + b, 0) || 1;
  const mobile = [...browsers.entries()].filter(([b]) => /mobile|ios|android|samsung/i.test(b)).reduce((a, [, v]) => a + v, 0);
  const countryReq = [...countries.values()].reduce((a, b) => a + b, 0) || 1;
  return c.json({
    demo: false,
    zones: Object.keys(ids),
    zone,
    totals: { visitors: total("visitors"), pageviews: total("pageviews"), requests: total("requests"), mobileShare: mobile / totalPv },
    series,
    perZone,
    pages: [...paths.entries()].map(([path, views]) => ({ path, views })).sort((a, b) => b.views - a.views).slice(0, 10),
    pagesDays: Math.max(0, ...results.map((r) => r.pathDays)),
    countries: [...countries.entries()].map(([code, n]) => ({ code, share: n / countryReq })).sort((a, b) => b.share - a.share).slice(0, 8),
    browsers: [...browsers.entries()].map(([name, n]) => ({ name, share: n / totalPv })).sort((a, b) => b.share - a.share).slice(0, 6),
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
