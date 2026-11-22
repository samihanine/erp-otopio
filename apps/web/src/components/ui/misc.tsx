import { icons, type LucideProps } from "lucide-react";
import type { ReactNode } from "react";
import type { Color, SelectOption } from "@erp/shared";
import { BADGE, DOT, TILE } from "@/lib/colors";
import { cn, initials } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/** Lucide icon by name (from table metadata). */
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = icons[name as keyof typeof icons] ?? icons.Circle;
  return <Cmp {...props} />;
}

export function TableTile({ icon, color, size = "md", className }: { icon: string; color: Color; size?: "sm" | "md" | "lg"; className?: string }) {
  const s = size === "sm" ? "size-5 rounded-md [&_svg]:size-3" : size === "lg" ? "size-9 rounded-xl [&_svg]:size-[18px]" : "size-6 rounded-lg [&_svg]:size-3.5";
  return (
    <span className={cn("inline-grid shrink-0 place-items-center text-white shadow-[inset_0_-1px_0_rgb(0_0_0/.12)]", TILE[color], s, className)}>
      <Icon name={icon} strokeWidth={2.4} />
    </span>
  );
}

export function OptionBadge({ option, className }: { option?: SelectOption | null; className?: string }) {
  const { tr } = useI18n();
  if (!option) return null;
  return (
    <span className={cn("inline-flex h-[22px] max-w-full items-center gap-1.5 truncate rounded-md px-1.5 text-xs font-medium ring-1 ring-inset", BADGE[option.color], className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", DOT[option.color])} />
      <span className="truncate">{tr(option.label)}</span>
    </span>
  );
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-[22px] max-w-full items-center gap-1 truncate rounded-md bg-surface-2 px-1.5 text-xs font-medium text-fg ring-1 ring-inset ring-border", className)}>{children}</span>;
}

const AVATAR_COLORS = ["bg-emerald-100 text-emerald-700", "bg-violet-100 text-violet-700", "bg-sky-100 text-sky-700", "bg-amber-100 text-amber-800", "bg-rose-100 text-rose-700", "bg-indigo-100 text-indigo-700", "bg-teal-100 text-teal-700"];
export function Avatar({ name, src, size = 22, className }: { name?: string | null; src?: string | null; size?: number; className?: string }) {
  const idx = (name ?? "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return src ? (
    <img src={src} alt={name ?? ""} style={{ width: size, height: size }} className={cn("shrink-0 rounded-full object-cover ring-2 ring-surface", className)} />
  ) : (
    <span style={{ width: size, height: size, fontSize: Math.max(9, size * 0.42) }} className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold ring-2 ring-surface", AVATAR_COLORS[idx], className)}>
      {initials(name)}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 font-sans text-[11px] font-medium text-muted">{children}</kbd>;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-4 animate-spin rounded-full border-2 border-border-strong border-t-fg", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}

export function EmptyState({ icon = "Inbox", title, description, action }: { icon?: string; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="mb-1 grid size-11 place-items-center rounded-2xl border border-border bg-surface-2 text-muted">
        <Icon name={icon} className="size-5" />
      </div>
      <div className="text-sm font-medium">{title}</div>
      {description ? <div className="max-w-sm text-[13px] text-muted">{description}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-lg bg-surface-2 p-0.5 ring-1 ring-inset ring-border", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn("h-6 shrink-0 whitespace-nowrap rounded-md px-2.5 text-xs font-medium text-muted transition", value === o.value && "bg-surface text-fg shadow-card ring-1 ring-border")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className="relative inline-flex size-2">
      {ok && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60" />}
      <span className={cn("relative inline-flex size-2 rounded-full", ok ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600")} />
    </span>
  );
}
