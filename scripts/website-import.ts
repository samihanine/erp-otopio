/**
 * One-off import of the otopio.ca static content (projects, team) into the ERP website CMS.
 * Images are copied to the public R2 bucket (served by media.otopio.ca) through the Cloudflare API.
 *
 *   LANDING_DIR=../../landing ERP_URL=https://erp.otopio.ca ERP_PASSWORD=… \
 *   CF_EMAIL=… CF_KEY=… CF_ACCOUNT=… bun scripts/website-import.ts [--dry]
 * Idempotent: records are matched by slug and updated.
 */
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const LANDING = process.env.LANDING_DIR ?? "../../landing";
const BASE = process.env.ERP_URL ?? "https://erp.otopio.ca";
const BUCKET = process.env.R2_PUBLIC_BUCKET ?? "otopio-media";
const MEDIA = process.env.R2_PUBLIC_MEDIA_URL ?? "https://media.otopio.ca";
const DRY = process.argv.includes("--dry");

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm" };

async function login() {
  const r = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email: process.env.ERP_EMAIL, password: process.env.ERP_PASSWORD }),
  });
  if (!r.ok) throw new Error(`login ${r.status}`);
  return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

const uploaded = new Map<string, string>();
/** Copy an image (remote URL or landing /public path) to R2 and return its media.otopio.ca URL. */
async function rehost(src: string | undefined, folder: string): Promise<string | undefined> {
  if (!src) return src;
  if (src.startsWith(MEDIA)) return src;
  if (uploaded.has(src)) return uploaded.get(src);
  const name = src.split("/").pop()!.split("?")[0]!;
  const key = `${folder}/${name}`;
  const url = `${MEDIA}/${key}`;
  if (!DRY) {
    const body = src.startsWith("http") ? new Uint8Array(await (await fetch(src)).arrayBuffer()) : await readFile(join(LANDING, "public", src));
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "X-Auth-Email": process.env.CF_EMAIL!, "X-Auth-Key": process.env.CF_KEY!, "content-type": MIME[extname(name).toLowerCase()] ?? "application/octet-stream" },
      body,
    });
    if (!res.ok) throw new Error(`upload ${key}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  uploaded.set(src, url);
  return url;
}

async function main() {
  const { projects, tags } = await import(join(process.cwd(), LANDING, "src/data/projects.ts"));
  const { TEAM_GROUPS } = await import(join(process.cwd(), LANDING, "src/data/team.ts"));
  const cookie = await login();
  const api = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${BASE}/api/${path}`, { method, headers: { cookie, "content-type": "application/json", origin: BASE }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    return r.json();
  };
  const existing = async (table: string) => new Map(((await api("GET", `data/${table}?limit=1000`)).rows as { id: string; slug: string }[]).map((r) => [r.slug, r.id]));

  const tagName = (id: string) => tags.find((t: { id: string; name: string }) => t.id === id)?.name ?? id;
  const artIds = await existing("artifact");
  for (const [i, p] of (projects as any[]).entries()) {
    const sections = [];
    for (const s of p.sections ?? []) {
      sections.push({
        ...s,
        imageUrl: await rehost(s.imageUrl, `projects/${p.id}`),
        subsections: s.subsections ? await Promise.all(s.subsections.map(async (x: any) => ({ ...x, imageUrl: await rehost(x.imageUrl, `projects/${p.id}`) }))) : undefined,
      });
    }
    const row = {
      slug: p.id,
      title: p.title,
      customer: p.customer,
      status: "published",
      position: i + 1,
      summary: p.summary,
      description: p.description,
      imageUrl: await rehost(p.imageUrl, `projects/${p.id}`),
      url: p.url || null,
      startedAt: p.startedAt || null,
      endedAt: p.endedAt || null,
      tags: p.tagIds.map(tagName),
      lucideIcon: p.lucideIcon,
      hexColor: p.hexColor,
      sections,
    };
    if (DRY) console.log("artifact", row.slug, row.imageUrl, sections.length);
    else if (artIds.has(p.id)) await api("PATCH", `data/artifact/${artIds.get(p.id)}`, row);
    else await api("POST", "data/artifact", row);
    console.log("✓ artifact", p.id);
  }

  const teamIds = await existing("team_member");
  let pos = 0;
  for (const g of TEAM_GROUPS as any[]) {
    for (const m of g.members) {
      const row = { slug: m.id, name: m.name, role: m.role, bio: m.bio, group: g.id, status: "published", position: ++pos, imageUrl: await rehost(m.image, "team"), linkedin: m.linkedin };
      if (DRY) console.log("team", row);
      else if (teamIds.has(m.id)) await api("PATCH", `data/team_member/${teamIds.get(m.id)}`, row);
      else await api("POST", "data/team_member", row);
      console.log("✓ team", m.id);
    }
  }
  console.log(`images rehosted: ${uploaded.size}`);
}

await main();
