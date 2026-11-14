import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CalendarClock, CircleCheck, Clock, FileText, FolderKanban, Info, TrendingUp, UserRound, Users } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RTooltip, XAxis } from "recharts";
import { formatMoney, TABLES } from "@erp/shared";
import { AppShell } from "@/components/layout/app-shell";
import { api, type Row } from "@/lib/api";
import { fmtDate, useI18n } from "@/lib/i18n";
import { useList } from "@/lib/data";
import { useSession } from "@/lib/auth-client";
import { HEX } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Avatar, OptionBadge, Segmented, Skeleton, TableTile } from "@/components/ui/misc";
import { RelationChip } from "@/components/database/fields";
import type { FinanceSummary } from "./finance";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

function Ring({ value, total, color }: { value: number; total: number; color: string }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const pct = total ? value / total : 0;
  return (
    <svg viewBox="0 0 44 44" className="size-11 -rotate-90">
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--border)" strokeWidth="3.5" strokeDasharray="3 3.6" />
      <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
      <text x="22" y="22" dy="0.35em" textAnchor="middle" className="rotate-90 fill-fg text-[13px] font-semibold" style={{ transformOrigin: "22px 22px" }}>
        {value}
      </text>
    </svg>
  );
}

function StatCard({ label, value, delta, icon, tint, hint }: { label: string; value: string | number; delta?: string; icon: React.ReactNode; tint: string; hint?: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="pointer-events-none absolute -right-6 -top-6 size-36 rounded-full opacity-[.07]" style={{ background: tint }} />
      <div className="dot-grid pointer-events-none absolute right-0 top-0 h-full w-1/2 opacity-60 [mask-image:linear-gradient(to_left,black,transparent)]" />
      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-1.5 text-[13px] text-muted">
          {label}
          {hint && (
            <span title={hint}>
              <Info className="size-3.5 text-subtle" />
            </span>
          )}
        </div>
        <span className="grid size-8 place-items-center rounded-lg text-white" style={{ background: tint }}>
          {icon}
        </span>
      </div>
      <div className="relative mt-4 text-[34px] font-semibold leading-none tracking-tight tabular-nums">{value}</div>
      {delta && (
        <div className="relative mt-3 flex items-center gap-1.5 text-[13px] text-muted">
          <span className="grid size-5 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950">
            <ArrowUpRight className="size-3" />
          </span>
          <span className="font-medium text-emerald-600">{delta}</span>
        </div>
      )}
    </div>
  );
}

export function HomePage() {
  const { tr, locale, t } = useI18n();
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const email = session?.user.email?.toLowerCase();

  const { data: people } = useList("person", { filters: email ? [{ field: "email", op: "eq", value: email }] : [] }, Boolean(email));
  const me = people?.rows[0];
  const taskFilters = scope === "mine" && me ? [{ field: "assigneeId", op: "in", value: [me.id] }] : [];
  const { data: tasks, isLoading } = useList("task", { filters: taskFilters });
  const { data: projects } = useList("project", { filters: [{ field: "status", op: "in", value: ["in_progress", "planned", "maintenance"] }], sorts: [{ field: "dueDate", dir: "asc" }] });
  const { data: tickets } = useList("ticket", { filters: [{ field: "status", op: "not_in", value: ["resolved", "closed"] }] });
  const { data: fin } = useQuery({ queryKey: ["finance", "summary", new Date().getFullYear(), "all"], queryFn: () => api<FinanceSummary>(`/finance/summary?year=${new Date().getFullYear()}&entity=all`) });

  const taskDef = TABLES.task;
  const statusOptions = taskDef.fields.find((f) => f.key === "status")!.options!;
  const rows = tasks?.rows ?? [];
  const open = rows.filter((r) => !["done", "cancelled"].includes(String(r.status)));
  const createdThisWeek = rows.filter((r) => String(r.createdAt ?? "").slice(0, 10) >= daysAgo(7)).length;
  const doneThisWeek = rows.filter((r) => r.status === "done" && String(r.completedAt ?? r.updatedAt ?? "").slice(0, 10) >= daysAgo(7)).length;

  const upcoming = useMemo(() => open.filter((r) => r.dueDate).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))).slice(0, 7), [open]);

  const completion = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const d = daysAgo(13 - i);
      return {
        d,
        label: fmtDate(d, locale, { weekday: "short" }),
        done: rows.filter((r) => r.status === "done" && String(r.completedAt ?? String(r.updatedAt ?? "").slice(0, 10)) === d).length,
      };
    });
  }, [rows, locale]);

  const hour = new Date().getHours();
  const name = me?.firstName ?? session?.user.name?.split(" ")[0] ?? "";

  return (
    <AppShell title={tr({ fr: "Tableau de bord", en: "Dashboard" })}>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 pb-16 pt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[13px] capitalize text-muted">{fmtDate(today(), locale, { weekday: "long", day: "numeric", month: "long" })}</div>
              <h1 className="mt-1 text-[30px] font-semibold tracking-tight">
                {hour < 18 ? t("greetingMorning") : t("greetingEvening")}
                {name ? `, ${name}` : ""} <span className="font-serif text-[34px] font-normal italic text-muted">— {tr({ fr: "votre travail", en: "your work" })}</span>
              </h1>
            </div>
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: "mine", label: <span className="flex items-center gap-1.5"><UserRound className="size-3.5" />{tr({ fr: "Moi", en: "Me" })}</span> },
                { value: "all", label: <span className="flex items-center gap-1.5"><Users className="size-3.5" />{tr({ fr: "Équipe", en: "Team" })}</span> },
              ]}
            />
          </div>

          {/* Overview */}
          <h2 className="mb-3 mt-8 text-lg font-semibold">{tr({ fr: "Vue d'ensemble", en: "Overview" })}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label={tr({ fr: "Tâches ouvertes", en: "Open tasks" })} value={isLoading ? "…" : open.length} delta={`+${createdThisWeek} ${tr({ fr: "cette semaine", en: "this week" })}`} icon={<CircleCheck className="size-4" />} tint="#2563eb" />
            <StatCard label={tr({ fr: "Terminées (7 j)", en: "Done (7d)" })} value={doneThisWeek} icon={<TrendingUp className="size-4" />} tint="#10b981" />
            <StatCard label={tr({ fr: "Projets actifs", en: "Active projects" })} value={projects?.total ?? "…"} icon={<FolderKanban className="size-4" />} tint="#f97316" />
            <StatCard
              label={tr({ fr: "À encaisser", en: "Outstanding" })}
              value={fin ? formatMoney(fin.kpis.outstanding, "CAD", locale).replace(/\s?\$|CA\$/, " $") : "…"}
              hint={tr({ fr: "Consolidé en CAD", en: "Consolidated in CAD" })}
              icon={<FileText className="size-4" />}
              tint="#8b5cf6"
            />
          </div>

          {/* Workload */}
          <h2 className="mb-3 mt-10 text-lg font-semibold">{tr({ fr: "Charge de travail", en: "Workload" })}</h2>
          <div className="grid overflow-hidden rounded-2xl border border-border bg-surface shadow-card sm:grid-cols-2 lg:grid-cols-4">
            {statusOptions
              .filter((o) => o.value !== "cancelled" && o.value !== "done")
              .map((o, i) => {
                const items = rows.filter((r) => r.status === o.value);
                const nextDue = items.map((r) => r.dueDate as string | null).filter(Boolean).sort()[0];
                const assignees = [...new Set(items.map((r) => r.assigneeId as string | null).filter(Boolean))] as string[];
                return (
                  <Link key={o.value} to="/db/$table" params={{ table: "task" }} className={cn("flex items-center gap-3 p-5 transition hover:bg-hover", i > 0 && "border-l border-border max-sm:border-l-0 max-sm:border-t")}>
                    <Ring value={items.length} total={Math.max(rows.length, 1)} color={HEX[o.color]} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium">{tr(o.label)}</div>
                      <div className="text-xs text-muted">{nextDue ? `${tr({ fr: "Échéance", en: "Due" })} ${fmtDate(nextDue, locale, { day: "numeric", month: "short" })}` : "—"}</div>
                    </div>
                    <div className="flex -space-x-1.5">
                      {assignees.slice(0, 3).map((a) => (
                        <Avatar key={a} name={tasks?.refs.person?.[a]?.label} size={26} />
                      ))}
                    </div>
                  </Link>
                );
              })}
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-5">
            {/* Upcoming */}
            <section className="lg:col-span-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{tr({ fr: "Prochaines échéances", en: "Upcoming deadlines" })}</h2>
                <Link to="/db/$table" params={{ table: "task" }} className="text-[13px] text-muted hover:text-fg">
                  {tr({ fr: "Tout voir", en: "View all" })} →
                </Link>
              </div>
              <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
                {isLoading && <Skeleton className="m-4 h-32" />}
                {upcoming.map((r: Row) => {
                  const late = String(r.dueDate) < today();
                  return (
                    <button key={r.id} type="button" onClick={() => navigate({ to: "/db/$table", params: { table: "task" }, search: { record: r.id } as never })} className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-hover">
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl text-center text-[11px] font-semibold leading-tight", late ? "bg-rose-50 text-rose-600 dark:bg-rose-950" : "bg-surface-2 text-fg ring-1 ring-inset ring-border")}>
                        {fmtDate(r.dueDate, locale, { day: "numeric" })}
                        <br />
                        <span className="font-normal uppercase">{fmtDate(r.dueDate, locale, { month: "short" }).replace(".", "")}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{String(r.title)}</span>
                        <span className="mt-0.5 flex items-center gap-2">{r.projectId ? <RelationChip table="project" id={String(r.projectId)} refs={tasks!.refs} compact /> : null}</span>
                      </span>
                      <OptionBadge option={statusOptions.find((o) => o.value === r.status)} />
                    </button>
                  );
                })}
                {!isLoading && !upcoming.length && <div className="p-8 text-center text-[13px] text-subtle">{tr({ fr: "Rien d'urgent 🎉", en: "Nothing urgent 🎉" })}</div>}
              </div>
            </section>

            {/* Completion chart */}
            <section className="lg:col-span-2">
              <h2 className="mb-3 text-lg font-semibold">{tr({ fr: "Tâches terminées", en: "Tasks completed" })}</h2>
              <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-card">
                <div className="pointer-events-none absolute -bottom-16 -right-10 size-56 rounded-full bg-emerald-300/20 blur-3xl" />
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[15px] font-semibold">{tr({ fr: "14 derniers jours", en: "Last 14 days" })}</div>
                    <div className="text-xs text-muted">{tr({ fr: "Complétées par jour", en: "Completed per day" })}</div>
                  </div>
                  <span className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted ring-1 ring-inset ring-border">
                    <Clock className="size-3" /> 14 j
                  </span>
                </div>
                <div className="mt-4 h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={completion} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                      <defs>
                        <linearGradient id="g-done" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--subtle)" }} interval={1} />
                      <RTooltip cursor={{ stroke: "var(--border-strong)" }} contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12 }} />
                      <Area type="monotone" dataKey="done" stroke="#10b981" strokeWidth={2} fill="url(#g-done)" name={tr({ fr: "Terminées", en: "Done" })} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          </div>

          {/* Projects */}
          <div className="mb-3 mt-10 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{tr({ fr: "Projets en cours", en: "Active projects" })}</h2>
            <Link to="/db/$table" params={{ table: "project" }} className="text-[13px] text-muted hover:text-fg">
              {tr({ fr: "Timeline", en: "Timeline" })} →
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(projects?.rows ?? []).slice(0, 9).map((p) => (
              <button key={p.id} type="button" onClick={() => navigate({ to: "/db/$table/$id", params: { table: "project", id: p.id } })} className="rounded-2xl border border-border bg-surface p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-center gap-2">
                  <TableTile icon="FolderKanban" color="orange" size="sm" />
                  <span className="truncate text-[13px] font-semibold">{String(p.name)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                  {p.organizationId ? <RelationChip table="organization" id={String(p.organizationId)} refs={projects!.refs} compact /> : null}
                  {p.dueDate ? (
                    <span className="flex items-center gap-1">
                      <CalendarClock className="size-3" /> {fmtDate(p.dueDate, locale, { day: "numeric", month: "short" })}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${Number(p.progress ?? 0)}%` }} />
                </div>
                <div className="mt-1 text-right text-[11px] tabular-nums text-subtle">{Number(p.progress ?? 0)}%</div>
              </button>
            ))}
          </div>

          {tickets && tickets.total > 0 && (
            <div className="mt-10 rounded-2xl border border-border bg-surface p-5 shadow-card">
              <div className="flex items-center gap-3">
                <TableTile icon="LifeBuoy" color="red" />
                <div className="flex-1">
                  <div className="text-[15px] font-semibold">
                    {tickets.total} {tr({ fr: "tickets clients ouverts", en: "open client tickets" })}
                  </div>
                  <div className="text-xs text-muted">{tickets.rows.slice(0, 3).map((r) => String(r.title)).join(" · ")}</div>
                </div>
                <Link to="/db/$table" params={{ table: "ticket" }} className="rounded-lg px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset ring-border hover:bg-hover">
                  {t("open")}
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
