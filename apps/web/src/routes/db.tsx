import { useState } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search, X } from "lucide-react";
import { TABLE_GROUPS, TABLES, type TableKey } from "@erp/shared";
import { AppShell } from "@/components/layout/app-shell";
import { DatabaseView, VIEW_ICONS } from "@/components/database/database-view";
import { RecordDetail } from "@/components/database/record-panel";
import { Icon, TableTile } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useViews } from "@/lib/data";

const COLLAPSE_KEY = "erp.db.collapsed";
const readCollapsed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "[]");
  } catch {
    return [];
  }
};

/** List of every table (+ saved views of the current one), with search and collapsible groups. */
export function DatabaseSidebar({ current, viewId }: { current?: TableKey; viewId?: string }) {
  const { tr } = useI18n();
  const { data: counts } = useQuery({ queryKey: ["counts"], queryFn: () => api<Record<TableKey, number>>("/data/_counts"), staleTime: 30_000 });
  const { data: views = [] } = useViews();
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed);
  const toggle = (k: string) => {
    const next = collapsed.includes(k) ? collapsed.filter((x) => x !== k) : [...collapsed, k];
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
    } catch {}
  };
  const needle = q.trim().toLowerCase();
  const match = (d: (typeof TABLES)[TableKey]) => !needle || tr(d.label).toLowerCase().includes(needle) || d.key.includes(needle);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-2 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr({ fr: "Trouver une table…", en: "Find a table…" })}
            className="h-8 w-full rounded-lg bg-surface pl-8 pr-7 text-[13px] outline-none ring-1 ring-inset ring-border focus:ring-accent/40"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle hover:text-fg">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {TABLE_GROUPS.map((g) => {
          const tables = Object.values(TABLES).filter((d) => d.group === g.key && match(d));
          if (!tables.length) return null;
          const closed = !needle && collapsed.includes(g.key) && !tables.some((d) => d.key === current);
          return (
            <div key={g.key} className="mb-2">
              <button
                type="button"
                onClick={() => toggle(g.key)}
                className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-subtle hover:text-muted"
              >
                <ChevronRight className={cn("size-3 transition-transform", !closed && "rotate-90")} />
                {tr(g.label)}
              </button>
              {!closed &&
                tables.map((d) => {
                  const active = current === d.key;
                  return (
                    <div key={d.key}>
                      <Link
                        to="/db/$table"
                        params={{ table: d.key }}
                        search={{}}
                        className={cn(
                          "flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-muted transition hover:bg-hover hover:text-fg",
                          active && "bg-hover font-medium text-fg",
                        )}
                      >
                        <TableTile icon={d.icon} color={d.color} size="sm" />
                        <span className="flex-1 truncate">{tr(d.label)}</span>
                        <span className="text-[11px] tabular-nums text-subtle">{counts?.[d.key] ?? ""}</span>
                      </Link>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

export function DatabasePage() {
  const { table } = useParams({ from: "/app/db/$table" });
  const search = useSearch({ from: "/app/db/$table" });
  const navigate = useNavigate();
  const { tr, t } = useI18n();
  return (
    <AppShell header={false} title={tr(TABLES[table as TableKey].label)} parent={{ label: t("database"), to: "/db/project" }} sidebar={<DatabaseSidebar current={table as TableKey} viewId={search.view} />}>
      <DatabaseView
        key={table}
        table={table as TableKey}
        viewId={search.view}
        recordId={search.record}
        onSearchChange={(s) => navigate({ to: "/db/$table", params: { table }, search: s, replace: Boolean(s.record) || Boolean(search.record) })}
      />
    </AppShell>
  );
}

export function RecordPage() {
  const { table, id } = useParams({ from: "/app/db/$table/$id" });
  const { tr } = useI18n();
  const def = TABLES[table as TableKey];
  return (
    <AppShell title={tr(def?.singular)} parent={{ label: tr(def?.label), to: `/db/${table}` }} sidebar={<DatabaseSidebar current={table as TableKey} />}>
      <RecordDetail table={table as TableKey} id={id} full />
    </AppShell>
  );
}
