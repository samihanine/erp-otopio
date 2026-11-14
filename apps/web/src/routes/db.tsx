import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import type { TableKey } from "@erp/shared";
import { TABLES } from "@erp/shared";
import { AppShell } from "@/components/layout/app-shell";
import { DatabaseView } from "@/components/database/database-view";
import { RecordDetail } from "@/components/database/record-panel";
import { useI18n } from "@/lib/i18n";

export function DatabasePage() {
  const { table } = useParams({ from: "/app/db/$table" });
  const search = useSearch({ from: "/app/db/$table" });
  const navigate = useNavigate();
  const { tr } = useI18n();
  return (
    <AppShell title={tr(TABLES[table as TableKey].label)}>
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
  return (
    <AppShell title={tr(TABLES[table as TableKey]?.singular)}>
      <div className="h-full bg-surface">
        <RecordDetail table={table as TableKey} id={id} full />
      </div>
    </AppShell>
  );
}
