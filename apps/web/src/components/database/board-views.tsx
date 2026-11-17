import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { formatMoney, TABLES, type FieldDef, type TableKey } from "@erp/shared";
import type { Refs, Row } from "@/lib/api";
import { fmtDate, useI18n } from "@/lib/i18n";
import { recordLabel, type ViewConfig } from "@/lib/data";
import { DOT } from "@/lib/colors";
import { cn, faviconUrl, hostname } from "@/lib/utils";
import { Avatar, EmptyState, TableTile } from "@/components/ui/misc";
import { FieldDisplay, useVisibleFields } from "./fields";

type BaseProps = {
  table: TableKey;
  rows: Row[];
  refs: Refs;
  config: ViewConfig;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  onOpen: (id: string) => void;
  onCreate: (values?: Record<string, unknown>) => void;
};

/** Small set of meta fields rendered on cards. */
function useCardFields(table: TableKey, config: ViewConfig, exclude: string[]) {
  const visible = useVisibleFields(table, config.hiddenFields, config.fieldOrder);
  const def = TABLES[table];
  return visible.filter((f) => f.key !== def.primary && !exclude.includes(f.key) && f.type !== "longtext" && f.type !== "lines").slice(0, 5);
}

function CardMeta({ fields, row, refs, table }: { fields: FieldDef[]; row: Row; refs: Refs; table: TableKey }) {
  const shown = fields.filter((f) => {
    const v = row[f.key];
    return !(v == null || v === "" || (Array.isArray(v) && !v.length) || (f.type === "checkbox" && !v) || ((f.type === "number" || f.type === "currency") && Number(v) === 0));
  });
  if (!shown.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
      {shown.map((f) => (
        <span key={f.key} className="inline-flex min-w-0 max-w-full items-center text-muted [&_a]:text-xs">
          <FieldDisplay field={f} row={row} refs={refs} table={table} />
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Kanban                                                                    */
/* -------------------------------------------------------------------------- */

export function KanbanView({ table, rows, refs, config, onUpdate, onOpen, onCreate }: BaseProps) {
  const { tr, t, locale } = useI18n();
  const def = TABLES[table];
  const groupKey = config.groupBy ?? def.kanbanField;
  const groupField = def.fields.find((f) => f.key === groupKey && f.type === "select");
  const cardFields = useCardFields(table, config, [groupKey ?? ""]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const moneyField = def.fields.find((f) => f.type === "currency" && !config.hiddenFields.includes(f.key));

  if (!groupField) return <EmptyState icon="Columns3" title={tr({ fr: "Choisissez un champ de regroupement", en: "Pick a group-by field" })} />;

  const columns = [...(groupField.options ?? []).map((o) => ({ key: o.value, option: o })), { key: "__none", option: null }];
  const byCol = (k: string) => rows.filter((r) => (k === "__none" ? r[groupField.key] == null : r[groupField.key] === k));

  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4">
      {columns.map(({ key, option }) => {
        const items = byCol(key);
        if (key === "__none" && !items.length) return null;
        const sum = moneyField ? items.reduce((a, r) => a + Number(r[moneyField.key] ?? 0), 0) : 0;
        return (
          <div
            key={key}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(key);
            }}
            onDragLeave={() => setOver((o) => (o === key ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain") || dragId;
              if (id) onUpdate(id, { [groupField.key]: key === "__none" ? null : key });
              setOver(null);
              setDragId(null);
            }}
            className={cn("flex w-[290px] shrink-0 flex-col rounded-2xl bg-surface-2/70 ring-1 ring-inset ring-border transition", over === key && "bg-accent/5 ring-accent/40")}
          >
            <div className="flex items-center gap-2 px-3 pb-2 pt-3">
              <span className={cn("size-2 rounded-full", option ? DOT[option.color] : "bg-zinc-300")} />
              <span className="text-[13px] font-semibold">{option ? tr(option.label) : t("none")}</span>
              <span className="rounded-md bg-surface px-1.5 text-xs tabular-nums text-muted ring-1 ring-inset ring-border">{items.length}</span>
              {moneyField && sum ? <span className="ml-auto text-xs tabular-nums text-subtle">{formatMoney(sum, String(items[0]?.currency ?? "CAD"), locale)}</span> : null}
            </div>
            <div className="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {items.map((r) => (
                <div
                  key={r.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", r.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDragId(r.id);
                  }}
                  onDragEnd={() => setDragId(null)}
                  onClick={() => onOpen(r.id)}
                  className={cn(
                    "cursor-pointer rounded-xl border border-border bg-surface p-3 shadow-card transition hover:border-border-strong hover:shadow-md active:cursor-grabbing",
                    dragId === r.id && "opacity-40",
                  )}
                >
                  <div className="text-[13px] font-medium leading-snug">{recordLabel(table, r) || t("untitled")}</div>
                  <CardMeta fields={cardFields} row={r} refs={refs} table={table} />
                </div>
              ))}
              <button
                type="button"
                onClick={() => onCreate(key === "__none" ? {} : { [groupField.key]: key })}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-muted transition hover:bg-surface hover:text-fg"
              >
                <Plus className="size-4" /> {t("new")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Gallery                                                                   */
/* -------------------------------------------------------------------------- */

export function GalleryView({ table, rows, refs, config, onOpen, onCreate }: BaseProps) {
  const { t } = useI18n();
  const def = TABLES[table];
  const cardFields = useCardFields(table, config, []);
  const cover = config.coverField ?? def.coverField;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 p-4">
      {rows.map((r) => {
        const url = cover ? (r[cover] as string | null) : null;
        const site = (r.website ?? r.websiteUrl) as string | null;
        const fav = faviconUrl(site);
        return (
          <button key={r.id} type="button" onClick={() => onOpen(r.id)} className="group overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="dot-grid relative grid h-28 place-items-center border-b border-border bg-surface-2">
              {url ? (
                <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
              ) : table === "person" ? (
                <Avatar name={recordLabel(table, r)} size={52} />
              ) : fav ? (
                <span className="grid size-14 place-items-center rounded-2xl bg-surface shadow-card ring-1 ring-border">
                  <img src={fav} alt="" className="size-8 rounded-md" />
                </span>
              ) : (
                <TableTile icon={def.icon} color={def.color} size="lg" />
              )}
            </div>
            <div className="p-3">
              <div className="truncate text-[13px] font-semibold">{recordLabel(table, r) || t("untitled")}</div>
              {site ? <div className="truncate text-xs text-subtle">{hostname(site)}</div> : null}
              <CardMeta fields={cardFields.filter((f) => f.type !== "url")} row={r} refs={refs} table={table} />
            </div>
          </button>
        );
      })}
      <button type="button" onClick={() => onCreate()} className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-border-strong text-[13px] text-muted transition hover:bg-surface hover:text-fg">
        <span className="flex items-center gap-1.5">
          <Plus className="size-4" /> {t("new")}
        </span>
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  List                                                                      */
/* -------------------------------------------------------------------------- */

export function ListView({ table, rows, refs, config, onOpen, onCreate }: BaseProps) {
  const { t } = useI18n();
  const def = TABLES[table];
  const cardFields = useCardFields(table, config, []);
  return (
    <div className="mx-auto max-w-4xl p-2 sm:p-4">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {rows.map((r) => (
          <button key={r.id} type="button" onClick={() => onOpen(r.id)} className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-hover">
            {table === "person" ? <Avatar name={recordLabel(table, r)} size={28} /> : <TableTile icon={def.icon} color={def.color} />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{recordLabel(table, r) || t("untitled")}</div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                {cardFields.slice(0, 4).map((f) =>
                  r[f.key] == null || r[f.key] === "" ? null : (
                    <span key={f.key} className="inline-flex items-center">
                      <FieldDisplay field={f} row={r} refs={refs} table={table} />
                    </span>
                  ),
                )}
              </div>
            </div>
          </button>
        ))}
        <button type="button" onClick={() => onCreate()} className="flex w-full items-center gap-2 px-4 py-3 text-[13px] text-muted hover:bg-hover hover:text-fg">
          <Plus className="size-4" /> {t("new")}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Calendar                                                                  */
/* -------------------------------------------------------------------------- */

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function CalendarView({ table, rows, config, onOpen, onCreate, onUpdate }: BaseProps) {
  const { tr, t, locale } = useI18n();
  const def = TABLES[table];
  const dateKey = config.dateField ?? def.dateField ?? "";
  const dateField = def.fields.find((f) => f.key === dateKey);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const statusField = def.fields.find((f) => f.key === (def.kanbanField ?? "status") && f.type === "select");

  const days = useMemo(() => {
    const first = new Date(cursor);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const v = r[dateKey];
      if (!v) continue;
      const k = dateField?.type === "datetime" ? ymd(new Date(String(v))) : String(v).slice(0, 10);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  }, [rows, dateKey, dateField]);

  const undated = rows.filter((r) => !r[dateKey]).length;
  const todayKey = ymd(new Date());
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { weekday: "short" }));
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-base font-semibold capitalize">{cursor.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { month: "long", year: "numeric" })}</h3>
        <div className="ml-2 flex items-center rounded-lg ring-1 ring-inset ring-border">
          <button type="button" className="h-7 px-2 text-muted hover:text-fg" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            ‹
          </button>
          <button type="button" className="h-7 border-x border-border px-2 text-xs font-medium" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
            {t("today")}
          </button>
          <button type="button" className="h-7 px-2 text-muted hover:text-fg" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            ›
          </button>
        </div>
        {undated ? <span className="ml-auto text-xs text-subtle">{undated} {tr({ fr: "sans date", en: "undated" })}</span> : null}
      </div>
      <div className="grid grid-cols-7 border-b border-border pb-1 text-xs font-medium uppercase tracking-wide text-subtle">
        {weekdays.map((w) => (
          <div key={w} className="px-2">
            {w}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6 overflow-hidden rounded-b-xl border-l border-border">
        {days.map((d) => {
          const k = ymd(d);
          const items = byDay.get(k) ?? [];
          const inMonth = d.getMonth() === cursor.getMonth();
          return (
            <div
              key={k}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                if (id && dateField) onUpdate(id, { [dateKey]: dateField.type === "datetime" ? new Date(`${k}T12:00:00`).toISOString() : k });
              }}
              onDoubleClick={() => dateField && onCreate({ [dateKey]: dateField.type === "datetime" ? new Date(`${k}T12:00:00`).toISOString() : k })}
              className={cn("group/day min-h-24 overflow-hidden border-b border-r border-border p-1", !inMonth && "bg-surface-2/50")}
            >
              <div className="mb-1 flex items-center justify-between px-1">
                <span className={cn("grid size-6 place-items-center rounded-full text-xs tabular-nums", k === todayKey ? "bg-accent font-semibold text-white" : inMonth ? "text-fg" : "text-subtle")}>{d.getDate()}</span>
                <button type="button" onClick={() => dateField && onCreate({ [dateKey]: k })} className="hidden size-5 place-items-center rounded text-muted hover:bg-hover group-hover/day:grid">
                  <Plus className="size-3.5" />
                </button>
              </div>
              <div className="space-y-0.5">
                {items.slice(0, 4).map((r) => {
                  const opt = statusField?.options?.find((o) => o.value === r[statusField.key]);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", r.id);
                        setDragId(r.id);
                      }}
                      onClick={() => onOpen(r.id)}
                      className="flex w-full items-center gap-1.5 truncate rounded-md bg-surface px-1.5 py-0.5 text-left text-xs shadow-card ring-1 ring-inset ring-border hover:ring-border-strong"
                    >
                      <span className={cn("size-1.5 shrink-0 rounded-full", opt ? DOT[opt.color] : "bg-zinc-300")} />
                      <span className="truncate">{recordLabel(table, r)}</span>
                    </button>
                  );
                })}
                {items.length > 4 && <div className="px-1.5 text-[11px] text-subtle">+{items.length - 4}</div>}
              </div>
            </div>
          );
        })}
      </div>
      {dateField ? null : <div className="mt-2 text-xs text-subtle">{fmtDate(new Date().toISOString(), locale)}</div>}
    </div>
  );
}
