import { Hono } from "hono";
import { db, schema } from "@erp/db";
import { round2, toCAD } from "@erp/shared";
import type { AppEnv } from "../lib/types";
import { env } from "../lib/env";

export const finance = new Hono<AppEnv>();

const today = () => new Date().toISOString().slice(0, 10);

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
  const currency = entity?.currency ?? "CAD";
  const conv = (amount: number, cur: string) => (entity ? amount : toCAD(amount, cur));
  const scoped = <T extends { legalEntityId: string }>(rows: T[]) => (entity ? rows.filter((r) => r.legalEntityId === entity.id) : rows);

  const inv = scoped(invoices).filter((i) => i.status !== "cancelled");
  const issued = inv.filter((i) => i.status !== "draft" && inYear(i.issueDate, year));
  const yearBills = scoped(bills).filter((b) => b.status !== "cancelled" && inYear(b.issueDate, year));
  // business figures only count professional spending; personal life spending is reported apart
  const bl = yearBills.filter((b) => b.scope !== "perso");
  const perso = yearBills.filter((b) => b.scope !== "pro");
  const tx = scoped(txs);

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
    const ei = invoices.filter((i) => i.legalEntityId === e.id && i.status !== "draft" && i.status !== "cancelled" && inYear(i.issueDate, year));
    const eb = bills.filter((b) => b.legalEntityId === e.id && b.status !== "cancelled" && b.scope !== "perso" && inYear(b.issueDate, year));
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
    .filter((b) => b.active)
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

  return c.json({
    year,
    months,
    years: allYears,
    currency,
    consolidated: !entity,
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
