import { useState } from "react";
import { ArrowDownUp, ArrowDown, ArrowUp, Eye, EyeOff, Filter, GripVertical, Plus, Search, Settings2, Trash2, X } from "lucide-react";
import { OP_LABELS, OPS_BY_TYPE, TABLES, VALUELESS_OPS, type FieldDef, type FilterOp, type TableKey, type ViewType } from "@erp/shared";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OptionBadge, Icon } from "@/components/ui/misc";
import { inputClass } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { useOptions, type ViewConfig } from "@/lib/data";
import { cn, uid } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

type Props = { table: TableKey; config: ViewConfig; onChange: (c: ViewConfig) => void };

const FIELD_ICON: Record<FieldDef["type"], string> = {
  text: "Type",
  longtext: "AlignLeft",
  number: "Hash",
  currency: "CircleDollarSign",
  percent: "Percent",
  date: "Calendar",
  datetime: "CalendarClock",
  select: "CircleChevronDown",
  tags: "Tags",
  relation: "Link2",
  checkbox: "SquareCheck",
  url: "Link",
  email: "AtSign",
  phone: "Phone",
  repo: "Github",
  lines: "List",
  sections: "LayoutPanelTop",
  image: "Image",
};
export const fieldIcon = (f: FieldDef) => FIELD_ICON[f.type];

function FieldPicker({ table, onPick, filter }: { table: TableKey; onPick: (f: FieldDef) => void; filter?: (f: FieldDef) => boolean }) {
  const { tr, t } = useI18n();
  const [q, setQ] = useState("");
  const fields = TABLES[table].fields.filter((f) => (filter ? filter(f) : true) && tr(f.label).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="w-56">
      <div className="mb-1 flex items-center gap-2 border-b border-border px-1.5 pb-1.5">
        <Search className="size-3.5 text-subtle" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="h-6 w-full bg-transparent text-[13px] outline-none placeholder:text-subtle" />
      </div>
      <div className="max-h-72 overflow-auto">
        {fields.map((f) => (
          <button key={f.key} type="button" onClick={() => onPick(f)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[13px] hover:bg-hover">
            <Icon name={fieldIcon(f)} className="size-3.5 text-muted" />
            {tr(f.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

function RelationValuePicker({ field, value, onChange }: { field: FieldDef; value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const { data = [] } = useOptions(field.relation, q);
  const { data: selected = [] } = useOptions(field.relation, "", value.length > 0);
  const { t } = useI18n();
  const known = new Map([...selected, ...data].map((o) => [o.id, o.label]));
  return (
    <div className="w-64">
      {value.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1 border-b border-border px-1 pb-1.5">
          {value.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs ring-1 ring-inset ring-border">
              {known.get(id) ?? "…"}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== id))}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className={cn(inputClass, "mb-1 h-7")} />
      <div className="max-h-56 overflow-auto">
        {data.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] hover:bg-hover">
            <Checkbox checked={value.includes(o.id)} onCheckedChange={(c) => onChange(c ? [...value, o.id] : value.filter((x) => x !== o.id))} />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function FilterValue({ field, op, value, onChange }: { field: FieldDef; op: FilterOp; value: unknown; onChange: (v: unknown) => void }) {
  const { tr, t } = useI18n();
  const [open, setOpen] = useState(false);
  if (VALUELESS_OPS.includes(op)) return null;
  if (field.type === "select") {
    const arr = (Array.isArray(value) ? value : value ? [value] : []) as string[];
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className={cn(inputClass, "flex h-7 min-w-36 flex-1 items-center gap-1 overflow-hidden text-left")}>
          {arr.length ? arr.map((v) => <OptionBadge key={v} option={field.options?.find((o) => o.value === v)} />) : <span className="text-subtle">{t("select")}</span>}
        </PopoverTrigger>
        <PopoverContent className="w-56">
          {field.options?.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-hover">
              <Checkbox checked={arr.includes(o.value)} onCheckedChange={(c) => onChange(c ? [...arr, o.value] : arr.filter((x) => x !== o.value))} />
              <OptionBadge option={o} />
            </label>
          ))}
        </PopoverContent>
      </Popover>
    );
  }
  if (field.type === "relation") {
    const arr = (Array.isArray(value) ? value : value ? [value] : []) as string[];
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className={cn(inputClass, "flex h-7 min-w-36 flex-1 items-center text-left")}>
          {arr.length ? <span className="truncate">{arr.length} {t("select").replace("…", "").toLowerCase()}</span> : <span className="text-subtle">{t("select")}</span>}
        </PopoverTrigger>
        <PopoverContent>
          <RelationValuePicker field={field} value={arr} onChange={onChange} />
        </PopoverContent>
      </Popover>
    );
  }
  const type = field.type === "date" ? "date" : field.type === "datetime" ? "datetime-local" : ["number", "currency", "percent"].includes(field.type) ? "number" : "text";
  return <input type={type} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={tr({ fr: "Valeur…", en: "Value…" })} className={cn(inputClass, "h-7 min-w-36 flex-1")} />;
}

export function FilterMenu({ table, config, onChange }: Props) {
  const { t, tr } = useI18n();
  const [picking, setPicking] = useState(false);
  const filters = config.filters;
  const set = (filters: ViewConfig["filters"]) => onChange({ ...config, filters });
  const add = (f: FieldDef) => {
    const op = OPS_BY_TYPE[f.type][0]!;
    set([...filters, { id: uid(), field: f.key, op, value: f.type === "select" || f.type === "relation" ? [] : "" }]);
    setPicking(false);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={filters.length ? "subtle" : "ghost"} size="sm" className={cn(filters.length && "text-accent ring-1 ring-inset ring-accent/25 bg-accent/5")}>
          <Filter /> {t("filter")}
          {filters.length ? <span className="ml-0.5 rounded bg-accent px-1 text-[10px] leading-4 text-white">{filters.length}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,620px)] p-2">
        {filters.length === 0 && !picking && <div className="px-2 py-2 text-[13px] text-muted">{tr({ fr: "Aucun filtre appliqué à cette vue.", en: "No filters applied to this view." })}</div>}
        <div className="space-y-1.5">
          {filters.map((f, i) => {
            const field = TABLES[table].fields.find((x) => x.key === f.field);
            if (!field) return null;
            return (
              <div key={f.id} className="flex items-center gap-1.5">
                <div className="w-14 shrink-0 text-right text-xs text-muted">
                  {i === 0 ? (
                    t("where")
                  ) : i === 1 ? (
                    <select value={config.filterMode ?? "and"} onChange={(e) => onChange({ ...config, filterMode: e.target.value as "and" | "or" })} className="h-7 rounded-md bg-surface-2 px-1 text-xs ring-1 ring-inset ring-border">
                      <option value="and">{t("and")}</option>
                      <option value="or">{t("or")}</option>
                    </select>
                  ) : (
                    t(config.filterMode === "or" ? "or" : "and")
                  )}
                </div>
                <div className="flex h-7 w-36 shrink-0 items-center gap-1.5 truncate rounded-lg bg-surface-2 px-2 text-[13px] ring-1 ring-inset ring-border">
                  <Icon name={fieldIcon(field)} className="size-3.5 shrink-0 text-muted" />
                  <span className="truncate">{tr(field.label)}</span>
                </div>
                <select
                  value={f.op}
                  onChange={(e) => set(filters.map((x) => (x.id === f.id ? { ...x, op: e.target.value } : x)))}
                  className="h-7 w-36 shrink-0 rounded-lg border border-border bg-surface px-1.5 text-[13px] outline-none"
                >
                  {OPS_BY_TYPE[field.type].map((op) => (
                    <option key={op} value={op}>
                      {tr(OP_LABELS[op])}
                    </option>
                  ))}
                </select>
                <FilterValue field={field} op={f.op as FilterOp} value={f.value} onChange={(v) => set(filters.map((x) => (x.id === f.id ? { ...x, value: v } : x)))} />
                <Button variant="ghost" size="icon-sm" onClick={() => set(filters.filter((x) => x.id !== f.id))}>
                  <Trash2 />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <Popover open={picking} onOpenChange={setPicking}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm">
                <Plus /> {t("addFilter")}
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <FieldPicker table={table} onPick={add} filter={(f) => f.type !== "lines"} />
            </PopoverContent>
          </Popover>
          {filters.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => set([])}>
              {t("clear")}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SortMenu({ table, config, onChange }: Props) {
  const { t, tr } = useI18n();
  const [picking, setPicking] = useState(false);
  const sorts = config.sorts;
  const set = (sorts: ViewConfig["sorts"]) => onChange({ ...config, sorts });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={sorts.length ? "subtle" : "ghost"} size="sm" className={cn(sorts.length && "text-accent ring-1 ring-inset ring-accent/25 bg-accent/5")}>
          <ArrowDownUp /> {t("sort")}
          {sorts.length ? <span className="ml-0.5 rounded bg-accent px-1 text-[10px] leading-4 text-white">{sorts.length}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-2">
        {!sorts.length && <div className="px-2 py-2 text-[13px] text-muted">{tr({ fr: "Tri par défaut.", en: "Default order." })}</div>}
        <div className="space-y-1.5">
          {sorts.map((s, i) => {
            const field = TABLES[table].fields.find((f) => f.key === s.field);
            return (
              <div key={s.field} className="flex items-center gap-1.5">
                <GripVertical className="size-3.5 text-subtle" />
                <div className="flex h-7 flex-1 items-center gap-1.5 truncate rounded-lg bg-surface-2 px-2 text-[13px] ring-1 ring-inset ring-border">
                  {field && <Icon name={fieldIcon(field)} className="size-3.5 text-muted" />}
                  {field ? tr(field.label) : s.field}
                </div>
                <button
                  type="button"
                  onClick={() => set(sorts.map((x, j) => (j === i ? { ...x, dir: x.dir === "asc" ? "desc" : "asc" } : x)))}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-xs hover:bg-hover"
                >
                  {s.dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
                  {t(s.dir === "asc" ? "ascending" : "descending")}
                </button>
                <Button variant="ghost" size="icon-sm" onClick={() => set(sorts.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="mt-2 border-t border-border pt-2">
          <Popover open={picking} onOpenChange={setPicking}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm">
                <Plus /> {t("addSort")}
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <FieldPicker
                table={table}
                filter={(f) => !sorts.some((s) => s.field === f.key) && !["lines", "tags"].includes(f.type)}
                onPick={(f) => {
                  set([...sorts, { field: f.key, dir: "asc" }]);
                  setPicking(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FieldsMenu({ table, config, onChange }: Props) {
  const { t, tr } = useI18n();
  const def = TABLES[table];
  const hidden = new Set(config.hiddenFields);
  const toggle = (k: string) => {
    const next = new Set(hidden);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onChange({ ...config, hiddenFields: [...next] });
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <EyeOff /> {t("fields")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="flex items-center justify-between px-1.5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle">
          {t("fields")}
          <div className="flex gap-2 normal-case tracking-normal">
            <button type="button" className="hover:text-fg" onClick={() => onChange({ ...config, hiddenFields: [] })}>
              {t("showAll")}
            </button>
            <button type="button" className="hover:text-fg" onClick={() => onChange({ ...config, hiddenFields: def.fields.filter((f) => f.key !== def.primary).map((f) => f.key) })}>
              {t("hideAll")}
            </button>
          </div>
        </div>
        <div className="max-h-80 overflow-auto">
          {def.fields.map((f) => (
            <button
              key={f.key}
              type="button"
              disabled={f.key === def.primary}
              onClick={() => toggle(f.key)}
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[13px] hover:bg-hover disabled:opacity-60"
            >
              <Icon name={fieldIcon(f)} className="size-3.5 text-muted" />
              <span className="flex-1 truncate">{tr(f.label)}</span>
              {hidden.has(f.key) ? <EyeOff className="size-3.5 text-subtle" /> : <Eye className="size-3.5 text-fg" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Layout options depending on the view type (group by, date fields…). */
export function LayoutMenu({ table, config, onChange, type }: Props & { type: ViewType }) {
  const { t, tr } = useI18n();
  const def = TABLES[table];
  const selectFields = def.fields.filter((f) => f.type === "select");
  const dateFields = def.fields.filter((f) => f.type === "date" || f.type === "datetime");
  const urlFields = def.fields.filter((f) => f.type === "url");
  if (type === "table" || type === "list") return null;
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="flex items-center justify-between gap-3 px-1.5 py-1 text-[13px]">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
  const sel = "h-7 min-w-36 rounded-lg border border-border bg-surface px-1.5 text-[13px] outline-none";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <Settings2 /> {tr({ fr: "Affichage", en: "Layout" })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        {type === "kanban" && (
          <Row label={t("groupBy")}>
            <select className={sel} value={config.groupBy ?? ""} onChange={(e) => onChange({ ...config, groupBy: e.target.value || null })}>
              {selectFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {tr(f.label)}
                </option>
              ))}
            </select>
          </Row>
        )}
        {(type === "calendar" || type === "gantt") && (
          <Row label={type === "gantt" ? t("startField") : t("dateField")}>
            <select className={sel} value={config.dateField ?? ""} onChange={(e) => onChange({ ...config, dateField: e.target.value || null })}>
              {dateFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {tr(f.label)}
                </option>
              ))}
            </select>
          </Row>
        )}
        {type === "gantt" && (
          <Row label={t("endField")}>
            <select className={sel} value={config.endDateField ?? ""} onChange={(e) => onChange({ ...config, endDateField: e.target.value || null })}>
              <option value="">—</option>
              {dateFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {tr(f.label)}
                </option>
              ))}
            </select>
          </Row>
        )}
        {type === "gallery" && (
          <Row label={tr({ fr: "Couverture", en: "Cover" })}>
            <select className={sel} value={config.coverField ?? ""} onChange={(e) => onChange({ ...config, coverField: e.target.value || null })}>
              <option value="">—</option>
              {urlFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {tr(f.label)}
                </option>
              ))}
            </select>
          </Row>
        )}
      </PopoverContent>
    </Popover>
  );
}
