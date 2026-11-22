/**
 * Otopio MCP server — connect Claude (custom connector) or ChatGPT (connector) to all Otopio data.
 *
 *  - OAuth 2.1 authorization server (dynamic client registration, PKCE S256), login with the ERP account
 *  - Streamable-HTTP MCP endpoint (stateless JSON-RPC) at /api/mcp
 *  - Read-only tools: search, fetch, query tables, finance, Drive documents, Gmail, Calendar
 */
import { Hono, type Context } from "hono";
import { and, eq, gt, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@erp/db";
import { TABLES, TABLE_KEYS, type TableKey } from "@erp/shared";
import { calendar, drive, FOLDER, gmail, googleConfigured, header, textBody, gfetch, SCOPES } from "@erp/google";
import { auth } from "../lib/auth";
import { env } from "../lib/env";
import { buildOrder, buildWhere, columns, isTableKey, labelExpr, resolveRefs, TABLE_MAP } from "../lib/data";

const ISSUER = () => env.authUrl.replace(/\/$/, "");
const sha = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
const rand = (n = 32) => Buffer.from(crypto.getRandomValues(new Uint8Array(n))).toString("base64url");
const MAILBOXES = ["contact@otopio.ca", "sami@otopio.ca", "maissane@otopio.ca", "noah@otopio.ca"];
const ADMIN_SUBJECT = "contact@otopio.ca";

/* -------------------------------------------------------------------------- */
/*  OAuth discovery + endpoints                                               */
/* -------------------------------------------------------------------------- */

export const wellKnown = new Hono();
const asMetadata = () => ({
  issuer: ISSUER(),
  authorization_endpoint: `${ISSUER()}/api/mcp/oauth/authorize`,
  token_endpoint: `${ISSUER()}/api/mcp/oauth/token`,
  registration_endpoint: `${ISSUER()}/api/mcp/oauth/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
  scopes_supported: ["otopio"],
});
const prMetadata = () => ({ resource: `${ISSUER()}/api/mcp`, authorization_servers: [ISSUER()], scopes_supported: ["otopio"], bearer_methods_supported: ["header"] });
wellKnown.get("/oauth-authorization-server", (c) => c.json(asMetadata()));
wellKnown.get("/oauth-authorization-server/*", (c) => c.json(asMetadata()));
wellKnown.get("/openid-configuration", (c) => c.json(asMetadata()));
wellKnown.get("/oauth-protected-resource", (c) => c.json(prMetadata()));
wellKnown.get("/oauth-protected-resource/*", (c) => c.json(prMetadata()));

export const mcp = new Hono();

mcp.post("/oauth/register", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { client_name?: string; redirect_uris?: string[] };
  const id = `mcp_${rand(16)}`;
  await db.insert(schema.mcpClient).values({ id, name: b.client_name ?? "MCP client", redirectUris: b.redirect_uris ?? [] });
  return c.json(
    {
      client_id: id,
      client_name: b.client_name ?? "MCP client",
      redirect_uris: b.redirect_uris ?? [],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      client_id_issued_at: Math.floor(Date.now() / 1000),
    },
    201,
  );
});

const page = (title: string, body: string) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a1430;font-family:Inter,system-ui,sans-serif;color:#0d1326}
.card{background:#fff;border-radius:18px;padding:32px;width:min(92vw,420px);box-shadow:0 20px 60px rgba(0,0,0,.35)}h1{font-size:20px;margin:0 0 8px}p{color:#5f6577;font-size:14px;line-height:1.5}
.row{display:flex;gap:8px;margin-top:20px}button{flex:1;height:40px;border-radius:10px;border:1px solid #e7e7ea;background:#fff;font-weight:600;font-size:14px;cursor:pointer}
button.primary{background:#0a1430;color:#fff;border-color:#0a1430}ul{font-size:13px;color:#5f6577;padding-left:18px}</style></head><body><div class="card">${body}</div></body></html>`;

mcp.get("/oauth/authorize", async (c) => {
  const q = c.req.query();
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.redirect(`/login?next=${encodeURIComponent(c.req.url.replace(/^https?:\/\/[^/]+/, ""))}`);
  const [client] = await db.select().from(schema.mcpClient).where(eq(schema.mcpClient.id, q.client_id ?? ""));
  if (!client) return c.html(page("Erreur", `<h1>Client inconnu</h1><p>Reconnectez le connecteur depuis Claude ou ChatGPT.</p>`), 400);
  if (q.response_type !== "code" || !q.code_challenge || (q.code_challenge_method ?? "S256") !== "S256") return c.html(page("Erreur", "<h1>Requête invalide</h1><p>PKCE S256 requis.</p>"), 400);
  if (client.redirectUris.length && !client.redirectUris.includes(q.redirect_uri ?? "")) return c.html(page("Erreur", "<h1>redirect_uri non autorisée</h1>"), 400);
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  const hidden = Object.entries(q)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("");
  return c.html(
    page(
      "Autoriser l'accès",
      `<h1>Connecter « ${esc(client.name)} » à Otopio</h1>
<p>Connecté en tant que <b>${esc(session.user.email)}</b>. Ce connecteur pourra <b>lire</b> les données d'Otopio :</p>
<ul><li>base de données ERP (clients, projets, factures, dépenses…)</li><li>documents des Drive partagés</li><li>courriels et agendas de l'équipe</li></ul>
<form method="post" action="/api/mcp/oauth/authorize">${hidden}<div class="row"><button name="decision" value="deny">Refuser</button><button class="primary" name="decision" value="allow">Autoriser</button></div></form>`,
    ),
  );
});

mcp.post("/oauth/authorize", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.text("Unauthorized", 401);
  const f = Object.fromEntries((await c.req.formData()).entries()) as Record<string, string>;
  const redirect = new URL(f.redirect_uri!);
  if (f.state) redirect.searchParams.set("state", f.state);
  if (f.decision !== "allow") {
    redirect.searchParams.set("error", "access_denied");
    return c.redirect(redirect.toString());
  }
  const code = rand();
  await db.insert(schema.mcpToken).values({
    kind: "code",
    tokenHash: sha(code),
    clientId: f.client_id!,
    userId: session.user.id,
    codeChallenge: f.code_challenge,
    redirectUri: f.redirect_uri,
    expiresAt: new Date(Date.now() + 5 * 60_000),
  });
  redirect.searchParams.set("code", code);
  return c.redirect(redirect.toString());
});

async function issueTokens(clientId: string, userId: string) {
  const access = rand(), refresh = rand();
  await db.insert(schema.mcpToken).values([
    { kind: "access", tokenHash: sha(access), clientId, userId, expiresAt: new Date(Date.now() + 7 * 864e5) },
    { kind: "refresh", tokenHash: sha(refresh), clientId, userId, expiresAt: new Date(Date.now() + 90 * 864e5) },
  ]);
  return { access_token: access, token_type: "Bearer", expires_in: 7 * 86400, refresh_token: refresh, scope: "otopio" };
}

mcp.post("/oauth/token", async (c) => {
  const ct = c.req.header("content-type") ?? "";
  const f = (ct.includes("json") ? await c.req.json() : Object.fromEntries((await c.req.formData()).entries())) as Record<string, string>;
  const basic = c.req.header("authorization")?.match(/^Basic (.+)$/)?.[1];
  const clientId = f.client_id ?? (basic ? Buffer.from(basic, "base64").toString().split(":")[0] : undefined);
  if (f.grant_type === "authorization_code") {
    const [row] = await db.select().from(schema.mcpToken).where(and(eq(schema.mcpToken.tokenHash, sha(f.code ?? "")), eq(schema.mcpToken.kind, "code"), gt(schema.mcpToken.expiresAt, new Date())));
    if (!row || (clientId && row.clientId !== clientId)) return c.json({ error: "invalid_grant" }, 400);
    const challenge = Buffer.from(new Bun.CryptoHasher("sha256").update(f.code_verifier ?? "").digest()).toString("base64url");
    if (challenge !== row.codeChallenge) return c.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
    await db.delete(schema.mcpToken).where(eq(schema.mcpToken.id, row.id));
    return c.json(await issueTokens(row.clientId, row.userId));
  }
  if (f.grant_type === "refresh_token") {
    const [row] = await db.select().from(schema.mcpToken).where(and(eq(schema.mcpToken.tokenHash, sha(f.refresh_token ?? "")), eq(schema.mcpToken.kind, "refresh"), gt(schema.mcpToken.expiresAt, new Date())));
    if (!row) return c.json({ error: "invalid_grant" }, 400);
    await db.delete(schema.mcpToken).where(eq(schema.mcpToken.id, row.id));
    return c.json(await issueTokens(row.clientId, row.userId));
  }
  return c.json({ error: "unsupported_grant_type" }, 400);
});

async function bearerUser(c: Context) {
  const tok = c.req.header("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!tok) return null;
  const [row] = await db
    .select({ id: schema.mcpToken.id, userId: schema.mcpToken.userId, email: schema.user.email, name: schema.user.name })
    .from(schema.mcpToken)
    .innerJoin(schema.user, eq(schema.user.id, schema.mcpToken.userId))
    .where(and(eq(schema.mcpToken.tokenHash, sha(tok)), eq(schema.mcpToken.kind, "access"), gt(schema.mcpToken.expiresAt, new Date())));
  if (row) db.update(schema.mcpToken).set({ lastUsedAt: new Date() }).where(eq(schema.mcpToken.id, row.id)).catch(() => {});
  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Tools                                                                     */
/* -------------------------------------------------------------------------- */

type Tool = { name: string; title: string; description: string; inputSchema: Record<string, unknown>; run: (args: Record<string, any>, user: { email: string }) => Promise<unknown> };
const str = (description: string) => ({ type: "string", description });
const tableEnum = { type: "string", enum: TABLE_KEYS, description: "Table ERP" };
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function erpSearch(q: string, limit = 5) {
  const out: { id: string; title: string; table: TableKey }[] = [];
  for (const k of TABLE_KEYS) {
    const cols = columns(k);
    const conds = TABLES[k].searchFields.map((f) => cols[f]).filter(Boolean).map((col) => ilike(col!, `%${q}%`));
    if (!conds.length) continue;
    const rows = await db.select({ id: cols.id!, label: labelExpr(k) }).from(TABLE_MAP[k]).where(or(...conds)).limit(limit);
    out.push(...rows.map((r) => ({ id: `erp:${k}:${r.id}`, title: `${TABLES[k].singular.fr} — ${r.label}`, table: k })));
  }
  return out;
}

async function driveSearch(q: string, limit = 10) {
  if (!googleConfigured()) return [];
  const files = await drive.list(ADMIN_SUBJECT, `trashed=false and mimeType!='${FOLDER}' and (name contains '${q.replace(/'/g, "\\'")}' or fullText contains '${q.replace(/'/g, "\\'")}')`, { corpora: "allDrives" });
  return files.slice(0, limit).map((f) => ({ id: `drive:${f.id}`, title: f.name, url: f.webViewLink, modified: f.modifiedTime, mimeType: f.mimeType }));
}

async function driveText(fileId: string) {
  const f = await drive.get(ADMIN_SUBJECT, fileId);
  const exportAs = (mime: string) => gfetch<Response>(ADMIN_SUBJECT, SCOPES.drive, `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(mime)}`, { raw: true }).then((r) => r.text());
  let text = "";
  if (f.mimeType === "application/vnd.google-apps.document" || f.mimeType === "application/vnd.google-apps.presentation") text = await exportAs("text/plain");
  else if (f.mimeType === "application/vnd.google-apps.spreadsheet") text = await exportAs("text/csv");
  else if (f.mimeType === "application/pdf" || f.mimeType.includes("wordprocessingml") || f.mimeType === "application/msword") {
    // Convert a temporary copy to a Google Doc (OCR for PDFs), export as text, then delete the copy.
    const copy = await gfetch<{ id: string }>(ADMIN_SUBJECT, SCOPES.drive, `https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true`, {
      method: "POST",
      json: { name: `[tmp-mcp] ${f.name}`, mimeType: "application/vnd.google-apps.document", parents: f.parents },
    });
    try {
      text = await gfetch<Response>(ADMIN_SUBJECT, SCOPES.drive, `https://www.googleapis.com/drive/v3/files/${copy.id}/export?mimeType=text/plain`, { raw: true }).then((r) => r.text());
    } finally {
      await gfetch(ADMIN_SUBJECT, SCOPES.drive, `https://www.googleapis.com/drive/v3/files/${copy.id}?supportsAllDrives=true`, { method: "DELETE" }).catch(() => {});
    }
  } else if (f.mimeType.startsWith("text/")) text = new TextDecoder().decode(await drive.download(ADMIN_SUBJECT, fileId));
  else text = `(Aperçu texte indisponible pour ${f.mimeType})`;
  return { id: `drive:${f.id}`, title: f.name, url: f.webViewLink, text: text.slice(0, 60_000), metadata: { mimeType: f.mimeType, modified: f.modifiedTime } };
}

async function recordFull(table: TableKey, id: string) {
  const cols = columns(table);
  const [row] = await db.select().from(TABLE_MAP[table]).where(eq(cols.id!, id));
  if (!row) return null;
  const refs = await resolveRefs(table, [row as Record<string, unknown>]);
  const related: Record<string, unknown[]> = {};
  for (const t of Object.values(TABLES))
    for (const f of t.fields)
      if (f.type === "relation" && f.relation === table) {
        const col = columns(t.key)[f.key];
        if (!col) continue;
        const rows = await db.select({ id: columns(t.key).id!, label: labelExpr(t.key) }).from(TABLE_MAP[t.key]).where(eq(col, id)).limit(30);
        if (rows.length) related[`${t.key}.${f.key}`] = rows;
      }
  return { row, refs, related };
}

const TOOLS: Tool[] = [
  {
    name: "search",
    title: "Recherche globale",
    description: "Recherche dans toutes les données d'Otopio : ERP (clients, contacts, projets, tâches, factures, devis, dépenses, communications…) et documents des Drive partagés. Retourne des identifiants à passer à `fetch`.",
    inputSchema: { type: "object", properties: { query: str("Texte recherché") }, required: ["query"] },
    run: async ({ query }) => {
      const [erp, docs] = await Promise.all([erpSearch(query), driveSearch(query, 10).catch(() => [])]);
      return { results: [...erp.map((r) => ({ id: r.id, title: r.title, url: `${ISSUER()}/db/${r.table}/${r.id.split(":")[2]}` })), ...docs.map((d) => ({ id: d.id, title: `Document — ${d.title}`, url: d.url }))] };
    },
  },
  {
    name: "fetch",
    title: "Lire un élément",
    description: "Retourne le contenu complet d'un résultat de `search` : fiche ERP avec ses éléments liés (`erp:<table>:<id>`), texte d'un document Drive (`drive:<fileId>`) ou fil de courriels (`gmail:<boîte>:<threadId>`).",
    inputSchema: { type: "object", properties: { id: str("Identifiant renvoyé par search") }, required: ["id"] },
    run: async ({ id }) => {
      const [kind, a, b] = String(id).split(":");
      if (kind === "erp" && isTableKey(a!)) {
        const r = await recordFull(a, b!);
        return { id, title: `${TABLES[a].singular.fr}`, text: JSON.stringify(r, null, 1), url: `${ISSUER()}/db/${a}/${b}` };
      }
      if (kind === "drive") return driveText(a!);
      if (kind === "gmail") return readThread(a!, b!);
      throw new Error("Identifiant inconnu");
    },
  },
  {
    name: "list_tables",
    title: "Lister les tables",
    description: "Liste les tables de l'ERP avec leurs champs (clé, libellé, type, options) pour construire des requêtes `query_records`.",
    inputSchema: { type: "object", properties: {} },
    run: async () =>
      Object.values(TABLES).map((t) => ({
        table: t.key,
        label: t.label.fr,
        fields: t.fields.map((f) => ({ key: f.key, label: f.label.fr, type: f.type, ...(f.relation ? { relation: f.relation } : {}), ...(f.options ? { options: f.options.map((o) => o.value) } : {}) })),
      })),
  },
  {
    name: "query_records",
    title: "Interroger une table",
    description:
      "Liste les enregistrements d'une table ERP avec filtres et tris. Opérateurs : contains, eq, neq, gt, gte, lt, lte, in, not_in, is_empty, is_not_empty, before, after, this_week, this_month, this_year, past_due. Les relations sont résolues en libellés.",
    inputSchema: {
      type: "object",
      properties: {
        table: tableEnum,
        search: str("Recherche texte libre (optionnel)"),
        filters: { type: "array", items: { type: "object", properties: { field: { type: "string" }, op: { type: "string" }, value: {} }, required: ["field", "op"] } },
        sorts: { type: "array", items: { type: "object", properties: { field: { type: "string" }, dir: { type: "string", enum: ["asc", "desc"] } } } },
        limit: { type: "number", description: "Max 200 (défaut 50)" },
      },
      required: ["table"],
    },
    run: async ({ table, search, filters = [], sorts = [], limit = 50 }) => {
      if (!isTableKey(table)) throw new Error("Table inconnue");
      const rows = await db
        .select()
        .from(TABLE_MAP[table])
        .where(buildWhere(table, filters, "and", search))
        .orderBy(...buildOrder(table, sorts))
        .limit(Math.min(Number(limit) || 50, 200));
      const refs = await resolveRefs(table, rows as Record<string, unknown>[]);
      const rel = TABLES[table].fields.filter((f) => f.type === "relation");
      return rows.map((r) => {
        const o: Record<string, unknown> = { ...(r as Record<string, unknown>) };
        for (const f of rel) if (o[f.key]) o[`${f.key}Label`] = refs[f.relation!]?.[String(o[f.key])]?.label;
        delete o.lines;
        return o;
      });
    },
  },
  {
    name: "get_record",
    title: "Fiche complète",
    description: "Retourne un enregistrement ERP et tous les éléments qui lui sont liés (ex. un client avec ses contacts, projets, factures, communications).",
    inputSchema: { type: "object", properties: { table: tableEnum, id: str("UUID") }, required: ["table", "id"] },
    run: async ({ table, id }) => (isTableKey(table) ? recordFull(table, id) : null),
  },
  {
    name: "finance_summary",
    title: "Synthèse financière",
    description: "Chiffre d'affaires, encaissements, montants à encaisser et en retard, dépenses, marge, répartition mensuelle et par client, et points de rapprochement, pour une année et une structure (Megascale FR / Otopio Inc. CA / toutes consolidées en CAD).",
    inputSchema: { type: "object", properties: { year: { type: "number" }, entity: str("all | MGS | OTP") } },
    run: async ({ year, entity = "all" }) => {
      let ent = "all";
      if (entity && entity !== "all") {
        const [e] = await db.select({ id: schema.legalEntity.id }).from(schema.legalEntity).where(or(eq(schema.legalEntity.code, String(entity).toUpperCase()), eq(schema.legalEntity.id, String(entity))));
        ent = e?.id ?? "all";
      }
      const res = await fetch(`http://localhost:${env.port}/api/finance/summary?year=${year ?? new Date().getFullYear()}&entity=${ent}`, { headers: { "x-internal": internalKey } });
      return res.json();
    },
  },
  {
    name: "search_documents",
    title: "Chercher des documents",
    description: "Recherche plein texte dans les Drive partagés (Clients, Administratif). Utiliser `fetch` avec l'id pour lire le contenu.",
    inputSchema: { type: "object", properties: { query: str("Mots-clés"), limit: { type: "number" } }, required: ["query"] },
    run: async ({ query, limit = 15 }) => driveSearch(query, limit),
  },
  {
    name: "list_folder",
    title: "Explorer un dossier Drive",
    description: "Liste le contenu d'un dossier Drive (id de dossier) ou, sans id, les Drive partagés.",
    inputSchema: { type: "object", properties: { folderId: str("Id du dossier (optionnel)") } },
    run: async ({ folderId }) => {
      if (!folderId) return drive.sharedDrives(ADMIN_SUBJECT);
      const files = await drive.list(ADMIN_SUBJECT, `'${folderId}' in parents and trashed=false`, { corpora: "allDrives" });
      return files.map((f) => ({ id: f.id, name: f.name, folder: f.mimeType === FOLDER, mimeType: f.mimeType, modified: f.modifiedTime, url: f.webViewLink }));
    },
  },
  {
    name: "search_emails",
    title: "Chercher des courriels",
    description: `Recherche Gmail (syntaxe Gmail : from:, to:, subject:, after:YYYY/MM/DD, label:…) dans une boîte (${MAILBOXES.join(", ")}) ou toutes. Retourne des ids \`gmail:<boîte>:<threadId>\` à lire avec \`fetch\`.`,
    inputSchema: { type: "object", properties: { query: str("Requête Gmail"), mailbox: str("Boîte (optionnel, toutes par défaut)"), limit: { type: "number" } }, required: ["query"] },
    run: async ({ query, mailbox, limit = 10 }) => {
      const boxes = mailbox ? [mailbox] : MAILBOXES;
      const out: unknown[] = [];
      for (const box of boxes) {
        const ids = (await gmail.listThreads(box, query, limit)).slice(0, limit);
        for (const tid of ids) {
          const t = await gmail.thread(box, tid);
          const last = t.messages.at(-1)!;
          out.push({ id: `gmail:${box}:${tid}`, mailbox: box, subject: header(t.messages[0]!, "Subject"), from: header(last, "From"), date: header(last, "Date"), snippet: last.snippet, messages: t.messages.length });
        }
      }
      return out;
    },
  },
  {
    name: "calendar_events",
    title: "Agenda",
    description: "Événements des agendas de l'équipe entre deux dates (défaut : 7 derniers jours → 14 prochains jours). Filtre optionnel par personne (email).",
    inputSchema: { type: "object", properties: { from: str("YYYY-MM-DD"), to: str("YYYY-MM-DD"), person: str("email @otopio.ca (optionnel)") } },
    run: async ({ from, to, person }) => {
      const timeMin = new Date(from ?? isoDay(new Date(Date.now() - 7 * 864e5))).toISOString();
      const timeMax = new Date(to ?? isoDay(new Date(Date.now() + 14 * 864e5))).toISOString();
      const out: unknown[] = [];
      for (const u of person ? [person] : MAILBOXES) {
        const { items } = await calendar.events(u, "primary", { timeMin, timeMax }).catch(() => ({ items: [] }));
        for (const e of items) {
          if (e.visibility === "private") {
            out.push({ calendar: u, title: "Occupé", start: e.start.dateTime ?? e.start.date, end: e.end.dateTime ?? e.end.date });
            continue;
          }
          out.push({ calendar: u, title: e.summary, start: e.start.dateTime ?? e.start.date, end: e.end.dateTime ?? e.end.date, attendees: e.attendees?.map((a) => a.email), meet: e.hangoutLink, location: e.location });
        }
      }
      return out;
    },
  },
];

async function readThread(box: string, threadId: string) {
  const t = await gmail.thread(box, threadId, "full");
  const msgs = t.messages.map((m) => `De: ${header(m, "From")}\nÀ: ${header(m, "To")}\nDate: ${header(m, "Date")}\nObjet: ${header(m, "Subject")}\n\n${textBody(m).slice(0, 8000)}`);
  return { id: `gmail:${box}:${threadId}`, title: header(t.messages[0]!, "Subject"), url: `https://mail.google.com/mail/?authuser=${box}#all/${threadId}`, text: msgs.join("\n\n---\n\n").slice(0, 60_000) };
}

/** Lets MCP tools call internal routes (e.g. finance) without a browser session. */
export const internalKey = rand(24);

/* -------------------------------------------------------------------------- */
/*  JSON-RPC endpoint                                                         */
/* -------------------------------------------------------------------------- */

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, any> };

mcp.get("/", (c) => c.json({ error: "Use POST (MCP streamable HTTP)" }, 405));
mcp.delete("/", (c) => c.body(null, 204));
mcp.post("/", async (c) => {
  const user = await bearerUser(c);
  if (!user) {
    c.header("WWW-Authenticate", `Bearer realm="otopio", resource_metadata="${ISSUER()}/.well-known/oauth-protected-resource"`);
    return c.json({ error: "unauthorized" }, 401);
  }
  const body = (await c.req.json()) as Rpc | Rpc[];
  const handle = async (m: Rpc) => {
    const ok = (result: unknown) => ({ jsonrpc: "2.0", id: m.id ?? null, result });
    const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: m.id ?? null, error: { code, message } });
    switch (m.method) {
      case "initialize":
        return ok({
          protocolVersion: m.params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "otopio", title: "Otopio ERP", version: "1.0.0" },
          instructions:
            "Serveur de données d'Otopio (agence TI Montréal/Lyon ; structures Megascale FR en EUR et Otopio Inc. CA en CAD). Commence par `search` ou `query_records` ; `list_tables` décrit les champs. Lecture seule.",
        });
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: TOOLS.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema, annotations: { readOnlyHint: true } })) });
      case "tools/call": {
        const tool = TOOLS.find((t) => t.name === m.params?.name);
        if (!tool) return err(-32602, `Outil inconnu: ${m.params?.name}`);
        try {
          const data = await tool.run(m.params?.arguments ?? {}, user);
          const text = typeof data === "string" ? data : JSON.stringify(data, null, 1);
          await db.insert(schema.activity).values({ table: "mcp", recordId: crypto.randomUUID(), action: `mcp:${tool.name}`, comment: JSON.stringify(m.params?.arguments ?? {}).slice(0, 500), userId: user.userId }).catch(() => {});
          return ok({ content: [{ type: "text", text: text.slice(0, 100_000) }], ...(data && typeof data === "object" && !Array.isArray(data) ? { structuredContent: data } : {}) });
        } catch (e) {
          return ok({ content: [{ type: "text", text: `Erreur : ${(e as Error).message}` }], isError: true });
        }
      }
      default:
        if (m.method?.startsWith("notifications/")) return null;
        return err(-32601, `Méthode non supportée: ${m.method}`);
    }
  };
  if (Array.isArray(body)) {
    const res = (await Promise.all(body.map(handle))).filter(Boolean);
    return res.length ? c.json(res) : c.body(null, 202);
  }
  const res = await handle(body);
  return res ? c.json(res) : c.body(null, 202);
});

export { sql };
