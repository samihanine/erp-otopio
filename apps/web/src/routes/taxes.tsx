import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Circle, Info, Landmark } from "lucide-react";
import { formatMoney } from "@erp/shared";
import { api } from "@/lib/api";
import { fmtDate, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Combobox } from "@/components/ui/combobox";
import { Segmented, Skeleton } from "@/components/ui/misc";

type Line = { key: string; label: string; base: number; rate: string; amount: number; note?: string };
type Deadline = { key: string; date: string; title: string; detail: string; authority: string; kind: "declare" | "pay" | "admin"; amount?: number; conditional?: boolean; entity: string; currency: string; done: boolean };
type EntityTax = {
  code: "OTP" | "MGS";
  name: string;
  country: string;
  currency: string;
  color: string;
  config: Record<string, unknown>;
  fy: { start: string; end: string; first: boolean; days: number };
  figures: { revenueHT: number; expensesHT: number; profit: number; invoices: number; bills: number };
  taxes: Line[];
  sales: Line[];
  totalIncomeTax: number;
  totalSales: number;
  total: number;
  deadlines: Deadline[];
  notes: string[];
};

const FLAG: Record<string, string> = { CA: "🇨🇦", FR: "🇫🇷" };

export function TaxesView() {
  const { tr, locale } = useI18n();
  const qc = useQueryClient();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const { data, isLoading } = useQuery({ queryKey: ["finance", "taxes", year], queryFn: () => api<{ year: number; today: string; entities: EntityTax[] }>(`/finance/taxes?year=${year}`), placeholderData: (p) => p });
  const save = async (code: string, patch: Record<string, unknown>) => {
    await api(`/finance/taxes/config/${code}`, { method: "PUT", body: JSON.stringify(patch) });
    qc.invalidateQueries({ queryKey: ["finance", "taxes"] });
  };
  const today = data?.today ?? new Date().toISOString().slice(0, 10);
  const deadlines = (data?.entities ?? []).flatMap((e) => e.deadlines).sort((a, b) => a.date.localeCompare(b.date));
  const days = (d: string) => Math.round((+new Date(d) - +new Date(today)) / 864e5);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <Combobox size="md" className="w-36" value={year} onChange={(v) => v && setYear(v)} options={["2026", "2027", "2028"].map((y) => ({ value: y, label: `${tr({ fr: "Exercice", en: "FY" })} ${y}` }))} />
        <p className="text-[12.5px] text-muted">
          {tr({ fr: "Estimation à partir des factures et dépenses de l'ERP, taux 2026. À valider avec un comptable avant de déclarer.", en: "Estimate from ERP invoices and bills, 2026 rates. Validate with an accountant before filing." })}
        </p>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        {isLoading && !data ? [0, 1].map((i) => <Skeleton key={i} className="h-96 rounded-2xl" />) : null}
        {(data?.entities ?? []).map((e) => {
          const money = (n: number) => formatMoney(n, e.currency, locale);
          return (
            <div key={e.code} className="overflow-hidden rounded-2xl border border-border">
              <div className="flex flex-wrap items-center gap-3 border-b border-border p-4 sm:p-5" style={{ background: `${e.color}0d` }}>
                <span className="grid size-10 place-items-center rounded-xl text-xl" style={{ background: `${e.color}1f` }}>
                  {FLAG[e.country] ?? e.country}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{e.name}</div>
                  <div className="text-xs text-muted">
                    {tr({ fr: "Exercice", en: "FY" })} {fmtDate(e.fy.start, locale)} → {fmtDate(e.fy.end, locale)}
                    {e.fy.first ? ` · ${tr({ fr: "1er exercice", en: "first FY" })}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-wider text-subtle">{tr({ fr: "À prévoir", en: "To set aside" })}</div>
                  <div className="text-[20px] font-semibold tabular-nums">{money(e.total)}</div>
                </div>
              </div>

              <div className="space-y-5 p-4 sm:p-5">
                {/* settings */}
                <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                  {e.code === "MGS" ? (
                    <>
                      <span className="text-muted">{tr({ fr: "Régime", en: "Regime" })}</span>
                      <Segmented value={String(e.config.regime)} onChange={(v) => save("MGS", { regime: v })} options={[{ value: "IS", label: "IS" }, { value: "IR", label: "IR" }]} />
                      {e.config.regime === "IS" ? (
                        <label className="ml-2 flex items-center gap-1.5 text-muted">
                          {tr({ fr: "Rémunération gérant", en: "Manager pay" })}
                          <input type="number" defaultValue={Number(e.config.gerantPay)} onBlur={(ev) => save("MGS", { gerantPay: Number(ev.target.value) || 0 })} className="h-7 w-24 rounded-md border border-border bg-transparent px-2 text-right tabular-nums" />
                        </label>
                      ) : (
                        <label className="ml-2 flex items-center gap-1.5 text-muted">
                          {tr({ fr: "Taux IR", en: "Income tax rate" })}
                          <input type="number" step="1" defaultValue={Math.round(Number(e.config.irRate) * 100)} onBlur={(ev) => save("MGS", { irRate: (Number(ev.target.value) || 0) / 100 })} className="h-7 w-16 rounded-md border border-border bg-transparent px-2 text-right tabular-nums" />%
                        </label>
                      )}
                    </>
                  ) : (
                    <>
                      <label className="flex items-center gap-1.5 text-muted">
                        <input type="checkbox" checked={Boolean(e.config.ccpc)} onChange={(ev) => save("OTP", { ccpc: ev.target.checked })} /> SPCC
                      </label>
                      <label className="ml-3 flex items-center gap-1.5 text-muted">
                        <input type="checkbox" checked={Boolean(e.config.qcSbd)} onChange={(ev) => save("OTP", { qcSbd: ev.target.checked })} /> {tr({ fr: "DPE Québec (≥ 5 500 h rémunérées)", en: "Québec SBD (≥ 5,500 paid hours)" })}
                      </label>
                    </>
                  )}
                </div>

                {/* figures */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    [tr({ fr: "Facturé HT", en: "Invoiced (net)" }), e.figures.revenueHT, `${e.figures.invoices} ${tr({ fr: "factures", en: "invoices" })}`],
                    [tr({ fr: "Charges HT", en: "Expenses (net)" }), e.figures.expensesHT, `${e.figures.bills} ${tr({ fr: "dépenses", en: "bills" })}`],
                    [tr({ fr: "Bénéfice", en: "Profit" }), e.figures.profit, tr({ fr: "imposable estimé", en: "est. taxable" })],
                  ].map(([l, v, s]) => (
                    <div key={String(l)} className="rounded-xl bg-surface-2/60 px-3 py-2.5">
                      <div className="text-[11.5px] text-muted">{l}</div>
                      <div className={cn("mt-0.5 text-[13.5px] font-semibold tabular-nums sm:text-[15px]", Number(v) < 0 && "text-rose-600")}>{money(Number(v))}</div>
                      <div className="text-[11px] text-subtle">{s}</div>
                    </div>
                  ))}
                </div>

                {/* tax lines */}
                {[
                  [tr({ fr: "Impôts & cotisations", en: "Income tax & contributions" }), e.taxes, e.totalIncomeTax],
                  [e.code === "OTP" ? tr({ fr: "Taxes de vente (TPS/TVQ)", en: "Sales taxes (GST/QST)" }) : tr({ fr: "TVA", en: "VAT" }), e.sales, e.totalSales],
                ].map(([title, lines, sub]) => (
                  <div key={String(title)}>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <h4 className="text-[13px] font-semibold">{String(title)}</h4>
                      <span className="text-[13px] font-semibold tabular-nums">{money(Number(sub))}</span>
                    </div>
                    <div className="divide-y divide-border rounded-xl border border-border">
                      {(lines as Line[]).map((l) => (
                        <div key={l.key} className="px-3 py-2">
                          <div className="flex items-center gap-2 text-[13px]">
                            <span className="flex-1">{l.label}</span>
                            <span className="text-xs text-subtle max-sm:hidden">{l.rate}</span>
                            <span className="w-24 text-right font-medium tabular-nums">{money(l.amount)}</span>
                          </div>
                          {l.note && <div className="mt-0.5 text-[11.5px] leading-snug text-subtle">{l.note}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <ul className="space-y-1 text-[11.5px] leading-snug text-subtle">
                  {e.notes.map((n, i) => (
                    <li key={i} className="flex gap-1.5">
                      <Info className="mt-0.5 size-3 shrink-0" />
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* calendar */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <CalendarClock className="size-4 text-muted" />
          <h3 className="text-[15px] font-semibold">{tr({ fr: "Échéances", en: "Deadlines" })}</h3>
          <span className="ml-auto text-xs text-subtle">{tr({ fr: "Coche une échéance une fois faite", en: "Tick a deadline once done" })}</span>
        </div>
        <div className="divide-y divide-border">
          {deadlines.map((d) => {
            const n = days(d.date);
            const late = n < 0 && !d.done;
            return (
              <div key={d.key} className={cn("flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 sm:flex-nowrap sm:px-5", d.done && "opacity-50")}>
                <button type="button" onClick={() => save(d.entity, { done: { [d.key]: !d.done } })} className="mt-0.5 text-muted hover:text-fg" title={tr({ fr: "Marquer comme fait", en: "Mark as done" })}>
                  {d.done ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4" />}
                </button>
                <div className="w-24 shrink-0">
                  <div className="text-[13px] font-medium tabular-nums">{fmtDate(d.date, locale, { day: "numeric", month: "short", year: "numeric" })}</div>
                  <div className={cn("text-[11px]", late ? "font-medium text-rose-600" : n <= 30 && !d.done ? "text-amber-600" : "text-subtle")}>
                    {d.done ? tr({ fr: "fait", en: "done" }) : n < 0 ? tr({ fr: `en retard de ${-n} j`, en: `${-n} d late` }) : n === 0 ? tr({ fr: "aujourd'hui", en: "today" }) : tr({ fr: `dans ${n} j`, en: `in ${n} d` })}
                  </div>
                </div>
                <span className="mt-0.5 shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium max-sm:hidden">{FLAG[d.entity === "OTP" ? "CA" : "FR"]} {d.entity}</span>
                <div className="min-w-0 flex-1 max-sm:basis-full max-sm:pl-7">
                  <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                    <span className="sm:hidden">{FLAG[d.entity === "OTP" ? "CA" : "FR"]}</span>
                    {d.kind === "pay" ? <Landmark className="size-3.5 text-rose-500" /> : null}
                    {d.title}
                    {d.conditional && <span className="rounded bg-amber-50 px-1 text-[10.5px] font-normal text-amber-700 dark:bg-amber-950 dark:text-amber-300">{tr({ fr: "si seuil atteint", en: "if threshold met" })}</span>}
                  </div>
                  <div className="text-[12px] leading-snug text-muted">{d.detail}</div>
                  <div className="text-[11px] text-subtle">{d.authority}</div>
                </div>
                {d.amount != null && d.amount > 0 && <div className="shrink-0 text-right text-[13px] font-semibold tabular-nums max-sm:w-full max-sm:pl-7 max-sm:text-left">{formatMoney(d.amount, d.currency, locale)}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
