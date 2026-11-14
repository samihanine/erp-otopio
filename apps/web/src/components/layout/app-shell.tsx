import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileText, Globe, Home, Landmark, LogOut, Moon, PanelLeft, Plus, Search, Settings, Sun, Wallet, Database, Languages } from "lucide-react";
import { TABLE_GROUPS, TABLES, type TableDef, type TableKey } from "@erp/shared";
import { api } from "@/lib/api";
import { useI18n, type DictKey } from "@/lib/i18n";
import { useViews } from "@/lib/data";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Avatar, Icon, Kbd, TableTile } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { CommandMenu } from "./command-menu";
import { OtopioLogo } from "./logo";
import { VIEW_ICONS } from "@/components/database/database-view";

type Section = { key: string; to: string; icon: typeof Home; label: DictKey; match: (p: string) => boolean };
const SECTIONS: Section[] = [
  { key: "home", to: "/", icon: Home, label: "home", match: (p) => p === "/" },
  { key: "db", to: "/db/project", icon: Database, label: "database", match: (p) => p.startsWith("/db") },
  { key: "docs", to: "/documents", icon: FileText, label: "documents", match: (p) => p.startsWith("/documents") },
  { key: "finance", to: "/finance", icon: Wallet, label: "finance", match: (p) => p.startsWith("/finance") },
  { key: "website", to: "/website", icon: Globe, label: "website", match: (p) => p.startsWith("/website") },
];

const SHORTCUTS: TableKey[] = ["project", "task", "invoice", "ticket"];

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("erp.theme") === "dark";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("erp.theme", dark ? "dark" : "light");
    } catch {}
  }, [dark]);
  return { dark, setDark };
}

export function AppShell({ children, title, actions }: { children: ReactNode; title?: ReactNode; actions?: ReactNode }) {
  const { t, tr, locale, setLocale } = useI18n();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { dark, setDark } = useTheme();
  const section = SECTIONS.find((s) => s.match(path)) ?? SECTIONS[0]!;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const user = session?.user;

  return (
    <div className="flex h-full bg-bg">
      {/* Icon rail */}
      <aside className="flex w-[68px] shrink-0 flex-col items-center gap-1.5 py-3">
        <Link to="/" className="mb-2 grid size-11 place-items-center rounded-2xl bg-gradient-to-b from-[#3b82f6] to-[#1d4ed8] text-white shadow-[0_6px_16px_-6px_rgb(37_99_235/.7),inset_0_1px_0_rgb(255_255_255/.25)] transition hover:scale-105">
          <OtopioLogo className="size-6" />
        </Link>
        {SECTIONS.map((s) => {
          const active = s.key === section.key;
          return (
            <Tooltip key={s.key} content={t(s.label)}>
              <Link
                to={s.to}
                className={cn(
                  "grid size-10 place-items-center rounded-xl text-muted transition hover:bg-surface/70 hover:text-fg",
                  active && "bg-surface text-fg shadow-card ring-1 ring-border",
                )}
              >
                <s.icon className="size-[18px]" strokeWidth={active ? 2.3 : 2} />
              </Link>
            </Tooltip>
          );
        })}
        <div className="my-2 h-px w-5 bg-border-strong" />
        {SHORTCUTS.map((k) => (
          <Tooltip key={k} content={tr(TABLES[k].label)}>
            <Link to="/db/$table" params={{ table: k }} className="grid size-10 place-items-center rounded-xl transition hover:bg-surface/70">
              <TableTile icon={TABLES[k].icon} color={TABLES[k].color} className="size-7 rounded-full [&_svg]:size-3.5" />
            </Link>
          </Tooltip>
        ))}
        <div className="mt-auto flex flex-col items-center gap-1.5">
          <Tooltip content={t("settings")}>
            <Link to="/settings" className={cn("grid size-10 place-items-center rounded-xl text-muted hover:bg-surface/70 hover:text-fg", path.startsWith("/settings") && "bg-surface text-fg shadow-card ring-1 ring-border")}>
              <Settings className="size-[18px]" />
            </Link>
          </Tooltip>
          <Dropdown>
            <DropdownTrigger className="rounded-full outline-none ring-offset-2 ring-offset-bg focus-visible:ring-2 focus-visible:ring-accent">
              <Avatar name={user?.name ?? user?.email} src={user?.image} size={34} />
            </DropdownTrigger>
            <DropdownContent side="right" align="end" className="w-60">
              <div className="px-2 py-1.5">
                <div className="truncate text-[13px] font-medium">{user?.name}</div>
                <div className="truncate text-xs text-muted">{user?.email}</div>
              </div>
              <DropdownSeparator />
              <DropdownLabel>{t("language")}</DropdownLabel>
              <DropdownItem onSelect={() => setLocale("fr")}>
                <Languages /> Français {locale === "fr" && "✓"}
              </DropdownItem>
              <DropdownItem onSelect={() => setLocale("en")}>
                <Languages /> English {locale === "en" && "✓"}
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem onSelect={() => setDark(!dark)}>
                {dark ? <Sun /> : <Moon />} {dark ? t("light") : t("dark")}
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem
                onSelect={async () => {
                  await signOut();
                  navigate({ to: "/login" });
                }}
              >
                <LogOut /> {t("signOut")}
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </div>
      </aside>

      {/* Main surface */}
      <div className="my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
          <button type="button" onClick={() => setCollapsed((c) => !c)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg" title="⌘\">
            <PanelLeft className="size-4" />
          </button>
          <div className="flex min-w-0 items-center gap-1.5 text-[15px]">
            <span className="text-muted">Otopio</span>
            <span className="text-subtle">/</span>
            <span className="truncate font-medium">{title ?? t(section.label)}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {actions}
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="flex h-9 w-72 items-center gap-2 rounded-xl bg-surface-2 px-3 text-[13px] text-subtle ring-1 ring-inset ring-border transition hover:text-muted max-md:w-9 max-md:px-2.5"
            >
              <Search className="size-4 shrink-0" />
              <span className="truncate max-md:hidden">{t("searchAnything")}</span>
              <span className="ml-auto flex gap-0.5 max-md:hidden">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          {!collapsed && <Sidebar section={section.key} onNew={() => setCmdOpen(true)} />}
          <main className="min-w-0 flex-1 overflow-hidden bg-canvas">{children}</main>
        </div>
      </div>
      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Secondary sidebar                                                         */
/* -------------------------------------------------------------------------- */

function NavItem({ to, params, search, icon, label, count, active, indent, iconNode }: { to: string; params?: Record<string, string>; search?: Record<string, string>; icon?: string; iconNode?: ReactNode; label: ReactNode; count?: number; active?: boolean; indent?: boolean }) {
  return (
    <Link
      to={to}
      params={params as never}
      search={search as never}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-muted transition hover:bg-hover hover:text-fg",
        active && "bg-surface-2 font-medium text-fg ring-1 ring-inset ring-border",
        indent && "ml-4 h-7 pl-3 text-[12.5px]",
      )}
    >
      {iconNode ?? (icon ? <Icon name={icon} className="size-4 shrink-0" /> : null)}
      <span className="truncate">{label}</span>
      {count != null && <span className="ml-auto text-xs tabular-nums text-subtle">{count}</span>}
    </Link>
  );
}

function Sidebar({ section, onNew }: { section: string; onNew: () => void }) {
  const { t, tr } = useI18n();
  const loc = useRouterState({ select: (s) => s.location });
  const path = loc.pathname;
  const searchView = (loc.search as { view?: string }).view;
  const { data: counts } = useQuery({ queryKey: ["counts"], queryFn: () => api<Record<TableKey, number>>("/data/_counts"), staleTime: 30_000 });
  const { data: views = [] } = useViews();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ crm: true, delivery: true, finance: true, marketing: true, settings: false });
  const [openTables, setOpenTables] = useState<Record<string, boolean>>({});
  const currentTable = path.startsWith("/db/") ? (path.split("/")[2] as TableKey) : null;
  useEffect(() => {
    if (currentTable) setOpenTables((o) => ({ ...o, [currentTable]: true }));
  }, [currentTable]);

  const sectionTitle: Record<string, string> = {
    home: tr({ fr: "Espace de travail", en: "Workspace" }),
    db: t("database"),
    docs: t("documents"),
    finance: t("finance"),
    website: t("website"),
  };

  const tableNode = (d: TableDef) => {
    const tv = views.filter((v) => v.table === d.key);
    const open = openTables[d.key];
    const active = currentTable === d.key;
    return (
      <div key={d.key}>
        <div className="group relative flex items-center">
          {tv.length > 0 && (
            <button type="button" onClick={() => setOpenTables((o) => ({ ...o, [d.key]: !o[d.key] }))} className="absolute -left-3.5 grid size-4 place-items-center rounded text-subtle opacity-0 transition hover:text-fg group-hover:opacity-100">
              {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            </button>
          )}
          <div className="flex-1">
            <NavItem to="/db/$table" params={{ table: d.key }} iconNode={<TableTile icon={d.icon} color={d.color} size="sm" />} label={tr(d.label)} count={counts?.[d.key]} active={active && !searchView && path.split("/").length === 3} />
          </div>
        </div>
        {open && tv.length > 0 && (
          <div className="relative mb-1 mt-0.5 before:absolute before:bottom-2 before:left-[18px] before:top-0 before:w-px before:bg-border">
            {tv.map((v) => (
              <NavItem key={v.id} indent to="/db/$table" params={{ table: d.key }} search={{ view: v.id }} icon={v.icon ?? VIEW_ICONS[v.type]} label={v.name} active={searchView === v.id} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const groups = TABLE_GROUPS.filter((g) => {
    if (section === "finance") return g.key === "finance" || g.key === "settings";
    if (section === "website") return g.key === "marketing";
    if (section === "docs") return g.key === "finance" || g.key === "crm";
    return true;
  });

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-[17px] font-semibold tracking-tight">{sectionTitle[section]}</h2>
      </div>
      <div className="px-3">
        <button type="button" onClick={onNew} className="flex h-9 w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 text-[13px] font-medium shadow-card transition hover:bg-hover">
          <Plus className="size-4" /> {t("newRecord")}
        </button>
      </div>
      <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        <NavItem to="/" icon="House" label={t("home")} active={path === "/"} />
        <NavItem to="/documents" icon="FileText" label={t("documents")} active={path.startsWith("/documents")} count={undefined} />
        <NavItem to="/finance" icon="ChartPie" label={t("finance")} active={path === "/finance"} />
        <NavItem to="/website" icon="Globe" label={t("website")} active={path === "/website"} />

        {groups.map((g) => (
          <div key={g.key} className="pt-4">
            <button type="button" onClick={() => setOpenGroups((o) => ({ ...o, [g.key]: !o[g.key] }))} className="mb-1 flex w-full items-center justify-between rounded-md px-2.5 py-1 text-[11px] font-medium uppercase tracking-[.08em] text-subtle hover:text-muted">
              {tr(g.label)}
              <span className="grid size-5 place-items-center rounded-md bg-surface-2 ring-1 ring-inset ring-border">{openGroups[g.key] ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}</span>
            </button>
            {openGroups[g.key] && <div className="space-y-0.5 pl-0.5">{Object.values(TABLES).filter((d) => d.group === g.key).map(tableNode)}</div>}
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <Link to="/settings" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-hover hover:text-fg">
          <Landmark className="size-3.5" /> Megascale (FR) · Otopio Inc. (CA)
        </Link>
      </div>
    </aside>
  );
}
