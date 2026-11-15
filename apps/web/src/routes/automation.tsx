import { Fragment, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { fmtRelative, useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/** Minimal markdown: **bold**, bullet lines and paragraphs. */
function Md({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <strong key={i} className="font-semibold text-fg">{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
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
  if (!data?.digest) return null;
  return (
    <section className="mt-8 rounded-xl border border-border p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="size-4 text-violet-500" />
        <h2 className="text-[14px] font-semibold">{tr({ fr: "Point de la semaine", en: "Weekly brief" })}</h2>
        <span className="ml-auto text-xs text-subtle">{fmtRelative(data.at, locale)}</span>
      </div>
      <Md text={data.digest} />
    </section>
  );
}

type Entry = { id: string; action: string; table: string; recordId: string; comment: string | null; changes: { undo?: unknown } | null; createdAt: string };
const JOBS = [
  { job: "drive-sync", label: "Drive" },
  { job: "calendar-sync", label: "Agenda" },
  { job: "gmail-sync", label: "Gmail" },
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
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
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
