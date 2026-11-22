import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatMoney, TABLES } from "@erp/shared";
import { AppShell } from "@/components/layout/app-shell";
import { api, type Row } from "@/lib/api";
import { fmtDate, useI18n } from "@/lib/i18n";
import { useList } from "@/lib/data";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { OptionBadge, Segmented, Skeleton } from "@/components/ui/misc";
import { RelationChip } from "@/components/database/fields";
import type { FinanceSummary } from "./finance";
import { DigestCard } from "./automation";
import { useWorkspaces, type ModuleKey } from "@/lib/workspace";

const today = () => new Date().toISOString().slice(0, 10);

function Stat({ label, value, to, sub }: { label: string; value: string | number; to: string; sub?: string }) {
  return (
    <Link to={to} search={{}} className="block rounded-xl border border-border px-5 py-4 transition hover:border-border-strong">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1.5 text-[26px] font-semibold tabular-nums tracking-tight">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-subtle">{sub}</div> : null}
    </Link>
  );
}

/** Accueil sub-tabs: general dashboard + team calendar (when the module is on) */
export function homeTabs(tr: (x: { fr: string; en: string }) => string, active: "general" | "calendar", enabled: (m: ModuleKey) => boolean = () => true) {
  const tabs = [
    { key: "general", label: tr({ fr: "Général", en: "Overview" }), to: "/", active: active === "general" },
    ...(enabled("calendar") ? [{ key: "calendar", label: tr({ fr: "Calendrier", en: "Calendar" }), to: "/calendar", active: active === "calendar" }] : []),
  ];
  return tabs.length > 1 ? tabs : [];
}

export function HomePage() {
  const { tr, locale, t } = useI18n();
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const { enabled } = useWorkspaces();
  const email = session?.user.email?.toLowerCase();

  const { data: people } = useList("person", { filters: email ? [{ field: "email", op: "eq", value: email }] : [] }, Boolean(email));
  const me = people?.rows[0];
  const taskFilters = [
    { field: "status", op: "not_in", value: ["done", "cancelled"] },
    ...(scope === "mine" && me ? [{ field: "assigneeId", op: "in", value: [me.id] }] : []),
  ];
  const { data: tasks, isLoading } = useList("task", { filters: taskFilters, sorts: [{ field: "dueDate", dir: "asc" }] });
  const { data: projects } = useList("project", { filters: [{ field: "status", op: "in", value: ["in_progress", "planned", "maintenance"] }], sorts: [{ field: "dueDate", dir: "asc" }] });
  const { data: tickets } = useList("ticket", { filters: [{ field: "status", op: "not_in", value: ["resolved", "closed"] }] });
  const { data: fin } = useQuery({ queryKey: ["finance", "summary", new Date().getFullYear(), "all"], queryFn: () => api<FinanceSummary>(`/finance/summary?year=${new Date().getFullYear()}&entity=all`) });

  const statusOptions = TABLES.task.fields.find((f) => f.key === "status")!.options!;
  const open = tasks?.rows ?? [];
  const upcoming = useMemo(() => open.filter((r) => r.dueDate).slice(0, 8), [open]);
  const late = open.filter((r) => r.dueDate && String(r.dueDate) < today()).length;
  const name = me?.firstName ?? session?.user.name?.split(" ")[0] ?? "";
  const hour = new Date().getHours();

  return (
    <AppShell title={t("home")} tabs={homeTabs(tr, "general", enabled)}>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 pb-20 pt-6 md:px-8 md:pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[13px] capitalize text-muted">{fmtDate(today(), locale, { weekday: "long", day: "numeric", month: "long" })}</div>
              <h1 className="mt-1 text-[28px] font-semibold tracking-tight">
                {hour < 18 ? t("greetingMorning") : t("greetingEvening")}
                {name ? `, ${name}` : ""}
              </h1>
            </div>
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: "mine", label: tr({ fr: "Mes tâches", en: "My tasks" }) },
                { value: "all", label: tr({ fr: "Équipe", en: "Team" }) },
              ]}
            />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={tr({ fr: "Tâches ouvertes", en: "Open tasks" })} value={isLoading ? "…" : open.length} sub={late ? `${late} ${tr({ fr: "en retard", en: "late" })}` : undefined} to="/db/task" />
            <Stat label={tr({ fr: "Projets actifs", en: "Active projects" })} value={projects?.total ?? "…"} to="/db/project" />
            <Stat label={tr({ fr: "Tickets ouverts", en: "Open tickets" })} value={tickets?.total ?? "…"} to="/db/ticket" />
            <Stat label={t("outstanding")} value={fin ? formatMoney(fin.kpis.outstanding, fin.currency ?? "CAD", locale) : "…"} sub={tr({ fr: "Factures envoyées non payées", en: "Sent invoices not yet paid" })} to="/finance" />
          </div>

          <DigestCard />

          <div className="mt-12 grid gap-10 lg:grid-cols-2 [&>*]:min-w-0">
            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-[15px] font-semibold">{tr({ fr: "Prochaines échéances", en: "Upcoming deadlines" })}</h2>
                <Link to="/db/$table" params={{ table: "task" }} search={{}} className="text-[13px] text-muted hover:text-fg">
                  {tr({ fr: "Toutes les tâches", en: "All tasks" })}
                </Link>
              </div>
              <div className="divide-y divide-border border-y border-border">
                {isLoading && <Skeleton className="my-3 h-24" />}
                {upcoming.map((r: Row) => {
                  const isLate = String(r.dueDate) < today();
                  return (
                    <button key={r.id} type="button" onClick={() => navigate({ to: "/db/$table", params: { table: "task" }, search: { record: r.id } })} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-hover/60">
                      <span className={cn("w-14 shrink-0 text-[12px] tabular-nums", isLate ? "font-medium text-rose-600" : "text-muted")}>{fmtDate(r.dueDate, locale, { day: "numeric", month: "short" })}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">{String(r.title)}</span>
                        {r.projectId ? <span className="block truncate text-xs text-subtle">{tasks?.refs.project?.[String(r.projectId)]?.label}</span> : null}
                      </span>
                      <OptionBadge option={statusOptions.find((o) => o.value === r.status)} />
                    </button>
                  );
                })}
                {!isLoading && !upcoming.length && <div className="py-8 text-center text-[13px] text-subtle">{tr({ fr: "Aucune échéance à venir.", en: "Nothing due." })}</div>}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-[15px] font-semibold">{tr({ fr: "Projets en cours", en: "Active projects" })}</h2>
                <Link to="/db/$table" params={{ table: "project" }} search={{}} className="text-[13px] text-muted hover:text-fg">
                  {tr({ fr: "Tous les projets", en: "All projects" })}
                </Link>
              </div>
              <div className="divide-y divide-border border-y border-border">
                {(projects?.rows ?? []).slice(0, 8).map((p) => (
                  <button key={p.id} type="button" onClick={() => navigate({ to: "/db/$table/$id", params: { table: "project", id: p.id } })} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-hover/60">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{String(p.name)}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-subtle">
                        {p.organizationId ? <RelationChip table="organization" id={String(p.organizationId)} refs={projects!.refs} compact /> : null}
                        {p.dueDate ? fmtDate(p.dueDate, locale, { day: "numeric", month: "short" }) : null}
                      </span>
                    </span>
                    <span className="flex w-28 items-center gap-2">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full bg-fg/70" style={{ width: `${Number(p.progress ?? 0)}%` }} />
                      </span>
                      <span className="w-8 text-right text-[11px] tabular-nums text-subtle">{Number(p.progress ?? 0)}%</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
