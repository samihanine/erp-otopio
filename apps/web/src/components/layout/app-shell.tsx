import { TabBar } from "@/components/ui/tab-bar";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import * as Dl from "@radix-ui/react-dialog";
import { Briefcase, CalendarDays, Check, ChevronsUpDown, Database, FileText, Globe, Home, Languages, LogOut, Menu as MenuIcon, Moon, PanelLeftClose, PanelLeftOpen, Search, Settings, Sun, Wallet, X } from "lucide-react";
import { useMedia, usePref, useResizableWidth } from "@/lib/use-media";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { useI18n, type DictKey } from "@/lib/i18n";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Avatar, Kbd } from "@/components/ui/misc";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { CommandMenu } from "./command-menu";
import { OtopioLogo } from "./logo";
import { useWorkspaces, type ModuleKey, type WorkspaceInfo } from "@/lib/workspace";

/** sections shown in the mobile bottom tab bar (the rest is under « Plus ») */
const TABS = ["home", "clients", "db", "finance"];

type Section = { key: string; to: string; icon: typeof Home; label: DictKey; match: (p: string) => boolean; modules: ModuleKey[] };
const SECTIONS: Section[] = [
  { key: "home", to: "/", icon: Home, label: "home", match: (p) => p === "/" || p.startsWith("/calendar"), modules: ["home", "calendar"] },
  { key: "clients", to: "/clients", icon: Briefcase, label: "clients", match: (p) => p.startsWith("/clients"), modules: ["clients"] },
  { key: "db", to: "/db", icon: Database, label: "databaseShort", match: (p) => p.startsWith("/db"), modules: ["db"] },
  { key: "docs", to: "/documents", icon: FileText, label: "documents", match: (p) => p.startsWith("/documents"), modules: ["docs"] },
  { key: "finance", to: "/finance", icon: Wallet, label: "finance", match: (p) => p.startsWith("/finance"), modules: ["finance", "taxes"] },
  { key: "website", to: "/website", icon: Globe, label: "website", match: (p) => p.startsWith("/website"), modules: ["website", "social"] },
];

const initials = (w: WorkspaceInfo) => (w.code === "OTP" ? "OT" : w.code === "MGS" ? "MG" : w.name.replace(/[^A-Za-zÀ-ÿ ]/g, "").split(" ")[0]!.slice(0, 2)).toUpperCase();

/** Workspace picker (one workspace per structure). */
export function WorkspaceSwitcher({ compact = true }: { compact?: boolean }) {
  const { list, ws, switchTo } = useWorkspaces();
  const { tr } = useI18n();
  if (!ws) return null;
  return (
    <Dropdown>
      <DropdownTrigger
        className={cn("outline-none focus-visible:ring-2 focus-visible:ring-accent", compact ? "group mb-3 flex flex-col items-center gap-1" : "flex w-full min-w-0 items-center gap-3 rounded-xl border border-border bg-surface px-2.5 py-2 text-left shadow-[0_1px_2px_rgb(0_0_0/.04)] transition hover:border-border-strong")}
        title={tr({ fr: "Changer d'espace de travail", en: "Switch workspace" })}
      >
        <span className="relative grid size-10 shrink-0 place-items-center rounded-xl text-[13px] font-bold text-white shadow-sm transition group-hover:opacity-90" style={{ background: ws.color }}>
          {ws.code === "OTP" ? <OtopioLogo className="size-6" /> : initials(ws)}
        </span>
        {compact ? (
          <span className="flex w-[76px] flex-col items-center text-center text-[10.5px] font-medium leading-[1.15] text-muted group-hover:text-fg">
            <span className="line-clamp-2 break-words">{ws.name}</span>
            <ChevronsUpDown className="mt-0.5 size-3 shrink-0 text-subtle" />
          </span>
        ) : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold leading-tight">{ws.name}</span>
              <span className="block truncate text-[12px] text-muted">{ws.country === "FR" ? "France" : "Canada"} · {ws.currency}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted" />
          </>
        )}
      </DropdownTrigger>
      <DropdownContent side={compact ? "right" : "bottom"} align="start" className="w-64">
        <DropdownLabel>{tr({ fr: "Espaces de travail", en: "Workspaces" })}</DropdownLabel>
        {list.map((w) => (
          <DropdownItem key={w.id} onSelect={() => switchTo(w.id)}>
            <span className="grid size-6 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white" style={{ background: w.color }}>
              {initials(w)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{w.name}</span>
              <span className="block truncate text-[11px] text-muted">
                {w.legalName} · {w.currency}
              </span>
            </span>
            {w.id === ws.id && <Check className="size-4" />}
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}

/** Shell controls usable by pages that render their own header (`header={false}`). */
type ShellCtx = { openMenu: () => void; openSearch: () => void; toggleSidebar: () => void; sidebarOpen: boolean; hasSidebar: boolean; wide: boolean };
const ShellContext = createContext<ShellCtx | null>(null);
export const useShell = () => useContext(ShellContext);

/** Menu (mobile) / panel toggle (desktop) buttons. */
export function ShellNavButtons() {
  const s = useShell();
  const { tr } = useI18n();
  if (!s) return null;
  return (
    <>
      <button type="button" onClick={s.openMenu} className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-fg", s.hasSidebar ? "lg:hidden" : "hidden")} aria-label="Menu">
        <MenuIcon className="size-[18px]" />
      </button>
      {s.hasSidebar && s.wide ? (
        <button
          type="button"
          onClick={s.toggleSidebar}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-fg"
          title={s.sidebarOpen ? tr({ fr: "Masquer le panneau", en: "Hide panel" }) : tr({ fr: "Afficher le panneau", en: "Show panel" })}
        >
          {s.sidebarOpen ? <PanelLeftClose className="size-[18px]" /> : <PanelLeftOpen className="size-[18px]" />}
        </button>
      ) : null}
    </>
  );
}

/** Global search button (⌘K). */
export function ShellSearchButton({ className }: { className?: string }) {
  const s = useShell();
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => s?.openSearch()}
      className={cn("flex h-8 w-56 items-center gap-2 rounded-lg border border-border px-2.5 text-[13px] text-subtle transition hover:text-muted max-md:w-8 max-md:px-2", className)}
    >
      <Search className="size-4 shrink-0" />
      <span className="truncate max-md:hidden">{t("search")}</span>
      <span className="ml-auto flex gap-0.5 max-md:hidden">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}

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

function RailLink({ to, icon: I, label, active }: { to: string; icon: typeof Home; label: string; active: boolean }) {
  return (
    <Link to={to} className={cn("group flex w-full flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium text-muted transition hover:text-fg", active && "text-fg")}>
      <span className={cn("grid size-9 place-items-center rounded-xl transition group-hover:bg-hover", active && "bg-fg/[.07] dark:bg-white/10")}>
        <I className="size-[18px]" strokeWidth={active ? 2.2 : 1.8} />
      </span>
      <span className="leading-none">{label}</span>
    </Link>
  );
}

/**
 * Navigation rail + optional section sidebar + content.
 *  - `title`: breadcrumb segment; `parent`: optional link before it.
 *  - `sidebar`: section navigation (e.g. the list of tables). Collapsible on desktop,
 *    and shown in the slide-over menu on mobile / tablet.
 */
export type ShellTab = { key: string; label: string; to?: string; onClick?: () => void; active: boolean };

export function AppShell({ children, title, actions, parent, sidebar, header = true, tabs }: { children: ReactNode; title?: ReactNode; actions?: ReactNode; parent?: { label: string; to: string }; sidebar?: ReactNode; header?: boolean; tabs?: ShellTab[] }) {
  const { t, locale, setLocale, tr } = useI18n();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [cmdOpen, setCmdOpen] = useState(false);
  const { dark, setDark } = useTheme();
  const { enabled, ws } = useWorkspaces();
  const sections = SECTIONS.filter((s) => s.modules.some(enabled));
  const section = SECTIONS.find((s) => s.match(path));
  // a section turned off in this workspace (direct link, old bookmark…) → home
  const off = Boolean(ws && section && section.key !== "home" && !section.modules.some(enabled));
  useEffect(() => {
    if (off) navigate({ to: "/", replace: true });
  }, [off, navigate]);
  const [sidebarOpen, setSidebarOpen] = usePref("erp.sidebar", true);
  const [menuOpen, setMenuOpen] = useState(false);
  const wide = useMedia("(min-width: 1024px)");
  const md = useMedia("(min-width: 768px)");
  const sideW = useResizableWidth("erp.sidebar.width", 240, 180, 440);
  // close the mobile menu after navigating
  useEffect(() => setMenuOpen(false), [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const user = session?.user;

  const ctx: ShellCtx = { openMenu: () => setMenuOpen(true), openSearch: () => setCmdOpen(true), toggleSidebar: () => setSidebarOpen(!sidebarOpen), sidebarOpen, hasSidebar: Boolean(sidebar), wide };

  return (
    <ShellContext.Provider value={ctx}>
    <div className="flex h-full bg-surface">
      {/* Main sidebar (desktop): app name, workspace card, navigation, account */}
      <aside className="hidden w-[236px] shrink-0 flex-col border-r border-border bg-surface-2/50 px-3 pb-3 pt-4 xl:flex">
        <Link to="/" className="mb-4 flex items-center gap-2.5 px-1.5">
          <span className="grid size-9 place-items-center rounded-xl bg-navy text-sky-brand">
            <OtopioLogo className="size-5" />
          </span>
          <span className="text-[19px] font-semibold tracking-tight">Otopio</span>
        </Link>
        <WorkspaceSwitcher compact={false} />
        <nav className="mt-4 flex flex-col gap-0.5">
          {[...sections, { key: "settings", to: "/settings", icon: Settings, label: "settings" as DictKey, match: (p: string) => p.startsWith("/settings"), modules: [] }].map((s) => {
            const active = s.key === "settings" ? path.startsWith("/settings") : section?.key === s.key;
            return (
              <Link
                key={s.key}
                to={s.to}
                className={cn("flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] text-muted transition hover:bg-hover hover:text-fg", active && "bg-navy/[.08] font-medium text-fg dark:bg-white/10")}
              >
                <s.icon className="size-[18px] shrink-0" strokeWidth={active ? 2.1 : 1.8} />
                {t(s.label)}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-border pt-3">
          <div className="truncate px-3 pb-2 text-[12px] text-muted" title={user?.email}>
            {user?.email}
          </div>
          <button type="button" onClick={() => setDark(!dark)} className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[14px] text-muted hover:bg-hover hover:text-fg">
            {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />} {dark ? tr({ fr: "Thème clair", en: "Light theme" }) : tr({ fr: "Thème sombre", en: "Dark theme" })}
          </button>
          <button type="button" onClick={() => setLocale(locale === "fr" ? "en" : "fr")} className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[14px] text-muted hover:bg-hover hover:text-fg">
            <Languages className="size-[18px]" /> {locale === "fr" ? "English" : "Français"}
          </button>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate({ to: "/login", search: {} });
            }}
            className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[14px] text-muted hover:bg-hover hover:text-fg"
          >
            <LogOut className="size-[18px]" /> {t("signOut")}
          </button>
        </div>
      </aside>

      {/* Compact rail (tablets / small laptops) */}
      <aside className="hidden w-[84px] shrink-0 flex-col items-center gap-1 border-r border-border bg-surface-2/50 px-2 py-4 md:flex xl:hidden">
        <WorkspaceSwitcher />
        {sections.map((s) => (
          <RailLink key={s.key} to={s.to} icon={s.icon} label={t(s.label)} active={section?.key === s.key} />
        ))}
        <div className="mt-auto flex w-full flex-col items-center gap-2">
          <RailLink to="/settings" icon={Settings} label={t("settings")} active={path.startsWith("/settings")} />
          <Dropdown>
            <DropdownTrigger className="mt-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <Avatar name={user?.name ?? user?.email} src={user?.image} size={32} className="ring-0" />
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
                  navigate({ to: "/login", search: {} });
                }}
              >
                <LogOut /> {t("signOut")}
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </div>
      </aside>

      {/* Section sidebar (desktop, collapsible) */}
      {sidebar && wide && sidebarOpen ? (
        <aside className="relative flex shrink-0 flex-col border-r border-border bg-surface-2/30" style={{ width: sideW.width }}>
          {sidebar}
          <ResizeHandle onPointerDown={sideW.onPointerDown} onReset={sideW.reset} />
        </aside>
      ) : null}

      {/* Mobile / tablet slide-over: main navigation + section sidebar */}
      <Dl.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Dl.Portal>
          <Dl.Overlay className="fixed inset-0 z-50 bg-black/30 animate-fade" />
          <Dl.Content aria-describedby={undefined} className="fixed inset-y-0 left-0 z-50 flex w-[min(86vw,320px)] flex-col overflow-hidden border-r border-border bg-surface shadow-pop outline-none">
            <Dl.Title className="sr-only">Menu</Dl.Title>
            <div className="flex items-center gap-2 border-b border-border px-3 py-3">
              <WorkspaceSwitcher compact={false} />
              <Dl.Close className="ml-auto rounded-md p-1.5 text-muted hover:bg-hover hover:text-fg">
                <X className="size-4" />
              </Dl.Close>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {sidebar ? (
                <div className="flex min-h-[40%] flex-col border-b border-border">{sidebar}</div>
              ) : null}
              <nav className={cn("flex flex-col gap-0.5 p-2", sidebar && "md:hidden")}>
                {[...sections, { key: "settings", to: "/settings", icon: Settings, label: "settings" as DictKey, match: (p: string) => p.startsWith("/settings"), modules: [] }].map((s) => {
                  const active = s.match(path);
                  return (
                    <Link key={s.key} to={s.to} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-muted transition hover:bg-hover hover:text-fg", active && "bg-fg/[.06] text-fg dark:bg-white/10")}>
                      <s.icon className="size-[18px]" strokeWidth={active ? 2.2 : 1.8} />
                      {t(s.label)}
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div className="flex items-center gap-2 border-t border-border p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              <Avatar name={user?.name ?? user?.email} src={user?.image} size={32} className="ring-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{user?.name}</div>
                <div className="truncate text-xs text-muted">{user?.email}</div>
              </div>
              <button type="button" onClick={() => setLocale(locale === "fr" ? "en" : "fr")} className="grid size-8 place-items-center rounded-lg text-[11px] font-semibold uppercase text-muted hover:bg-hover hover:text-fg" title={t("language")}>
                {locale}
              </button>
              <button type="button" onClick={() => setDark(!dark)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-fg" title={dark ? t("light") : t("dark")}>
                {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/login", search: {} });
                }}
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-fg"
                title={t("signOut")}
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </Dl.Content>
        </Dl.Portal>
      </Dl.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        {header && <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 md:px-6">
          {/* menu button: mobile always, tablet when a section sidebar exists */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-fg", sidebar ? "lg:hidden" : "hidden")}
            aria-label="Menu"
          >
            <MenuIcon className="size-[18px]" />
          </button>
          {sidebar && wide ? (
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="-ml-2 grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-fg"
              title={sidebarOpen ? tr({ fr: "Masquer le panneau", en: "Hide panel" }) : tr({ fr: "Afficher le panneau", en: "Show panel" })}
            >
              {sidebarOpen ? <PanelLeftClose className="size-[18px]" /> : <PanelLeftOpen className="size-[18px]" />}
            </button>
          ) : null}
          <div className="flex min-w-0 items-center gap-1.5 text-[14px]">
            {parent ? (
              <>
                <Link to={parent.to} className="truncate text-muted hover:text-fg max-sm:hidden">
                  {parent.label}
                </Link>
                <span className="text-subtle max-sm:hidden">/</span>
              </>
            ) : null}
            <span className={cn("truncate font-medium", tabs?.length && "max-sm:hidden")}>{title ?? (section ? t(section.key === "db" ? "database" : section.label) : "")}</span>
          </div>
          {tabs?.length ? <TabBar className="sm:ml-2" size="sm" items={tabs} /> : null}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {md ? actions : null}
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="flex h-8 w-60 items-center gap-2 rounded-lg border border-border px-2.5 text-[13px] text-subtle transition hover:text-muted max-md:w-8 max-md:px-2"
            >
              <Search className="size-4 shrink-0" />
              <span className="truncate max-md:hidden">{t("search")}</span>
              <span className="ml-auto flex gap-0.5 max-md:hidden">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>
          </div>
        </header>}
        {header && actions && !md ? <div className="no-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border px-3 py-2 [&>*]:shrink-0">{actions}</div> : null}
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
        {/* Mobile tab bar */}
        <nav className="flex shrink-0 items-stretch border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {TABS.filter((k) => sections.some((x) => x.key === k)).map((k) => {
            const s = SECTIONS.find((x) => x.key === k)!;
            const active = section?.key === k;
            return (
              <Link key={k} to={s.to} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium text-muted", active && "text-fg")}>
                <s.icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
                {t(s.label)}
              </Link>
            );
          })}
          <button type="button" onClick={() => setMenuOpen(true)} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium text-muted", !TABS.includes(section?.key ?? "") && "text-fg")}>
            <MenuIcon className="size-5" />
            {tr({ fr: "Plus", en: "More" })}
          </button>
        </nav>
      </div>
      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
    </ShellContext.Provider>
  );
}
