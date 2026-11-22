/**
 * Qonto → ERP (Megascale Technologie SARL, every 15 min)
 *  - settled transactions → `transaction` rows (idempotent: externalRef = "qonto:<last id segment>", same as the CSV import)
 *  - debits → a supplier `bill` (paid, categorised by rules, VAT from Qonto) linked to the transaction
 *  - credits matching an open sales invoice (same amount, EUR) → invoice marked paid + linked
 *  - Qonto attachments (justificatifs) → R2 (`file` row) and bill.fileUrl
 * Auth: QONTO_LOGIN (organization slug) + QONTO_SECRET_KEY (alias QONTO_ID / QONTO_API_KEY).
 */
import { eq } from "drizzle-orm";
import { S3Client } from "bun";
import { db, schema } from "@erp/db";
import { log, setState } from "./common";

const E = process.env;
const LOGIN = E.QONTO_LOGIN ?? "";
const SECRET = E.QONTO_SECRET_KEY ?? E.QONTO_ID ?? E.QONTO_API_KEY ?? "";
export const qontoConfigured = () => Boolean(LOGIN && SECRET);
const API = E.QONTO_API_URL ?? "https://thirdparty.qonto.com/v2";

type QTx = {
  transaction_id: string;
  amount: number;
  currency: string;
  side: "credit" | "debit";
  label: string;
  settled_at: string | null;
  emitted_at: string;
  status: string;
  operation_type?: string;
  vat_amount?: number | null;
  note?: string | null;
  reference?: string | null;
  attachment_ids?: string[];
  attachment_lost?: boolean;
  category?: string;
};

async function q<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `${LOGIN}:${SECRET}`, accept: "application/json" } });
  if (!res.ok) throw new Error(`Qonto ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** Supplier → bill category (anything unknown stays "other" = to categorise, flagged in alerts). */
const RULES: [RegExp, string][] = [
  [/anthropic|openai|chatgpt|claude|mistral|midjourney/i, "ai"],
  [/digitalocean|ovh|godaddy|cloudflare|vercel|hetzner|aws|amazon web|scaleway|dokploy|namecheap/i, "hosting"],
  [/qonto|frais de change|fx fee|commission|stripe fee/i, "bank_fees"],
  [/brevo|sendinblue|google|workspace|notion|figma|github|slack|zoom|adobe|microsoft|1password|linear|rapidapi|intuit|quickbooks/i, "software"],
  [/kiwi|sncf|air france|ryanair|easyjet|booking|airbnb|uber|bolt|trainline|flixbus/i, "travel"],
  [/emergence|loyer|coworking|regus|bureau/i, "office"],
  [/expert|comptab|compta/i, "accounting"],
  [/avocat|juridique|legal|inpi|greffe/i, "legal"],
  [/meta ads|google ads|linkedin|facebook|canva|mailchimp/i, "marketing"],
];
export const categorize = (s: string) => RULES.find(([r]) => r.test(s))?.[1] ?? "other";

const s3 = () => new S3Client({ endpoint: E.R2_ENDPOINT, accessKeyId: E.R2_ACCESS_KEY_ID, secretAccessKey: E.R2_SECRET_ACCESS_KEY, bucket: E.R2_BUCKET ?? "otopio-erp" });
const appUrl = () => (E.APP_URL ?? "https://erp.otopio.ca").replace(/\/$/, "");

/** Download a Qonto attachment into R2 and return its ERP url. */
async function storeAttachment(attId: string, table: string, recordId: string) {
  const a = await q<{ attachment: { id: string; file_name: string; file_content_type: string; file_size: string | number; url: string } }>(`/attachments/${attId}`);
  const res = await fetch(a.attachment.url);
  if (!res.ok) return null;
  const data = new Uint8Array(await res.arrayBuffer());
  const name = a.attachment.file_name || `${attId}.pdf`;
  const safe = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_");
  const key = `${table}/${crypto.randomUUID()}-${safe}`;
  const mime = a.attachment.file_content_type || "application/pdf";
  await s3().write(key, data, { type: mime });
  const [row] = await db.insert(schema.file).values({ key, name, size: data.byteLength, mimeType: mime, table, recordId }).returning();
  return `${appUrl()}/api/files/${row!.id}`;
}

export async function syncQonto() {
  if (!qontoConfigured()) return null;
  const [mgs] = await db.select().from(schema.legalEntity).where(eq(schema.legalEntity.code, "MGS"));
  if (!mgs) return null;
  const org = await q<{ organization: { bank_accounts: { id: string; status?: string; currency?: string; balance_cents?: number }[] } }>("/organization");
  const stats = { created: 0, bills: 0, invoicesPaid: 0, attachments: 0, skipped: 0 };
  const existing = await db.select().from(schema.transaction).where(eq(schema.transaction.legalEntityId, mgs.id));
  const have = new Map(existing.map((t) => [t.externalRef, t]));
  const openInvoices = await db.select().from(schema.invoice).where(eq(schema.invoice.legalEntityId, mgs.id));
  const usedInvoice = new Set(existing.map((t) => t.invoiceId).filter(Boolean));
  let balance = 0;

  for (const acc of org.organization.bank_accounts) {
    if (acc.status && acc.status !== "active") continue;
    balance += (acc.balance_cents ?? 0) / 100;
    const all: QTx[] = [];
    for (let page = 1; page < 100; page++) {
      const r = await q<{ transactions: QTx[]; meta: { next_page: number | null } }>(`/transactions?bank_account_id=${acc.id}&status[]=completed&per_page=100&current_page=${page}&sort_by=settled_at:desc`);
      all.push(...r.transactions);
      if (!r.meta.next_page) break;
    }
    all.sort((a, b) => String(a.settled_at ?? a.emitted_at).localeCompare(String(b.settled_at ?? b.emitted_at)));
    for (const t of all) {
      const ref = `qonto:${t.transaction_id.split("-").pop()}`;
      const known = have.get(ref);
      const date = String(t.settled_at ?? t.emitted_at).slice(0, 10);
      if (known) {
        // late-arriving justificatif on an already imported debit
        if (known.billId && t.attachment_ids?.length) {
          const [b] = await db.select().from(schema.bill).where(eq(schema.bill.id, known.billId));
          if (b && !b.fileUrl) {
            const url = await storeAttachment(t.attachment_ids[0]!, "bill", b.id).catch(() => null);
            if (url) {
              await db.update(schema.bill).set({ fileUrl: url }).where(eq(schema.bill.id, b.id));
              stats.attachments++;
              await log("qonto-receipt", "bill", b.id, `Justificatif Qonto rattaché à « ${b.label} »`);
            }
          }
        }
        stats.skipped++;
        continue;
      }
      // fallback anti-doublon: same date + amount + side already present (e.g. imported by hand)
      const twin = existing.find((x) => x.date === date && x.side === t.side && Math.abs(Number(x.amount) - t.amount) < 0.005 && !String(x.externalRef ?? "").startsWith("qonto:"));
      if (twin) {
        await db.update(schema.transaction).set({ externalRef: ref, source: "qonto" }).where(eq(schema.transaction.id, twin.id));
        continue;
      }
      const debit = t.side === "debit";
      let billId: string | null = null;
      let invoiceId: string | null = null;
      if (debit) {
        const vat = t.vat_amount ? Number(t.vat_amount) : 0;
        const [b] = await db
          .insert(schema.bill)
          .values({
            label: `${t.label}${t.reference ? ` — ${t.reference}` : ""}`.slice(0, 200),
            legalEntityId: mgs.id,
            category: categorize(`${t.label} ${t.reference ?? ""}`) as never,
            status: "paid",
            issueDate: date,
            paidAt: date,
            currency: t.currency,
            total: t.amount,
            subtotal: Math.round((t.amount - vat) * 100) / 100,
            taxTotal: vat,
            paidBy: "entity",
            paymentMethod: t.operation_type === "card" ? "Carte Qonto Megascale" : t.operation_type === "direct_debit" ? "Prélèvement Qonto" : "Virement Qonto",
            externalRef: ref,
            notes: "Importé automatiquement depuis Qonto.",
          })
          .returning({ id: schema.bill.id });
        billId = b!.id;
        stats.bills++;
        if (t.attachment_ids?.length) {
          const url = await storeAttachment(t.attachment_ids[0]!, "bill", billId).catch(() => null);
          if (url) {
            await db.update(schema.bill).set({ fileUrl: url }).where(eq(schema.bill.id, billId));
            stats.attachments++;
          }
        }
      } else {
        const inv = openInvoices.find((i) => !usedInvoice.has(i.id) && i.status !== "paid" && i.status !== "lost" && i.status !== "cancelled" && i.currency === t.currency && Math.abs(Number(i.total) - t.amount) < 0.01);
        if (inv) {
          invoiceId = inv.id;
          usedInvoice.add(inv.id);
          await db.update(schema.invoice).set({ status: "paid" }).where(eq(schema.invoice.id, inv.id));
          stats.invoicesPaid++;
          await log("qonto-invoice-paid", "invoice", inv.id, `Facture ${inv.number} marquée payée (virement Qonto ${t.amount} ${t.currency})`);
        }
      }
      const [row] = await db
        .insert(schema.transaction)
        .values({ legalEntityId: mgs.id, date, label: t.label, counterparty: t.label, side: t.side, amount: t.amount, currency: t.currency, source: "qonto", externalRef: ref, nature: "operating", invoiceId, billId, note: t.note ?? null })
        .returning({ id: schema.transaction.id });
      have.set(ref, { id: row!.id, billId, invoiceId } as never);
      stats.created++;
      await log("qonto-tx", "transaction", row!.id, `${debit ? "Dépense" : "Encaissement"} Qonto ${t.amount} ${t.currency} — ${t.label}${debit && !t.attachment_ids?.length ? " (justificatif manquant)" : ""}${!debit && !invoiceId ? " (aucune facture associée)" : ""}`);
    }
  }
  await setState("qonto:lastSync", JSON.stringify({ at: new Date().toISOString(), balance, ...stats }));
  return { ...stats, balance };
}

