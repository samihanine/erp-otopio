/** Inline filter under each column header (combobox or input), stored in the view's filters as `col:<field>`. */
import { useEffect, useState } from "react";
import type { FieldDef, TableKey } from "@erp/shared";
import { useI18n } from "@/lib/i18n";
import { useOptions, type ViewConfig } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Combobox } from "@/components/ui/combobox";

const cls = "h-7 w-full min-w-0 rounded-md bg-surface-2/70 px-2 text-[12px] text-fg outline-none ring-1 ring-inset ring-transparent placeholder:text-subtle hover:ring-border focus:bg-surface focus:ring-accent/40";
const active = "bg-accent/[.07] ring-accent/30 text-accent";
const EMPTY = "__empty";

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
  const all = tr({ fr: "Tous", en: "All" });
  const emptyLabel = tr({ fr: "— vide —", en: "— empty —" });
  const multiValue = current?.op === "is_empty" ? [EMPTY] : ((current?.value as string[] | undefined) ?? []);
  const setMulti = (v: string[]) => {
    if (!v.length) return set(null);
    if (v.includes(EMPTY)) return set("is_empty"); // "empty" alone (combined with values is not supported by the API)
    set("in", v);
  };

  switch (field.type) {
    case "select":
      return (
        <Combobox
          multiple
          size="xs"
          active={Boolean(current)}
          placeholder={all}
          value={multiValue}
          onChange={setMulti}
          options={[...(field.options ?? []).map((o) => ({ value: o.value, label: tr(o.label), color: o.color })), { value: EMPTY, label: emptyLabel }]}
        />
      );
    case "relation":
      return <RelationFilter field={field} value={multiValue} onSet={setMulti} placeholder={all} emptyLabel={emptyLabel} />;
    case "checkbox":
      return (
        <Combobox
          size="xs"
          clearable
          active={Boolean(current)}
          placeholder={all}
          value={current ? (current.op === "is_true" ? "1" : "0") : null}
          onChange={(v) => set(v === null ? null : v === "1" ? "is_true" : "is_false")}
          options={[
            { value: "1", label: tr({ fr: "Oui", en: "Yes" }) },
            { value: "0", label: tr({ fr: "Non", en: "No" }) },
          ]}
        />
      );
    case "date":
    case "datetime":
      return (
        <Combobox
          size="xs"
          clearable
          active={Boolean(current)}
          placeholder={tr({ fr: "Toutes dates", en: "Any date" })}
          value={current?.op ?? null}
          onChange={(v) => set(v)}
          options={[
            { value: "this_week", label: tr({ fr: "Cette semaine", en: "This week" }) },
            { value: "this_month", label: tr({ fr: "Ce mois-ci", en: "This month" }) },
            { value: "this_year", label: tr({ fr: "Cette année", en: "This year" }) },
            ...(field.type === "date" ? [{ value: "past_due", label: tr({ fr: "Dépassée", en: "Past due" }) }] : []),
            { value: "is_empty", label: tr({ fr: "Vide", en: "Empty" }) },
            { value: "is_not_empty", label: tr({ fr: "Renseignée", en: "Set" }) },
          ]}
        />
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

function RelationFilter({ field, value, onSet, placeholder, emptyLabel }: { field: FieldDef; value: string[]; onSet: (v: string[]) => void; placeholder: string; emptyLabel: string }) {
  const [load, setLoad] = useState(value.length > 0);
  const [q, setQ] = useState("");
  const { data = [], isFetching } = useOptions(field.relation, q, load, field.relationScope);
  const { data: picked = [] } = useOptions(field.relation, "", value.length > 0, field.relationScope);
  const map = new Map([...picked, ...data].map((o) => [o.id, o]));
  return (
    <Combobox
      multiple
      size="xs"
      active={value.length > 0}
      placeholder={placeholder}
      value={value}
      onChange={onSet}
      onOpenChange={(o) => o && setLoad(true)}
      onSearch={setQ}
      loading={isFetching}
      options={[...[...map.values()].map((o) => ({ value: o.id, label: o.label, hint: o.subtitle ?? undefined })), { value: EMPTY, label: emptyLabel }]}
    />
  );
}
