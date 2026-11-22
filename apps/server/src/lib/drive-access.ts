/**
 * Drive access per workspace:
 *  - Otopio Inc. / Megascale: shared drives of the otopio.ca Google Workspace (service account acting as contact@otopio.ca)
 *  - freelance workspaces: an « ERP » folder in the owner's personal Drive, through their OAuth connection
 *    (Settings → Comptes Google) — the ERP never reads or deletes anything outside that folder.
 */
import { like } from "drizzle-orm";
import { db, schema } from "@erp/db";
import { env } from "./env";
import type { Workspace } from "./workspace";

export const ADMIN = "contact@otopio.ca";

async function aesKey() {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`personal-google:${env.authSecret}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function seal(v: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(JSON.stringify(v))));
  return Buffer.from(new Uint8Array([...iv, ...ct])).toString("base64");
}
export async function unseal<T>(s: string): Promise<T> {
  const b = new Uint8Array(Buffer.from(s, "base64"));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, await aesKey(), b.slice(12));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

const tokenCache = new Map<string, { t: string; exp: number }>();
/** Access token of a connected personal Google account (whoever connected it). */
export async function personalAccessToken(email: string): Promise<string | null> {
  const c = tokenCache.get(email);
  if (c && c.exp > Date.now() + 60_000) return c.t;
  const rows = await db.select().from(schema.syncState).where(like(schema.syncState.key, `personal-google:%:${email.toLowerCase()}`));
  const row = rows.find((r) => !r.key.startsWith("personal-google:entity:") && !r.key.startsWith("personal-google:nonce:"));
  if (!row) return null;
  const { refreshToken } = await unseal<{ refreshToken: string }>(row.value);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: process.env.PERSONAL_GOOGLE_CLIENT_ID || env.googleClientId, client_secret: process.env.PERSONAL_GOOGLE_CLIENT_SECRET || env.googleClientSecret, grant_type: "refresh_token" }),
  });
  const t = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!t.access_token) return null;
  tokenCache.set(email, { t: t.access_token, exp: Date.now() + (t.expires_in ?? 3600) * 1000 });
  return t.access_token;
}

/** Subject to pass to @erp/google drive calls for this workspace. */
export async function driveSubject(ws: Pick<Workspace, "drive">) {
  const email = ws.drive?.personalEmail;
  if (!email) return ADMIN;
  const t = await personalAccessToken(email);
  if (!t) throw new Error(`Drive personnel non connecté (${email}) — connecte le compte dans Paramètres › Comptes Google`);
  return `oauth:${t}`;
}
