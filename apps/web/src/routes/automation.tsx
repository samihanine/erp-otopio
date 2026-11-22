import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { fmtRelative, useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { formatMoney } from "@erp/shared";
import { cn } from "@/lib/utils";

/** Minimal markdown: **bold**, bullet lines and paragraphs. */
export function Md({ text, inline: asInline }: { text: string; inline?: boolean }) {
  const inline = (s: string): ReactNode[] => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <strong key={i} className="font-semibold text-fg">{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
  if (asInline) return <>{inline(text)}</>;
  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed text-muted">
      {text
        .split("\n")
        .filter((l) => l.trim())
        .map((l, i) => {
          const b = l.match(/^\s*[-*•]\s+(.*)/);
          const h = l.match(/^#+\s+(.*)/);
          if (h) return <div key={i} className="pt-1 font-semibold text-fg">{inline(h[1]!)}</div>;
          return b ? (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-subtle">•</span>
              <span>{inline(b[1]!)}</span>
            </div>
          ) : (
            <p key={i}>{inline(l)}</p>
          );
        })}
    </div>
  );
}

export function DigestCard() {
  const { tr, locale } = useI18n();
  const { data } = useQuery({ queryKey: ["ws", "digest"], queryFn: () => api<{ digest: string; at: string } | null>("/ws/digest"), staleTime: 300_000 });
  const [open, setOpen] = useState(false);
  if (!data?.digest) return null;
  // split "**Section**" blocks into columns
  const sections: { title: string; items: string[] }[] = [];
  for (const raw of data.digest.split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    const h = l.match(/^(?:#+\s*)?\*\*(.+?)\*\*:?$/) ?? l.match(/^#+\s+(.*)/);
    if (h) sections.push({ title: h[1]!, items: [] });
    else {
      if (!sections.length) sections.push({ title: "", items: [] });
      sections.at(-1)!.items.push(l.replace(/^[-*•]\s+/, ""));
    }
  }
  const max = open ? 99 : 2;
  const hidden = sections.reduce((a, s) => a + Math.max(0, s.items.length - max), 0);
  return (
    <section className="mt-6 rounded-xl bg-surface-2/50 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-3.5 text-violet-500" />
        <h2 className="text-[12px] font-medium uppercase tracking-wider text-muted">{tr({ fr: "Point de la semaine", en: "Weekly brief" })}</h2>
        <span className="text-[11px] text-subtle">· {fmtRelative(data.at, locale)}</span>
        {(hidden > 0 || open) && (
          <button type="button" onClick={() => setOpen(!open)} className="ml-auto text-[11.5px] text-muted hover:text-fg">
            {open ? tr({ fr: "Réduire", en: "Collapse" }) : `${tr({ fr: "Voir tout", en: "Show all" })} (+${hidden})`}
          </button>
        )}
      </div>
      <div className="grid gap-x-6 gap-y-2 md:grid-cols-3">
        {sections.map((s, i) => (
          <div key={i} className="min-w-0">
            {s.title && <div className="mb-0.5 text-[12px] font-semibold">{s.title}</div>}
            <ul className="space-y-0.5 text-[12.5px] leading-snug text-muted">
              {s.items.slice(0, max).map((it, j) => (
                <li key={j} className={cn(!open && "line-clamp-1")}>
                  <Md text={it} inline />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

type Entry = { id: string; action: string; table: string; recordId: string; comment: string | null; changes: { undo?: unknown } | null; createdAt: string };
const JOBS = [
  { job: "drive-sync", label: "Drive" },
  { job: "calendar-sync", label: "Agenda" },
  { job: "gmail-sync", label: "Gmail" },
  { job: "qonto-sync", label: "Qonto" },
  { job: "ai-sync", label: "IA" },
];

export function AutomationJournal() {
  const { tr, locale } = useI18n();
  const qc = useQueryClient();
  const { data, isFetching } = useQuery({ queryKey: ["ws", "automation"], queryFn: () => api<{ entries: Entry[]; sync: { key: string; updatedAt: string }[] }>("/ws/automation") });
  const { data: jobs = [] } = useQuery({ queryKey: ["ws", "jobs"], queryFn: () => api<{ id: string; name: string; state: string; error: string | null; at: number }[]>("/ws/jobs"), refetchInterval: 30_000 });
  const lastByName = JOBS.map((j) => ({ ...j, last: jobs.find((x) => x.name === j.job && x.state !== "waiting") }));
  const run = (job: string) => api(`/ws/sync/${job}`, { method: "POST" }).then(() => toast.success(tr({ fr: "Synchronisation lancée", en: "Sync started" })));
  const undo = async (id: string) => {
    await api(`/ws/automation/${id}/undo`, { method: "POST" });
    toast.success(tr({ fr: "Action annulée", en: "Action undone" }));
    qc.invalidateQueries({ queryKey: ["ws", "automation"] });
  };
  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{tr({ fr: "Automatisations", en: "Automations" })}</h2>
        {isFetching && <RefreshCw className="size-3.5 animate-spin text-subtle" />}
        <div className="ml-auto flex gap-1.5">
          {JOBS.map((j) => (
            <Button key={j.job} size="sm" onClick={() => run(j.job)}>
              <RefreshCw /> {j.label}
            </Button>
          ))}
        </div>
      </div>
      <p className="mb-3 text-[13px] text-muted">
        {tr({ fr: "Tout ce que la synchronisation a créé ou modifié automatiquement. Chaque action réversible peut être annulée.", en: "Everything the sync created or changed automatically. Reversible actions can be undone." })}
      </p>
      <div className="mb-3 grid gap-2 sm:grid-cols-5">
        {lastByName.map((j) => (
          <div key={j.job} className="rounded-lg border border-border px-3 py-2 text-xs" title={j.last?.error ?? ""}>
            <div className="flex items-center gap-1.5 font-medium">
              <span className={j.last?.state === "failed" ? "size-1.5 rounded-full bg-rose-500" : j.last?.state === "active" ? "size-1.5 rounded-full bg-amber-500" : j.last ? "size-1.5 rounded-full bg-emerald-500" : "size-1.5 rounded-full bg-zinc-300"} />
              {j.label}
            </div>
            <div className="mt-0.5 truncate text-subtle">{j.last ? (j.last.state === "failed" ? j.last.error : fmtRelative(new Date(j.last.at).toISOString(), locale)) : "—"}</div>
          </div>
        ))}
      </div>
      <div className="max-h-[480px] overflow-y-auto rounded-xl border border-border">
        {(data?.entries ?? []).map((e) => {
          const undone = e.action.startsWith("automation-undone:");
          return (
            <div key={e.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-0">
              <span className="w-24 shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-center text-[11px] text-muted">{e.action.split(":")[1]}</span>
              <span className={undone ? "min-w-0 flex-1 truncate text-subtle line-through" : "min-w-0 flex-1 truncate"}>
                {e.table && e.recordId && !undone ? (
                  <Link to="/db/$table/$id" params={{ table: e.table, id: e.recordId }} className="hover:underline">
                    {e.comment}
                  </Link>
                ) : (
                  e.comment
                )}
              </span>
              <span className="shrink-0 text-xs text-subtle">{fmtRelative(e.createdAt, locale)}</span>
              {e.changes?.undo && !undone ? (
                <Button size="sm" variant="ghost" onClick={() => undo(e.id)}>
                  <Undo2 /> {tr({ fr: "Annuler", en: "Undo" })}
                </Button>
              ) : (
                <span className="w-[84px]" />
              )}
            </div>
          );
        })}
        {!data?.entries.length && <div className="p-8 text-center text-[13px] text-subtle">{tr({ fr: "Aucune action automatique pour l'instant.", en: "No automatic actions yet." })}</div>}
      </div>
      {data?.sync.length ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-subtle">
          {data.sync.map((s) => (
            <span key={s.key}>
              {s.key} · {fmtRelative(s.updatedAt, locale)}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function PersonalGoogle() {
  const { tr, locale } = useI18n();
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["personal-google"], queryFn: () => api<{ email: string; updatedAt: string; entity: string | null }[]>("/integrations/google-personal") });
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const g = p.get("google");
    if (!g) return;
    if (g === "connected") toast.success(`${tr({ fr: "Compte connecté", en: "Account connected" })} : ${p.get("account") ?? ""}`);
    else toast.error(`Google : ${g}`);
    history.replaceState(null, "", location.pathname);
  }, []);
  const remove = async (email: string) => {
    await api(`/integrations/google-personal?email=${encodeURIComponent(email)}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["personal-google"] });
  };
  return (
    <section className="mt-10">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-lg font-semibold">{tr({ fr: "Comptes Google personnels", en: "Personal Google accounts" })}</h2>
        <a href="/api/integrations/google-personal/connect" className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium hover:bg-hover">
          + {tr({ fr: "Connecter un compte", en: "Connect an account" })}
        </a>
      </div>
      <p className="mb-3 text-[13px] text-muted">
        {tr({ fr: "Pour gérer une boîte Gmail hors Workspace (ex. @gmail.com). Le jeton est chiffré et visible uniquement par vous.", en: "To manage a non-Workspace Gmail inbox. The token is encrypted and only visible to you." })}
      </p>
      <div className="overflow-hidden rounded-xl border border-border">
        {data.map((a) => (
          <div key={a.email} className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-0">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span className="flex-1">{a.email}</span>
            <Combobox
              size="xs"
              className="w-56"
              placeholder={tr({ fr: "Structure liée…", en: "Linked entity…" })}
              value={a.entity ?? ""}
              onChange={async (v) => {
                await api("/integrations/google-personal/entity", { method: "PUT", body: JSON.stringify({ email: a.email, code: v || null }) });
                qc.invalidateQueries({ queryKey: ["personal-google"] });
                toast.success(tr({ fr: "Structure mise à jour", en: "Entity updated" }));
              }}
              options={[{ value: "MGS", label: "Megascale Technologie SARL" }, { value: "OTP", label: "Otopio Inc." }]}
            />
            <span className="text-xs text-subtle">{fmtRelative(a.updatedAt, locale)}</span>
            <Button size="sm" variant="ghost" onClick={() => remove(a.email)}>
              {tr({ fr: "Déconnecter", en: "Disconnect" })}
            </Button>
          </div>
        ))}
        {!data.length && <div className="p-5 text-center text-[13px] text-subtle">{tr({ fr: "Aucun compte connecté.", en: "No account connected." })}</div>}
      </div>
    </section>
  );
}

type AlertGroup = { count: number; items: { id: string; label: string; date: string | null; amount: number; currency: string; entity: string }[] };
export function AlertsCard() {
  const { tr, locale } = useI18n();
  const { data } = useQuery({ queryKey: ["ws", "alerts"], queryFn: () => api<{ total: number; billsWithoutReceipt: AlertGroup; billsUncategorised: AlertGroup; invoicesWithoutFile: AlertGroup; bankUnmatched: AlertGroup; toReimburse: AlertGroup }>("/ws/alerts"), staleTime: 60_000 });
  if (!data || !(data.total + data.toReimburse.count)) return null;
  const groups: { title: string; g: AlertGroup; table: string }[] = [
    { title: tr({ fr: "Dépenses sans justificatif", en: "Expenses without receipt" }), g: data.billsWithoutReceipt, table: "bill" },
    { title: tr({ fr: "Dépenses non catégorisées", en: "Uncategorised expenses" }), g: data.billsUncategorised, table: "bill" },
    { title: tr({ fr: "Factures sans fichier", en: "Invoices without file" }), g: data.invoicesWithoutFile, table: "invoice" },
    { title: tr({ fr: "Lignes bancaires non rapprochées", en: "Unmatched bank lines" }), g: data.bankUnmatched, table: "transaction" },
    { title: tr({ fr: "Dépenses pro payées perso — à rembourser", en: "Pro expenses paid personally — to reimburse" }), g: data.toReimburse, table: "bill" },
  ].filter((x) => x.g.count > 0);
  return (
    <section className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-amber-600">{tr({ fr: "À traiter", en: "Needs attention" })} · {data.total}</h2>
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
        {groups.map((x) => (
          <div key={x.title} className="min-w-0">
            <Link to="/db/$table" params={{ table: x.table }} search={{}} className="text-[12.5px] font-semibold hover:underline">
              {x.title} ({x.g.count})
            </Link>
            <ul className="mt-0.5 space-y-0.5 text-[12px] text-muted">
              {x.g.items.slice(0, 3).map((i) => (
                <li key={i.id} className="truncate">
                  <Link to="/db/$table/$id" params={{ table: x.table, id: i.id }} className="hover:underline">
                    {i.entity} · {i.date} · {i.label} · {formatMoney(i.amount, i.currency, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
