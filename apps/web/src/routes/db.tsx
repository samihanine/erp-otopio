import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TABLE_GROUPS, TABLES, type TableKey } from "@erp/shared";
import { AppShell } from "@/components/layout/app-shell";
import { DatabaseView, VIEW_ICONS } from "@/components/database/database-view";
import { RecordDetail } from "@/components/database/record-panel";
import { Icon, TableTile } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useViews } from "@/lib/data";

/** /db — Notion-like index of every table, grouped. */
export function DatabaseHomePage() {
  const { t, tr } = useI18n();
  const { data: counts } = useQuery({ queryKey: ["counts"], queryFn: () => api<Record<TableKey, number>>("/data/_counts"), staleTime: 30_000 });
  const { data: views = [] } = useViews();
  return (
    <AppShell title={t("database")}>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 pb-20 pt-10">
          <h1 className="text-[28px] font-semibold tracking-tight">{t("database")}</h1>
          <p className="mt-1 text-[14px] text-muted">{tr({ fr: "Toutes les données d'Otopio, organisées en tables.", en: "All Otopio data, organized in tables." })}</p>

          {TABLE_GROUPS.map((g) => {
            const tables = Object.values(TABLES).filter((d) => d.group === g.key);
            return (
              <section key={g.key} className="mt-10">
                <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-subtle">{tr(g.label)}</h2>
                <div className="divide-y divide-border border-y border-border">
                  {tables.map((d) => {
                    const tv = views.filter((v) => v.table === d.key);
                    return (
                      <div key={d.key} className="group flex items-center gap-3 py-3">
                        <Link to="/db/$table" params={{ table: d.key }} search={{}} className="flex min-w-0 flex-1 items-center gap-3">
                          <TableTile icon={d.icon} color={d.color} />
                          <span className="truncate text-[15px] font-medium group-hover:underline">{tr(d.label)}</span>
                          <span className="text-[13px] tabular-nums text-subtle">{counts?.[d.key] ?? ""}</span>
                        </Link>
                        <div className="hidden items-center gap-1 sm:flex">
                          {tv.slice(0, 3).map((v) => (
                            <Link key={v.id} to="/db/$table" params={{ table: d.key }} search={{ view: v.id }} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted hover:bg-hover hover:text-fg">
                              <Icon name={v.icon ?? VIEW_ICONS[v.type]} className="size-3.5" />
                              {v.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

export function DatabasePage() {
  const { table } = useParams({ from: "/app/db/$table" });
  const search = useSearch({ from: "/app/db/$table" });
  const navigate = useNavigate();
  const { tr, t } = useI18n();
  return (
    <AppShell title={tr(TABLES[table as TableKey].label)} parent={{ label: t("database"), to: "/db" }}>
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
    <AppShell title={tr(def?.singular)} parent={{ label: tr(def?.label), to: `/db/${table}` }}>
      <RecordDetail table={table as TableKey} id={id} full />
    </AppShell>
  );
}
