/**
 * Read helpers over the unified ledger (`transaction` table).
 * Many reports reason in terms of "invoices", "expenses" and "bank lines": these views rebuild
 * them from the single table so the finance logic stays readable.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@erp/db";

export type Row = typeof schema.transaction.$inferSelect;
export type InvoiceView = Row & { issueDate: string; title: string };
export type ExpenseView = Row & { issueDate: string };
/** a cash movement (bank side): either merged into a document or a standalone movement */
export type CashView = { id: string; docId: string | null; legalEntityId: string; date: string; label: string; counterparty: string | null; side: "credit" | "debit"; amount: number; currency: string; source: string; nature: string; bankRef: string | null; invoiceId: string | null; billId: string | null };

export function splitLedger(rows: Row[]) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const invoices: InvoiceView[] = rows.filter((r) => r.kind === "invoice").map((r) => ({ ...r, issueDate: r.date, title: r.label }));
  const expenses: ExpenseView[] = rows.filter((r) => r.kind === "expense").map((r) => ({ ...r, issueDate: r.date }));
  const childSum = new Map<string, number>();
  for (const r of rows) if (r.kind === "movement" && r.parentId) childSum.set(r.parentId, (childSum.get(r.parentId) ?? 0) + r.total);
  const cash: CashView[] = [];
  for (const r of rows) {
    if (r.kind === "movement") {
      const parent = r.parentId ? byId.get(r.parentId) : undefined;
      cash.push({ id: r.id, docId: parent?.id ?? null, legalEntityId: r.legalEntityId, date: r.date, label: r.label, counterparty: r.counterparty, side: r.side, amount: r.total, currency: r.currency, source: r.source, nature: r.nature, bankRef: r.bankRef, invoiceId: parent?.kind === "invoice" ? parent.id : null, billId: parent?.kind === "expense" ? parent.id : null });
    } else if (r.bankRef || r.source !== "none") {
      // the bank line was merged into the document it pays
      const paid = r.kind === "invoice" ? Math.max(0, (r.amountPaid || r.total) - (childSum.get(r.id) ?? 0)) : r.total;
      cash.push({ id: r.id, docId: r.id, legalEntityId: r.legalEntityId, date: r.paidAt ?? r.date, label: r.counterparty ?? r.label, counterparty: r.counterparty, side: r.side, amount: paid, currency: r.currency, source: r.source, nature: r.nature, bankRef: r.bankRef, invoiceId: r.kind === "invoice" ? r.id : null, billId: r.kind === "expense" ? r.id : null });
    }
  }
  return { invoices, expenses, cash };
}

/** ledger of one workspace */
export async function loadLedger(workspaceId: string) {
  return splitLedger(await db.select().from(schema.transaction).where(eq(schema.transaction.workspaceId, workspaceId)));
}
