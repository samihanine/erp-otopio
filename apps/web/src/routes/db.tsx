import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TABLE_GROUPS, TABLES, type TableKey } from "@erp/shared";
import { AppShell } from "@/components/layout/app-shell";
import { DatabaseView, VIEW_ICONS } from "@/components/database/database-view";
import { RecordDetail } from "@/components/database/record-panel";
import { Icon, TableTile } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useViews } from "@/lib/data";

/** Left list of every table (+ its saved views) — only shown in the Data section. */
function DatabaseSidebar({ current, viewId }: { current?: TableKey; viewId?: string }) {
  const { tr } = useI18n();
  const { data: counts } = useQuery({ queryKey: ["counts"], queryFn: () => api<Record<TableKey, number>>("/data/_counts"), staleTime: 30_000 });
  const { data: views = [] } = useViews();
  return (
    <aside className="w-56 shrink-0 overflow-y-auto border-r border-border px-2 py-4">
      {TABLE_GROUPS.map((g) => (
        <div key={g.key} className="mb-4">
          <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-subtle">{tr(g.label)}</div>
          {Object.values(TABLES)
            .filter((d) => d.group === g.key)
            .map((d) => {
              const active = current === d.key;
              const tv = active ? views.filter((v) => v.table === d.key) : [];
              return (
                <div key={d.key}>
                  <Link
                    to="/db/$table"
                    params={{ table: d.key }}
                    search={{}}
                    className={cn("flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-muted hover:bg-hover hover:text-fg", active && !viewId && "bg-hover font-medium text-fg", active && viewId && "text-fg")}
                  >
                    <TableTile icon={d.icon} color={d.color} size="sm" />
                    <span className="flex-1 truncate">{tr(d.label)}</span>
                    <span className="text-[11px] tabular-nums text-subtle">{counts?.[d.key] ?? ""}</span>
                  </Link>
                  {tv.map((v) => (
                    <Link
                      key={v.id}
                      to="/db/$table"
                      params={{ table: d.key }}
                      search={{ view: v.id }}
                      className={cn("ml-5 flex h-7 items-center gap-2 rounded-md px-2 text-[12.5px] text-muted hover:bg-hover hover:text-fg", viewId === v.id && "bg-hover font-medium text-fg")}
                    >
                      <Icon name={v.icon ?? VIEW_ICONS[v.type]} className="size-3.5 shrink-0" />
                      <span className="truncate">{v.name}</span>
                    </Link>
                  ))}
                </div>
              );
            })}
        </div>
      ))}
    </aside>
  );
}

export function DatabasePage() {
  const { table } = useParams({ from: "/app/db/$table" });
  const search = useSearch({ from: "/app/db/$table" });
  const navigate = useNavigate();
  const { tr, t } = useI18n();
  return (
    <AppShell title={tr(TABLES[table as TableKey].label)} parent={{ label: t("database"), to: "/db/project" }}>
      <div className="flex h-full min-h-0">
      <DatabaseSidebar current={table as TableKey} viewId={search.view} />
      <div className="min-w-0 flex-1">
      <DatabaseView
        key={table}
        table={table as TableKey}
        viewId={search.view}
        recordId={search.record}
        onSearchChange={(s) => navigate({ to: "/db/$table", params: { table }, search: s, replace: Boolean(s.record) || Boolean(search.record) })}
      />
      </div>
      </div>
    </AppShell>
  );
}

export function RecordPage() {
  const { table, id } = useParams({ from: "/app/db/$table/$id" });
  const { tr } = useI18n();
  const def = TABLES[table as TableKey];
  return (
    <AppShell title={tr(def?.singular)} parent={{ label: tr(def?.label), to: `/db/${table}` }}>
      <div className="flex h-full min-h-0">
        <DatabaseSidebar current={table as TableKey} />
        <div className="min-w-0 flex-1">
          <RecordDetail table={table as TableKey} id={id} full />
        </div>
      </div>
    </AppShell>
  );
}
