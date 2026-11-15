/**
 * Google Workspace client using a service account with domain-wide delegation.
 * Key: GOOGLE_SERVICE_ACCOUNT_B64 (base64 JSON) or GOOGLE_SERVICE_ACCOUNT_FILE.
 */
import { createSign } from "node:crypto";

type SA = { client_email: string; private_key: string };
let sa: SA | null = null;
async function key(): Promise<SA> {
  if (sa) return sa;
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (b64) sa = JSON.parse(Buffer.from(b64.trim(), "base64").toString("utf8"));
  else if (file) sa = JSON.parse(await Bun.file(file).text());
  else throw new Error("Google service account not configured");
  return sa!;
}
export const googleConfigured = () => Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_B64 || process.env.GOOGLE_SERVICE_ACCOUNT_FILE);

export const SCOPES = {
  gmail: "https://mail.google.com/",
  gmailSettings: "https://www.googleapis.com/auth/gmail.settings.basic",
  drive: "https://www.googleapis.com/auth/drive",
  calendar: "https://www.googleapis.com/auth/calendar",
};

const b64u = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const cache = new Map<string, { t: string; exp: number }>();

export async function accessToken(subject: string, scope: string) {
  const k = `${subject}|${scope}`;
  const c = cache.get(k);
  if (c && c.exp > Date.now() + 60_000) return c.t;
  const s = await key();
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const p = b64u(JSON.stringify({ iss: s.client_email, sub: subject, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${h}.${p}`).sign(s.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${h}.${p}.${b64u(sig)}` }),
  });
  const j = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!j.access_token) throw new Error(`Google auth ${subject}: ${j.error} ${j.error_description ?? ""}`);
  cache.set(k, { t: j.access_token, exp: Date.now() + 3500_000 });
  return j.access_token;
}

export class GoogleError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Authenticated JSON call with retry on 429/5xx. */
export async function gfetch<T = any>(subject: string, scope: string, url: string, init: RequestInit & { json?: unknown; raw?: boolean } = {}): Promise<T> {
  const { json, raw, ...rest } = init;
  for (let attempt = 0; ; attempt++) {
    const t = await accessToken(subject, scope);
    const r = await fetch(url, {
      ...rest,
      headers: { authorization: `Bearer ${t}`, ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    if ((r.status === 429 || r.status >= 500) && attempt < 8) {
      await Bun.sleep(Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500);
      continue;
    }
    if (!r.ok) {
      const body = await r.text();
      if (r.status === 403 && /quota|rate ?limit|userRateLimitExceeded/i.test(body) && attempt < 8) {
        await Bun.sleep(Math.min(60_000, 2000 * 2 ** attempt) + Math.random() * 1000);
        continue;
      }
      throw new GoogleError(r.status, `${r.status} ${rest.method ?? "GET"} ${url.split("?")[0]} ${body.slice(0, 300)}`);
    }
    if (raw) return r as unknown as T;
    const txt = await r.text();
    return (txt ? JSON.parse(txt) : null) as T;
  }
}

/** Run async tasks with bounded concurrency. */
export async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]!, idx);
      }
    }),
  );
  return out;
}

export * from "./gmail";
export * from "./drive";
export * from "./calendar";
