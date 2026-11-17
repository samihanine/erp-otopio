/**
 * Combobox — replaces every native <select> in the app.
 * Popover with search, coloured tags, single or multiple selection, select all / clear.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { Color } from "@erp/shared";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { BADGE, DOT } from "@/lib/colors";

export type ComboOption = { value: string; label: string; color?: Color; icon?: ReactNode; hint?: string };

type Common = {
  options: ComboOption[];
  placeholder?: string;
  className?: string;
  size?: "xs" | "sm" | "md";
  /** show coloured tags (default: when options have colors) */
  tags?: boolean;
  /** called with the search text (for server-side options) */
  onSearch?: (q: string) => void;
  loading?: boolean;
  align?: "start" | "end";
  disabled?: boolean;
  onOpenChange?: (o: boolean) => void;
  /** highlight the trigger (e.g. an active filter) */
  active?: boolean;
  /** width of the popover */
  menuClassName?: string;
};
type Single = Common & { multiple?: false; value: string | null | undefined; onChange: (v: string | null) => void; clearable?: boolean };
type Multi = Common & { multiple: true; value: string[]; onChange: (v: string[]) => void; clearable?: boolean };

function Tag({ o, tags }: { o: ComboOption; tags: boolean }) {
  if (tags && o.color)
    return (
      <span className={cn("inline-flex h-[20px] max-w-full items-center gap-1 truncate rounded-md px-1.5 text-[11.5px] font-medium ring-1 ring-inset", BADGE[o.color])}>
        <span className={cn("size-1.5 shrink-0 rounded-full", DOT[o.color])} />
        <span className="truncate">{o.label}</span>
      </span>
    );
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
      {o.icon}
      <span className="truncate">{o.label}</span>
    </span>
  );
}

export function Combobox(props: Single | Multi) {
  const { options, placeholder, className, size = "sm", onSearch, loading, align = "start", disabled, active, menuClassName } = props;
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const tags = props.tags ?? options.some((o) => o.color);
  const selected = props.multiple ? props.value : props.value ? [props.value] : [];
  const sel = new Set(selected);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((o) => o.label.toLowerCase().includes(n) || o.hint?.toLowerCase().includes(n)) : options;
  }, [options, q]);
  const chosen = selected.map((v) => options.find((o) => o.value === v) ?? { value: v, label: "…" });
  const h = size === "xs" ? "h-7 text-[12px]" : size === "sm" ? "h-8 text-[13px]" : "h-9 text-[13px]";

  const pick = (v: string) => {
    if (props.multiple) props.onChange(sel.has(v) ? props.value.filter((x) => x !== v) : [...props.value, v]);
    else {
      props.onChange(v === props.value && props.clearable ? null : v);
      setOpen(false);
    }
  };
  const clear = () => (props.multiple ? props.onChange([]) : props.onChange(null));

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
        props.onOpenChange?.(o);
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "group flex w-full min-w-0 items-center gap-1 rounded-lg bg-surface px-2 text-left outline-none ring-1 ring-inset ring-border transition hover:ring-border-strong focus-visible:ring-accent/50 data-[state=open]:ring-accent/50 disabled:opacity-50",
            active && "bg-accent/[.06] ring-accent/40",
            h,
            className,
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {chosen.length === 0 ? (
              <span className="truncate text-subtle">{placeholder ?? tr({ fr: "Choisir…", en: "Choose…" })}</span>
            ) : props.multiple && chosen.length > 2 ? (
              <>
                <Tag o={chosen[0]!} tags={tags} />
                <span className="shrink-0 rounded bg-surface-2 px-1 text-[11px] text-muted">+{chosen.length - 1}</span>
              </>
            ) : (
              chosen.map((o) => <Tag key={o.value} o={o} tags={tags} />)
            )}
          </span>
          {chosen.length > 0 && (props.multiple || props.clearable) ? (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
              className="grid size-4 shrink-0 place-items-center rounded text-subtle hover:text-fg"
            >
              <X className="size-3" />
            </span>
          ) : (
            <ChevronDown className="size-3.5 shrink-0 text-subtle transition group-data-[state=open]:rotate-180" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className={cn("w-[max(var(--radix-popover-trigger-width),220px)] max-w-[92vw] p-1", menuClassName)}>
        {(options.length > 7 || onSearch) && (
          <div className="mb-1 flex items-center gap-2 border-b border-border px-2 pb-1.5 pt-1">
            <Search className="size-3.5 text-subtle" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                onSearch?.(e.target.value);
              }}
              placeholder={tr({ fr: "Rechercher…", en: "Search…" })}
              className="h-6 w-full bg-transparent text-[13px] outline-none placeholder:text-subtle"
            />
            {loading && <span className="size-3 animate-spin rounded-full border-2 border-border-strong border-t-fg" />}
          </div>
        )}
        {props.multiple && (
          <div className="mb-1 flex gap-1 px-1 text-[11.5px]">
            <button type="button" onClick={() => props.onChange([...new Set([...props.value, ...filtered.map((o) => o.value)])])} className="rounded px-1.5 py-0.5 text-muted hover:bg-hover hover:text-fg">
              {tr({ fr: "Tout sélectionner", en: "Select all" })}
            </button>
            <button type="button" onClick={clear} className="rounded px-1.5 py-0.5 text-muted hover:bg-hover hover:text-fg">
              {tr({ fr: "Aucun", en: "None" })}
            </button>
            <span className="ml-auto px-1 py-0.5 text-subtle">{selected.length || ""}</span>
          </div>
        )}
        <div className="max-h-72 overflow-y-auto">
          {filtered.map((o) => {
            const on = sel.has(o.value);
            return (
              <button key={o.value} type="button" onClick={() => pick(o.value)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-hover", on && !props.multiple && "bg-hover")}>
                {props.multiple && (
                  <span className={cn("grid size-4 shrink-0 place-items-center rounded border", on ? "border-accent bg-accent text-white" : "border-border-strong")}>{on && <Check className="size-3" strokeWidth={3} />}</span>
                )}
                <span className="min-w-0 flex-1">
                  <Tag o={o} tags={tags} />
                  {o.hint && <span className="block truncate text-[11px] text-subtle">{o.hint}</span>}
                </span>
                {!props.multiple && on && <Check className="size-3.5 shrink-0 text-muted" />}
              </button>
            );
          })}
          {!filtered.length && <div className="px-2 py-3 text-center text-xs text-subtle">{tr({ fr: "Aucun résultat", en: "No results" })}</div>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
