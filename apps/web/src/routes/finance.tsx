import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, CheckCircle2, CircleDollarSign, FileWarning, Landmark, Link2Off, Plug, Receipt, Wallet } from "lucide-react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { formatMoney, TABLES } from "@erp/shared";
import { AppShell } from "@/components/layout/app-shell";
import { api } from "@/lib/api";
import { fmtDate, useI18n } from "@/lib/i18n";
import { HEX } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton, StatusDot } from "@/components/ui/misc";

export type FinanceSummary = {
  year: number;
  currency: string;
  consolidated: boolean;
  kpis: { invoicedHT: number; invoicedTTC: number; collected: number; outstanding: number; overdue: number; expenses: number; margin: number; openCount: number };
  monthly: { month: string; revenue: number; expenses: number; collected: number }[];
  byClient: { id: string; name: string; amount: number }[];
  byCategory: { category: string; amount: number }[];
  byEntity: { id: string; name: string; code: string; country: string; currency: string; color: string; provider: string; connected: boolean; revenue: number; expenses: number; invoices: number }[];
  checks: {
    paidWithoutPayment: { id: string; number: string; client: string | null; amount: number; currency: string }[];
    billsWithoutReceipt: { id: string; label: string; amount: number; currency: string; date: string | null }[];
    billsWithoutAmount: { id: string; label: string; date: string | null }[];
    unmatchedTransactions: { id: string; label: string; amount: number; currency: string; side: string; date: string }[];
    paidBillsWithoutTransaction: { id: string; label: string; amount: number; currency: string }[];
    overdue: { id: string; number: string; client: string | null; balance: number; currency: string; dueDate: string | null }[];
  };
};

export function FinancePage() {
  const { tr, t, locale } = useI18n();
  const navigate = useNavigate();
  const [year, setYear] = useState(new Date().getFullYear());
  const [entity, setEntity] = useState("all");
  const { data, isLoading } = useQuery({ queryKey: ["finance", "summary", year, entity], queryFn: () => api<FinanceSummary>(`/finance/summary?year=${year}&entity=${entity}`) });
  const cur = data?.currency ?? "CAD";
  const money = (n: number) => formatMoney(n, cur, locale);
  const catField = TABLES.bill.fields.find((f) => f.key === "category")!;
  const monthLabel = (m: string) => fmtDate(`${m}-01`, locale, { month: "short" }).replace(".", "");

  const kpis = data?.kpis;
  const checks = data?.checks;
  const issues = checks ? checks.billsWithoutReceipt.length + checks.billsWithoutAmount.length + checks.unmatchedTransactions.length + checks.paidWithoutPayment.length + checks.paidBillsWithoutTransaction.length : 0;

  return (
    <AppShell
      title={t("finance")}
      actions={
        <div className="flex items-center gap-2">
          <select value={entity} onChange={(e) => setEntity(e.target.value)} className="h-9 rounded-xl border border-border bg-surface px-3 text-[13px] outline-none">
            <option value="all">{t("allEntities")}</option>
            {data?.byEntity.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.country})
              </option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-9 rounded-xl border border-border bg-surface px-3 text-[13px] outline-none">
            {[0, 1, 2].map((d) => {
              const y = new Date().getFullYear() - d;
              return (
                <option key={y} value={y}>
                  {y}
                </option>
              );
            })}
          </select>
        </div>
      }
    >
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 pb-16 pt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight">
                {t("finance")} <span className="font-serif text-[32px] font-normal italic text-muted">{year}</span>
              </h1>
              <p className="text-[13px] text-muted">
                {data?.consolidated ? `${t("consolidated")} · EUR × 1,52` : tr({ fr: "Montants dans la devise de la structure", en: "Amounts in entity currency" })}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => navigate({ to: "/db/$table", params: { table: "invoice" } })}>
                <Receipt /> {tr(TABLES.invoice.label)}
              </Button>
              <Button size="sm" onClick={() => navigate({ to: "/db/$table", params: { table: "bill" } })}>
                <Wallet /> {tr(TABLES.bill.label)}
              </Button>
              <Button size="sm" onClick={() => navigate({ to: "/db/$table", params: { table: "transaction" } })}>
                <Banknote /> {tr(TABLES.transaction.label)}
              </Button>
            </div>
          </div>

          {/* KPIs */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: tr({ fr: "Facturé HT", en: "Invoiced (net)" }), value: kpis?.invoicedHT, icon: CircleDollarSign, tint: "#2563eb" },
              { label: t("collected"), value: kpis?.collected, icon: ArrowDownRight, tint: "#10b981" },
              { label: t("outstanding"), value: kpis?.outstanding, icon: Receipt, tint: "#8b5cf6", sub: kpis ? `${kpis.openCount} ${tr({ fr: "factures", en: "invoices" })}` : "" },
              { label: t("expenses"), value: kpis?.expenses, icon: ArrowUpRight, tint: "#ec4899" },
              { label: t("margin"), value: kpis?.margin, icon: Landmark, tint: "#0a1430" },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
                <div className="flex items-center justify-between text-[13px] text-muted">
                  {k.label}
                  <span className="grid size-7 place-items-center rounded-lg text-white" style={{ background: k.tint }}>
                    <k.icon className="size-3.5" />
                  </span>
                </div>
                <div className="mt-3 text-[22px] font-semibold tabular-nums tracking-tight">{isLoading ? <Skeleton className="h-7 w-24" /> : money(k.value ?? 0)}</div>
                {k.sub ? <div className="mt-1 text-xs text-subtle">{k.sub}</div> : null}
              </div>
            ))}
          </div>

          {kpis && kpis.overdue > 0 && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
              <AlertTriangle className="size-4" />
              <span>
                <strong>{money(kpis.overdue)}</strong> {tr({ fr: "en retard de paiement", en: "overdue" })} —{" "}
                {checks?.overdue.map((o) => `${o.number}${o.client ? ` (${o.client})` : ""}`).join(", ")}
              </span>
              <Link to="/db/$table" params={{ table: "invoice" }} className="ml-auto font-medium underline">
                {tr({ fr: "Relancer", en: "Follow up" })}
              </Link>
            </div>
          )}

          {/* Chart */}
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-card lg:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[15px] font-semibold">{tr({ fr: "Revenus vs dépenses", en: "Revenue vs expenses" })}</div>
                  <div className="text-xs text-muted">{tr({ fr: "Par mois d'émission · encaissements en ligne", en: "By issue month · collections as line" })}</div>
                </div>
                <div className="flex gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[#2563eb]" />{t("revenue")}</span>
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[#ec4899]" />{t("expenses")}</span>
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-[#10b981]" />{t("collected")}</span>
                </div>
              </div>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data?.monthly ?? []} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--subtle)" }} />
                    <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: "var(--subtle)" }} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                    <RTooltip
                      cursor={{ fill: "var(--hover)" }}
                      formatter={(v) => money(Number(v))}
                      labelFormatter={(m) => fmtDate(`${String(m)}-01`, locale, { month: "long", year: "numeric" })}
                      contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12 }}
                    />
                    <Bar dataKey="revenue" name={t("revenue")} fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="expenses" name={t("expenses")} fill="#ec4899" radius={[6, 6, 0, 0]} maxBarSize={22} />
                    <Line type="monotone" dataKey="collected" name={t("collected")} stroke="#10b981" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
              <div className="text-[15px] font-semibold">{tr({ fr: "Dépenses par catégorie", en: "Expenses by category" })}</div>
              <div className="relative mt-2 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data?.byCategory ?? []} dataKey="amount" nameKey="category" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none">
                      {(data?.byCategory ?? []).map((c) => (
                        <Cell key={c.category} fill={HEX[catField.options!.find((o) => o.value === c.category)?.color ?? "gray"]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <div className="text-xs text-muted">{t("expenses")}</div>
                    <div className="text-[15px] font-semibold tabular-nums">{money(kpis?.expenses ?? 0)}</div>
                  </div>
                </div>
              </div>
              <div className="mt-2 space-y-1.5">
                {(data?.byCategory ?? []).map((c) => {
                  const o = catField.options!.find((x) => x.value === c.category);
                  return (
                    <div key={c.category} className="flex items-center gap-2 text-[13px]">
                      <span className="size-2 rounded-full" style={{ background: HEX[o?.color ?? "gray"] }} />
                      <span className="flex-1 truncate text-muted">{o ? tr(o.label) : c.category}</span>
                      <span className="tabular-nums">{money(c.amount)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            {/* Entities */}
            <div className="space-y-3">
              <h3 className="text-[15px] font-semibold">{tr({ fr: "Structures de facturation", en: "Billing entities" })}</h3>
              {data?.byEntity.map((e) => (
                <div key={e.id} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
                  <div className="flex items-center gap-3 p-4">
                    <span className="grid size-10 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: e.color }}>
                      {e.country}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold">{e.name}</div>
                      <div className="text-xs text-muted">
                        {e.currency} · {e.invoices} {tr({ fr: "factures", en: "invoices" })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[14px] font-semibold tabular-nums">{formatMoney(e.revenue, e.currency, locale)}</div>
                      <div className="text-xs tabular-nums text-muted">− {formatMoney(e.expenses, e.currency, locale)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border-t border-border bg-surface-2/60 px-4 py-2.5 text-[13px]">
                    <StatusDot ok={e.connected} />
                    <span className="font-medium">{e.provider === "qonto" ? "Qonto" : e.provider === "quickbooks" ? "QuickBooks" : "—"}</span>
                    <span className="text-muted">{e.connected ? t("connected") : t("notConnected")}</span>
                    <Button size="xs" variant="secondary" className="ml-auto" disabled title={t("comingSoon")}>
                      <Plug /> {t("connect")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Top clients */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
              <h3 className="text-[15px] font-semibold">{tr({ fr: "Meilleurs clients", en: "Top clients" })}</h3>
              <div className="mt-4 space-y-3">
                {(data?.byClient ?? []).map((c, i) => {
                  const max = data!.byClient[0]?.amount || 1;
                  return (
                    <button key={c.id} type="button" onClick={() => navigate({ to: "/db/$table/$id", params: { table: "organization", id: c.id } })} className="block w-full text-left">
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="truncate font-medium">{c.name}</span>
                        <span className="tabular-nums text-muted">{money(c.amount)}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full" style={{ width: `${(c.amount / max) * 100}%`, background: ["#2563eb", "#6366f1", "#8b5cf6", "#0ea5e9", "#14b8a6", "#10b981"][i % 6] }} />
                      </div>
                    </button>
                  );
                })}
                {!data?.byClient.length && <div className="text-[13px] text-subtle">—</div>}
              </div>
            </div>

            {/* Reconciliation */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-semibold">{t("reconciliation")}</h3>
                <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", issues ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-50 text-emerald-700")}>{issues ? `${issues} ${tr({ fr: "à vérifier", en: "to review" })}` : "OK"}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{tr({ fr: "Chaque recette doit être liée à une facture, chaque dépense à un justificatif.", en: "Every inflow needs an invoice, every expense a receipt." })}</p>
              <div className="mt-4 space-y-2">
                <Check icon={Link2Off} label={tr({ fr: "Transactions non rapprochées", en: "Unmatched transactions" })} items={checks?.unmatchedTransactions.map((x) => ({ id: x.id, label: `${x.label} · ${formatMoney(x.amount, x.currency, locale)}` }))} table="transaction" />
                <Check icon={FileWarning} label={tr({ fr: "Dépenses sans justificatif", en: "Bills without receipt" })} items={checks?.billsWithoutReceipt.map((x) => ({ id: x.id, label: x.label }))} table="bill" />
                <Check icon={CircleDollarSign} label={tr({ fr: "Dépenses sans montant", en: "Bills without amount" })} items={checks?.billsWithoutAmount.map((x) => ({ id: x.id, label: x.label }))} table="bill" />
                <Check icon={Receipt} label={tr({ fr: "Factures payées sans encaissement", en: "Paid invoices without payment" })} items={checks?.paidWithoutPayment.map((x) => ({ id: x.id, label: `${x.number}${x.client ? ` · ${x.client}` : ""}` }))} table="invoice" />
                <Check icon={Wallet} label={tr({ fr: "Dépenses payées sans transaction", en: "Paid bills without transaction" })} items={checks?.paidBillsWithoutTransaction.map((x) => ({ id: x.id, label: x.label }))} table="bill" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Check({ icon: I, label, items, table }: { icon: typeof Receipt; label: string; items?: { id: string; label: string }[]; table: "bill" | "invoice" | "transaction" }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const n = items?.length ?? 0;
  return (
    <div className="rounded-xl border border-border">
      <button type="button" onClick={() => n && setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]">
        {n ? <I className="size-4 text-amber-600" /> : <CheckCircle2 className="size-4 text-emerald-600" />}
        <span className="flex-1">{label}</span>
        <span className={cn("rounded-md px-1.5 text-xs tabular-nums", n ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "text-subtle")}>{n}</span>
      </button>
      {open && (
        <div className="border-t border-border py-1">
          {items!.map((x) => (
            <button key={x.id} type="button" onClick={() => navigate({ to: "/db/$table/$id", params: { table, id: x.id } })} className="block w-full truncate px-3 py-1 text-left text-xs text-muted hover:bg-hover hover:text-fg">
              {x.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

