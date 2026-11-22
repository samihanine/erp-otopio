/**
 * Connected personal Gmail accounts → ERP (every 5 min).
 * Each account is bound to ONE legal entity (state key `personal-google:entity:<email>`, default for
 * megascale.technologie@gmail.com = MGS). Only that entity receives bills / data from it.
 *  - new mail is sorted into structured labels  <ENTITY>/Factures fournisseurs | Banque | Clients | Administratif | Autres
 *  - supplier invoices (PDF) → matched to an existing bill without justificatif (same amount ±0.02, date ±7 d) or created
 */
import { and, eq, like } from "drizzle-orm";
import { S3Client } from "bun";
import { db, schema } from "@erp/db";
import { ai, aiEnabled, getState, log, setState } from "./common";

const E = process.env;
const INVOICE = /\b(facture|invoice|receipt|reçu|justificatif|payment (received|confirmation)|votre paiement|billing statement)\b/i;
const DEFAULTS: Record<string, string> = { "megascale.technologie@gmail.com": "MGS", "sami.hanine22@gmail.com": "SHF", "maissane.t69@gmail.com": "MTF" };

async function key() {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`personal-google:${E.BETTER_AUTH_SECRET ?? ""}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
}
export async function unseal<T>(s: string): Promise<T> {
  const b = new Uint8Array(Buffer.from(s, "base64"));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, await key(), b.slice(12));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}
export async function accessToken(refreshToken: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: E.PERSONAL_GOOGLE_CLIENT_ID || E.GOOGLE_CLIENT_ID || "", client_secret: E.PERSONAL_GOOGLE_CLIENT_SECRET || E.GOOGLE_CLIENT_SECRET || "", grant_type: "refresh_token" }),
  });
  return ((await r.json()) as { access_token?: string }).access_token ?? null;
}

type Part = { filename?: string; mimeType?: string; body?: { attachmentId?: string; data?: string }; parts?: Part[] };
type Msg = { id: string; threadId: string; snippet?: string; internalDate: string; labelIds?: string[]; payload?: Part & { headers?: { name: string; value: string }[] } };
const hdr = (m: Msg, n: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";
const flat = (p?: Part): Part[] => (p ? [p, ...(p.parts ?? []).flatMap(flat)] : []);
const text = (m: Msg) => {
  const t = flat(m.payload).find((p) => p.mimeType === "text/plain" && p.body?.data);
  return t ? Buffer.from(t.body!.data!, "base64url").toString("utf8") : (m.snippet ?? "");
};

const s3 = () => new S3Client({ endpoint: E.R2_ENDPOINT, accessKeyId: E.R2_ACCESS_KEY_ID, secretAccessKey: E.R2_SECRET_ACCESS_KEY, bucket: E.R2_BUCKET ?? "otopio-erp" });

export async function syncPersonalGmail(full = false) {
  const rows = await db.select().from(schema.syncState).where(like(schema.syncState.key, "personal-google:%"));
  const entityRows = new Map(rows.filter((r) => r.key.startsWith("personal-google:entity:")).map((r) => [r.key.slice("personal-google:entity:".length), r.value]));
  const accounts = rows.filter((r) => !r.key.startsWith("personal-google:nonce:") && !r.key.startsWith("personal-google:entity:"));
  const out: Record<string, unknown> = {};
  for (const a of accounts) {
    const email = a.key.split(":").slice(2).join(":");
    const code = entityRows.get(email) ?? DEFAULTS[email];
    if (!code) continue; // accounts without an entity binding are never synced
    try {
      out[email] = await syncAccount(email, a.value, code, full);
    } catch (e) {
      out[email] = `error: ${(e as Error).message}`;
    }
  }
  return out;
}

async function syncAccount(email: string, sealed: string, code: string, full = false) {
  const { refreshToken } = await unseal<{ refreshToken: string }>(sealed);
  const token = await accessToken(refreshToken);
  if (!token) throw new Error("token refresh failed");
  const g = async <T>(path: string, init?: RequestInit) => {
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) } });
      if (r.ok) return (await r.json()) as T;
      const body = await r.text();
      // per-user rate limit → back off and retry
      if ((r.status === 429 || (r.status === 403 && /rate|quota/i.test(body))) && attempt < 5) {
        await new Promise((res) => setTimeout(res, 2000 * 2 ** attempt));
        continue;
      }
      throw new Error(`gmail ${r.status} ${path.slice(0, 40)} ${body.slice(0, 160)}`);
    }
  };
  const [entity] = await db.select().from(schema.legalEntity).where(eq(schema.legalEntity.code, code));
  if (!entity) return "unknown entity";
  const labelNames = ["Factures fournisseurs", "Banque", "Clients", "Administratif", "Autres"].map((n) => `${code === "MGS" ? "Megascale" : code}/${n}`);
  const existing = (await g<{ labels: { id: string; name: string }[] }>("labels")).labels;
  const labelId = new Map(existing.map((l) => [l.name, l.id]));
  for (const n of labelNames) if (!labelId.has(n)) labelId.set(n, (await g<{ id: string }>("labels", { method: "POST", body: JSON.stringify({ name: n }) })).id);
  const ours = new Set(labelNames.map((n) => labelId.get(n)!));
  const L = (n: string) => labelId.get(`${code === "MGS" ? "Megascale" : code}/${n}`)!;

  const stateKey = `pgmail:${email}:since`;
  const since = await getState(stateKey);
  // full = whole mailbox backfill (manual), otherwise incremental since the last run
  const q = full ? "-in:spam -in:trash" : since ? `after:${since} -in:spam -in:trash` : "newer_than:30d -in:spam -in:trash";
  const list: { messages: { id: string }[] } = { messages: [] };
  for (let page: string | undefined, i = 0; i < (full ? 40 : 3); i++) {
    const r = await g<{ messages?: { id: string }[]; nextPageToken?: string }>(`messages?q=${encodeURIComponent(q)}&maxResults=100${page ? `&pageToken=${page}` : ""}`);
    list.messages.push(...(r.messages ?? []));
    if (!(page = r.nextPageToken)) break;
  }
  const stats = { seen: 0, labelled: 0, billsAttached: 0, billsCreated: 0, aiErrors: 0 };
  const bills = await db.select().from(schema.transaction).where(and(eq(schema.transaction.workspaceId, entity.id), eq(schema.transaction.kind, "expense")));
  const invs = await db.select({ org: schema.transaction.organizationId }).from(schema.transaction).where(and(eq(schema.transaction.workspaceId, entity.id), eq(schema.transaction.kind, "invoice")));
  const orgs = await db.select().from(schema.organization).where(eq(schema.organization.workspaceId, entity.id));
  const clientIds = new Set(invs.map((i) => i.org));
  const GENERIC = /^(gmail|hotmail|outlook|yahoo|icloud|live|free|orange|wanadoo|laposte)\./;
  const clientDomains = new Set(
    orgs
      .filter((o) => clientIds.has(o.id))
      .flatMap((o) => [(o.email ?? "").split("@")[1] ?? "", (o.website ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? ""])
      .map((d) => d.toLowerCase())
      .filter((d) => d && !GENERIC.test(d)),
  );
  for (const { id } of list.messages ?? []) {
    const m = await g<Msg>(`messages/${id}?format=full`);
    if (m.labelIds?.some((l) => ours.has(l))) continue; // already sorted
    stats.seen++;
    const from = hdr(m, "From");
    const subject = hdr(m, "Subject");
    const pdfs = flat(m.payload).filter((p) => p.body?.attachmentId && (/pdf/i.test(p.mimeType ?? "") || /\.pdf$/i.test(p.filename ?? "")));
    const fromAddr = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
    const dom = fromAddr.split("@")[1] ?? "";
    let bucket = "Autres";
    if (/qonto|banque|bank|stripe|paypal|wise\.com/i.test(from)) bucket = "Banque";
    else if (/impots|finances\.gouv|dgfip|urssaf|greffe|inpi|infogreffe|insee|securite-sociale|ssi|net-entreprises|bpifrance|expert-?compt|assurance/i.test(`${from} ${dom}`)) bucket = "Administratif";
    else if (clientDomains.has(dom)) bucket = "Clients";
    else if (INVOICE.test(`${subject} ${m.snippet}`) || (pdfs.length && /facture|invoice|receipt|reçu/i.test(pdfs.map((p) => p.filename).join(" ")))) bucket = "Factures fournisseurs";
    await g(`messages/${id}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds: [L(bucket)] }) });
    stats.labelled++;
    if (bucket !== "Factures fournisseurs" || !aiEnabled() || !pdfs.length) continue;
    let x: { isSupplierInvoice: boolean; supplier: string; number: string | null; date: string | null; total: number | null; tax: number | null; currency: string; category: string };
    try {
      x = await ai<{ isSupplierInvoice: boolean; supplier: string; number: string | null; date: string | null; total: number | null; tax: number | null; currency: string; category: string }>(
      `Tu analyses un courriel reçu par ${entity.name}. Détermine s'il s'agit d'une facture ou d'un reçu FOURNISSEUR (dépense). Catégories : software, hosting, ai, subcontracting, legal, accounting, marketing, office, travel, other.`,
      `Expéditeur: ${from}\nObjet: ${subject}\nPièces jointes: ${pdfs.map((p) => p.filename).join(", ")}\n\n${text(m).slice(0, 5000)}\n\nJSON: {"isSupplierInvoice":bool,"supplier":string,"number":string|null,"date":"YYYY-MM-DD"|null,"total":number|null,"tax":number|null,"currency":"CAD"|"EUR"|"USD","category":string}`,
      true,
      "factures-boites-perso",
      );
    } catch (e) {
      // AI unavailable (quota…) → mail stays labelled, invoice will be retried by the alerts / next backfill
      stats.aiErrors++;
      await g(`messages/${id}/modify`, { method: "POST", body: JSON.stringify({ removeLabelIds: [L(bucket)] }) }); // retried next run
      continue;
    }
    if (!x.isSupplierInvoice) continue;
    const date = x.date ?? new Date(Number(m.internalDate)).toISOString().slice(0, 10);
    const same = (b: (typeof bills)[number]) => b.currency === (x.currency || b.currency) && x.total != null && Math.abs(Number(b.total) - x.total) < 0.02 && Math.abs(+new Date(b.date ?? date) - +new Date(date)) < 7 * 864e5;
    if (bills.some((b) => b.fileUrl && same(b)) || bills.some((b) => b.externalRef === `gmail:${id}`)) continue; // already documented
    const att = await g<{ data: string }>(`messages/${id}/attachments/${pdfs[0]!.body!.attachmentId}`);
    const data = new Uint8Array(Buffer.from(att.data, "base64url"));
    const name = `${date} — ${x.supplier} — Facture — ${x.number ?? pdfs[0]!.filename}`.replace(/\.pdf$/i, "") + ".pdf";
    const k = `bill/${crypto.randomUUID()}-${name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_")}`;
    await s3().write(k, data, { type: "application/pdf" });
    const [f] = await db.insert(schema.file).values({ workspaceId: entity.id, key: k, name, size: data.byteLength, mimeType: "application/pdf", table: "transaction" }).returning();
    const url = `${(E.APP_URL ?? "https://erp.otopio.ca").replace(/\/$/, "")}/api/files/${f!.id}`;
    // anti-doublon: attach to the Qonto-imported bill when it is the same expense
    const twin = bills.find((b) => !b.fileUrl && b.currency === (x.currency || b.currency) && x.total != null && Math.abs(Number(b.total) - x.total) < 0.02 && Math.abs(+new Date(b.date ?? date) - +new Date(date)) < 7 * 864e5);
    if (twin) {
      await db.update(schema.transaction).set({ fileUrl: url, number: twin.number ?? x.number, taxTotal: Number(twin.taxTotal) || x.tax || 0 }).where(eq(schema.transaction.id, twin.id));
      twin.fileUrl = url;
      stats.billsAttached++;
      await log("bill-receipt", "transaction", twin.id, `Justificatif ${x.supplier} (${email}) rattaché à « ${twin.label} »`);
      continue;
    }
    const dup = bills.find((b) => b.externalRef === `gmail:${id}`);
    if (dup) continue;
    const cats = ["software", "hosting", "ai", "subcontracting", "legal", "accounting", "marketing", "office", "travel", "other"];
    const [org] = await db.select().from(schema.organization).where(and(eq(schema.organization.workspaceId, entity.id), eq(schema.organization.name, x.supplier)));
    const supplier = org ?? (await db.insert(schema.organization).values({ workspaceId: entity.id, defaultEntityId: entity.id, name: x.supplier, type: "supplier", status: "active", notes: "Créé automatiquement depuis une facture reçue." }).returning())[0]!;
    const [b] = await db
      .insert(schema.transaction)
      .values({ kind: "expense", side: "debit", workspaceId: entity.id, label: `${x.supplier}${x.number ? ` — ${x.number}` : ""}`, number: x.number, legalEntityId: entity.id, organizationId: supplier.id, category: (cats.includes(x.category) ? x.category : "other") as never, status: "to_pay", date, currency: x.currency || entity.currency, total: x.total ?? 0, subtotal: (x.total ?? 0) - (x.tax ?? 0), taxTotal: x.tax ?? 0, fileUrl: url, externalRef: `gmail:${id}`, notes: `Détectée automatiquement dans ${email} (« ${subject} »).` })
      .returning({ id: schema.transaction.id });
    bills.push({ id: b!.id, fileUrl: url, externalRef: `gmail:${id}` } as never);
    stats.billsCreated++;
    await log("bill-detected", "transaction", b!.id, `Facture ${x.supplier} ${x.total ?? "?"} ${x.currency} détectée (${email}, ${code})`, { deleteRecord: { table: "transaction", id: b!.id } });
  }
  await setState(stateKey, new Date(Date.now() - 86_400_000).toISOString().slice(0, 10).replace(/-/g, "/"));
  return stats;
}
