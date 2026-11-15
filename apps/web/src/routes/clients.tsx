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
        <div className="mx-auto max-w-6xl px-8 pb-20 pt-8">
          {/* Header */}
          <div className="flex items-start gap-4">
            <span className="grid size-14 place-items-center overflow-hidden rounded-2xl border border-border">
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

          {/* KPIs */}
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {[
              { l: tr({ fr: "Facturé HT", en: "Invoiced" }), v: money(kpis.invoiced) },
              { l: tr({ fr: "Encaissé", en: "Collected" }), v: money(kpis.collected) },
              { l: tr({ fr: "À encaisser", en: "Outstanding" }), v: money(kpis.outstanding), warn: kpis.outstanding > 0 },
              { l: tr({ fr: "Devis en attente", en: "Open quotes" }), v: money(kpis.quotesOpen) },
              { l: tr({ fr: "Heures (tâches)", en: "Hours (tasks)" }), v: `${kpis.hoursSpent} / ${kpis.hoursEstimated || "—"} h` },
              { l: tr({ fr: "Heures de réunion", en: "Meeting hours" }), v: `${kpis.meetingHours} h` },
            ].map((k) => (
              <div key={k.l} className="rounded-xl border border-border px-4 py-3">
                <div className="text-xs text-muted">{k.l}</div>
                <div className={cn("mt-1 text-[18px] font-semibold tabular-nums tracking-tight", k.warn && "text-amber-700 dark:text-amber-400")}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* AI summary */}
          <div className="mt-6 rounded-xl border border-border bg-surface-2/40 p-5">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
              <Sparkles className="size-4 text-violet-500" /> {tr({ fr: "Point de situation (IA)", en: "Status (AI)" })}
              {org.aiSummaryAt && <span className="text-xs font-normal text-subtle">· {fmtRelative(org.aiSummaryAt, locale)}</span>}
            </div>
            {org.aiSummary ? (
              <div className="prose-doc whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg">{String(org.aiSummary)}</div>
            ) : (
              <div className="text-[13px] text-subtle">{tr({ fr: "Le résumé sera généré automatiquement lors de la prochaine synchronisation (toutes les heures).", en: "The summary will be generated at the next sync (hourly)." })}</div>
            )}
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-3">
            <div className="space-y-8 lg:col-span-2">
              {/* Projects */}
              <Section title={tr({ fr: "Projets", en: "Projects" })} count={data.projects.length} to={{ table: "project" }}>
                {data.projects.map((p) => (
                  <Link key={p.id} to="/db/$table/$id" params={{ table: "project", id: p.id }} className="flex items-center gap-3 py-2.5 hover:bg-hover/60">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{String(p.name)}</span>
                      <span className="text-xs text-subtle">{p.dueDate ? `${tr({ fr: "Échéance", en: "Due" })} ${fmtDate(p.dueDate, locale)}` : ""}</span>
                    </span>
                    <span className="flex w-28 items-center gap-2">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full bg-fg/70" style={{ width: `${Number(p.progress ?? 0)}%` }} />
                      </span>
                      <span className="w-8 text-right text-[11px] tabular-nums text-subtle">{Number(p.progress ?? 0)}%</span>
                    </span>
                    <OptionBadge option={projStatus.find((o) => o.value === p.status)} />
                  </Link>
                ))}
              </Section>

              {/* Money */}
              <Section title={tr({ fr: "Factures & devis", en: "Invoices & quotes" })} count={data.invoices.length + data.quotes.length}>
                {([...data.invoices.map((i) => ({ ...i, _k: "invoice" as const })), ...data.quotes.map((q) => ({ ...q, _k: "quote" as const }))] as (Row & { _k: "invoice" | "quote" })[])
                  .sort((a, b) => String(b.issueDate ?? "").localeCompare(String(a.issueDate ?? "")))
                  .map((d) => (
                    <Link key={d.id} to="/documents/$kind/$id" params={{ kind: d._k, id: d.id }} className="flex items-center gap-3 py-2.5 hover:bg-hover/60">
                      <span className="w-14 text-[11px] font-medium uppercase text-subtle">{d._k === "invoice" ? tr({ fr: "Facture", en: "Invoice" }) : tr({ fr: "Devis", en: "Quote" })}</span>
                      <span className="min-w-0 flex-1">
                        <span className="font-mono text-xs text-muted">{String(d.number)}</span> <span className="truncate text-[13px]">{String(d.title ?? "")}</span>
                      </span>
                      <span className="text-[13px] tabular-nums">{formatMoney(Number(d.total), String(d.currency), locale)}</span>
                      <OptionBadge option={(d._k === "invoice" ? invStatus : quoteStatus).find((o) => o.value === d.status)} />
                    </Link>
                  ))}
              </Section>

              {/* Communications */}
              <Section
                title={tr({ fr: "Communications", en: "Communications" })}
                count={data.communications.length}
                extra={<Segmented value={commFilter} onChange={setCommFilter} options={[{ value: "all", label: tr({ fr: "Tout", en: "All" }) }, { value: "email", label: "Mails" }, { value: "meeting", label: tr({ fr: "Réunions", en: "Meetings" }) }]} />}
              >
                {comms.map((c) => (
                  <Link key={c.id} to="/db/$table/$id" params={{ table: "communication", id: c.id }} className="flex gap-3 py-3 hover:bg-hover/60">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">{c.type === "email" ? <Mail className="size-3.5" /> : <Video className="size-3.5" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium">{String(c.subject)}</span>
                        <OptionBadge option={commType.find((o) => o.value === c.type)} className="shrink-0" />
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{String(c.aiSummary || c.summary || "")}</span>
                    </span>
                    <span className="shrink-0 text-xs text-subtle">{fmtDate(c.occurredAt, locale, { day: "numeric", month: "short" })}</span>
                  </Link>
                ))}
              </Section>
            </div>

            <div className="space-y-8">
              {/* Upcoming */}
              <Section title={tr({ fr: "Agenda", en: "Upcoming" })} count={data.upcoming.length}>
                {data.upcoming.map((e) => (
                  <a key={e.id} href={String(e.meetUrl ?? e.htmlLink ?? "#")} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-2.5 hover:bg-hover/60">
                    <CalendarClock className="size-4 text-subtle" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{String(e.title)}</span>
                      <span className="text-xs text-subtle">{fmtDate(e.startAt, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                  </a>
                ))}
                {!data.upcoming.length && <div className="py-3 text-[13px] text-subtle">{tr({ fr: "Aucun rendez-vous prévu.", en: "Nothing scheduled." })}</div>}
              </Section>

              {/* Tasks */}
              <Section title={tr({ fr: "Tâches ouvertes", en: "Open tasks" })} count={kpis.openTasks}>
                {data.tasks.map((t) => (
                  <Link key={t.id} to="/db/$table/$id" params={{ table: "task", id: t.id }} className="flex items-center gap-2 py-2 hover:bg-hover/60">
                    <span className="min-w-0 flex-1 truncate text-[13px]">{String(t.title)}</span>
                    {t.dueDate ? <span className="text-xs text-subtle">{fmtDate(t.dueDate, locale, { day: "numeric", month: "short" })}</span> : null}
                  </Link>
                ))}
              </Section>

              {/* Contacts */}
              <Section title={tr({ fr: "Contacts", en: "Contacts" })} count={data.people.length}>
                {data.people.map((p) => (
                  <Link key={p.id} to="/db/$table/$id" params={{ table: "person", id: p.id }} className="flex items-center gap-2.5 py-2 hover:bg-hover/60">
                    <Avatar name={`${p.firstName} ${p.lastName ?? ""}`} size={26} className="ring-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px]">
                        {String(p.firstName)} {String(p.lastName ?? "")}
                      </span>
                      <span className="block truncate text-xs text-subtle">{String(p.jobTitle ?? p.email ?? "")}</span>
                    </span>
                  </Link>
                ))}
              </Section>

              {/* Files */}
              <Section title={tr({ fr: "Fichiers Drive", en: "Drive files" })} count={data.documents.length}>
                {data.documents.slice(0, 15).map((d) => (
                  <button key={d.id} type="button" onClick={() => setPreview(d)} className="flex w-full items-center gap-2.5 py-2 text-left hover:bg-hover/60">
                    <FileIcon mime={String(d.mimeType ?? "")} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{String(d.title)}</span>
                  </button>
                ))}
                {!data.documents.length && <div className="py-3 text-[13px] text-subtle">{tr({ fr: "Aucun fichier synchronisé.", en: "No synced files." })}</div>}
              </Section>
            </div>
          </div>
        </div>
      </div>
      {preview && <PreviewOverlay doc={preview} onClose={() => setPreview(null)} />}
    </AppShell>
  );
}

function Section({ title, count, children, extra, to }: { title: string; count?: number; children: React.ReactNode; extra?: React.ReactNode; to?: { table: string } }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {count != null && <span className="text-xs tabular-nums text-subtle">{count}</span>}
        <div className="ml-auto">{extra}</div>
        {to && <span className="hidden">{to.table}</span>}
      </div>
      <div className="divide-y divide-border border-y border-border">{children}</div>
    </section>
  );
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
