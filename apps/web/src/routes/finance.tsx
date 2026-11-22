import { useWorkspaces } from "@/lib/workspace";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Banknote, CheckCircle2, FileWarning, Landmark, Receipt, Wallet } from "lucide-react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { formatMoney, TABLES } from "@erp/shared";
import { AppShell } from "@/components/layout/app-shell";
import { api } from "@/lib/api";
import { fmtDate, useI18n } from "@/lib/i18n";
import { HEX } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { usePrefValue } from "@/lib/use-media";
import { TaxesView } from "./taxes";
import { AlertsCard } from "./automation";

export type FinanceSummary = {
  year: number | "all";
  years?: string[];
  currency: string;
  consolidated: boolean;
  fx?: { date: string; source: string; rates: Record<string, number> };
  breakdown?: Record<"collected" | "expenses" | "balance", { ht: number; vat: number; ttc: number }>;
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
  personal?: { total: number; count: number; byCategory: { category: string; amount: number }[] };
  subscriptions?: { id: string; label: string; scope: string; recurrence: string; amount: number; currency: string; monthly: number; lastCharge: string | null; card: string | null }[];
  subscriptionsMonthly?: number;
  series?: Record<"month" | "year", { month: string; revenue: number; expenses: number; collected: number }[]>;
  ledger?: LedgerRow[];
  receivables?: { id: string; number: string; client: string | null; issueDate: string | null; dueDate: string | null; balance: number; original: number; currency: string; overdue: boolean }[];
};
type LedgerRow = { id: string; table: "transaction"; date: string | null; label: string; party: string | null; category: string | null; entity: string; side: "expense" | "income"; amount: number; original: number; currency: string; hasFile: boolean; status: string; reimburse: boolean };

export function FinancePage() {
  const { tr, t, locale } = useI18n();
  const navigate = useNavigate();
  const [year, setYear] = useState<string>("all");
  const [months, setMonths] = useState<number[]>([]);
  const entity = "all";
  const [view0, setView] = usePrefValue<"dashboard" | "taxes">("finance:view", "dashboard");
  const { enabled, ws } = useWorkspaces();
  const view = !enabled("taxes") ? "dashboard" : !enabled("finance") ? "taxes" : view0;
  const [grain, setGrain] = usePrefValue<"month" | "year">("finance:grain", "month");
  const [currency, setCurrency] = useState<string>(() => {
    try {
      return localStorage.getItem(`erp.finance.currency.${ws?.id}`) ?? ws?.currency ?? "CAD";
    } catch {
      return ws?.currency ?? "CAD";
    }
  });
  const pickCurrency = (c: string) => {
    setCurrency(c);
    try {
      localStorage.setItem(`erp.finance.currency.${ws?.id}`, c);
    } catch {}
  };
  const { data, isLoading } = useQuery({
    queryKey: ["finance", "summary", year, months.join(","), entity, currency],
    queryFn: () => api<FinanceSummary>(`/finance/summary?year=${year}&months=${months.join(",")}&entity=${entity}&currency=${currency}`),
    placeholderData: (prev) => prev,
  });
  const years = [...new Set([...(data?.years ?? []), String(new Date().getFullYear())])].sort().reverse();
  const MONTHS = Array.from({ length: 12 }, (_, i) => fmtDate(`2026-${String(i + 1).padStart(2, "0")}-01`, locale, { month: "short" }).replace(".", ""));
  const periodLabel = `${year === "all" ? tr({ fr: "Toutes les années", en: "All years" }) : year}${months.length ? ` · ${months.map((m) => MONTHS[m - 1]).join(", ")}` : ""}`;
  const cur = data?.currency ?? "CAD";
  const money = (n: number) => formatMoney(n, cur, locale);
  const catField = TABLES.transaction.fields.find((f) => f.key === "category")!;
  const monthLabel = (m: string) => (m.length === 4 ? m : fmtDate(`${m}-01`, locale, { month: "short" }).replace(".", ""));

  const kpis = data?.kpis;
  const checks = data?.checks;
  const issues = checks ? checks.billsWithoutReceipt.length + checks.billsWithoutAmount.length + checks.unmatchedTransactions.length + checks.paidWithoutPayment.length + checks.paidBillsWithoutTransaction.length : 0;

  return (
    <AppShell
      title={t("finance")}
      tabs={
        enabled("finance") && enabled("taxes")
          ? [
              { key: "dashboard", label: tr({ fr: "Finance", en: "Finance" }), onClick: () => setView("dashboard"), active: view === "dashboard" },
              { key: "taxes", label: tr({ fr: "Fiscal", en: "Tax" }), onClick: () => setView("taxes"), active: view === "taxes" },
            ]
          : []
      }
      actions={
        view === "taxes" ? null : (
        <div className="flex items-center gap-2">
          <Combobox
            size="md"
            className="w-40 md:w-44"
            value={year}
            onChange={(v) => setYear(v ?? "all")}
            options={["all", ...years].map((y) => ({ value: y, label: y === "all" ? tr({ fr: "Toutes les années", en: "All years" }) : y }))}
          />
          <Combobox
            multiple
            size="md"
            className="w-44"
            placeholder={tr({ fr: "Tous les mois", en: "All months" })}
            value={months.map(String)}
            onChange={(v) => setMonths(v.map(Number).sort((a, b) => a - b))}
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m.charAt(0).toUpperCase() + m.slice(1) }))}
          />
          <Segmented value={currency} onChange={pickCurrency} options={["CAD", "EUR", "USD"].map((c) => ({ value: c, label: c }))} />
        </div>
        )
      }
    >
      <div className="h-full overflow-y-auto">
        <div className={cn("mx-auto px-4 pb-16 pt-6 md:px-8 md:pt-8", view === "taxes" ? "max-w-[1600px]" : "max-w-7xl")}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[24px] font-semibold tracking-tight md:text-[28px]">
                {view === "taxes" ? tr({ fr: "Fiscal", en: "Tax" }) : tr({ fr: "Finance", en: "Finance" })} {view === "taxes" ? null : <span className="font-serif text-[26px] font-normal italic text-muted">{periodLabel}</span>}
              </h1>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => navigate({ to: "/db/$table", params: { table: "transaction" } })}>
                <Banknote /> {tr(TABLES.transaction.label)}
              </Button>
            </div>
          </div>

          {view === "taxes" ? (
            <TaxesView />
          ) : (
            <>
          {/* VAT cards */}
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {(
              [
                ["collected", tr({ fr: "Encaissé", en: "Collected" }), tr({ fr: "TVA collectée", en: "VAT collected" }), ArrowDownRight, "#10b981"],
                ["expenses", tr({ fr: "Dépenses", en: "Expenses" }), tr({ fr: "TVA déductible", en: "Deductible VAT" }), ArrowUpRight, "#ec4899"],
                ["balance", tr({ fr: "Bilan", en: "Balance" }), tr({ fr: "TVA à reverser", en: "VAT payable" }), Landmark, "#6366f1"],
              ] as const
            ).map(([k, label, vatLabel, Icon, tint]) => {
              const b = data?.breakdown?.[k];
              return (
                <div key={k} className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5">
                  <div className="absolute inset-x-0 top-0 h-1" style={{ background: tint }} />
                  <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
                    <span className="grid size-7 place-items-center rounded-lg" style={{ background: `${tint}1a`, color: tint }}>
                      <Icon className="size-4" />
                    </span>
                    {label}
                    <span className="ml-auto text-[11px] font-normal uppercase tracking-wider text-subtle">{tr({ fr: "HT", en: "Net" })}</span>
                  </div>
                  <div className={cn("mt-3 text-[26px] font-semibold tabular-nums tracking-tight", k === "balance" && b && b.ht < 0 && "text-rose-600")}>{isLoading || !b ? <Skeleton className="h-8 w-32" /> : money(b.ht)}</div>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-[12.5px]">
                    <div>
                      <div className="text-subtle">{vatLabel}</div>
                      <div className="mt-0.5 font-medium tabular-nums">{b ? money(b.vat) : "…"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-subtle">{tr({ fr: "Total TTC", en: "Total incl. VAT" })}</div>
                      <div className="mt-0.5 font-medium tabular-nums">{b ? money(b.ttc) : "…"}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ledger */}

          {/* Chart */}
          <div className="mt-6 rounded-2xl border border-border p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[15px] font-semibold">{tr({ fr: "Revenus vs dépenses", en: "Revenue vs expenses" })}</div>
                <div className="text-xs text-muted">{tr({ fr: "Facturé HT, dépenses TTC · encaissements en ligne", en: "Invoiced net, expenses gross · collections as line" })}</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[#2563eb]" />{t("revenue")}</span>
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[#ec4899]" />{t("expenses")}</span>
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-[#10b981]" />{t("collected")}</span>
                </div>
                <Segmented value={grain} onChange={setGrain} options={[{ value: "month", label: tr({ fr: "Mois", en: "Month" }) }, { value: "year", label: tr({ fr: "Année", en: "Year" }) }]} />
              </div>
            </div>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data?.series?.[grain] ?? data?.monthly ?? []} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="month" tickFormatter={(m: string) => (m.length === 4 ? m : `${monthLabel(m)}${year === "all" ? ` ${m.slice(2, 4)}` : ""}`)} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--subtle)" }} />
                  <YAxis domain={[0, "auto"]} tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: "var(--subtle)" }} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <RTooltip
                    cursor={{ fill: "var(--hover)" }}
                    formatter={(v) => money(Number(v))}
                    labelFormatter={(m) => (String(m).length === 4 ? String(m) : fmtDate(`${String(m)}-01`, locale, { month: "long", year: "numeric" }))}
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12 }}
                  />
                  <Bar dataKey="revenue" name={t("revenue")} fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="expenses" name={t("expenses")} fill="#ec4899" radius={[6, 6, 0, 0]} maxBarSize={22} />
                  <Line type="linear" dataKey="collected" name={t("collected")} stroke="#10b981" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Donut + subscriptions */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <div className="rounded-2xl border border-border p-5">
              <div className="text-[15px] font-semibold">{tr({ fr: "Dépenses par catégorie", en: "Expenses by category" })}</div>
              <div className="mt-2 grid items-center gap-4 sm:grid-cols-[200px_1fr]">
                <div className="relative h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data?.byCategory ?? []} dataKey="amount" nameKey="category" innerRadius={58} outerRadius={86} paddingAngle={2} stroke="none">
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
                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {(data?.byCategory ?? []).map((c) => {
                    const o = catField.options!.find((x) => x.value === c.category);
                    const pct = kpis?.expenses ? (c.amount / kpis.expenses) * 100 : 0;
                    return (
                      <div key={c.category} className="flex items-center gap-2 text-[13px]">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: HEX[o?.color ?? "gray"] }} />
                        <span className="flex-1 truncate text-muted">{o ? tr(o.label) : c.category}</span>
                        <span className="w-10 text-right text-xs tabular-nums text-subtle">{pct.toFixed(0)} %</span>
                        <span className="w-24 text-right tabular-nums">{money(c.amount)}</span>
                      </div>
                    );
                  })}
                  {!data?.byCategory.length && <div className="text-[13px] text-subtle">—</div>}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[15px] font-semibold">{tr({ fr: "Abonnements en cours", en: "Active subscriptions" })}</h3>
                <span className="text-[13px] tabular-nums text-muted">
                  ≈ {money(data?.subscriptionsMonthly ?? 0)} / {tr({ fr: "mois", en: "month" })}
                </span>
              </div>
              <div className="mt-3 max-h-60 space-y-0.5 overflow-y-auto">
                {(data?.subscriptions ?? []).map((s) => (
                  <button key={s.id} type="button" onClick={() => navigate({ to: "/db/$table/$id", params: { table: "transaction", id: s.id } })} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[13px] hover:bg-hover">
                    <span className={cn("size-1.5 shrink-0 rounded-full", s.scope === "perso" ? "bg-pink-500" : "bg-blue-500")} />
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    {s.card && <span className="hidden shrink-0 text-xs text-subtle sm:inline">{s.card}</span>}
                    <span className="shrink-0 tabular-nums text-muted">
                      {formatMoney(s.amount, s.currency, locale)}
                      <span className="text-subtle">/{s.recurrence === "yearly" ? tr({ fr: "an", en: "yr" }) : s.recurrence === "quarterly" ? tr({ fr: "trim.", en: "qtr" }) : tr({ fr: "mois", en: "mo" })}</span>
                    </span>
                  </button>
                ))}
                {!data?.subscriptions?.length && <div className="text-[13px] text-subtle">—</div>}
              </div>
            </div>
          </div>

          {/* Top clients + receivables */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <div className="rounded-2xl border border-border p-5">
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

            <div className="rounded-2xl border border-border p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[15px] font-semibold">{tr({ fr: "Factures à encaisser", en: "Invoices to collect" })}</h3>
                <span className="text-[13px] tabular-nums text-muted">{money(kpis?.outstanding ?? 0)}</span>
              </div>
              <div className="mt-3 max-h-60 space-y-0.5 overflow-y-auto">
                {(data?.receivables ?? []).map((r) => (
                  <button key={r.id} type="button" onClick={() => navigate({ to: "/db/$table/$id", params: { table: "transaction", id: r.id } })} className="flex w-full items-center gap-3 rounded-md px-1.5 py-1.5 text-left text-[13px] hover:bg-hover">
                    <span className={cn("size-1.5 shrink-0 rounded-full", r.overdue ? "bg-rose-500" : "bg-amber-500")} />
                    <span className="w-28 shrink-0 font-medium">{r.number}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{r.client ?? "—"}</span>
                    <span className={cn("hidden shrink-0 text-xs sm:inline", r.overdue ? "text-rose-600" : "text-subtle")}>
                      {r.dueDate ? `${r.overdue ? tr({ fr: "échue", en: "due" }) : tr({ fr: "éch.", en: "due" })} ${fmtDate(r.dueDate, locale, { day: "numeric", month: "short" })}` : ""}
                    </span>
                    <span className="w-24 shrink-0 text-right tabular-nums">{formatMoney(r.original, r.currency, locale)}</span>
                  </button>
                ))}
                {!data?.receivables?.length && <div className="text-[13px] text-subtle">{tr({ fr: "Rien en attente.", en: "Nothing pending." })}</div>}
              </div>
            </div>
          </div>

          {/* Needs attention + full ledger */}
          <AlertsCard />
          <Ledger rows={data?.ledger ?? []} money={money} cur={cur} />
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Ledger({ rows, money, cur }: { rows: LedgerRow[]; money: (n: number) => string; cur: string }) {
  const { tr, locale } = useI18n();
  const navigate = useNavigate();
  const [kind, setKind] = usePrefValue<"all" | "expense" | "income" | "missing">("finance:ledger", "all");
  const [sort, setSort] = useState<string>("date");
  const [month, setMonth] = useState<string>("all");
  const [limit, setLimit] = useState(25);
  const catField = TABLES.transaction.fields.find((f) => f.key === "category")!;
  const monthsAvail = [...new Set(rows.map((r) => r.date?.slice(0, 7)).filter(Boolean) as string[])].sort().reverse();
  const missingCount = rows.filter((r) => !r.hasFile).length;
  let list = rows.filter((r) => (kind === "all" ? true : kind === "missing" ? !r.hasFile : r.side === kind) && (month === "all" || r.date?.startsWith(month)));
  list = [...list].sort((a, b) => (sort === "amount" ? b.amount - a.amount : sort === "missing" ? Number(a.hasFile) - Number(b.hasFile) || String(b.date).localeCompare(String(a.date)) : String(b.date).localeCompare(String(a.date))));
  const total = list.reduce((a, r) => a + (r.side === "income" ? r.amount : -r.amount), 0);
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h3 className="mr-2 text-[15px] font-semibold">{tr({ fr: "Transactions", en: "Transactions" })}</h3>
        <Segmented
          className="no-scrollbar max-w-full overflow-x-auto"
          value={kind}
          onChange={(v) => {
            setKind(v);
            setLimit(25);
          }}
          options={[
            { value: "all", label: tr({ fr: "Tout", en: "All" }) },
            { value: "expense", label: tr({ fr: "Dépenses", en: "Expenses" }) },
            { value: "income", label: tr({ fr: "Recettes", en: "Income" }) },
            { value: "missing", label: `${tr({ fr: "Justificatif manquant", en: "Missing receipt" })}${missingCount ? ` · ${missingCount}` : ""}` },
          ]}
        />
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <Combobox size="md" className="min-w-0 flex-1 sm:w-40 sm:flex-none" value={month} onChange={(v) => setMonth(v ?? "all")} options={[{ value: "all", label: tr({ fr: "Tous les mois", en: "All months" }) }, ...monthsAvail.map((m) => ({ value: m, label: fmtDate(`${m}-01`, locale, { month: "long", year: "numeric" }) }))]} />
          <Combobox
            size="md"
            className="min-w-0 flex-1 sm:w-44 sm:flex-none"
            value={sort}
            onChange={(v) => setSort(v ?? "date")}
            options={[
              { value: "date", label: tr({ fr: "Trier : date", en: "Sort: date" }) },
              { value: "amount", label: tr({ fr: "Trier : montant", en: "Sort: amount" }) },
              { value: "missing", label: tr({ fr: "Trier : manquants", en: "Sort: missing" }) },
            ]}
          />
        </div>
      </div>
      <div className="divide-y divide-border md:hidden">
        {list.slice(0, limit).map((r) => {
          const o = r.category ? catField.options!.find((x) => x.value === r.category) : null;
          return (
            <button key={`${r.table}:${r.id}`} type="button" onClick={() => navigate({ to: "/db/$table/$id", params: { table: r.table, id: r.id } })} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-hover">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: r.side === "income" ? "#10b9811a" : `${HEX[o?.color ?? "gray"]}1f` }}>
                {r.hasFile ? <CheckCircle2 className="size-4 text-emerald-600" /> : <FileWarning className="size-4 text-amber-500" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{r.label}</span>
                <span className="block truncate text-[11.5px] text-subtle">
                  {r.date ? fmtDate(r.date, locale, { day: "numeric", month: "short", year: "2-digit" }) : "—"} · {r.side === "income" ? tr({ fr: "Recette", en: "Income" }) : o ? tr(o.label) : r.category}
                  {r.reimburse ? ` · ${tr({ fr: "à rembourser", en: "reimburse" })}` : ""}
                </span>
              </span>
              <span className={cn("shrink-0 text-right text-[13px] font-semibold tabular-nums", r.side === "income" && "text-emerald-700 dark:text-emerald-400")}>
                {r.side === "income" ? "+" : "−"} {money(r.amount)}
                {r.currency !== cur && <span className="block text-[10.5px] font-normal text-subtle">{formatMoney(r.original, r.currency, locale)}</span>}
              </span>
            </button>
          );
        })}
        {!list.length && <div className="p-8 text-center text-[13px] text-subtle">{tr({ fr: "Aucune ligne pour ce filtre.", en: "No rows for this filter." })}</div>}
      </div>
      <div className="overflow-x-auto max-md:hidden">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead className="bg-surface-2/50 text-left text-[11px] uppercase tracking-wider text-subtle">
            <tr>
              <th className="px-4 py-2 font-medium">{tr({ fr: "Date", en: "Date" })}</th>
              <th className="px-4 py-2 font-medium">{tr({ fr: "Libellé", en: "Label" })}</th>
              <th className="px-4 py-2 font-medium">{tr({ fr: "Catégorie", en: "Category" })}</th>
              <th className="px-4 py-2 text-right font-medium">{tr({ fr: "Montant", en: "Amount" })}</th>
              <th className="px-4 py-2 text-center font-medium">{tr({ fr: "Justificatif", en: "Receipt" })}</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.slice(0, limit).map((r) => {
              const o = r.category ? catField.options!.find((x) => x.value === r.category) : null;
              return (
                <tr key={`${r.table}:${r.id}`} className="border-t border-border hover:bg-hover/50">
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted">{r.date ? fmtDate(r.date, locale, { day: "numeric", month: "short", year: "2-digit" }) : "—"}</td>
                  <td className="max-w-[320px] px-4 py-2">
                    <div className="truncate font-medium">{r.label}</div>
                    {r.party && <div className="truncate text-xs text-subtle">{r.party}</div>}
                  </td>
                  <td className="px-4 py-2">
                    {r.side === "income" ? (
                      <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11.5px] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{tr({ fr: "Recette", en: "Income" })}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-muted">
                        <span className="size-2 rounded-full" style={{ background: HEX[o?.color ?? "gray"] }} />
                        {o ? tr(o.label) : r.category}
                        {r.reimburse && <span className="rounded bg-orange-50 px-1 text-[10.5px] text-orange-700 dark:bg-orange-950 dark:text-orange-300">{tr({ fr: "à rembourser", en: "reimburse" })}</span>}
                      </span>
                    )}
                  </td>
                  <td className={cn("whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums", r.side === "income" ? "text-emerald-700 dark:text-emerald-400" : "")}>
                    {r.side === "income" ? "+" : "−"} {money(r.amount)}
                    {r.currency !== cur && <div className="text-[11px] font-normal text-subtle">{formatMoney(r.original, r.currency, locale)}</div>}
                  </td>
                  <td className="px-4 py-2 text-center">{r.hasFile ? <CheckCircle2 className="mx-auto size-4 text-emerald-600" /> : <FileWarning className="mx-auto size-4 text-amber-500" />}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="xs" variant="secondary" onClick={() => navigate({ to: "/db/$table/$id", params: { table: r.table, id: r.id } })}>
                      {tr({ fr: "Voir", en: "View" })}
                    </Button>
                  </td>
                </tr>
              );
            })}
            {!list.length && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-subtle">
                  {tr({ fr: "Aucune ligne pour ce filtre.", en: "No rows for this filter." })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 border-t border-border bg-surface-2/40 px-4 py-2 text-[12.5px] text-muted">
        <span>
          {list.length} {tr({ fr: "lignes", en: "rows" })} · {tr({ fr: "solde", en: "net" })} <span className="font-medium tabular-nums text-fg">{money(total)}</span>
        </span>
        {list.length > limit && (
          <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setLimit(limit + 50)}>
            {tr({ fr: "Afficher plus", en: "Show more" })}
          </Button>
        )}
      </div>
    </div>
  );
}
