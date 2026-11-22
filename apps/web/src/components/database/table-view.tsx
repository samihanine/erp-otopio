import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, EyeOff, Filter, FilterX, Maximize2, Plus, Repeat } from "lucide-react";
import { ColumnFilter } from "./column-filters";
import { formatMoney, TABLES, type FieldDef, type TableKey } from "@erp/shared";
import type { Refs, Row } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ViewConfig } from "@/lib/data";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/misc";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { FieldDisplay, InlineInput, isEditable, isPopoverField, PopoverEditor, useVisibleFields } from "./fields";
import { fieldIcon } from "./toolbar";

type Props = {
  table: TableKey;
  rows: Row[];
  refs: Refs;
  config: ViewConfig;
  onConfigChange: (c: ViewConfig) => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  onOpen: (id: string) => void;
  onCreate: (values?: Record<string, unknown>) => void;
  selected: Set<string>;
  onSelect: (s: Set<string>) => void;
};

const DEFAULT_WIDTH: Partial<Record<FieldDef["type"], number>> = {
  text: 155,
  longtext: 205,
  number: 95,
  currency: 110,
  percent: 120,
  date: 110,
  datetime: 145,
  select: 130,
  tags: 155,
  relation: 155,
  checkbox: 75,
  url: 155,
  email: 180,
  phone: 130,
  repo: 170,
  lines: 85,
};

type Cell = { row: number; col: number };

/** Plain-text tooltip for a cell (shows the full value when it is truncated). */
function cellTitle(f: FieldDef, r: Row, refs: Refs): string | undefined {
  const v = r[f.key];
  if (v == null || v === "") return undefined;
  if (f.type === "relation") return refs[f.relation!]?.[String(v)]?.label;
  if (f.type === "tags") return (v as string[]).join(", ");
  if (["text", "longtext", "url", "email", "phone", "repo"].includes(f.type)) return String(v);
  return undefined;
}

export function TableView({ table, rows, refs, config, onConfigChange, onUpdate, onOpen, onCreate, selected, onSelect }: Props) {
  const { tr, t, locale } = useI18n();
  const def = TABLES[table];
  const fields = useVisibleFields(table, config.hiddenFields, config.fieldOrder);
  const [active, setActive] = useState<Cell | null>(null);
  const [editing, setEditing] = useState<Cell | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const width = useCallback((f: FieldDef) => config.columnWidths?.[f.key] ?? (f.width ? Math.round(f.width * 0.88) : undefined) ?? DEFAULT_WIDTH[f.type] ?? 140, [config.columnWidths]);
  const template = `44px ${fields.map((f) => `${width(f)}px`).join(" ")} minmax(60px,1fr)`;

  // Column resize
  const startResize = (e: React.PointerEvent, f: FieldDef) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = width(f);
    const move = (ev: PointerEvent) => {
      const w = Math.max(70, Math.min(600, startW + ev.clientX - startX));
      onConfigChange({ ...config, columnWidths: { ...(config.columnWidths ?? {}), [f.key]: w } });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!active || editing) return;
      if (!gridRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
      const move = (dr: number, dc: number) => {
        e.preventDefault();
        setActive({ row: Math.max(0, Math.min(rows.length - 1, active.row + dr)), col: Math.max(0, Math.min(fields.length - 1, active.col + dc)) });
      };
      if (e.key === "ArrowDown") move(1, 0);
      else if (e.key === "ArrowUp") move(-1, 0);
      else if (e.key === "ArrowRight" || (e.key === "Tab" && !e.shiftKey)) move(0, 1);
      else if (e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) move(0, -1);
      else if (e.key === "Enter") {
        e.preventDefault();
        const f = fields[active.col];
        if (f && isEditable(f)) setEditing(active);
      } else if (e.key === "Escape") setActive(null);
      else if ((e.key === "Backspace" || e.key === "Delete") && fields[active.col] && isEditable(fields[active.col]!)) {
        const f = fields[active.col]!;
        const r = rows[active.row];
        if (r && !f.required) onUpdate(r.id, { [f.key]: f.type === "tags" ? [] : f.type === "checkbox" ? false : null });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, editing, rows, fields, onUpdate]);

  const sortBy = (f: FieldDef, dir: "asc" | "desc") => onConfigChange({ ...config, sorts: [{ field: f.key, dir }] });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const totals = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === "currency") {
        const byCur = new Map<string, number>();
        for (const r of rows) {
          const v = Number(r[f.key] ?? 0);
          const cur = String(r[f.currencyField ?? "currency"] ?? "CAD");
          byCur.set(cur, (byCur.get(cur) ?? 0) + v);
        }
        out[f.key] = [...byCur.entries()].map(([c, v]) => formatMoney(v, c, locale)).join(" · ");
      } else if (f.type === "number") {
        const s = rows.reduce((a, r) => a + Number(r[f.key] ?? 0), 0);
        if (s) out[f.key] = `Σ ${s.toLocaleString(locale)}`;
      }
    }
    return out;
  }, [fields, rows, locale]);

  return (
    <div ref={gridRef} className="relative h-full overflow-auto" tabIndex={-1}>
      <div className="min-w-max text-[12.5px] leading-tight">
        {/* Header */}
        <div className="sticky top-0 z-10 grid border-b border-border bg-surface/95 backdrop-blur" style={{ gridTemplateColumns: template }}>
          <div className="sticky left-0 z-20 flex h-8 items-center justify-center border-r border-border/70 bg-surface">
            <Checkbox checked={allSelected} onCheckedChange={(c) => onSelect(c ? new Set(rows.map((r) => r.id)) : new Set())} />
          </div>
          {fields.map((f, ci) => {
            const sort = config.sorts.find((s) => s.field === f.key);
            return (
              <div key={f.key} className={cn("group/h relative flex h-8 items-center border-r border-border/70 text-[11.5px] uppercase tracking-wide", f.key === def.primary && "sticky left-[44px] z-20 bg-surface shadow-[2px_0_0_0_var(--border)]")}>
                <Dropdown>
                  <DropdownTrigger className="flex h-full w-full min-w-0 items-center gap-1.5 px-2 text-left font-medium text-subtle outline-none hover:bg-hover data-[state=open]:bg-hover">
                    <Icon name={fieldIcon(f)} className="size-3.5 shrink-0 text-subtle" />
                    <span className="truncate">{tr(f.label)}</span>
                    {sort && (sort.dir === "asc" ? <ArrowUp className="size-3 shrink-0 text-accent" /> : <ArrowDown className="size-3 shrink-0 text-accent" />)}
                  </DropdownTrigger>
                  <DropdownContent>
                    <DropdownItem onSelect={() => sortBy(f, "asc")}>
                      <ArrowUp /> {t("ascending")}
                    </DropdownItem>
                    <DropdownItem onSelect={() => sortBy(f, "desc")}>
                      <ArrowDown /> {t("descending")}
                    </DropdownItem>
                    {f.key !== def.primary && (
                      <>
                        <DropdownSeparator />
                        <DropdownItem onSelect={() => onConfigChange({ ...config, hiddenFields: [...config.hiddenFields, f.key] })}>
                          <EyeOff /> {tr({ fr: "Masquer le champ", en: "Hide field" })}
                        </DropdownItem>
                      </>
                    )}
                  </DropdownContent>
                </Dropdown>
                <div onPointerDown={(e) => startResize(e, f)} className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize opacity-0 transition group-hover/h:opacity-100">
                  <div className="mx-auto h-full w-0.5 bg-accent/60" />
                </div>
              </div>
            );
          })}
          <div />
          {/* Inline column filters */}
          <div className="sticky left-0 z-20 flex h-8 items-center justify-center border-r border-t border-border/70 bg-surface">
            {config.filters.some((x) => x.id.startsWith("col:")) ? (
              <button
                type="button"
                title={tr({ fr: "Effacer les filtres", en: "Clear filters" })}
                onClick={() => onConfigChange({ ...config, filters: config.filters.filter((x) => !x.id.startsWith("col:")) })}
                className="grid size-6 place-items-center rounded-md text-accent hover:bg-accent/10"
              >
                <FilterX className="size-3.5" />
              </button>
            ) : (
              <Filter className="size-3.5 text-subtle" />
            )}
          </div>
          {fields.map((f) => (
            <div key={f.key} className={cn("flex h-8 items-center border-r border-t border-border/70 px-1", f.key === def.primary && "sticky left-[44px] z-20 bg-surface shadow-[2px_0_0_0_var(--border)]")}>
              <ColumnFilter field={f} config={config} onChange={onConfigChange} table={table} />
            </div>
          ))}
          <div className="border-t border-border" />
        </div>

        {/* Rows */}
        {rows.map((r, ri) => (
          <div key={r.id} className={cn("group/r grid border-b border-border/70 hover:bg-hover/60", selected.has(r.id) && "bg-accent/[.04]")} style={{ gridTemplateColumns: template }}>
            <div className="sticky left-0 z-[3] flex h-[34px] items-center justify-center border-r border-border/70 bg-surface text-[11px] text-subtle group-hover/r:bg-[color-mix(in_oklab,var(--hover)_60%,var(--surface))]">
              <span className={cn("group-hover/r:hidden", selected.has(r.id) && "hidden")}>{ri + 1}</span>
              <span className={cn("hidden group-hover/r:block", selected.has(r.id) && "block")}>
                <Checkbox
                  checked={selected.has(r.id)}
                  onCheckedChange={(c) => {
                    const n = new Set(selected);
                    if (c) n.add(r.id);
                    else n.delete(r.id);
                    onSelect(n);
                  }}
                />
              </span>
            </div>
            {fields.map((f, ci) => {
              const isActive = active?.row === ri && active.col === ci;
              const isEditing = editing?.row === ri && editing.col === ci;
              const editable = isEditable(f);
              const primary = f.key === def.primary;
              const close = () => setEditing(null);
              const cellCls = cn(
                "relative flex h-[34px] min-w-0 items-center border-r border-border/70 px-2",
                ["number", "currency"].includes(f.type) && "justify-end",
                primary && "sticky left-[44px] z-[2] cursor-pointer bg-surface font-medium shadow-[2px_0_0_0_var(--border)] group-hover/r:bg-[color-mix(in_oklab,var(--hover)_60%,var(--surface))]",
                isActive && "z-[2] ring-2 ring-inset ring-accent/60",
              );
              const onClick = () => {
                if (primary && !isActive) {
                  // a single click on the name opens the record (double-click to rename)
                  setActive({ row: ri, col: ci });
                  onOpen(r.id);
                  return;
                }
                if (f.type === "checkbox" && editable) {
                  onUpdate(r.id, { [f.key]: !r[f.key] });
                  setActive({ row: ri, col: ci });
                  return;
                }
                if (isActive && editable) setEditing({ row: ri, col: ci });
                else setActive({ row: ri, col: ci });
              };

              if (isEditing && !isPopoverField(f)) {
                return (
                  <div key={f.key} className={cn(cellCls, "bg-surface p-0 ring-2 ring-inset ring-accent")}>
                    <InlineInput
                      field={f}
                      value={r[f.key]}
                      onCommit={(v) => {
                        onUpdate(r.id, { [f.key]: v });
                        close();
                      }}
                      onCancel={close}
                    />
                  </div>
                );
              }

              const content = (
                <div key={f.key} className={cellCls} onClick={onClick} onDoubleClick={() => editable && setEditing({ row: ri, col: ci })} title={cellTitle(f, r, refs)}>
                  <div className="flex min-w-0 flex-1 items-center overflow-hidden">
                    <FieldDisplay field={f} row={r} refs={refs} table={table} />
                    {primary && !r[f.key] && <span className="text-subtle">{t("untitled")}</span>}
                    {primary && r._seriesCount ? (
                      <span className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-normal text-muted ring-1 ring-inset ring-border">
                        <Repeat className="size-3" /> {String(r._seriesCount)} {tr({ fr: "à venir", en: "upcoming" })}
                      </span>
                    ) : null}
                  </div>
                  {primary && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(r.id);
                      }}
                      className="ml-1 hidden h-6 shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-1.5 text-[11px] font-medium text-muted shadow-card hover:text-fg group-hover/r:inline-flex"
                    >
                      <Maximize2 className="size-3" /> {t("open")}
                    </button>
                  )}
                </div>
              );

              if (isPopoverField(f) && editable) {
                return (
                  <Popover key={f.key} open={isEditing} onOpenChange={(o) => (o ? setEditing({ row: ri, col: ci }) : close())}>
                    <PopoverAnchor asChild>{content}</PopoverAnchor>
                    <PopoverContent className="p-1.5" onOpenAutoFocus={(e) => f.type === "longtext" && e.preventDefault()}>
                      <PopoverEditor field={f} value={r[f.key]} onChange={(v) => onUpdate(r.id, { [f.key]: v })} onDone={close} />
                    </PopoverContent>
                  </Popover>
                );
              }
              return content;
            })}
            <div />
          </div>
        ))}

        {!rows.length && (
          <div className="sticky left-0 max-w-[100vw] px-6 py-10 text-center text-[13px] text-subtle">{t("noRecords")}</div>
        )}

        {/* New row */}
        <button type="button" onClick={() => onCreate()} className="sticky left-0 flex h-[34px] w-full max-w-[100vw] items-center gap-2 border-b border-border/70 px-3 text-left text-muted hover:bg-hover hover:text-fg">
          <Plus className="size-4" /> {t("new")}
        </button>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 grid border-t border-border bg-surface text-xs text-muted" style={{ gridTemplateColumns: template }}>
          <div className="sticky left-0 h-8 bg-surface" />
          {fields.map((f, ci) => (
            <div key={f.key} className={cn("flex h-8 items-center truncate px-2 tabular-nums", ["number", "currency"].includes(f.type) && "justify-end", f.key === def.primary && "sticky left-[44px] bg-surface")}>
              {f.key === def.primary ? (
                <span>
                  <span className="font-medium text-fg">{rows.length}</span> {t("records")}
                </span>
              ) : (
                totals[f.key]
              )}
            </div>
          ))}
          <div />
        </div>
      </div>
    </div>
  );
}
