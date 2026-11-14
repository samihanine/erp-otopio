import { Hono } from "hono";
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
