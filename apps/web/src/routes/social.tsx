import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CalendarClock, ExternalLink, Lightbulb, Megaphone, Plus, Send } from "lucide-react";
import { CONTENT_STATUS_OPTIONS, TABLES } from "@erp/shared";
import { useCreateRecord, useList } from "@/lib/data";
import { fmtDate, useI18n } from "@/lib/i18n";
import { HEX } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { OptionBadge } from "@/components/ui/misc";
import type { Row } from "@/lib/api";

const NETWORKS = TABLES.post.fields.find((f) => f.key === "network")!.options!;

/** Social media planning: editorial pipeline per network, built on the « post » table. */
export function SocialView() {
  const { tr, locale } = useI18n();
  const navigate = useNavigate();
  const [net, setNet] = useState<string>("all");
  const { data } = useList("post", { sorts: [{ field: "scheduledAt", dir: "asc" }], limit: 500 });
  const create = useCreateRecord("post");
  const all = data?.rows ?? [];
  const rows = net === "all" ? all : all.filter((r) => r.network === net);
  const now = new Date();
  const in30 = new Date(Date.now() + 30 * 864e5);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const when = (r: Row) => (r.scheduledAt ? new Date(String(r.scheduledAt)) : null);
  const ideas = rows.filter((r) => ["idea", "draft", "review"].includes(String(r.status)));
  const planned = rows.filter((r) => r.status === "scheduled").sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
  const published = rows.filter((r) => r.status === "published").sort((a, b) => String(b.publishedAt ?? b.scheduledAt).localeCompare(String(a.publishedAt ?? a.scheduledAt)));
  const kpis = [
    { label: tr({ fr: "Planifiés (30 j)", en: "Scheduled (30 d)" }), value: planned.filter((r) => when(r) && when(r)! <= in30).length },
    { label: tr({ fr: "Publiés ce mois", en: "Published this month" }), value: published.filter((r) => new Date(String(r.publishedAt ?? r.scheduledAt ?? 0)) >= monthStart).length },
    { label: tr({ fr: "Idées & brouillons", en: "Ideas & drafts" }), value: ideas.length },
    { label: tr({ fr: "Réseaux actifs", en: "Active networks" }), value: new Set(all.map((r) => r.network).filter(Boolean)).size },
  ];
  const byNet = useMemo(() => NETWORKS.map((n) => ({ n, count: all.filter((r) => r.network === n.value).length })), [all]);
  const open = (r: Row) => navigate({ to: "/db/$table", params: { table: "post" }, search: { record: r.id } as never });
  const add = async (status: string) => {
    const res = await create.mutateAsync({ title: tr({ fr: "Nouveau post", en: "New post" }), status, network: net === "all" ? "linkedin" : net });
    open(res.row);
  };

  const Card = ({ r }: { r: Row }) => {
    const n = NETWORKS.find((x) => x.value === r.network);
    const d = when(r);
    return (
      <button type="button" onClick={() => open(r)} className="block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition hover:border-border-strong hover:shadow-card">
        <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
          <span className="size-2 rounded-full" style={{ background: HEX[n?.color ?? "gray"] }} />
          {n ? tr(n.label) : "—"}
          {d && <span className="ml-auto tabular-nums">{fmtDate(d.toISOString(), locale, { day: "numeric", month: "short" })} · {d.toTimeString().slice(0, 5)}</span>}
        </div>
        <div className="mt-1 line-clamp-2 text-[13px] font-medium">{String(r.title)}</div>
        <div className="mt-1.5 flex items-center gap-2">
          <OptionBadge option={CONTENT_STATUS_OPTIONS.find((o) => o.value === r.status)} />
          {r.url ? (
            <a href={String(r.url)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="ml-auto text-subtle hover:text-fg">
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
      </button>
    );
  };

  const columns = [
    { key: "ideas", title: tr({ fr: "Idées & brouillons", en: "Ideas & drafts" }), icon: Lightbulb, rows: ideas, status: "idea" },
    { key: "planned", title: tr({ fr: "Planifiés", en: "Scheduled" }), icon: CalendarClock, rows: planned, status: "scheduled" },
    { key: "published", title: tr({ fr: "Publiés", en: "Published" }), icon: Send, rows: published.slice(0, 20), status: "published" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-pink-500/10 text-pink-600">
            <Megaphone className="size-5" />
          </span>
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight">{tr({ fr: "Réseaux sociaux", en: "Social media" })}</h1>
            <p className="text-[13px] text-muted">{tr({ fr: "Ligne éditoriale, planning et publications par réseau.", en: "Editorial line, planning and posts per network." })}</p>
          </div>
        </div>
        <Button variant="primary" onClick={() => add("idea")}>
          <Plus /> {tr({ fr: "Nouveau post", en: "New post" })}
        </Button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border px-4 py-3">
            <div className="text-[12.5px] text-muted">{k.label}</div>
            <div className="mt-1 text-[24px] font-semibold tabular-nums">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="no-scrollbar mt-5 flex items-center gap-1.5 overflow-x-auto">
        <button type="button" onClick={() => setNet("all")} className={cn("shrink-0 rounded-full border px-3 py-1 text-[12.5px] font-medium", net === "all" ? "border-fg bg-fg text-surface" : "border-border text-muted hover:text-fg")}>
          {tr({ fr: "Tous", en: "All" })} · {all.length}
        </button>
        {byNet.map(({ n, count }) => (
          <button key={n.value} type="button" onClick={() => setNet(n.value)} className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium", net === n.value ? "border-fg bg-fg text-surface" : "border-border text-muted hover:text-fg")}>
            <span className="size-2 rounded-full" style={{ background: HEX[n.color] }} />
            {tr(n.label)} · {count}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        {columns.map((c) => (
          <div key={c.key} className="rounded-2xl bg-surface-2/60 p-3">
            <div className="mb-2 flex items-center gap-2 px-1">
              <c.icon className="size-4 text-muted" />
              <span className="text-[13px] font-semibold">{c.title}</span>
              <span className="text-[12px] text-subtle">{c.rows.length}</span>
              <button type="button" onClick={() => add(c.status)} className="ml-auto grid size-6 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg" title={tr({ fr: "Ajouter", en: "Add" })}>
                <Plus className="size-3.5" />
              </button>
            </div>
            <div className="max-h-[560px] space-y-2 overflow-y-auto">
              {c.rows.map((r) => (
                <Card key={r.id} r={r} />
              ))}
              {!c.rows.length && <div className="px-1 py-6 text-center text-[12.5px] text-subtle">{tr({ fr: "Rien pour l'instant.", en: "Nothing yet." })}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
