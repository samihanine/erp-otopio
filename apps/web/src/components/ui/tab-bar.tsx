/** One tab style for the whole app: a segmented bar, the active tab raised in white. */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type TabItem = { key: string; label: ReactNode; active: boolean; to?: string; onClick?: () => void; count?: number | null; icon?: ReactNode; highlight?: boolean };

export function TabBar({ items, className, size = "md" }: { items: TabItem[]; className?: string; size?: "sm" | "md" }) {
  const item = (t: TabItem) =>
    cn(
      "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition",
      size === "sm" ? "px-2.5 py-1 text-[12.5px]" : "px-3 py-1.5 text-[13px]",
      t.active ? "bg-surface text-fg shadow-sm ring-1 ring-border dark:bg-white/10 dark:ring-white/10" : "text-muted hover:bg-surface/60 hover:text-fg dark:hover:bg-white/5",
    );
  const inner = (t: TabItem) => (
    <>
      {t.icon}
      {t.label}
      {t.count ? (
        <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", t.highlight ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : t.active ? "bg-surface-2 text-muted" : "bg-fg/[.06] text-muted")}>{t.count}</span>
      ) : null}
    </>
  );
  return (
    <nav className={cn("no-scrollbar inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-fg/[.05] p-1 dark:bg-white/[.06]", className)}>
      {items.map((t) =>
        t.to ? (
          <Link key={t.key} to={t.to} search={{}} className={item(t)}>
            {inner(t)}
          </Link>
        ) : (
          <button key={t.key} type="button" onClick={t.onClick} className={item(t)}>
            {inner(t)}
          </button>
        ),
      )}
    </nav>
  );
}
