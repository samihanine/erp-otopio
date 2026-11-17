/** Inline filter under each column header (input or select), stored in the view's filters as `col:<field>`. */
import { useEffect, useState } from "react";
import type { FieldDef, TableKey } from "@erp/shared";
import { useI18n } from "@/lib/i18n";
import { useOptions, type ViewConfig } from "@/lib/data";
import { cn } from "@/lib/utils";

const cls = "h-7 w-full min-w-0 rounded-md bg-surface-2/70 px-2 text-[12px] text-fg outline-none ring-1 ring-inset ring-transparent placeholder:text-subtle hover:ring-border focus:bg-surface focus:ring-accent/40";
const active = "bg-accent/[.07] ring-accent/30 text-accent";

type Props = { field: FieldDef; config: ViewConfig; onChange: (c: ViewConfig) => void; table: TableKey };

export const colFilterId = (key: string) => `col:${key}`;

export function ColumnFilter({ field, config, onChange }: Props) {
  const { tr } = useI18n();
  const id = colFilterId(field.key);
  const current = config.filters.find((f) => f.id === id);
  const set = (op: string | null, value?: unknown) => {
    const rest = config.filters.filter((f) => f.id !== id);
    onChange({ ...config, filters: op ? [...rest, { id, field: field.key, op, value }] : rest });
  };

  switch (field.type) {
    case "select":
      return (
        <select
          value={current?.op === "is_empty" ? "__empty" : ((current?.value as string[] | undefined)?.[0] ?? "")}
          onChange={(e) => (e.target.value === "__empty" ? set("is_empty") : set(e.target.value ? "in" : null, [e.target.value]))}
          className={cn(cls, current && active)}
        >
          <option value="">{tr({ fr: "Tous", en: "All" })}</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {tr(o.label)}
            </option>
          ))}
          <option value="__empty">{tr({ fr: "— vide —", en: "— empty —" })}</option>
        </select>
      );
    case "relation":
      return <RelationFilter field={field} value={(current?.value as string[] | undefined)?.[0] ?? (current?.op === "is_empty" ? "__empty" : "")} onSet={(v) => (v === "__empty" ? set("is_empty") : set(v ? "in" : null, [v]))} active={Boolean(current)} />;
    case "checkbox":
      return (
        <select value={current ? (current.op === "is_true" ? "1" : "0") : ""} onChange={(e) => set(e.target.value === "" ? null : e.target.value === "1" ? "is_true" : "is_false")} className={cn(cls, current && active)}>
          <option value="">{tr({ fr: "Tous", en: "All" })}</option>
          <option value="1">{tr({ fr: "Oui", en: "Yes" })}</option>
          <option value="0">{tr({ fr: "Non", en: "No" })}</option>
        </select>
      );
    case "date":
    case "datetime":
      return (
        <select value={current?.op ?? ""} onChange={(e) => set(e.target.value || null)} className={cn(cls, current && active)}>
          <option value="">{tr({ fr: "Toutes dates", en: "Any date" })}</option>
          <option value="this_week">{tr({ fr: "Cette semaine", en: "This week" })}</option>
          <option value="this_month">{tr({ fr: "Ce mois-ci", en: "This month" })}</option>
          <option value="this_year">{tr({ fr: "Cette année", en: "This year" })}</option>
          {field.type === "date" && <option value="past_due">{tr({ fr: "Dépassée", en: "Past due" })}</option>}
          <option value="is_empty">{tr({ fr: "Vide", en: "Empty" })}</option>
          <option value="is_not_empty">{tr({ fr: "Renseignée", en: "Set" })}</option>
        </select>
      );
    case "number":
    case "currency":
    case "percent":
      return <TextFilter value={String(current?.value ?? "")} placeholder="≥" numeric onSet={(v) => set(v === "" ? null : "gte", Number(v))} active={Boolean(current)} />;
    case "lines":
    case "sections":
      return <div />;
    default:
      return <TextFilter value={String(current?.value ?? "")} placeholder={tr({ fr: "Filtrer…", en: "Filter…" })} onSet={(v) => set(v ? "contains" : null, v)} active={Boolean(current)} />;
  }
}

function TextFilter({ value, placeholder, onSet, active: on, numeric }: { value: string; placeholder: string; onSet: (v: string) => void; active: boolean; numeric?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (v === value) return;
    const t = setTimeout(() => onSet(v.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} inputMode={numeric ? "decimal" : undefined} className={cn(cls, on && active, numeric && "text-right")} />;
}

function RelationFilter({ field, value, onSet, active: on }: { field: FieldDef; value: string; onSet: (v: string) => void; active: boolean }) {
  const { tr } = useI18n();
  const [load, setLoad] = useState(Boolean(value));
  const { data = [] } = useOptions(field.relation, "", load, field.relationScope);
  return (
    <select value={value} onFocus={() => setLoad(true)} onMouseDown={() => setLoad(true)} onChange={(e) => onSet(e.target.value)} className={cn(cls, on && active)}>
      <option value="">{tr({ fr: "Tous", en: "All" })}</option>
      {data.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
      {value && value !== "__empty" && !data.some((o) => o.id === value) && <option value={value}>…</option>}
      <option value="__empty">{tr({ fr: "— vide —", en: "— empty —" })}</option>
    </select>
  );
}
