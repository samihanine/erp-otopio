/** Settings › Système: consistency report of the current workspace. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ChevronDown, RefreshCw, Wrench, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useWorkspaces } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Report = { workspace: string; at: string; checks: { key: string; label: string; level: "ok" | "warn" | "error"; count: number; items: string[]; fixable?: boolean }[] };

export function IntegrityPanel() {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const { ws } = useWorkspaces();
  const { data, isFetching, refetch } = useQuery({ queryKey: ["integrity"], queryFn: () => api<Report>("/ws/integrity") });
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bad = (data?.checks ?? []).filter((c) => c.level !== "ok").length;
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{tr({ fr: "Contrôle de cohérence", en: "Consistency check" })}</h2>
          <p className="text-[13px] text-muted">
            {data ? `${data.workspace} · ` : ""}
            {bad ? tr({ fr: `${bad} point(s) à vérifier`, en: `${bad} item(s) to review` }) : tr({ fr: "Tout est cohérent", en: "All consistent" })}
          </p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn(isFetching && "animate-spin")} /> {tr({ fr: "Relancer", en: "Re-run" })}
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        {(data?.checks ?? []).map((c) => (
          <div key={c.key} className="border-b border-border last:border-0">
            <button type="button" onClick={() => setOpen(open === c.key ? null : c.key)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-hover">
              {c.level === "ok" ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : c.level === "warn" ? <AlertTriangle className="size-4 shrink-0 text-amber-500" /> : <XCircle className="size-4 shrink-0 text-rose-600" />}
              <span className="min-w-0 flex-1 text-[13px]">{c.label}</span>
              {c.level !== "ok" && <span className="text-[13px] font-semibold tabular-nums">{c.count}</span>}
              {c.items.length > 0 && <ChevronDown className={cn("size-4 text-subtle transition", open === c.key && "rotate-180")} />}
            </button>
            {open === c.key && c.items.length > 0 && (
              <ul className="space-y-0.5 bg-surface-2/40 px-11 py-2 text-xs text-muted">
                {c.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
            {c.fixable && ws?.role === "admin" && (
              <div className="px-11 pb-2.5">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const r = await api<{ fixed: number }>("/ws/integrity/fix", { method: "POST" });
                      toast.success(tr({ fr: `${r.fixed} lien(s) corrigé(s)`, en: `${r.fixed} link(s) fixed` }));
                      qc.invalidateQueries({ queryKey: ["integrity"] });
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Wrench /> {tr({ fr: "Corriger automatiquement", en: "Fix automatically" })}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
