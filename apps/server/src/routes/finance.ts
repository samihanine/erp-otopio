import { Hono } from "hono";
import { db, schema } from "@erp/db";
import { FX_TO_CAD, round2, toCAD } from "@erp/shared";
import type { AppEnv } from "../lib/types";
import { eq as eqOp } from "drizzle-orm";
import { computeMGS, computeOTP, DEFAULTS, fiscalYear, type TaxConfig } from "../lib/taxes";
import { env } from "../lib/env";

export const finance = new Hono<AppEnv>();

const today = () => new Date().toISOString().slice(0, 10);

/* Daily exchange rates (ECB via frankfurter.app), cached 12 h, fixed fallback. */
let fxCache: { at: number; date: string; source: string; toCAD: Record<string, number> } | null = null;
async function fxRates() {
  if (fxCache && Date.now() - fxCache.at < 12 * 3600e3) return fxCache;
  try {
    const r = (await (await fetch("https://api.frankfurter.dev/v1/latest?from=CAD&to=EUR,USD", { signal: AbortSignal.timeout(4000) })).json()) as { date: string; rates: Record<string, number> };
    const toCAD: Record<string, number> = { CAD: 1 };
    for (const [k, v] of Object.entries(r.rates)) toCAD[k] = 1 / v;
    fxCache = { at: Date.now(), date: r.date, source: "BCE", toCAD };
  } catch {
    fxCache = { at: Date.now() - 11 * 3600e3, date: "", source: "fixe", toCAD: { ...FX_TO_CAD } };
  }
  return fxCache;
}

finance.get("/summary", async (c) => {
  const yq = c.req.query("year") ?? String(new Date().getFullYear());
  const year = yq === "all" ? "all" : Number(yq);
  const months = (c.req.query("months") ?? "").split(",").map(Number).filter((m) => m >= 1 && m <= 12);
  /** date within the selected period (year or all years, optionally restricted to some months) */
  const inYear = (d: string | null | undefined, _y?: unknown) => !!d && (year === "all" || d.slice(0, 4) === String(year)) && (!months.length || months.includes(Number(d.slice(5, 7))));
  const entityParam = c.req.query("entity") ?? "all";

  const [entities, invoices, bills, txs, orgs] = await Promise.all([
    db.select().from(schema.legalEntity),
    db.select().from(schema.invoice),
    db.select().from(schema.bill),
    db.select().from(schema.transaction),
    db.select({ id: schema.organization.id, name: schema.organization.name }).from(schema.organization),
  ]);
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const entity = entities.find((e) => e.id === entityParam);
  const fx = await fxRates();
  const wanted = (c.req.query("currency") ?? "").toUpperCase();
  const currency = fx.toCAD[wanted] ? wanted : (entity?.currency ?? "CAD");
  /** convert any amount to the reporting currency */
  const conv = (amount: number, cur: string) => (cur === currency ? amount : round2((amount * (fx.toCAD[cur] ?? FX_TO_CAD[cur] ?? 1)) / (fx.toCAD[currency] ?? 1)));
  const scoped = <T extends { legalEntityId: string }>(rows: T[]) => (entity ? rows.filter((r) => r.legalEntityId === entity.id) : rows);

  const inv = scoped(invoices).filter((i) => i.status !== "cancelled" && i.status !== "lost"); // written-off invoices count nowhere
  const issued = inv.filter((i) => i.status !== "draft" && inYear(i.issueDate, year));
  const yearBills = scoped(bills).filter((b) => b.status !== "cancelled" && inYear(b.issueDate, year));
  // business figures only count professional spending; personal life spending is reported apart
  // costs borne by a client (paid with their card / re-billed) are not ours
  const bl = yearBills.filter((b) => b.scope !== "perso" && b.paidBy !== "client");
  const perso = yearBills.filter((b) => b.scope !== "pro");
  const tx = scoped(txs).filter((t) => (t.nature ?? "operating") === "operating" || t.side === "debit"); // share capital / internal transfers are not revenue

  const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
  const invoicedHT = sum(issued.map((i) => conv(i.subtotal, i.currency)));
  const invoicedTTC = sum(issued.map((i) => conv(i.total, i.currency)));
  // Entities without a bank feed (e.g. freelance activities): payments recorded on invoices count as collected.
  const noFeed = new Set(entities.filter((e) => e.accountingProvider === "none").map((e) => e.id));
  const paidNoFeed = inv.filter((i) => noFeed.has(i.legalEntityId) && i.amountPaid > 0 && (i.paidAt ?? i.issueDate));
  const paidOn = (i: (typeof inv)[number]) => i.paidAt ?? i.issueDate ?? "";
  const collected = round2(
    sum(tx.filter((t) => t.side === "credit" && inYear(t.date, year)).map((t) => conv(t.amount, t.currency))) +
      sum(paidNoFeed.filter((i) => inYear(paidOn(i), year)).map((i) => conv(i.amountPaid, i.currency))),
  );
  // HT / VAT / TTC breakdown of what was collected: credits linked to an invoice follow that invoice's VAT ratio
  const invById = new Map(invoices.map((i) => [i.id, i]));
  const htRatio = (i?: { subtotal: number; total: number }) => (i && i.total > 0 ? i.subtotal / i.total : 1);
  const collectedParts = [
    ...tx.filter((t) => t.side === "credit" && inYear(t.date, year)).map((t) => ({ ttc: conv(t.amount, t.currency), ratio: htRatio(t.invoiceId ? invById.get(t.invoiceId) : undefined) })),
    ...paidNoFeed.filter((i) => inYear(paidOn(i), year)).map((i) => ({ ttc: conv(i.amountPaid, i.currency), ratio: htRatio(i) })),
  ];
  const collectedTTC = sum(collectedParts.map((x) => x.ttc));
  const collectedHT = sum(collectedParts.map((x) => x.ttc * x.ratio));
  const expTTC = sum(bl.map((b) => conv(b.total, b.currency)));
  const expVAT = sum(bl.map((b) => conv(b.taxTotal, b.currency)));
  const breakdown = {
    collected: { ht: collectedHT, vat: round2(collectedTTC - collectedHT), ttc: collectedTTC },
    expenses: { ht: round2(expTTC - expVAT), vat: expVAT, ttc: expTTC },
    balance: { ht: round2(collectedHT - (expTTC - expVAT)), vat: round2(collectedTTC - collectedHT - expVAT), ttc: round2(collectedTTC - expTTC) },
  };
  const open = inv.filter((i) => ["sent", "partial", "overdue"].includes(i.status));
  const outstanding = sum(open.map((i) => conv(i.total - i.amountPaid, i.currency)));
  const overdueList = open.filter((i) => i.status === "overdue" || (i.dueDate && i.dueDate < today()));
  const overdue = sum(overdueList.map((i) => conv(i.total - i.amountPaid, i.currency)));
  const expenses = sum(bl.map((b) => conv(b.total, b.currency)));

  // buckets: months of the selected year, or years when "all" is selected
  const allYears = [...new Set([...invoices.map((i) => i.issueDate), ...bills.map((b) => b.issueDate)].filter(Boolean).map((d) => d!.slice(0, 4)))].sort();
  const buckets = year === "all" ? allYears : Array.from({ length: 12 }, (_, m) => `${year}-${String(m + 1).padStart(2, "0")}`).filter((mm) => !months.length || months.includes(Number(mm.slice(5, 7))));
  const monthly = buckets.map((mm) => {
    const inB = (d: string | null | undefined) => !!d && d.startsWith(mm) && inYear(d);
    return {
      month: mm,
      revenue: sum(issued.filter((i) => inB(i.issueDate)).map((i) => conv(i.subtotal, i.currency))),
      expenses: sum(bl.filter((b) => inB(b.issueDate)).map((b) => conv(b.total, b.currency))),
      collected: round2(
        sum(tx.filter((t) => t.side === "credit" && inB(t.date)).map((t) => conv(t.amount, t.currency))) +
          sum(paidNoFeed.filter((i) => inB(paidOn(i))).map((i) => conv(i.amountPaid, i.currency))),
      ),
    };
  });

  const byClientMap = new Map<string, number>();
  for (const i of issued) {
    const k = i.organizationId ?? "—";
    byClientMap.set(k, (byClientMap.get(k) ?? 0) + conv(i.subtotal, i.currency));
  }
  const byClient = [...byClientMap.entries()]
    .map(([id, amount]) => ({ id, name: orgName.get(id) ?? "Sans client", amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  const byCategoryMap = new Map<string, number>();
  for (const b of bl) byCategoryMap.set(b.category, (byCategoryMap.get(b.category) ?? 0) + conv(b.total, b.currency));
  const byCategory = [...byCategoryMap.entries()].map(([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount);

  const byEntity = entities.map((e) => {
    const ei = invoices.filter((i) => i.legalEntityId === e.id && i.status !== "draft" && i.status !== "cancelled" && i.status !== "lost" && inYear(i.issueDate, year));
    const eb = bills.filter((b) => b.legalEntityId === e.id && b.status !== "cancelled" && b.scope !== "perso" && b.paidBy !== "client" && inYear(b.issueDate, year));
    return {
      id: e.id,
      name: e.name,
      code: e.code,
      country: e.country,
      currency: e.currency,
      color: e.color,
      provider: e.accountingProvider,
      connected: e.accountingProvider === "qonto" ? env.qonto : e.accountingProvider === "quickbooks" ? env.quickbooks : false,
      revenue: sum(ei.map((i) => i.subtotal)),
      expenses: sum(eb.map((b) => b.total)),
      invoices: ei.length,
    };
  }).sort((a, b) => toCAD(b.revenue, b.currency) - toCAD(a.revenue, a.currency));

  // Reconciliation checks
  const txByInvoice = new Map<string, number>();
  const txByBill = new Set<string>();
  for (const t of txs) {
    if (t.invoiceId) txByInvoice.set(t.invoiceId, (txByInvoice.get(t.invoiceId) ?? 0) + t.amount);
    if (t.billId) txByBill.add(t.billId);
  }
  const proBills = scoped(bills).filter((b) => b.scope !== "perso");
  const checks = {
    paidWithoutPayment: inv
      .filter((i) => !noFeed.has(i.legalEntityId) && (i.status === "paid" || i.amountPaid > 0) && !txByInvoice.has(i.id))
      .map((i) => ({ id: i.id, number: i.number, client: orgName.get(i.organizationId ?? "") ?? null, amount: i.amountPaid, currency: i.currency })),
    billsWithoutReceipt: proBills
      .filter((b) => !b.fileUrl && !b.driveFileId)
      .map((b) => ({ id: b.id, label: b.label, amount: b.total, currency: b.currency, date: b.issueDate })),
    billsWithoutAmount: proBills
      .filter((b) => !b.total)
      .map((b) => ({ id: b.id, label: b.label, date: b.issueDate })),
    unmatchedTransactions: tx
      .filter((t) => !t.invoiceId && !t.billId)
      .map((t) => ({ id: t.id, label: t.label, amount: t.amount, currency: t.currency, side: t.side, date: t.date })),
    paidBillsWithoutTransaction: proBills
      .filter((b) => !noFeed.has(b.legalEntityId) && b.status === "paid" && b.total > 0 && !txByBill.has(b.id))
      .map((b) => ({ id: b.id, label: b.label, amount: b.total, currency: b.currency })),
    overdue: overdueList.map((i) => ({ id: i.id, number: i.number, client: orgName.get(i.organizationId ?? "") ?? null, balance: round2(i.total - i.amountPaid), currency: i.currency, dueDate: i.dueDate })),
  };

  // Personal life spending (scope perso/mixed) — reported apart from the business
  const personalByCat = new Map<string, number>();
  for (const b of perso) personalByCat.set(b.category, (personalByCat.get(b.category) ?? 0) + conv(b.total, b.currency));
  const personal = {
    total: sum(perso.map((b) => conv(b.total, b.currency))),
    count: perso.length,
    byCategory: [...personalByCat.entries()].map(([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount),
  };

  // Subscriptions still running (latest charge flagged active), with a monthly equivalent
  const PER_MONTH: Record<string, number> = { monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, none: 1 };
  const cardsById = new Map((await db.select().from(schema.creditCard)).map((k) => [k.id, k]));
  const subscriptions = scoped(bills)
    .filter((b) => b.active && b.paidBy !== "client")
    .map((b) => {
      const card = b.cardId ? cardsById.get(b.cardId) : null;
      return {
        id: b.id,
        label: b.label,
        scope: b.scope,
        recurrence: b.recurrence,
        amount: b.total,
        currency: b.currency,
        monthly: round2(conv(b.total, b.currency) * (PER_MONTH[b.recurrence] ?? 1)),
        lastCharge: b.issueDate,
        card: card ? `${card.label}` : (b.paymentMethod ?? null),
      };
    })
    .sort((a, b) => b.monthly - a.monthly);

  // Chart series at month or year granularity over the selected period
  const series = (len: 7 | 4) => {
    const keys = [...new Set([...issued.map((i) => i.issueDate), ...bl.map((b) => b.issueDate), ...tx.filter((t) => t.side === "credit").map((t) => t.date)].filter((d) => inYear(d)).map((d) => d!.slice(0, len)))].sort();
    return keys.map((k) => {
      const inB = (d: string | null | undefined) => !!d && d.startsWith(k) && inYear(d);
      return {
        month: k,
        revenue: sum(issued.filter((i) => inB(i.issueDate)).map((i) => conv(i.subtotal, i.currency))),
        expenses: sum(bl.filter((b) => inB(b.issueDate)).map((b) => conv(b.total, b.currency))),
        collected: round2(sum(tx.filter((t) => t.side === "credit" && inB(t.date)).map((t) => conv(t.amount, t.currency))) + sum(paidNoFeed.filter((i) => inB(paidOn(i))).map((i) => conv(i.amountPaid, i.currency)))),
      };
    });
  };

  // Unified ledger of the period: expenses (bills) + revenues (invoices), with justificatif status
  const code = new Map(entities.map((e) => [e.id, e.code]));
  const ledger = [
    ...bl.map((b) => ({
      id: b.id,
      table: "bill" as const,
      date: b.issueDate,
      label: b.label,
      party: orgName.get(b.organizationId ?? "") ?? null,
      category: b.category,
      entity: code.get(b.legalEntityId) ?? "",
      side: "expense" as const,
      amount: conv(b.total, b.currency),
      original: b.total,
      currency: b.currency,
      hasFile: Boolean(b.fileUrl || b.driveFileId),
      status: b.status,
      reimburse: b.paidBy === "reimburse",
    })),
    ...issued.map((i) => ({
      id: i.id,
      table: "invoice" as const,
      date: i.issueDate,
      label: `${i.number}${i.title ? ` — ${i.title}` : ""}`,
      party: orgName.get(i.organizationId ?? "") ?? null,
      category: null,
      entity: code.get(i.legalEntityId) ?? "",
      side: "income" as const,
      amount: conv(i.total, i.currency),
      original: i.total,
      currency: i.currency,
      hasFile: Boolean(i.fileUrl),
      status: i.status,
      reimburse: false,
    })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  // Invoices waiting to be collected
  const receivables = open
    .map((i) => ({
      id: i.id,
      number: i.number,
      client: orgName.get(i.organizationId ?? "") ?? null,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      balance: round2(conv(i.total - i.amountPaid, i.currency)),
      original: round2(i.total - i.amountPaid),
      currency: i.currency,
      overdue: i.status === "overdue" || Boolean(i.dueDate && i.dueDate < today()),
    }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || String(a.dueDate).localeCompare(String(b.dueDate)));

  return c.json({
    series: { month: series(7), year: series(4) },
    ledger,
    receivables,
    year,
    months,
    years: allYears,
    currency,
    consolidated: !entity,
    fx: { date: fx.date, source: fx.source, rates: Object.fromEntries(Object.entries(fx.toCAD).map(([k, v]) => [k, round2((v / (fx.toCAD[currency] ?? 1)) * 10000) / 10000])) },
    breakdown,
    kpis: { invoicedHT, invoicedTTC, collected, outstanding, overdue, expenses, margin: round2(invoicedHT - expenses), openCount: open.length },
    monthly,
    byClient,
    byCategory,
    byEntity,
    checks,
    personal,
    subscriptions,
    subscriptionsMonthly: sum(subscriptions.map((s) => s.monthly)),
  });
});

/* ------------------------------ Taxes (OTP + MGS) ------------------------------ */

async function taxConfig(code: string): Promise<TaxConfig> {
  const [row] = await db.select().from(schema.syncState).where(eqOp(schema.syncState.key, `tax:config:${code}`));
  return { ...DEFAULTS[code], ...(row ? JSON.parse(row.value) : {}) };
}
async function saveTaxConfig(code: string, cfg: TaxConfig) {
  const value = JSON.stringify(cfg);
  await db.insert(schema.syncState).values({ key: `tax:config:${code}`, value }).onConflictDoUpdate({ target: schema.syncState.key, set: { value, updatedAt: new Date() } });
}

finance.get("/taxes", async (c) => {
  const year = Number(c.req.query("year") ?? new Date().getFullYear());
  const [entities, invoices, bills] = await Promise.all([db.select().from(schema.legalEntity), db.select().from(schema.invoice), db.select().from(schema.bill)]);
  const fx = await fxRates();
  const out = [];
  for (const code of ["OTP", "MGS"] as const) {
    const e = entities.find((x) => x.code === code);
    if (!e) continue;
    const cfg = await taxConfig(code);
    const fy = fiscalYear(code, year, cfg);
    if (!fy.valid) continue;
    const conv = (n: number, cur: string) => (cur === e.currency ? n : round2((n * (fx.toCAD[cur] ?? FX_TO_CAD[cur] ?? 1)) / (fx.toCAD[e.currency] ?? 1)));
    const inFy = (d: string | null | undefined) => !!d && d >= fy.start && d <= fy.end;
    const inv = invoices.filter((i) => i.legalEntityId === e.id && !["draft", "cancelled", "lost"].includes(i.status) && inFy(i.issueDate));
    const bl = bills.filter((b) => b.legalEntityId === e.id && b.status !== "cancelled" && b.scope !== "perso" && b.paidBy !== "client" && inFy(b.issueDate));
    const taxOf = (i: (typeof invoices)[number], codes: string[]) => (i.taxes ?? []).filter((t) => codes.includes(String(t.code).toUpperCase())).reduce((a, t) => a + Number(t.amount ?? 0), 0);
    const base = {
      revenueHT: round2(inv.reduce((a, i) => a + conv(i.subtotal, i.currency), 0)),
      expensesHT: round2(bl.reduce((a, b) => a + conv(b.total - b.taxTotal, b.currency), 0)),
      invoices: inv.length,
      bills: bl.length,
    };
    let result;
    if (code === "OTP") {
      const cadBills = bl.filter((b) => b.currency === "CAD");
      const tax = cadBills.reduce((a, b) => a + b.taxTotal, 0);
      result = computeOTP(year, cfg, {
        ...base,
        gstCollected: round2(inv.reduce((a, i) => a + conv(taxOf(i, ["TPS", "GST"]), i.currency), 0)),
        qstCollected: round2(inv.reduce((a, i) => a + conv(taxOf(i, ["TVQ", "QST"]), i.currency), 0)),
        gstItc: round2((tax * 5) / 14.975),
        qstItr: round2((tax * 9.975) / 14.975),
        vatCollected: 0,
        vatDeductible: 0,
      });
    } else {
      // TVA on services: due when cashed → invoices paid during the FY
      const paid = invoices.filter((i) => i.legalEntityId === e.id && !["draft", "cancelled"].includes(i.status) && i.amountPaid > 0 && inFy(i.paidAt ?? i.issueDate));
      const vatCollected = round2(paid.reduce((a, i) => a + conv(i.total > 0 ? (i.taxTotal * i.amountPaid) / i.total : 0, i.currency), 0));
      const vatDeductible = round2(bl.filter((b) => b.fileUrl || b.driveFileId).reduce((a, b) => a + conv(b.taxTotal, b.currency), 0));
      result = computeMGS(year, cfg, { ...base, vatCollected, vatDeductible });
    }
    const done = cfg.done ?? {};
    out.push({
      code,
      name: e.legalName ?? e.name,
      country: e.country,
      currency: e.currency,
      color: e.color,
      config: Object.fromEntries(Object.entries(cfg).filter(([k]) => k !== "done")),
      ...result,
      deadlines: result.deadlines.map((d) => ({ ...d, entity: code, currency: e.currency, done: Boolean(done[d.key]) })),
    });
  }
  return c.json({ year, entities: out, today: new Date().toISOString().slice(0, 10) });
});

finance.put("/taxes/config/:code", async (c) => {
  const code = c.req.param("code");
  if (!DEFAULTS[code]) return c.json({ error: "Unknown entity" }, 400);
  const patch = (await c.req.json()) as TaxConfig;
  const cur = await taxConfig(code);
  await saveTaxConfig(code, { ...cur, ...patch, done: { ...(cur.done ?? {}), ...(patch.done ?? {}) } });
  return c.json({ ok: true });
});
