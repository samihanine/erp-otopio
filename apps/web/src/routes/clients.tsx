import { TabBar } from "@/components/ui/tab-bar";
import { createContext, useContext, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Download, ExternalLink, FolderOpen, Mail, Plus, RefreshCw, Search, Send, Sparkles, Trash2, Upload, Video, X } from "lucide-react";
import { formatMoney, TABLES, type SelectOption } from "@erp/shared";
import { AppShell } from "@/components/layout/app-shell";
import { Explorer } from "./files";
import { api, type Row } from "@/lib/api";
import { fmtDate, fmtRelative, useI18n } from "@/lib/i18n";
import { useCreateRecord } from "@/lib/data";
import { cn, faviconUrl, hostname } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, Icon, OptionBadge, Segmented, Skeleton, Spinner } from "@/components/ui/misc";
import { Input, inputClass, Textarea } from "@/components/ui/input";
import { Md } from "./automation";
import { FileIcon, filePreviewUrl } from "./drive-ui";

type ClientRow = Row & { name: string; status: string; website?: string; industry?: string; revenueCAD: number; outstandingCAD: number; activeProjects: number; lastContact: string | null; communications: number };

const statusOpt = (v: unknown) => TABLES.organization.fields.find((f) => f.key === "status")!.options!.find((o) => o.value === v);

export function ClientsPage() {
  const { tr, locale } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"active" | "all">("active");
  const { data = [], isLoading } = useQuery({ queryKey: ["clients"], queryFn: () => api<ClientRow[]>("/ws/clients") });
  const create = useCreateRecord("organization");
  const rows = data.filter((c) => (filter === "all" || c.status === "active") && c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <AppShell title={tr({ fr: "Clients", en: "Clients" })}>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-6 md:px-8 md:pt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight">{tr({ fr: "Clients", en: "Clients" })}</h1>
              <p className="text-[13px] text-muted">{tr({ fr: "Un tableau de bord par client, synchronisé avec son dossier Drive.", en: "One dashboard per client, synced with its Drive folder." })}</p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:flex-none">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr({ fr: "Rechercher…", en: "Search…" })} className="h-8 w-full rounded-lg border border-border pl-8 sm:w-56 pr-2 text-[13px] outline-none focus:ring-3 focus:ring-accent/15" />
              </div>
              <Segmented value={filter} onChange={setFilter} options={[{ value: "active", label: tr({ fr: "Actifs", en: "Active" }) }, { value: "all", label: tr({ fr: "Tous", en: "All" }) }]} />
              <Button
                variant="primary"
                onClick={async () => {
                  const r = await create.mutateAsync({ name: tr({ fr: "Nouveau client", en: "New client" }), type: "client", status: "active" });
                  navigate({ to: "/clients/$id", params: { id: r.row.id } });
                }}
              >
                <Plus /> {tr({ fr: "Nouveau client", en: "New client" })}
              </Button>
            </div>
          </div>
          <div className="mt-6 overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-[minmax(0,2fr)_110px_140px_140px_90px_140px] gap-3 border-b border-border bg-surface-2/60 px-4 py-2 text-xs font-medium text-muted max-lg:hidden">
              <span>{tr({ fr: "Client", en: "Client" })}</span>
              <span>{tr({ fr: "Statut", en: "Status" })}</span>
              <span className="text-right">{tr({ fr: "Facturé (CAD)", en: "Invoiced (CAD)" })}</span>
              <span className="text-right">{tr({ fr: "À encaisser", en: "Outstanding" })}</span>
              <span className="text-right">{tr({ fr: "Projets", en: "Projects" })}</span>
              <span className="text-right">{tr({ fr: "Dernier contact", en: "Last contact" })}</span>
            </div>
            {isLoading && <Skeleton className="m-4 h-40" />}
            {rows.map((c) => (
              <Link key={c.id} to="/clients/$id" params={{ id: c.id }} className="grid grid-cols-[minmax(0,2fr)_110px_140px_140px_90px_140px] items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-hover max-lg:grid-cols-2">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface">
                    {faviconUrl(c.website) ? <img src={faviconUrl(c.website)!} alt="" className="size-5" /> : <span className="text-xs font-semibold">{c.name[0]}</span>}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-subtle">{c.industry ?? hostname(c.website) ?? ""}</span>
                  </span>
                </span>
                <span>
                  <OptionBadge option={statusOpt(c.status)} />
                </span>
                <span className="text-right text-[13px] tabular-nums max-lg:hidden">{c.revenueCAD ? formatMoney(c.revenueCAD, "CAD", locale) : "—"}</span>
                <span className={cn("text-right text-[13px] tabular-nums max-lg:hidden", c.outstandingCAD > 0 && "font-medium text-amber-700 dark:text-amber-400")}>{c.outstandingCAD ? formatMoney(c.outstandingCAD, "CAD", locale) : "—"}</span>
                <span className="text-right text-[13px] tabular-nums max-lg:hidden">{c.activeProjects || "—"}</span>
                <span className="text-right text-xs text-muted max-lg:hidden">{c.lastContact ? fmtRelative(c.lastContact, locale) : "—"}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export type Overview = {
  org: Row & { name: string; website?: string; industry?: string; status: string; aiSummary?: string | null; aiSummaryAt?: string | null; notes?: string | null; email?: string | null };
  currency: string;
  kpis: { invoiced: number; collected: number; outstanding: number; quotesOpen: number; quotesAccepted: number; hoursSpent: number; hoursEstimated: number; meetingHours: number; openTasks: number; openTickets: number };
  people: Row[];
  projects: Row[];
  invoices: Row[];
  quotes: Row[];
  communications: Row[];
  tickets: Row[];
  tasks: Row[];
  documents: Row[];
  upcoming: Row[];
  driveUrl: string | null;
  uploads?: Row[];
  portal?: Row[];
};

export function ClientPage() {
  const { id } = useParams({ from: "/app/clients/$id" });
  const { tr } = useI18n();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["client", id], queryFn: () => api<Overview>(`/ws/clients/${id}`) });
  if (isLoading || !data)
    return (
      <AppShell title={tr({ fr: "Client", en: "Client" })} parent={{ label: tr({ fr: "Clients", en: "Clients" }), to: "/clients" }}>
        <Skeleton className="m-8 h-96" />
      </AppShell>
    );
  return (
    <AppShell
      title={data.org.name}
      parent={{ label: tr({ fr: "Clients", en: "Clients" }), to: "/clients" }}
      actions={
        <div className="flex gap-2">
          {data.driveUrl ? (
            <a href={data.driveUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium hover:bg-hover">
              <FolderOpen className="size-4" /> Drive
            </a>
          ) : (
            <Button
              size="md"
              onClick={async () => {
                await api(`/ws/clients/${id}/folder`, { method: "POST" });
                setTimeout(() => qc.invalidateQueries({ queryKey: ["client", id] }), 4000);
              }}
            >
              <FolderOpen /> {tr({ fr: "Créer le dossier Drive", en: "Create Drive folder" })}
            </Button>
          )}
          <Link to="/db/$table/$id" params={{ table: "organization", id }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium hover:bg-hover">
            {tr({ fr: "Fiche", en: "Record" })}
          </Link>
        </div>
      }
    >
      <div className="h-full overflow-y-auto">
        <ClientView data={data} id={id} mode="admin" />
      </div>
    </AppShell>
  );
}

/** "admin" = team view (links to records), "portal" = the client's own read-only view */
const ModeCtx = createContext<{ mode: "admin" | "portal"; orgId: string }>({ mode: "admin", orgId: "" });

/** Link to an ERP record in the team view, plain block in the portal. */
function RecLink({ table, id, className, children, title }: { table: string; id: string; className?: string; children: React.ReactNode; title?: string }) {
  const { mode } = useContext(ModeCtx);
  if (mode === "portal")
    return (
      <div className={className} title={title}>
        {children}
      </div>
    );
  return (
    <Link to="/db/$table/$id" params={{ table, id }} className={className} title={title}>
      {children}
    </Link>
  );
}

type Tab = "overview" | "ai" | "comms" | "money" | "work" | "people" | "files" | "uploads" | "portal";

export function ClientView({ data, id, mode }: { data: Overview; id: string; mode: "admin" | "portal" }) {
  const { tr, locale } = useI18n();
  const [commFilter, setCommFilter] = useState<"all" | "email" | "meeting">("all");
  const [tab, setTab] = useState<Tab>("overview");
  const money = (n: number) => formatMoney(n, data.currency ?? "CAD", locale);
  const comms = useMemo(() => (data.communications ?? []).filter((c) => commFilter === "all" || (commFilter === "email" ? c.type === "email" : c.type !== "email")), [data, commFilter]);
  const { org, kpis } = data;
  const invStatus = TABLES.transaction.fields.find((f) => f.key === "status")!.options!;
  const quoteStatus = TABLES.quote.fields.find((f) => f.key === "status")!.options!;
  const portal = mode === "portal";
  const toSort = (data.uploads ?? []).filter((u) => u.status === "to_sort").length;
  const tabs: [Tab, string, number | null][] = [
    ["overview", tr({ fr: "Aperçu", en: "Overview" }), null],
    ...(!portal ? ([["ai", tr({ fr: "Résumé IA", en: "AI summary" }), null]] as [Tab, string, null][]) : []),
    ...(!portal ? ([["comms", tr({ fr: "Échanges", en: "Communications" }), data.communications.length]] as [Tab, string, number][]) : []),
    ["money", tr({ fr: "Finance", en: "Finance" }), data.invoices.length + data.quotes.length],
    ["work", tr({ fr: "Projets & tâches", en: "Projects & tasks" }), data.projects.length + data.tasks.length],
    ["people", tr({ fr: "Contacts", en: "Contacts" }), data.people.length],
    ["files", tr({ fr: "Fichiers", en: "Files" }), data.documents.length],
    ["uploads", portal ? tr({ fr: "Déposer des fichiers", en: "Upload files" }) : tr({ fr: "Dépôts", en: "Uploads" }), portal ? null : toSort || null],
    ...(!portal ? ([["portal", tr({ fr: "Portail client", en: "Client portal" }), (data.portal ?? []).length || null]] as [Tab, string, number | null][]) : []),
  ];

  return (
    <ModeCtx.Provider value={{ mode, orgId: id }}>
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-6 md:px-8 md:pt-8">
        {/* Header */}
        <div className="flex items-start gap-4">
          <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface-2">
            {faviconUrl(org.website) ? <img src={faviconUrl(org.website)!} alt="" className="size-8" /> : <span className="text-xl font-semibold">{org.name[0]}</span>}
          </span>
          <div className="min-w-0">
            <h1 className="text-[28px] font-semibold tracking-tight">{org.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
              {!portal && <OptionBadge option={statusOpt(org.status)} />}
              {org.industry && <span>{org.industry}</span>}
              {org.website && (
                <a href={String(org.website).startsWith("http") ? String(org.website) : `https://${org.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg">
                  {hostname(org.website)} <ExternalLink className="size-3" />
                </a>
              )}
              {!portal && Array.isArray(org.alsoIn) && org.alsoIn.length ? (
                <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px]" title={tr({ fr: "Ce client a aussi une fiche dans un autre espace de travail", en: "This client also has a record in another workspace" })}>
                  {tr({ fr: "Aussi chez", en: "Also with" })} {(org.alsoIn as string[]).join(", ")}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-b border-border pb-5">
          {[
            { l: tr({ fr: "Facturé HT", en: "Invoiced" }), v: money(kpis.invoiced) },
            { l: tr({ fr: "Payé", en: "Paid" }), v: money(kpis.collected) },
            { l: portal ? tr({ fr: "Reste à payer", en: "Balance due" }) : tr({ fr: "À encaisser", en: "Outstanding" }), v: money(kpis.outstanding), warn: kpis.outstanding > 0 },
            { l: tr({ fr: "Devis en attente", en: "Open quotes" }), v: money(kpis.quotesOpen) },
            ...(!portal
              ? [
                  { l: tr({ fr: "Heures (tâches)", en: "Hours (tasks)" }), v: `${kpis.hoursSpent} / ${kpis.hoursEstimated || "—"} h` },
                  { l: tr({ fr: "Réunions", en: "Meetings" }), v: `${kpis.meetingHours} h` },
                ]
              : [{ l: tr({ fr: "Tâches en cours", en: "Open tasks" }), v: String(kpis.openTasks) }]),
          ].map((k) => (
            <div key={k.l}>
              <div className="text-[11px] uppercase tracking-wider text-subtle">{k.l}</div>
              <div className={cn("text-[17px] font-semibold tabular-nums tracking-tight", "warn" in k && k.warn && "text-amber-700 dark:text-amber-400")}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <TabBar className="mt-5" items={tabs.map(([k, label, n]) => ({ key: k, label, count: n, active: tab === k, onClick: () => setTab(k), highlight: k === "uploads", icon: k === "uploads" ? <Upload className="size-3.5" /> : k === "ai" ? <Sparkles className="size-3.5 text-violet-500" /> : undefined }))} />

        <div className="pt-6">
          {tab === "overview" && (
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 space-y-8">
                {!portal ? (
                  <>
                    <Block title={tr({ fr: "Derniers échanges", en: "Latest exchanges" })} more={data.communications.length > 5 ? () => setTab("comms") : undefined}>
                      {data.communications.slice(0, 5).map((c) => (
                        <CommRow key={c.id} c={c} />
                      ))}
                      {!data.communications.length && <Empty>{tr({ fr: "Aucun échange.", en: "No exchanges." })}</Empty>}
                    </Block>
                  </>
                ) : (
                  <>
                    <Block title={tr({ fr: "Projets", en: "Projects" })} more={() => setTab("work")}>
                      {data.projects.map((p) => (
                        <ProjectRow key={p.id} p={p} />
                      ))}
                      {!data.projects.length && <Empty>—</Empty>}
                    </Block>
                    <Block title={tr({ fr: "Derniers documents", en: "Latest documents" })} more={() => setTab("money")}>
                      <MoneyList data={data} limit={5} invStatus={invStatus} quoteStatus={quoteStatus} />
                    </Block>
                  </>
                )}
              </div>
              <div className="space-y-8">
                <Block title={tr({ fr: "À venir", en: "Upcoming" })}>
                  {data.upcoming.map((e) => (
                    <a key={e.id} href={String(e.meetUrl ?? e.htmlLink ?? "#")} target="_blank" rel="noreferrer" className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-hover">
                      <CalendarClock className="size-4 shrink-0 text-subtle" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">{String(e.title)}</span>
                        <span className="text-xs text-subtle">{fmtDate(e.startAt, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      </span>
                    </a>
                  ))}
                  {!data.upcoming.length && <Empty>{tr({ fr: "Aucun rendez-vous prévu.", en: "Nothing scheduled." })}</Empty>}
                </Block>
                {!portal && (
                  <Block title={tr({ fr: "Projets", en: "Projects" })} more={() => setTab("work")}>
                    {data.projects.map((p) => (
                      <ProjectRow key={p.id} p={p} />
                    ))}
                    {!data.projects.length && <Empty>—</Empty>}
                  </Block>
                )}
                <Block title={tr({ fr: "Contacts", en: "Contacts" })} more={() => setTab("people")}>
                  <div className="flex flex-wrap gap-1.5">
                    {data.people.slice(0, 8).map((p) => (
                      <RecLink key={p.id} table="person" id={p.id} title={`${p.firstName} ${p.lastName ?? ""}`}>
                        <Avatar name={`${p.firstName} ${p.lastName ?? ""}`} size={30} className="ring-2 ring-surface" />
                      </RecLink>
                    ))}
                    {!data.people.length && <Empty>—</Empty>}
                  </div>
                </Block>
              </div>
            </div>
          )}

          {tab === "ai" && !portal && (
            <div className="max-w-3xl border-l-2 border-violet-400/70 pl-4">
              <div className="mb-1.5 flex items-center gap-2 text-[12px] font-medium uppercase tracking-wider text-subtle">
                <Sparkles className="size-3.5 text-violet-500" /> {tr({ fr: "Point de situation", en: "Status" })}
                {org.aiSummaryAt && <span className="normal-case tracking-normal">· {fmtRelative(org.aiSummaryAt, locale)}</span>}
              </div>
              {org.aiSummary ? <Md text={String(org.aiSummary)} /> : <div className="text-[13px] text-subtle">{tr({ fr: "Résumé généré à la prochaine synchronisation.", en: "Summary generated at next sync." })}</div>}
            </div>
          )}

          {tab === "comms" && !portal && (
            <div>
              <div className="mb-3 flex justify-end">
                <Segmented value={commFilter} onChange={setCommFilter} options={[{ value: "all", label: tr({ fr: "Tout", en: "All" }) }, { value: "email", label: "Mails" }, { value: "meeting", label: tr({ fr: "Réunions", en: "Meetings" }) }]} />
              </div>
              {comms.map((c) => (
                <CommRow key={c.id} c={c} />
              ))}
              {!comms.length && <Empty>{tr({ fr: "Aucun échange.", en: "No exchanges." })}</Empty>}
            </div>
          )}

          {tab === "money" && <MoneyList data={data} invStatus={invStatus} quoteStatus={quoteStatus} />}

          {tab === "work" && (
            <div className="grid gap-10 lg:grid-cols-2">
              <Block title={tr({ fr: "Projets", en: "Projects" })}>
                {data.projects.map((p) => (
                  <ProjectRow key={p.id} p={p} />
                ))}
                {!data.projects.length && <Empty>—</Empty>}
              </Block>
              <Block title={tr({ fr: "Tâches ouvertes", en: "Open tasks" })}>
                {data.tasks.map((t) => (
                  <RecLink key={t.id} table="task" id={t.id} className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-hover">
                    <span className="size-1.5 shrink-0 rounded-full bg-border-strong" />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{String(t.title)}</span>
                    {t.dueDate ? <span className="text-xs text-subtle">{fmtDate(t.dueDate, locale, { day: "numeric", month: "short" })}</span> : null}
                  </RecLink>
                ))}
                {!data.tasks.length && <Empty>{tr({ fr: "Aucune tâche ouverte.", en: "No open tasks." })}</Empty>}
              </Block>
            </div>
          )}

          {tab === "people" && (
            <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {data.people.map((p) => (
                <RecLink key={p.id} table="person" id={p.id} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-hover">
                  <Avatar name={`${p.firstName} ${p.lastName ?? ""}`} size={32} className="ring-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">
                      {String(p.firstName)} {String(p.lastName ?? "")}
                    </span>
                    <span className="block truncate text-xs text-subtle">{[p.jobTitle, p.email].filter(Boolean).join(" · ")}</span>
                  </span>
                </RecLink>
              ))}
              {!data.people.length && <Empty>—</Empty>}
            </div>
          )}

          {tab === "files" &&
            (portal ? (
              <PortalFiles docs={data.documents} orgId={id} />
            ) : data.org.driveFolderId ? (
              <div className="-mx-4 flex h-[70vh] min-h-[420px] flex-col overflow-hidden rounded-xl border border-border md:mx-0">
                <Explorer root={{ id: String(data.org.driveFolderId), name: String(data.org.name), path: String(data.org.name) }} />
              </div>
            ) : (
              <Empty>{tr({ fr: "Aucun dossier Drive lié à ce client.", en: "No Drive folder linked to this client." })}</Empty>
            ))}

          {tab === "uploads" && <Uploads data={data} orgId={id} portal={portal} />}
          {tab === "portal" && !portal && <PortalAccess data={data} orgId={id} />}
        </div>
      </div>
    </ModeCtx.Provider>
  );
}

function MoneyList({ data, limit, invStatus, quoteStatus }: { data: Overview; limit?: number; invStatus: SelectOption[]; quoteStatus: SelectOption[] }) {
  const { tr, locale } = useI18n();
  const { mode, orgId } = useContext(ModeCtx);
  const rows = ([...data.invoices.map((i) => ({ ...i, _k: "invoice" as const })), ...data.quotes.map((q) => ({ ...q, _k: "quote" as const }))] as (Row & { _k: "invoice" | "quote" })[]).sort((a, b) =>
    String(b.issueDate ?? "").localeCompare(String(a.issueDate ?? "")),
  );
  const body = (d: Row & { _k: "invoice" | "quote" }) => (
    <>
      <span className="w-14 shrink-0 text-[11px] font-medium uppercase text-subtle">{d._k === "invoice" ? tr({ fr: "Facture", en: "Invoice" }) : tr({ fr: "Devis", en: "Quote" })}</span>
      <span className="w-24 shrink-0 text-xs text-subtle max-sm:hidden">{fmtDate(d.issueDate, locale)}</span>
      <span className="min-w-0 flex-1 truncate text-[13px]">
        <span className="font-mono text-xs text-muted">{String(d.number)}</span> {String(d.title ?? "")}
      </span>
      <span className="text-[13px] tabular-nums">{formatMoney(Number(d.total), String(d.currency), locale)}</span>
      <OptionBadge option={(d._k === "invoice" ? invStatus : quoteStatus).find((o) => o.value === d.status)} />
    </>
  );
  return (
    <div>
      {rows.slice(0, limit ?? rows.length).map((d) =>
        mode === "portal" ? (
          <a key={d.id} href={`/api/portal/clients/${orgId}/${d._k}/${d.id}/html`} target="_blank" rel="noreferrer" className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-hover">
            {body(d)}
          </a>
        ) : (
          <Link key={d.id} to="/documents/$kind/$id" params={{ kind: d._k, id: d.id }} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-hover">
            {body(d)}
          </Link>
        ),
      )}
      {!rows.length && <Empty>{tr({ fr: "Aucune facture ni devis.", en: "No invoices or quotes." })}</Empty>}
    </div>
  );
}

function PortalFiles({ docs, orgId }: { docs: Row[]; orgId: string }) {
  const { tr, locale } = useI18n();
  const [q, setQ] = useState("");
  const rows = docs.filter((d) => String(d.title).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="relative mb-3 max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr({ fr: "Rechercher un fichier…", en: "Search files…" })} className="h-8 w-full rounded-lg border border-border pl-8 pr-2 text-[13px] outline-none focus:ring-3 focus:ring-accent/15" />
      </div>
      {rows.map((d) => (
        <a key={d.id} href={`/api/portal/clients/${orgId}/files/${d.driveFileId}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-hover">
          <FileIcon mime={String(d.mimeType ?? "")} />
          <span className="min-w-0 flex-1 truncate text-[13px]">{String(d.title)}</span>
          <span className="shrink-0 text-xs text-subtle">{fmtDate(d.modifiedAt ?? d.createdAt, locale, { day: "numeric", month: "short", year: "2-digit" })}</span>
          <Download className="size-3.5 shrink-0 text-subtle" />
        </a>
      ))}
      {!rows.length && <Empty>{tr({ fr: "Aucun fichier partagé pour le moment.", en: "No shared files yet." })}</Empty>}
    </div>
  );
}

export const UPLOAD_CATEGORIES = [
  { value: "invoice", label: { fr: "Facture", en: "Invoice" } },
  { value: "quote", label: { fr: "Devis", en: "Quote" } },
  { value: "expense", label: { fr: "Dépense / reçu", en: "Expense / receipt" } },
  { value: "legal", label: { fr: "Juridique (contrat, NDA…)", en: "Legal (contract, NDA…)" } },
  { value: "deliverable", label: { fr: "Contenu / livrable", en: "Content / deliverable" } },
  { value: "other", label: { fr: "Autre", en: "Other" } },
] as const;

function Uploads({ data, orgId, portal }: { data: Overview; orgId: string; portal: boolean }) {
  const { tr, locale } = useI18n();
  const qc = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<string>("other");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: portal ? ["portal-client", orgId] : ["client", orgId] });
  const submit = async () => {
    if (!files.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      fd.set("category", category);
      fd.set("name", name);
      fd.set("description", description);
      await api(portal ? `/portal/clients/${orgId}/upload` : `/ws/clients/${orgId}/upload`, { method: "POST", body: fd });
      toast.success(tr({ fr: `${files.length} fichier(s) déposé(s)`, en: `${files.length} file(s) uploaded` }));
      setFiles([]);
      setName("");
      setDescription("");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const catLabel = (v: unknown) => UPLOAD_CATEGORIES.find((c) => c.value === v)?.label[locale] ?? String(v ?? "");
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <section className="space-y-3">
        <h2 className="text-[12px] font-medium uppercase tracking-wider text-subtle">{tr({ fr: "Nouveau dépôt", en: "New upload" })}</h2>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            setFiles((f) => [...f, ...Array.from(e.dataTransfer.files)]);
          }}
          className={cn("flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-border-strong px-4 py-8 text-center transition hover:bg-hover", drag && "border-accent bg-accent/5")}
        >
          <Upload className="size-5 text-muted" />
          <span className="text-[13px] font-medium">{tr({ fr: "Glisser des fichiers ici ou cliquer", en: "Drop files here or click" })}</span>
          <span className="text-xs text-subtle">{tr({ fr: "Plusieurs fichiers possibles · 50 Mo max par fichier", en: "Several files allowed · 50 MB max each" })}</span>
        </button>
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files ?? [])])} />
        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px]">
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-subtle">{(f.size / 1024 / 1024).toFixed(1)} Mo</span>
                <button type="button" onClick={() => setFiles((xs) => xs.filter((_, j) => j !== i))} className="text-muted hover:text-fg">
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{tr({ fr: "Catégorie", en: "Category" })}</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
            {UPLOAD_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label[locale]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{tr({ fr: "Nom", en: "Name" })}</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr({ fr: "ex. Facture fournisseur mars", en: "e.g. March supplier invoice" })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{tr({ fr: "Description", en: "Description" })}</span>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={tr({ fr: "Contexte, ce qu'il faut en faire…", en: "Context, what to do with it…" })} />
        </label>
        <Button variant="primary" className="w-full" disabled={!files.length || busy} onClick={submit}>
          {busy ? <Spinner /> : <Upload />} {tr({ fr: "Déposer", en: "Upload" })}
        </Button>
      </section>
      <section>
        <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-subtle">{portal ? tr({ fr: "Mes dépôts", en: "My uploads" }) : tr({ fr: "Fichiers déposés", en: "Uploaded files" })}</h2>
        {(data.uploads ?? []).map((u) => (
          <UploadRow key={u.id} u={u} portal={portal} orgId={orgId} catLabel={catLabel} onDone={refresh} />
        ))}
        {!(data.uploads ?? []).length && <Empty>{tr({ fr: "Aucun fichier déposé.", en: "No uploads yet." })}</Empty>}
      </section>
    </div>
  );
}

function UploadRow({ u, portal, orgId, catLabel, onDone }: { u: Row; portal: boolean; orgId: string; catLabel: (v: unknown) => string; onDone: () => void }) {
  const { tr, locale } = useI18n();
  const [cat, setCat] = useState(String(u.category ?? "other"));
  const [busy, setBusy] = useState(false);
  const pending = u.status === "to_sort";
  return (
    <div className="-mx-2 flex flex-wrap items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-hover">
      <FileIcon mime={String(u.mimeType ?? "")} />
      <div className="min-w-0 flex-1">
        <a href={portal ? `/api/portal/clients/${orgId}/files/${u.driveFileId}` : String(u.webViewLink ?? "#")} target="_blank" rel="noreferrer" className="block truncate text-[13px] font-medium hover:underline">
          {String(u.title)}
        </a>
        <div className="text-xs text-subtle">
          {catLabel(u.category)} · {fmtDate(u.createdAt, locale, { day: "numeric", month: "short", year: "2-digit" })}
          {!portal && u.uploadedBy ? ` · ${String(u.uploadedBy)}` : ""}
        </div>
        {u.description ? <div className="mt-1 text-xs leading-relaxed text-muted">{String(u.description)}</div> : null}
      </div>
      <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium", pending ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300")}>
        {pending ? tr({ fr: "À trier", en: "To sort" }) : tr({ fr: "Classé", en: "Filed" })}
      </span>
      {!portal && pending && (
        <span className="flex shrink-0 items-center gap-1.5">
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs">
            {UPLOAD_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label[locale]}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/ws/uploads/${u.id}/sort`, { method: "POST", json: { category: cat } });
                toast.success(tr({ fr: "Fichier classé", en: "File filed" }));
                onDone();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr({ fr: "Classer", en: "File" })}
          </Button>
        </span>
      )}
    </div>
  );
}

function PortalAccess({ data, orgId }: { data: Overview; orgId: string }) {
  const { tr, locale } = useI18n();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["client", orgId] });
  const suggestions = data.people.map((p) => String(p.email ?? "")).filter((e) => e && !(data.portal ?? []).some((a) => a.email === e.toLowerCase()));
  const invite = async (address: string) => {
    setBusy(true);
    try {
      const r = await api<{ sent: boolean }>(`/ws/clients/${orgId}/portal`, { method: "POST", json: { email: address } });
      toast.success(r.sent ? tr({ fr: "Invitation envoyée", en: "Invitation sent" }) : tr({ fr: "Accès ajouté (courriel non envoyé)", en: "Access added (email not sent)" }));
      setEmail("");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-[13px] leading-relaxed text-muted">
        {tr({
          fr: "Les adresses ci-dessous peuvent ouvrir l'espace client (lecture seule : projets, devis, factures, fichiers) et y déposer des fichiers. Connexion par lien magique envoyé par courriel ou avec Google, sur la page /portail.",
          en: "These addresses can open the client portal (read-only: projects, quotes, invoices, files) and upload files. Sign-in with an emailed magic link or Google, at /portail.",
        })}
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (email) invite(email);
        }}
      >
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@entreprise.com" list="portal-suggestions" />
        <datalist id="portal-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <Button variant="primary" disabled={busy || !email}>
          <Send /> {tr({ fr: "Inviter", en: "Invite" })}
        </Button>
      </form>
      <div>
        {(data.portal ?? []).map((a) => (
          <div key={a.id} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-hover">
            <Avatar name={String(a.email)} size={28} className="ring-0" />
            <div className="min-w-0 flex-1">
              <div className={cn("truncate text-[13px] font-medium", !a.active && "text-subtle line-through")}>{String(a.email)}</div>
              <div className="text-xs text-subtle">
                {a.lastLoginAt ? `${tr({ fr: "Dernière connexion", en: "Last sign-in" })} ${fmtRelative(a.lastLoginAt, locale)}` : a.invitedAt ? `${tr({ fr: "Invité", en: "Invited" })} ${fmtRelative(a.invitedAt, locale)}` : tr({ fr: "Pas encore invité", en: "Not invited yet" })}
              </div>
            </div>
            <Button
              size="sm"
              onClick={async () => {
                const r = await api<{ sent: boolean }>(`/ws/clients/${orgId}/portal/${a.id}/resend`, { method: "POST" });
                toast.success(r.sent ? tr({ fr: "Invitation renvoyée", en: "Invitation resent" }) : tr({ fr: "Envoi impossible", en: "Could not send" }));
                refresh();
              }}
            >
              <Mail /> {tr({ fr: "Renvoyer", en: "Resend" })}
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await api(`/ws/clients/${orgId}/portal/${a.id}`, { method: "PATCH", json: { active: !a.active } });
                refresh();
              }}
            >
              {a.active ? tr({ fr: "Suspendre", en: "Suspend" }) : tr({ fr: "Réactiver", en: "Reactivate" })}
            </Button>
            <button
              type="button"
              title={tr({ fr: "Retirer l'accès", en: "Remove access" })}
              className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-rose-600"
              onClick={async () => {
                await api(`/ws/clients/${orgId}/portal/${a.id}`, { method: "DELETE" });
                refresh();
              }}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        {!(data.portal ?? []).length && <Empty>{tr({ fr: "Aucun accès au portail pour ce client.", en: "No portal access for this client." })}</Empty>}
      </div>
    </div>
  );
}

function Block({ title, children, more }: { title: string; children: React.ReactNode; more?: () => void }) {
  const { tr } = useI18n();
  return (
    <section>
      <div className="mb-2 flex items-center">
        <h2 className="text-[12px] font-medium uppercase tracking-wider text-subtle">{title}</h2>
        {more && (
          <button type="button" onClick={more} className="ml-auto text-xs text-muted hover:text-fg">
            {tr({ fr: "Tout voir →", en: "See all →" })}
          </button>
        )}
      </div>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <div className="py-2 text-[13px] text-subtle">{children}</div>;

function CommRow({ c }: { c: Row }) {
  const { locale } = useI18n();
  const commType = TABLES.communication.fields.find((f) => f.key === "type")!.options!;
  const opt = commType.find((o) => o.value === c.type);
  return (
    <RecLink table="communication" id={c.id} className="-mx-2 flex gap-3 rounded-lg px-2 py-2.5 hover:bg-hover">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">{c.type === "email" ? <Mail className="size-3.5" /> : <Video className="size-3.5" />}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-medium">{String(c.subject)}</span>
          <span className="shrink-0 text-[11px] text-subtle">{opt ? opt.label[locale] : ""}</span>
          <span className="ml-auto shrink-0 text-xs text-subtle">{fmtDate(c.occurredAt, locale, { day: "numeric", month: "short", year: "2-digit" })}</span>
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted">{decodeEntities(String(c.aiSummary || c.summary || "").replace(/\*\*/g, ""))}</span>
      </span>
    </RecLink>
  );
}

function ProjectRow({ p }: { p: Row }) {
  const { tr, locale } = useI18n();
  const projStatus = TABLES.project.fields.find((f) => f.key === "status")!.options!;
  return (
    <RecLink table="project" id={p.id} className="-mx-2 block rounded-lg px-2 py-2 hover:bg-hover">
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{String(p.name)}</span>
        <OptionBadge option={projStatus.find((o) => o.value === p.status)} />
      </span>
      <span className="mt-1.5 flex items-center gap-2">
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
          <span className="block h-full rounded-full bg-fg/70" style={{ width: `${Number(p.progress ?? 0)}%` }} />
        </span>
        <span className="text-[11px] tabular-nums text-subtle">{Number(p.progress ?? 0)}%</span>
        {p.dueDate ? <span className="text-[11px] text-subtle">· {tr({ fr: "éch.", en: "due" })} {fmtDate(p.dueDate, locale, { day: "numeric", month: "short" })}</span> : null}
      </span>
    </RecLink>
  );
}

/** "&#39;" / "&lt;" etc. left in imported email snippets */
function decodeEntities(s: string) {
  return s.replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n))).replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export function PreviewOverlay({ doc, onClose }: { doc: Row; onClose: () => void }) {
  const url = filePreviewUrl(doc);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50 p-4 backdrop-blur-[2px] animate-fade" onClick={onClose}>
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-surface shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <FileIcon mime={String(doc.mimeType ?? "")} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{String(doc.title)}</span>
          {doc.webViewLink ? (
            <a href={String(doc.webViewLink)} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-hover">
              <ExternalLink className="size-3.5" /> Drive
            </a>
          ) : null}
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-hover">
            ✕
          </button>
        </div>
        {url ? <iframe title="preview" src={url} className="min-h-0 flex-1 bg-white" allow="autoplay" /> : <div className="grid flex-1 place-items-center text-sm text-muted">Aperçu indisponible</div>}
      </div>
    </div>
  );
}

export { Icon, RefreshCw };
