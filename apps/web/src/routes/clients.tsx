import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ExternalLink, FolderOpen, Mail, Plus, RefreshCw, Search, Sparkles, Video } from "lucide-react";
import { formatMoney, TABLES } from "@erp/shared";
import { AppShell } from "@/components/layout/app-shell";
import { api, type Row } from "@/lib/api";
import { fmtDate, fmtRelative, useI18n } from "@/lib/i18n";
import { useCreateRecord } from "@/lib/data";
import { cn, faviconUrl, hostname } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, Icon, OptionBadge, Segmented, Skeleton } from "@/components/ui/misc";
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
        <div className="mx-auto max-w-6xl px-8 pb-20 pt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight">{tr({ fr: "Clients", en: "Clients" })}</h1>
              <p className="text-[13px] text-muted">{tr({ fr: "Un tableau de bord par client, synchronisé avec son dossier Drive.", en: "One dashboard per client, synced with its Drive folder." })}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr({ fr: "Rechercher…", en: "Search…" })} className="h-8 w-56 rounded-lg border border-border pl-8 pr-2 text-[13px] outline-none focus:ring-3 focus:ring-accent/15" />
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

type Overview = {
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
};

export function ClientPage() {
  const { id } = useParams({ from: "/app/clients/$id" });
  const { tr, locale } = useI18n();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["client", id], queryFn: () => api<Overview>(`/ws/clients/${id}`) });
  const [preview, setPreview] = useState<Row | null>(null);
  const [commFilter, setCommFilter] = useState<"all" | "email" | "meeting">("all");
  const [tab, setTab] = useState<"overview" | "comms" | "money" | "work" | "people" | "files">("overview");
  const money = (n: number) => formatMoney(n, data?.currency ?? "CAD", locale);
  const comms = useMemo(
    () => (data?.communications ?? []).filter((c) => commFilter === "all" || (commFilter === "email" ? c.type === "email" : c.type !== "email")),
    [data, commFilter],
  );
  if (isLoading || !data)
    return (
      <AppShell title={tr({ fr: "Client", en: "Client" })} parent={{ label: tr({ fr: "Clients", en: "Clients" }), to: "/clients" }}>
        <Skeleton className="m-8 h-96" />
      </AppShell>
    );
  const { org, kpis } = data;
  const projStatus = TABLES.project.fields.find((f) => f.key === "status")!.options!;
  const invStatus = TABLES.invoice.fields.find((f) => f.key === "status")!.options!;
  const quoteStatus = TABLES.quote.fields.find((f) => f.key === "status")!.options!;
  const commType = TABLES.communication.fields.find((f) => f.key === "type")!.options!;

  return (
    <AppShell
      title={org.name}
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
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-6 md:px-8 md:pt-8">
          {/* Header */}
          <div className="flex items-start gap-4">
            <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface-2">
              {faviconUrl(org.website) ? <img src={faviconUrl(org.website)!} alt="" className="size-8" /> : <span className="text-xl font-semibold">{org.name[0]}</span>}
            </span>
            <div className="min-w-0">
              <h1 className="text-[28px] font-semibold tracking-tight">{org.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                <OptionBadge option={statusOpt(org.status)} />
                {org.industry && <span>{org.industry}</span>}
                {org.website && (
                  <a href={String(org.website).startsWith("http") ? String(org.website) : `https://${org.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg">
                    {hostname(org.website)} <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* KPI strip (no boxes) */}
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-b border-border pb-5">
            {[
              { l: tr({ fr: "Facturé HT", en: "Invoiced" }), v: money(kpis.invoiced) },
              { l: tr({ fr: "Encaissé", en: "Collected" }), v: money(kpis.collected) },
              { l: tr({ fr: "À encaisser", en: "Outstanding" }), v: money(kpis.outstanding), warn: kpis.outstanding > 0 },
              { l: tr({ fr: "Devis en attente", en: "Open quotes" }), v: money(kpis.quotesOpen) },
              { l: tr({ fr: "Heures (tâches)", en: "Hours (tasks)" }), v: `${kpis.hoursSpent} / ${kpis.hoursEstimated || "—"} h` },
              { l: tr({ fr: "Réunions", en: "Meetings" }), v: `${kpis.meetingHours} h` },
            ].map((k) => (
              <div key={k.l}>
                <div className="text-[11px] uppercase tracking-wider text-subtle">{k.l}</div>
                <div className={cn("text-[17px] font-semibold tabular-nums tracking-tight", k.warn && "text-amber-700 dark:text-amber-400")}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="no-scrollbar -mx-1 mt-1 flex gap-1 overflow-x-auto border-b border-border">
            {(
              [
                ["overview", tr({ fr: "Aperçu", en: "Overview" }), null],
                ["comms", tr({ fr: "Échanges", en: "Communications" }), data.communications.length],
                ["money", tr({ fr: "Finance", en: "Finance" }), data.invoices.length + data.quotes.length],
                ["work", tr({ fr: "Projets & tâches", en: "Projects & tasks" }), data.projects.length + data.tasks.length],
                ["people", tr({ fr: "Contacts", en: "Contacts" }), data.people.length],
                ["files", tr({ fr: "Fichiers", en: "Files" }), data.documents.length],
              ] as const
            ).map(([k, label, n]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-[13px] font-medium", tab === k ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg")}
              >
                {label}
                {n ? <span className="rounded-full bg-surface-2 px-1.5 text-[11px] tabular-nums text-muted">{n}</span> : null}
              </button>
            ))}
          </div>

          <div className="pt-6">
            {tab === "overview" && (
              <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0 space-y-8">
                  <div className="border-l-2 border-violet-400/70 pl-4">
                    <div className="mb-1.5 flex items-center gap-2 text-[12px] font-medium uppercase tracking-wider text-subtle">
                      <Sparkles className="size-3.5 text-violet-500" /> {tr({ fr: "Point de situation", en: "Status" })}
                      {org.aiSummaryAt && <span className="normal-case tracking-normal">· {fmtRelative(org.aiSummaryAt, locale)}</span>}
                    </div>
                    {org.aiSummary ? <Md text={String(org.aiSummary)} /> : <div className="text-[13px] text-subtle">{tr({ fr: "Résumé généré à la prochaine synchronisation.", en: "Summary generated at next sync." })}</div>}
                  </div>
                  <Block title={tr({ fr: "Derniers échanges", en: "Latest exchanges" })} more={data.communications.length > 5 ? () => setTab("comms") : undefined}>
                    {data.communications.slice(0, 5).map((c) => (
                      <CommRow key={c.id} c={c} />
                    ))}
                    {!data.communications.length && <Empty>{tr({ fr: "Aucun échange.", en: "No exchanges." })}</Empty>}
                  </Block>
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
                  <Block title={tr({ fr: "Projets", en: "Projects" })} more={() => setTab("work")}>
                    {data.projects.map((p) => (
                      <ProjectRow key={p.id} p={p} />
                    ))}
                    {!data.projects.length && <Empty>—</Empty>}
                  </Block>
                  <Block title={tr({ fr: "Contacts", en: "Contacts" })} more={() => setTab("people")}>
                    <div className="flex flex-wrap gap-1.5">
                      {data.people.slice(0, 8).map((p) => (
                        <Link key={p.id} to="/db/$table/$id" params={{ table: "person", id: p.id }} title={`${p.firstName} ${p.lastName ?? ""}`}>
                          <Avatar name={`${p.firstName} ${p.lastName ?? ""}`} size={30} className="ring-2 ring-surface" />
                        </Link>
                      ))}
                      {!data.people.length && <Empty>—</Empty>}
                    </div>
                  </Block>
                </div>
              </div>
            )}

            {tab === "comms" && (
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

            {tab === "money" && (
              <div>
                {([...data.invoices.map((i) => ({ ...i, _k: "invoice" as const })), ...data.quotes.map((q) => ({ ...q, _k: "quote" as const }))] as (Row & { _k: "invoice" | "quote" })[])
                  .sort((a, b) => String(b.issueDate ?? "").localeCompare(String(a.issueDate ?? "")))
                  .map((d) => (
                    <Link key={d.id} to="/documents/$kind/$id" params={{ kind: d._k, id: d.id }} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-hover">
                      <span className="w-14 shrink-0 text-[11px] font-medium uppercase text-subtle">{d._k === "invoice" ? tr({ fr: "Facture", en: "Invoice" }) : tr({ fr: "Devis", en: "Quote" })}</span>
                      <span className="w-24 shrink-0 text-xs text-subtle">{fmtDate(d.issueDate, locale)}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        <span className="font-mono text-xs text-muted">{String(d.number)}</span> {String(d.title ?? "")}
                      </span>
                      <span className="text-[13px] tabular-nums">{formatMoney(Number(d.total), String(d.currency), locale)}</span>
                      <OptionBadge option={(d._k === "invoice" ? invStatus : quoteStatus).find((o) => o.value === d.status)} />
                    </Link>
                  ))}
                {!data.invoices.length && !data.quotes.length && <Empty>{tr({ fr: "Aucune facture ni devis.", en: "No invoices or quotes." })}</Empty>}
              </div>
            )}

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
                    <Link key={t.id} to="/db/$table/$id" params={{ table: "task", id: t.id }} className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-hover">
                      <span className="size-1.5 shrink-0 rounded-full bg-border-strong" />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{String(t.title)}</span>
                      {t.dueDate ? <span className="text-xs text-subtle">{fmtDate(t.dueDate, locale, { day: "numeric", month: "short" })}</span> : null}
                    </Link>
                  ))}
                  {!data.tasks.length && <Empty>{tr({ fr: "Aucune tâche ouverte.", en: "No open tasks." })}</Empty>}
                </Block>
              </div>
            )}

            {tab === "people" && (
              <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                {data.people.map((p) => (
                  <Link key={p.id} to="/db/$table/$id" params={{ table: "person", id: p.id }} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-hover">
                    <Avatar name={`${p.firstName} ${p.lastName ?? ""}`} size={32} className="ring-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">
                        {String(p.firstName)} {String(p.lastName ?? "")}
                      </span>
                      <span className="block truncate text-xs text-subtle">{[p.jobTitle, p.email].filter(Boolean).join(" · ")}</span>
                    </span>
                  </Link>
                ))}
                {!data.people.length && <Empty>—</Empty>}
              </div>
            )}

            {tab === "files" && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-0.5">
                {data.documents.map((d) => (
                  <button key={d.id} type="button" onClick={() => setPreview(d)} className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-hover" title={String(d.title)}>
                    <span className="grid size-5 shrink-0 place-items-center">
                      <FileIcon mime={String(d.mimeType ?? "")} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px]">{String(d.title)}</span>
                  </button>
                ))}
                {!data.documents.length && <Empty>{tr({ fr: "Aucun fichier synchronisé.", en: "No synced files." })}</Empty>}
              </div>
            )}
          </div>
        </div>
      </div>
      {preview && <PreviewOverlay doc={preview} onClose={() => setPreview(null)} />}
    </AppShell>
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
    <Link to="/db/$table/$id" params={{ table: "communication", id: c.id }} className="-mx-2 flex gap-3 rounded-lg px-2 py-2.5 hover:bg-hover">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">{c.type === "email" ? <Mail className="size-3.5" /> : <Video className="size-3.5" />}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-medium">{String(c.subject)}</span>
          <span className="shrink-0 text-[11px] text-subtle">{opt ? opt.label[locale] : ""}</span>
          <span className="ml-auto shrink-0 text-xs text-subtle">{fmtDate(c.occurredAt, locale, { day: "numeric", month: "short", year: "2-digit" })}</span>
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted">{decodeEntities(String(c.aiSummary || c.summary || "").replace(/\*\*/g, ""))}</span>
      </span>
    </Link>
  );
}

function ProjectRow({ p }: { p: Row }) {
  const { tr, locale } = useI18n();
  const projStatus = TABLES.project.fields.find((f) => f.key === "status")!.options!;
  return (
    <Link to="/db/$table/$id" params={{ table: "project", id: p.id }} className="-mx-2 block rounded-lg px-2 py-2 hover:bg-hover">
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
    </Link>
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
