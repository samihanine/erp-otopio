import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Copy, Pencil, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { TABLES, type TableKey, type ViewType } from "@erp/shared";
import { useI18n, type DictKey } from "@/lib/i18n";
import { defaultConfig, useCreateRecord, useDeleteRecord, useList, useUpdateRecord, useViewMutations, useViews, type SavedView, type ViewConfig } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, Icon, Skeleton, TableTile } from "@/components/ui/misc";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Sheet } from "@/components/ui/dialog";
import { FieldsMenu, FilterMenu, LayoutMenu, SortMenu } from "./toolbar";
import { TableView } from "./table-view";
import { CalendarView, GalleryView, KanbanView, ListView } from "./board-views";
import { GanttView } from "./gantt-view";
import { RecordDetail } from "./record-panel";

export const VIEW_ICONS: Record<ViewType, string> = {
  table: "Table2",
  kanban: "Columns3",
  gantt: "ChartGantt",
  calendar: "CalendarDays",
  gallery: "LayoutGrid",
  list: "List",
};

type Props = { table: TableKey; viewId?: string; recordId?: string; onSearchChange: (s: { view?: string; record?: string }) => void };

export function DatabaseView({ table, viewId, recordId, onSearchChange }: Props) {
  const { tr, t } = useI18n();
  const def = TABLES[table];
  const { data: views = [] } = useViews(table);
  const vm = useViewMutations();

  const saved = views.find((v) => v.id === viewId) ?? null;
  const [defaultType, setDefaultType] = useState<ViewType>("table");
  const type: ViewType = saved?.type ?? defaultType;
  const baseConfig = useMemo<ViewConfig>(() => (saved ? { ...defaultConfig(table, saved.type), ...saved.config } : defaultConfig(table, defaultType)), [saved, table, defaultType]);
  const [config, setConfig] = useState<ViewConfig>(baseConfig);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    setConfig(baseConfig);
    setSelected(new Set());
  }, [baseConfig]);
  useEffect(() => setSearch(""), [table]);

  const dirty = JSON.stringify(config) !== JSON.stringify(baseConfig);
  const params = useMemo(
    () => ({ filters: config.filters.map(({ field, op, value }) => ({ field, op, value })), mode: config.filterMode, sorts: config.sorts, search: search || undefined }),
    [config.filters, config.filterMode, config.sorts, search],
  );
  const { data, isLoading, isFetching } = useList(table, params);
  const update = useUpdateRecord(table);
  const create = useCreateRecord(table);
  const del = useDeleteRecord(table);

  const onUpdate = (id: string, patch: Record<string, unknown>) => update.mutate({ id, patch });
  const onOpen = (id: string) => onSearchChange({ view: viewId, record: id });
  const onCreate = async (values: Record<string, unknown> = {}) => {
    // pre-fill from simple "in" filters so the new record stays visible
    const pre: Record<string, unknown> = {};
    for (const f of config.filters) {
      const field = def.fields.find((x) => x.key === f.field);
      if (!field) continue;
      if ((field.type === "select" || field.type === "relation") && f.op === "in" && Array.isArray(f.value) && f.value.length === 1) pre[f.field] = f.value[0];
    }
    const res = await create.mutateAsync({ ...pre, ...values });
    toast.success(t("created"));
    onOpen(res.row.id);
  };

  const createView = (vt: ViewType) => {
    vm.create.mutate(
      { table, name: `${t(vt as DictKey)}`, type: vt, icon: VIEW_ICONS[vt], config: { ...defaultConfig(table, vt), filters: config.filters, sorts: config.sorts } },
      { onSuccess: (v) => onSearchChange({ view: v.id }) },
    );
  };
  const saveView = () => {
    if (saved) vm.update.mutate({ id: saved.id, config }, { onSuccess: () => toast.success(t("saved")) });
    else saveAsNew();
  };
  const saveAsNew = () => {
    const name = prompt(t("viewName"), saved ? `${saved.name} (2)` : t(type as DictKey));
    if (!name) return;
    vm.create.mutate({ table, name, type, icon: VIEW_ICONS[type], config }, { onSuccess: (v) => onSearchChange({ view: v.id }) });
  };

  const rows = data?.rows ?? [];
  const refs = data?.refs ?? {};
  const common = { table, rows, refs, config, onUpdate, onOpen, onCreate };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 px-6 pb-2 pt-5">
        <TableTile icon={def.icon} color={def.color} size="lg" />
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">{tr(def.label)}</h1>
          <div className="text-xs text-muted">
            {data ? `${data.total} ${t("records")}` : "…"}
            {isFetching && !isLoading ? <span className="ml-2 inline-block size-1.5 animate-pulse rounded-full bg-accent align-middle" /> : null}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="primary" size="md" onClick={() => onCreate()}>
            <Plus /> {t("new")}
          </Button>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-5">
        <ViewTab active={!saved} icon={VIEW_ICONS[defaultType]} label={t("allRecords")} onClick={() => onSearchChange({})}>
          {!saved && (
            <Dropdown>
              <DropdownTrigger className="ml-0.5 rounded p-0.5 hover:bg-hover">
                <ChevronDown className="size-3" />
              </DropdownTrigger>
              <DropdownContent>
                <DropdownLabel>{tr({ fr: "Afficher en", en: "Show as" })}</DropdownLabel>
                {def.views.map((vt) => (
                  <DropdownItem key={vt} onSelect={() => setDefaultType(vt)}>
                    <Icon name={VIEW_ICONS[vt]} /> {t(vt as DictKey)}
                    {defaultType === vt && <Check className="ml-auto" />}
                  </DropdownItem>
                ))}
              </DropdownContent>
            </Dropdown>
          )}
        </ViewTab>
        {views.map((v) => (
          <ViewTab key={v.id} active={v.id === saved?.id} icon={v.icon ?? VIEW_ICONS[v.type]} label={v.name} onClick={() => onSearchChange({ view: v.id })}>
            {v.id === saved?.id && <ViewActions view={v} onDeleted={() => onSearchChange({})} />}
          </ViewTab>
        ))}
        <Dropdown>
          <DropdownTrigger asChild>
            <button type="button" className="ml-1 flex h-9 items-center gap-1 rounded-md px-2 text-[13px] text-muted hover:text-fg">
              <Plus className="size-3.5" /> {t("addView")}
            </button>
          </DropdownTrigger>
          <DropdownContent>
            {def.views.map((vt) => (
              <DropdownItem key={vt} onSelect={() => createView(vt)}>
                <Icon name={VIEW_ICONS[vt]} /> {t(vt as DictKey)}
              </DropdownItem>
            ))}
          </DropdownContent>
        </Dropdown>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 px-5 py-2">
        <div className="relative mr-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            className="h-7 w-52 rounded-lg bg-surface-2 pl-7 pr-7 text-[13px] outline-none ring-1 ring-inset ring-border transition focus:w-64 focus:bg-surface focus:ring-accent/40"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-subtle hover:text-fg">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <FilterMenu table={table} config={config} onChange={setConfig} />
        <SortMenu table={table} config={config} onChange={setConfig} />
        <FieldsMenu table={table} config={config} onChange={setConfig} />
        <LayoutMenu table={table} config={config} onChange={setConfig} type={type} />
        {dirty && (
          <div className="ml-auto flex items-center gap-1 rounded-lg bg-amber-50 py-0.5 pl-2.5 pr-0.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-200 animate-pop dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900">
            {t("unsaved")}
            <Button size="xs" variant="ghost" onClick={() => setConfig(baseConfig)} className="text-amber-800 dark:text-amber-200">
              <RotateCcw /> {t("resetView")}
            </Button>
            {saved && (
              <Button size="xs" variant="ghost" onClick={saveAsNew} className="text-amber-800 dark:text-amber-200">
                <Copy /> {t("saveAsNew")}
              </Button>
            )}
            <Button size="xs" variant="primary" onClick={saveView}>
              <Check /> {t("saveView")}
            </Button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="relative min-h-0 flex-1 border-t border-border bg-surface">
        {isLoading ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : !rows.length && type !== "table" && type !== "kanban" && type !== "calendar" && type !== "gantt" ? (
          <EmptyState icon={def.icon} title={t("noRecords")} action={<Button onClick={() => onCreate()}><Plus /> {t("new")}</Button>} />
        ) : type === "table" ? (
          <TableView {...common} onConfigChange={setConfig} selected={selected} onSelect={setSelected} />
        ) : type === "kanban" ? (
          <KanbanView {...common} />
        ) : type === "gantt" ? (
          <GanttView {...common} />
        ) : type === "calendar" ? (
          <CalendarView {...common} />
        ) : type === "gallery" ? (
          <div className="h-full overflow-auto">
            <GalleryView {...common} />
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <ListView {...common} />
          </div>
        )}

        {selected.size > 0 && (
          <div className="absolute bottom-12 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-navy px-3 py-2 text-[13px] text-white shadow-pop animate-pop">
            <span className="tabular-nums">{selected.size}</span> {tr({ fr: "sélectionné(s)", en: "selected" })}
            <span className="mx-1 h-4 w-px bg-white/20" />
            <button
              type="button"
              className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10"
              onClick={async () => {
                if (!confirm(tr({ fr: `Supprimer ${selected.size} élément(s) ?`, en: `Delete ${selected.size} item(s)?` }))) return;
                await Promise.all([...selected].map((id) => del.mutateAsync(id)));
                setSelected(new Set());
                toast.success(t("deleted"));
              }}
            >
              <Trash2 className="size-3.5" /> {t("delete")}
            </button>
            <button type="button" className="rounded-md p-1 hover:bg-white/10" onClick={() => setSelected(new Set())}>
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      <Sheet open={Boolean(recordId)} onOpenChange={(o) => !o && onSearchChange({ view: viewId })}>
        {recordId ? <RecordDetail table={table} id={recordId} onClose={() => onSearchChange({ view: viewId })} /> : null}
      </Sheet>
    </div>
  );
}

function ViewTab({ active, icon, label, onClick, children }: { active: boolean; icon: string; label: string; onClick: () => void; children?: React.ReactNode }) {
  return (
    <div className={cn("relative flex h-9 shrink-0 items-center", active && "after:absolute after:inset-x-1.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-fg")}>
      <button type="button" onClick={onClick} className={cn("flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition", active ? "text-fg" : "text-muted hover:bg-hover hover:text-fg")}>
        <Icon name={icon} className="size-3.5" />
        {label}
      </button>
      {children}
    </div>
  );
}

function ViewActions({ view, onDeleted }: { view: SavedView; onDeleted: () => void }) {
  const { t } = useI18n();
  const vm = useViewMutations();
  return (
    <Dropdown>
      <DropdownTrigger className="rounded p-0.5 text-muted hover:bg-hover hover:text-fg">
        <ChevronDown className="size-3" />
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem
          onSelect={() => {
            const name = prompt(t("viewName"), view.name);
            if (name) vm.update.mutate({ id: view.id, name });
          }}
        >
          <Pencil /> {t("renameView")}
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem
          danger
          onSelect={() => {
            if (confirm(`${t("deleteView")} « ${view.name} » ?`)) vm.remove.mutate(view.id, { onSuccess: onDeleted });
          }}
        >
          <Trash2 /> {t("deleteView")}
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
