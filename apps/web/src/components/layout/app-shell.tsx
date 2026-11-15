import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Briefcase, CalendarDays, Database, FileText, Globe, Home, Languages, LogOut, Moon, Search, Settings, Sun, Wallet } from "lucide-react";
import { useI18n, type DictKey } from "@/lib/i18n";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Avatar, Kbd } from "@/components/ui/misc";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { CommandMenu } from "./command-menu";
import { OtopioLogo } from "./logo";

type Section = { key: string; to: string; icon: typeof Home; label: DictKey; match: (p: string) => boolean };
const SECTIONS: Section[] = [
  { key: "home", to: "/", icon: Home, label: "home", match: (p) => p === "/" },
  { key: "clients", to: "/clients", icon: Briefcase, label: "clients", match: (p) => p.startsWith("/clients") },
  { key: "db", to: "/db", icon: Database, label: "databaseShort", match: (p) => p.startsWith("/db") },
  { key: "docs", to: "/documents", icon: FileText, label: "documents", match: (p) => p.startsWith("/documents") },
  { key: "calendar", to: "/calendar", icon: CalendarDays, label: "calendar", match: (p) => p.startsWith("/calendar") },
  { key: "finance", to: "/finance", icon: Wallet, label: "finance", match: (p) => p.startsWith("/finance") },
  { key: "website", to: "/website", icon: Globe, label: "website", match: (p) => p.startsWith("/website") },
];

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
 * Single navigation rail + content. `title` is a breadcrumb segment (string or node);
 * `parent` an optional link shown before it (e.g. "Base de données / Tâches").
 */
export function AppShell({ children, title, actions, parent }: { children: ReactNode; title?: ReactNode; actions?: ReactNode; parent?: { label: string; to: string } }) {
  const { t, locale, setLocale } = useI18n();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [cmdOpen, setCmdOpen] = useState(false);
  const { dark, setDark } = useTheme();
  const section = SECTIONS.find((s) => s.match(path));

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

  return (
    <div className="flex h-full bg-surface">
      <aside className="flex w-[84px] shrink-0 flex-col items-center gap-1 border-r border-border bg-surface-2/50 px-2 py-4">
        <Link to="/" className="mb-4 grid size-10 place-items-center rounded-xl bg-navy text-sky-brand transition hover:opacity-90" title="Otopio">
          <OtopioLogo className="size-6" />
        </Link>
        {SECTIONS.map((s) => (
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
          <div className="flex min-w-0 items-center gap-1.5 text-[14px]">
            {parent ? (
              <>
                <Link to={parent.to} className="truncate text-muted hover:text-fg">
                  {parent.label}
                </Link>
                <span className="text-subtle">/</span>
              </>
            ) : null}
            <span className="truncate font-medium">{title ?? (section ? t(section.key === "db" ? "database" : section.label) : "")}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {actions}
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
        </header>
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
