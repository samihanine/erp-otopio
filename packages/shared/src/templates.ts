/**
 * Branded HTML renderer for quotes (devis + cahier des charges) and invoices.
 * Used for the live preview in the web app and by the worker to print PDFs
 * (same HTML → identical output).
 */
import { computeTotals, formatMoney, lineTotal, type Line, type TaxRate } from "./money";

export type EntityLike = {
  name: string;
  legalName: string;
  legalForm?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  region?: string | null;
  country: string;
  email?: string | null;
  phone?: string | null;
  registrationNumber?: string | null;
  taxIds?: { label: string; value: string }[];
  bankDetails?: { label: string; value: string }[];
  paymentTerms?: string | null;
  legalMentions?: string | null;
  color?: string | null;
};

export type PartyLike = {
  name: string;
  legalName?: string | null;
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  vatNumber?: string | null;
  registrationNumber?: string | null;
};

export type RenderInput = {
  kind: "quote" | "invoice";
  locale?: "fr" | "en";
  number: string;
  title?: string | null;
  issueDate?: string | null;
  dueDate?: string | null; // invoice due date or quote validity
  currency: string;
  lines: Line[];
  taxes: TaxRate[];
  amountPaid?: number;
  introduction?: string | null;
  scope?: string | null;
  terms?: string | null;
  notes?: string | null;
  entity: EntityLike;
  client?: PartyLike | null;
  contactName?: string | null;
};

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Tiny, safe markdown subset: headings, lists, bold/italic, paragraphs. */
export function miniMarkdown(md: string): string {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const inline = (t: string) =>
    esc(t)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!line.trim()) {
      closeList();
      continue;
    }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      closeList();
      const level = Math.min(m[1]!.length + 1, 5);
      out.push(`<h${level}>${inline(m[2]!)}</h${level}>`);
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inline(m[1]!)}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inline(m[1]!)}</li>`);
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("\n");
}

const T = {
  fr: {
    quote: "Devis",
    invoice: "Facture",
    number: "N°",
    issued: "Date d'émission",
    due: "Échéance",
    valid: "Valide jusqu'au",
    from: "Émetteur",
    to: "Destinataire",
    desc: "Description",
    qty: "Qté",
    unit: "Prix unitaire",
    total: "Total HT",
    subtotal: "Sous-total HT",
    totalTTC: "Total TTC",
    paid: "Déjà payé",
    balance: "Solde à payer",
    scope: "Cahier des charges",
    terms: "Conditions",
    payment: "Détails du paiement",
    accept: "Bon pour accord — date, nom et signature",
    page: "Page",
  },
  en: {
    quote: "Quote",
    invoice: "Invoice",
    number: "No.",
    issued: "Issue date",
    due: "Due date",
    valid: "Valid until",
    from: "From",
    to: "Bill to",
    desc: "Description",
    qty: "Qty",
    unit: "Unit price",
    total: "Amount",
    subtotal: "Subtotal",
    totalTTC: "Total",
    paid: "Paid",
    balance: "Balance due",
    scope: "Scope of work",
    terms: "Terms",
    payment: "Payment details",
    accept: "Accepted — date, name and signature",
    page: "Page",
  },
};

export const OTOPIO_MARK = `<svg viewBox="0 0 64 40" width="44" height="28" aria-hidden="true"><circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="32" cy="20" r="14" fill="none" stroke="currentColor" stroke-width="3" opacity=".7"/><circle cx="44" cy="20" r="14" fill="none" stroke="currentColor" stroke-width="3" opacity=".45"/></svg>`;

function fmtDate(d: string | null | undefined, locale: "fr" | "en") {
  if (!d) return "—";
  const date = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return date.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { day: "2-digit", month: "long", year: "numeric" });
}

function address(p: { addressLine1?: string | null; addressLine2?: string | null; postalCode?: string | null; city?: string | null; region?: string | null; country?: string | null }) {
  return [p.addressLine1, p.addressLine2, [p.postalCode, p.city, p.region].filter(Boolean).join(" "), p.country]
    .filter(Boolean)
    .map(esc)
    .join("<br>");
}

export function renderDocumentHtml(input: RenderInput): string {
  const locale = input.locale ?? "fr";
  const t = T[locale];
  const { entity, client } = input;
  const totals = computeTotals(input.lines, input.taxes);
  const money = (n: number) => formatMoney(n, input.currency, locale);
  const accent = entity.color || "#1c3266";
  const balance = totals.total - (input.amountPaid ?? 0);

  const rows = input.lines
    .map(
      (l) => `<tr>
        <td><div class="ld">${esc(l.description)}</div>${l.details ? `<div class="lm">${esc(l.details)}</div>` : ""}</td>
        <td class="n">${esc(l.quantity)}${l.unit ? ` ${esc(l.unit)}` : ""}</td>
        <td class="n">${money(Number(l.unitPrice) || 0)}</td>
        <td class="n strong">${money(lineTotal(l))}</td>
      </tr>`,
    )
    .join("");

  const taxRows = totals.taxes
    .map((x) => `<tr><td>${esc(x.label)} (${(x.rate * 100).toLocaleString(locale, { maximumFractionDigits: 3 })} %)</td><td class="n">${money(x.amount)}</td></tr>`)
    .join("");

  const ids = [entity.registrationNumber ? `${locale === "fr" ? "Immatriculation" : "Registration"} ${esc(entity.registrationNumber)}` : "", ...(entity.taxIds ?? []).map((x) => `${esc(x.label)} ${esc(x.value)}`)]
    .filter(Boolean)
    .join(" · ");

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<title>${esc(t[input.kind])} ${esc(input.number)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #eef0f5; }
  body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #0a1430; font-size: 10.5pt; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: white; padding: 18mm 18mm 22mm; position: relative; }
  @media screen { .page { margin: 24px auto; box-shadow: 0 1px 2px rgba(10,20,48,.06), 0 12px 32px rgba(10,20,48,.08); border-radius: 6px; } }
  @media print { html, body { background: white; } .page { margin: 0; box-shadow: none; border-radius: 0; } }
  header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14mm; }
  .brand { display: flex; align-items: center; gap: 10px; color: ${accent}; }
  .brand b { font-size: 20pt; letter-spacing: -.03em; color: #0a1430; font-weight: 700; }
  .brand small { display: block; font-size: 8pt; color: #6b7593; letter-spacing: .14em; text-transform: uppercase; margin-top: 2px; }
  .doc { text-align: right; }
  .doc h1 { margin: 0; font-size: 22pt; letter-spacing: -.02em; font-weight: 600; }
  .doc .num { color: #6b7593; font-weight: 500; margin-top: 2px; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 9mm; }
  .meta div { background: #f5f6fa; border-radius: 8px; padding: 8px 12px; }
  .label { font-size: 7.5pt; color: #6b7593; text-transform: uppercase; letter-spacing: .1em; font-weight: 600; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; margin-bottom: 10mm; }
  .parties .name { font-weight: 600; font-size: 11pt; margin: 4px 0 2px; }
  .parties .muted, .muted { color: #4b5577; font-size: 9pt; }
  .title { font-size: 13pt; font-weight: 600; margin: 0 0 4mm; }
  .intro { color: #33405f; margin-bottom: 6mm; }
  table.lines { width: 100%; border-collapse: collapse; }
  table.lines th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .1em; color: #6b7593; font-weight: 600; padding: 8px 10px; border-bottom: 1.5px solid #0a1430; }
  table.lines td { padding: 10px; border-bottom: 1px solid #e6e9f2; vertical-align: top; }
  .n { text-align: right; white-space: nowrap; }
  th.n { text-align: right; }
  .ld { font-weight: 500; } .lm { color: #6b7593; font-size: 9pt; margin-top: 2px; white-space: pre-line; }
  .strong { font-weight: 600; }
  .totals { display: flex; justify-content: flex-end; margin-top: 6mm; }
  .totals table { width: 80mm; border-collapse: collapse; }
  .totals td { padding: 5px 10px; }
  .totals tr.grand td { background: #0a1430; color: white; font-weight: 600; font-size: 11.5pt; padding: 10px; }
  .totals tr.grand td:first-child { border-radius: 8px 0 0 8px; } .totals tr.grand td:last-child { border-radius: 0 8px 8px 0; }
  .totals tr.balance td { font-weight: 600; color: ${accent}; }
  section.block { margin-top: 10mm; break-inside: avoid; }
  section.block h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: .12em; color: ${accent}; margin: 0 0 3mm; }
  .scope h2, .scope h3, .scope h4 { font-size: 11pt; margin: 5mm 0 2mm; color: #0a1430; text-transform: none; letter-spacing: 0; }
  .scope p { margin: 0 0 2.5mm; } .scope ul, .scope ol { margin: 0 0 3mm; padding-left: 5mm; }
  .bank { display: grid; grid-template-columns: auto 1fr; gap: 3px 14px; font-size: 9pt; background: #f5f6fa; border-radius: 8px; padding: 10px 14px; }
  .bank span:nth-child(odd) { color: #6b7593; }
  .sign { margin-top: 12mm; display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; }
  .sign div { border: 1px dashed #c4cadb; border-radius: 8px; height: 30mm; padding: 8px 12px; font-size: 8.5pt; color: #6b7593; }
  footer { position: absolute; left: 18mm; right: 18mm; bottom: 9mm; font-size: 7.5pt; color: #8a93ad; display: flex; justify-content: space-between; border-top: 1px solid #e6e9f2; padding-top: 3mm; }
</style>
</head>
<body>
<div class="page">
  <header>
    <div class="brand">${OTOPIO_MARK}<div><b>otopio</b><small>${esc(entity.legalName)}</small></div></div>
    <div class="doc"><h1>${esc(t[input.kind])}</h1><div class="num">${t.number} ${esc(input.number)}</div></div>
  </header>

  <div class="meta">
    <div><div class="label">${t.issued}</div>${fmtDate(input.issueDate, locale)}</div>
    <div><div class="label">${input.kind === "invoice" ? t.due : t.valid}</div>${fmtDate(input.dueDate, locale)}</div>
    <div><div class="label">${input.kind === "invoice" ? t.balance : t.totalTTC}</div><strong>${money(input.kind === "invoice" ? balance : totals.total)}</strong></div>
  </div>

  <div class="parties">
    <div>
      <div class="label">${t.from}</div>
      <div class="name">${esc(entity.legalName)}${entity.legalForm ? `, ${esc(entity.legalForm)}` : ""}</div>
      <div class="muted">${address(entity)}${entity.email ? `<br>${esc(entity.email)}` : ""}${entity.phone ? ` · ${esc(entity.phone)}` : ""}</div>
    </div>
    <div>
      <div class="label">${t.to}</div>
      ${
        client
          ? `<div class="name">${esc(client.legalName || client.name)}</div>
      <div class="muted">${input.contactName ? `${esc(input.contactName)}<br>` : ""}${address(client)}${client.email ? `<br>${esc(client.email)}` : ""}${client.vatNumber ? `<br>TVA ${esc(client.vatNumber)}` : ""}${client.registrationNumber ? `<br>${esc(client.registrationNumber)}` : ""}</div>`
          : `<div class="muted">—</div>`
      }
    </div>
  </div>

  ${input.title ? `<p class="title">${esc(input.title)}</p>` : ""}
  ${input.introduction ? `<div class="intro">${miniMarkdown(input.introduction)}</div>` : ""}

  <table class="lines">
    <thead><tr><th>${t.desc}</th><th class="n">${t.qty}</th><th class="n">${t.unit}</th><th class="n">${t.total}</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4" class="muted">—</td></tr>`}</tbody>
  </table>

  <div class="totals"><table>
    <tr><td>${t.subtotal}</td><td class="n">${money(totals.subtotal)}</td></tr>
    ${taxRows}
    <tr class="grand"><td>${t.totalTTC}</td><td class="n">${money(totals.total)}</td></tr>
    ${input.kind === "invoice" && input.amountPaid ? `<tr><td>${t.paid}</td><td class="n">− ${money(input.amountPaid)}</td></tr><tr class="balance"><td>${t.balance}</td><td class="n">${money(balance)}</td></tr>` : ""}
  </table></div>

  ${input.scope ? `<section class="block scope"><h2>${t.scope}</h2>${miniMarkdown(input.scope)}</section>` : ""}
  ${input.terms || entity.paymentTerms ? `<section class="block"><h2>${t.terms}</h2><div class="muted">${miniMarkdown(input.terms || entity.paymentTerms || "")}</div></section>` : ""}
  ${input.notes ? `<section class="block"><div class="muted">${miniMarkdown(input.notes)}</div></section>` : ""}
  ${
    input.kind === "invoice" && entity.bankDetails?.length
      ? `<section class="block"><h2>${t.payment}</h2><div class="bank">${entity.bankDetails.map((b) => `<span>${esc(b.label)}</span><span>${esc(b.value)}</span>`).join("")}</div></section>`
      : ""
  }
  ${input.kind === "quote" ? `<div class="sign"><div>${t.accept}</div><div>${esc(entity.legalName)}</div></div>` : ""}
  ${entity.legalMentions ? `<section class="block"><div class="muted" style="font-size:8pt">${miniMarkdown(entity.legalMentions)}</div></section>` : ""}

  <footer><span>${esc(entity.legalName)}${ids ? ` · ${ids}` : ""}</span><span>${esc(input.number)}</span></footer>
</div>
</body>
</html>`;
}
