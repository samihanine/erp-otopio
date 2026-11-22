import { useState } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Briefcase, ChevronDown, ChevronRight, Layers, Megaphone, Settings2, Users, Wallet } from "lucide-react";
import { TABLE_GROUPS, TABLES, type TableKey } from "@erp/shared";
import { AppShell } from "@/components/layout/app-shell";
import { DatabaseView, VIEW_ICONS } from "@/components/database/database-view";
import { RecordDetail } from "@/components/database/record-panel";
import { TableTile } from "@/components/ui/misc";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "erp.db.collapsed";
const readCollapsed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "[]");
  } catch {
    return [];
  }
};

/** colored icon of each group of tables */
const GROUP_ICON: Record<string, React.ReactNode> = {
  crm: <Users className="size-4 text-blue-500" />,
  delivery: <Briefcase className="size-4 text-orange-500" />,
  finance: <Wallet className="size-4 text-emerald-500" />,
  marketing: <Megaphone className="size-4 text-pink-500" />,
  settings: <Settings2 className="size-4 text-zinc-500" />,
};

/** Tables grouped like the Drive tree of Documents (collapsible groups). */
export function DatabaseSidebar({ current, viewId }: { current?: TableKey; viewId?: string }) {
  const { tr } = useI18n();
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed);
  const toggle = (k: string) => {
    const next = collapsed.includes(k) ? collapsed.filter((x) => x !== k) : [...collapsed, k];
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
    } catch {}
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {TABLE_GROUPS.map((g) => {
          const tables = Object.values(TABLES).filter((d) => d.group === g.key);
          if (!tables.length) return null;
          const closed = collapsed.includes(g.key) && !tables.some((d) => d.key === current);
          return (
            <div key={g.key}>
              <button type="button" onClick={() => toggle(g.key)} className="flex h-8 w-full items-center gap-1 rounded-md pl-1 pr-2 text-left text-[13px] text-muted hover:bg-hover hover:text-fg">
                <span className="grid size-5 shrink-0 place-items-center text-subtle">{closed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}</span>
                <span className="grid size-5 shrink-0 place-items-center">{GROUP_ICON[g.key] ?? <Layers className="size-4" />}</span>
                <span className="ml-1 truncate">{tr(g.label)}</span>
              </button>
              {!closed &&
                tables.map((d) => (
                  <Link
                    key={d.key}
                    to="/db/$table"
                    params={{ table: d.key }}
                    search={{}}
                    className={cn("flex h-8 items-center gap-2 rounded-md pr-2 text-[13px] text-muted hover:bg-hover hover:text-fg", current === d.key && "bg-hover font-medium text-fg")}
                    style={{ paddingLeft: 24 }}
                  >
                    <TableTile icon={d.icon} color={d.color} size="sm" />
                    <span className="truncate">{tr(d.label)}</span>
                  </Link>
                ))}
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
    <AppShell title={t("databaseShort")} sidebar={<DatabaseSidebar current={table as TableKey} viewId={search.view} />}>
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
