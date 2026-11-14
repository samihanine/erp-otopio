import { Hono } from "hono";
import { db, schema } from "@erp/db";
import { round2, toCAD } from "@erp/shared";
import type { AppEnv } from "../lib/types";
import { env } from "../lib/env";

export const finance = new Hono<AppEnv>();

const inYear = (d: string | null | undefined, year: number) => !!d && d.slice(0, 4) === String(year);
const today = () => new Date().toISOString().slice(0, 10);

finance.get("/summary", async (c) => {
  const year = Number(c.req.query("year") ?? new Date().getFullYear());
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
  const bl = scoped(bills).filter((b) => b.status !== "cancelled" && inYear(b.issueDate, year));
  const tx = scoped(txs);

  const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
  const invoicedHT = sum(issued.map((i) => conv(i.subtotal, i.currency)));
  const invoicedTTC = sum(issued.map((i) => conv(i.total, i.currency)));
  const collected = sum(tx.filter((t) => t.side === "credit" && inYear(t.date, year)).map((t) => conv(t.amount, t.currency)));
  const open = inv.filter((i) => ["sent", "partial", "overdue"].includes(i.status));
  const outstanding = sum(open.map((i) => conv(i.total - i.amountPaid, i.currency)));
  const overdueList = open.filter((i) => i.status === "overdue" || (i.dueDate && i.dueDate < today()));
  const overdue = sum(overdueList.map((i) => conv(i.total - i.amountPaid, i.currency)));
  const expenses = sum(bl.map((b) => conv(b.total, b.currency)));

  const monthly = Array.from({ length: 12 }, (_, m) => {
    const mm = `${year}-${String(m + 1).padStart(2, "0")}`;
    return {
      month: mm,
      revenue: sum(issued.filter((i) => i.issueDate?.startsWith(mm)).map((i) => conv(i.subtotal, i.currency))),
      expenses: sum(bl.filter((b) => b.issueDate?.startsWith(mm)).map((b) => conv(b.total, b.currency))),
      collected: sum(tx.filter((t) => t.side === "credit" && t.date.startsWith(mm)).map((t) => conv(t.amount, t.currency))),
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
    const eb = bills.filter((b) => b.legalEntityId === e.id && b.status !== "cancelled" && inYear(b.issueDate, year));
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
  });

  // Reconciliation checks
  const txByInvoice = new Map<string, number>();
  const txByBill = new Set<string>();
  for (const t of txs) {
    if (t.invoiceId) txByInvoice.set(t.invoiceId, (txByInvoice.get(t.invoiceId) ?? 0) + t.amount);
    if (t.billId) txByBill.add(t.billId);
  }
  const checks = {
    paidWithoutPayment: inv
      .filter((i) => (i.status === "paid" || i.amountPaid > 0) && !txByInvoice.has(i.id))
      .map((i) => ({ id: i.id, number: i.number, client: orgName.get(i.organizationId ?? "") ?? null, amount: i.amountPaid, currency: i.currency })),
    billsWithoutReceipt: scoped(bills)
      .filter((b) => !b.fileUrl && !b.driveFileId)
      .map((b) => ({ id: b.id, label: b.label, amount: b.total, currency: b.currency, date: b.issueDate })),
    billsWithoutAmount: scoped(bills)
      .filter((b) => !b.total)
      .map((b) => ({ id: b.id, label: b.label, date: b.issueDate })),
    unmatchedTransactions: tx
      .filter((t) => !t.invoiceId && !t.billId)
      .map((t) => ({ id: t.id, label: t.label, amount: t.amount, currency: t.currency, side: t.side, date: t.date })),
    paidBillsWithoutTransaction: scoped(bills)
      .filter((b) => b.status === "paid" && b.total > 0 && !txByBill.has(b.id))
      .map((b) => ({ id: b.id, label: b.label, amount: b.total, currency: b.currency })),
    overdue: overdueList.map((i) => ({ id: i.id, number: i.number, client: orgName.get(i.organizationId ?? "") ?? null, balance: round2(i.total - i.amountPaid), currency: i.currency, dueDate: i.dueDate })),
  };

  return c.json({
    year,
    currency,
    consolidated: !entity,
    kpis: { invoicedHT, invoicedTTC, collected, outstanding, overdue, expenses, margin: round2(invoicedHT - expenses), openCount: open.length },
    monthly,
    byClient,
    byCategory,
    byEntity,
    checks,
  });
});
