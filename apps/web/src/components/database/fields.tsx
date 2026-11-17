import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ExternalLink, Github, Mail, Phone, Plus, Search, X } from "lucide-react";
import { formatMoney, TABLES, type FieldDef, type TableKey } from "@erp/shared";
import type { Refs, Row } from "@/lib/api";
import { fmtDate, fmtNumber, useI18n } from "@/lib/i18n";
import { useOptions } from "@/lib/data";
import { cn, faviconUrl, hostname } from "@/lib/utils";
import { Avatar, Chip, OptionBadge, TableTile } from "@/components/ui/misc";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { inputClass } from "@/components/ui/input";
import { ImageField } from "./cms-fields";

const today = () => new Date().toISOString().slice(0, 10);
const DONE = new Set(["done", "paid", "delivered", "resolved", "closed", "cancelled", "accepted", "rejected", "published"]);

/* -------------------------------------------------------------------------- */
/*  Display                                                                   */
/* -------------------------------------------------------------------------- */

export function RelationChip({ table, id, refs, compact }: { table: TableKey; id: string; refs: Refs; compact?: boolean }) {
  const ref = refs[table]?.[id];
  const def = TABLES[table];
  const label = ref?.label ?? "…";
  if (table === "person") {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 truncate text-[13px]">
        <Avatar name={label} size={18} className="ring-0" />
        <span className="truncate">{label}</span>
      </span>
    );
  }
  if (table === "legal_entity") {
    return (
      <Chip className="gap-1.5">
        <span className="size-2 rounded-full" style={{ background: ref?.color ?? "#1c3266" }} />
        <span className="truncate">{label}</span>
      </Chip>
    );
  }
  return (
    <Chip className="gap-1.5">
      {!compact && <TableTile icon={def.icon} color={def.color} size="sm" className="size-3.5 rounded-[4px] [&_svg]:size-2.5" />}
      <span className="truncate">{label}</span>
    </Chip>
  );
}

export function FieldDisplay({ field, row, refs, table }: { field: FieldDef; row: Row; refs: Refs; table: TableKey }) {
  const { locale } = useI18n();
  const v = row[field.key];
  const empty = v == null || v === "" || (Array.isArray(v) && !v.length);
  if (empty && field.type !== "checkbox" && field.type !== "percent") return null;

  switch (field.type) {
    case "select":
      return <OptionBadge option={field.options?.find((o) => o.value === v)} />;
    case "tags":
      return (
        <span className="flex min-w-0 gap-1 overflow-hidden">
          {(v as string[]).map((t) => (
            <Chip key={t} className="shrink-0 font-normal">
              {t}
            </Chip>
          ))}
        </span>
      );
    case "relation":
      return <RelationChip table={field.relation!} id={String(v)} refs={refs} />;
    case "checkbox":
      return <Checkbox checked={Boolean(v)} />;
    case "currency": {
      const cur = String(row[field.currencyField ?? "currency"] ?? "CAD");
      return <span className="tabular-nums">{formatMoney(Number(v), cur, locale)}</span>;
    }
    case "number":
      return <span className="tabular-nums">{fmtNumber(v, locale, { maximumFractionDigits: 2 })}</span>;
    case "percent": {
      const n = Math.max(0, Math.min(100, Number(v ?? 0)));
      return (
        <span className="flex w-full items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border">
            <span className={cn("block h-full rounded-full", n >= 100 ? "bg-emerald-500" : "bg-accent")} style={{ width: `${n}%` }} />
          </span>
          <span className="w-8 text-right text-xs tabular-nums text-muted">{n}%</span>
        </span>
      );
    }
    case "date": {
      const s = String(v);
      const statusDone = DONE.has(String(row.status ?? ""));
      const late = field.key === "dueDate" && s < today() && !statusDone;
      return <span className={cn("tabular-nums", late && "font-medium text-rose-600")}>{fmtDate(s, locale)}</span>;
    }
    case "datetime":
      return <span className="tabular-nums">{fmtDate(v, locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>;
    case "url": {
      const ico = faviconUrl(String(v));
      return (
        <a href={String(v).startsWith("http") ? String(v) : `https://${v}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex max-w-full items-center gap-1.5 truncate text-[13px] text-fg underline decoration-border-strong underline-offset-2 hover:decoration-fg">
          {ico && !String(v).includes("drive.google") ? <img src={ico} alt="" className="size-3.5 rounded-sm" /> : <ExternalLink className="size-3.5 text-muted" />}
          <span className="truncate">{String(v).includes("drive.google") ? "Google Drive" : hostname(String(v))}</span>
        </a>
      );
    }
    case "email":
      return (
        <a href={`mailto:${v}`} onClick={(e) => e.stopPropagation()} className="inline-flex max-w-full items-center gap-1.5 truncate hover:underline">
          <Mail className="size-3.5 shrink-0 text-muted" />
          <span className="truncate">{String(v)}</span>
        </a>
      );
    case "phone":
      return (
        <a href={`tel:${v}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 hover:underline">
          <Phone className="size-3.5 text-muted" />
          {String(v)}
        </a>
      );
    case "repo":
      return (
        <a href={`https://github.com/${v}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex max-w-full items-center gap-1.5 truncate font-mono text-xs hover:underline">
          <Github className="size-3.5 shrink-0" />
          <span className="truncate">{String(v)}</span>
        </a>
      );
    case "lines":
      return <span className="text-muted">{(v as unknown[]).length} {locale === "fr" ? "lignes" : "lines"}</span>;
    case "sections":
      return <span className="text-muted">{(v as unknown[]).length} sections</span>;
    case "image":
      return <img src={String(v)} alt="" className="h-6 w-9 rounded object-cover ring-1 ring-border" />;
    case "longtext":
      return <span className="truncate text-muted">{String(v)}</span>;
    default:
      return <span className="truncate">{String(v)}</span>;
  }
}

/* -------------------------------------------------------------------------- */
/*  Editors                                                                   */
/* -------------------------------------------------------------------------- */

const POPOVER_TYPES = new Set<FieldDef["type"]>(["select", "relation", "tags", "longtext", "date", "datetime"]);
export const isPopoverField = (f: FieldDef) => POPOVER_TYPES.has(f.type);
export const isEditable = (f: FieldDef) => !f.readOnly && f.type !== "lines" && f.type !== "sections";

export function SelectEditor({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown, close?: boolean) => void }) {
  const { tr, t } = useI18n();
  const [q, setQ] = useState("");
  const opts = (field.options ?? []).filter((o) => tr(o.label).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="w-56">
      <div className="mb-1 flex items-center gap-2 border-b border-border px-1.5 pb-1.5">
        <Search className="size-3.5 text-subtle" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="h-6 w-full bg-transparent text-[13px] outline-none placeholder:text-subtle" />
      </div>
      <div className="max-h-64 overflow-auto">
        {opts.map((o) => (
          <button key={o.value} type="button" onClick={() => onChange(o.value, true)} className="flex w-full items-center justify-between rounded-md px-1.5 py-1 hover:bg-hover">
            <OptionBadge option={o} />
            {value === o.value && <Check className="size-3.5 text-muted" />}
          </button>
        ))}
        {!field.required && value != null && (
          <button type="button" onClick={() => onChange(null, true)} className="mt-1 flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted hover:bg-hover">
            <X className="size-3.5" /> {t("clear")}
          </button>
        )}
      </div>
    </div>
  );
}

export function RelationEditor({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown, close?: boolean, label?: string) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const { data = [], isFetching } = useOptions(field.relation, q, true, field.relationScope);
  const target = TABLES[field.relation!];
  return (
    <div className="w-72">
      <div className="mb-1 flex items-center gap-2 border-b border-border px-1.5 pb-1.5">
        <Search className="size-3.5 text-subtle" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="h-6 w-full bg-transparent text-[13px] outline-none placeholder:text-subtle" />
        {isFetching && <span className="size-3 animate-spin rounded-full border-2 border-border-strong border-t-fg" />}
      </div>
      <div className="max-h-72 overflow-auto">
        {data.map((o) => (
          <button key={o.id} type="button" onClick={() => onChange(o.id, true, o.label)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-hover">
            {field.relation === "person" ? <Avatar name={o.label} size={20} className="ring-0" /> : <TableTile icon={target.icon} color={target.color} size="sm" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">{o.label}</span>
              {o.subtitle ? <span className="block truncate text-[11px] text-subtle">{o.subtitle}</span> : null}
            </span>
            {value === o.id && <Check className="size-3.5 text-muted" />}
          </button>
        ))}
        {!data.length && !isFetching && <div className="px-2 py-3 text-center text-xs text-subtle">{t("noResults")}</div>}
      </div>
      {value != null && (
        <button type="button" onClick={() => onChange(null, true)} className="mt-1 flex w-full items-center gap-1.5 rounded-md border-t border-border px-1.5 pb-0.5 pt-1.5 text-xs text-muted hover:text-fg">
          <X className="size-3.5" /> {t("clear")}
        </button>
      )}
    </div>
  );
}

export function TagsEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const tags = (value as string[] | null) ?? [];
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setDraft("");
  };
  return (
    <div className="w-64 p-1">
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <Chip key={t} className="gap-1 pr-0.5 font-normal">
            {t}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="rounded p-0.5 hover:bg-hover">
              <X className="size-3" />
            </button>
          </Chip>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
            if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
          }}
          placeholder="+ tag"
          className={cn(inputClass, "h-7")}
        />
        <button type="button" onClick={add} className="grid size-7 place-items-center rounded-md hover:bg-hover">
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function LongTextEditor({ value, onChange, onDone }: { value: unknown; onChange: (v: unknown) => void; onDone: () => void }) {
  const [draft, setDraft] = useState(String(value ?? ""));
  return (
    <textarea
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== (value ?? "")) onChange(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          onChange(draft);
          onDone();
        }
        if (e.key === "Escape") onDone();
      }}
      className="h-48 w-96 resize-none bg-transparent p-1.5 text-[13px] leading-relaxed outline-none"
    />
  );
}

function DateEditor({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown, close?: boolean) => void }) {
  const { t } = useI18n();
  const isDT = field.type === "datetime";
  const current = value ? (isDT ? new Date(String(value)).toISOString().slice(0, 16) : String(value).slice(0, 10)) : "";
  const quick = [
    { label: t("today"), days: 0 },
    { label: "+1 j", days: 1 },
    { label: "+7 j", days: 7 },
    { label: "+30 j", days: 30 },
  ];
  return (
    <div className="w-60 space-y-2 p-1">
      <input
        autoFocus
        type={isDT ? "datetime-local" : "date"}
        defaultValue={current}
        onChange={(e) => onChange(e.target.value ? (isDT ? new Date(e.target.value).toISOString() : e.target.value) : null)}
        className={inputClass}
      />
      <div className="flex flex-wrap gap-1">
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => {
              const d = new Date(Date.now() + q.days * 864e5);
              onChange(isDT ? d.toISOString() : d.toISOString().slice(0, 10), true);
            }}
            className="h-6 rounded-md bg-surface-2 px-2 text-xs text-muted ring-1 ring-inset ring-border hover:text-fg"
          >
            {q.label}
          </button>
        ))}
        {value ? (
          <button type="button" onClick={() => onChange(null, true)} className="h-6 rounded-md px-2 text-xs text-muted hover:text-rose-600">
            {t("clear")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Popover editor body for complex field types. */
export function PopoverEditor({ field, value, onChange, onDone }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void; onDone: () => void }) {
  const set = (v: unknown, close?: boolean) => {
    onChange(v);
    if (close) onDone();
  };
  switch (field.type) {
    case "select":
      return <SelectEditor field={field} value={value} onChange={set} />;
    case "relation":
      return <RelationEditor field={field} value={value} onChange={set} />;
    case "tags":
      return <TagsEditor value={value} onChange={onChange} />;
    case "longtext":
      return <LongTextEditor value={value} onChange={onChange} onDone={onDone} />;
    case "date":
    case "datetime":
      return <DateEditor field={field} value={value} onChange={set} />;
    default:
      return null;
  }
}

/** Inline text-like editor (text, number, currency, url…). */
export function InlineInput({ field, value, onCommit, onCancel, className }: { field: FieldDef; value: unknown; onCommit: (v: unknown) => void; onCancel: () => void; className?: string }) {
  const numeric = ["number", "currency", "percent"].includes(field.type);
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => {
    const next = numeric ? (draft === "" ? null : Number(draft.replace(",", "."))) : draft;
    if (next !== value && !(next === "" && value == null)) onCommit(next);
    else onCancel();
  };
  return (
    <input
      ref={ref}
      value={draft}
      inputMode={numeric ? "decimal" : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") onCancel();
      }}
      className={cn("h-full w-full bg-transparent px-2 text-[13px] outline-none", numeric && "text-right tabular-nums", className)}
    />
  );
}

/**
 * Property-style editable value (used in record detail panel).
 * Click to edit; complex types open a popover.
 */
export function PropertyValue({ field, row, refs, table, onSave, placeholder }: { field: FieldDef; row: Row; refs: Refs; table: TableKey; onSave: (v: unknown) => void; placeholder?: ReactNode }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const editable = isEditable(field);
  const v = row[field.key];

  if (field.type === "image") {
    return editable ? <ImageField value={v} onSave={onSave} table={table} recordId={row.id} /> : <FieldDisplay field={field} row={row} refs={refs} table={table} />;
  }

  if (field.type === "checkbox") {
    return (
      <div className="flex h-8 items-center px-2">
        <Checkbox checked={Boolean(v)} onCheckedChange={(c) => editable && onSave(c)} disabled={!editable} />
      </div>
    );
  }

  const display = (
    <div className={cn("flex min-h-8 w-full min-w-0 items-center rounded-md px-2 py-1 text-[13px]", editable && "cursor-pointer hover:bg-hover")}>
      <FieldDisplay field={field} row={row} refs={refs} table={table} />
      {(v == null || v === "" || (Array.isArray(v) && !v.length)) && <span className="text-subtle">{placeholder ?? t("empty")}</span>}
    </div>
  );

  if (!editable) return display;

  if (isPopoverField(field)) {
    return (
      <Popover open={editing} onOpenChange={setEditing}>
        <PopoverAnchor asChild>
          <div onClick={() => setEditing(true)} className="w-full min-w-0">
            {display}
          </div>
        </PopoverAnchor>
        <PopoverContent className="p-1.5">
          <PopoverEditor field={field} value={v} onChange={onSave} onDone={() => setEditing(false)} />
        </PopoverContent>
      </Popover>
    );
  }

  return editing ? (
    <div className="flex h-8 w-full items-center rounded-md bg-surface ring-2 ring-accent/30">
      <InlineInput
        field={field}
        value={v}
        onCommit={(nv) => {
          onSave(nv);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    </div>
  ) : (
    <div onClick={() => setEditing(true)} className="w-full min-w-0">
      {display}
    </div>
  );
}

export function useVisibleFields(table: TableKey, hidden: string[], order?: string[]) {
  return useMemo(() => {
    const fields = TABLES[table].fields.filter((f) => !hidden.includes(f.key));
    if (!order?.length) return fields;
    return [...fields].sort((a, b) => {
      const ia = order.indexOf(a.key);
      const ib = order.indexOf(b.key);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [table, hidden, order]);
}
