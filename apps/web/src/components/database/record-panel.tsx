import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink, FileText, GitCommitHorizontal, Github, Link2, Maximize2, MessageSquare, MoreHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { TABLES, type TableKey } from "@erp/shared";
import { api, type Refs, type Row } from "@/lib/api";
import { fmtRelative, useI18n } from "@/lib/i18n";
import { recordLabel, useDeleteRecord, useRecord, useRelated, useUpdateRecord } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, Icon, Skeleton, TableTile } from "@/components/ui/misc";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { FieldDisplay, PropertyValue } from "./fields";
import { fieldIcon } from "./toolbar";

export function RecordDetail({ table, id, onClose, full }: { table: TableKey; id: string; onClose?: () => void; full?: boolean }) {
  const { tr, t, locale } = useI18n();
  const def = TABLES[table];
  const { data, isLoading } = useRecord(table, id);
  const update = useUpdateRecord(table);
  const del = useDeleteRecord(table);
  const navigate = useNavigate();
  const [tab, setTab] = useState<"related" | "activity">("related");

  if (isLoading || !data)
    return (
      <div className="space-y-3 p-8">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="mt-6 h-40 w-full" />
      </div>
    );

  const { row, refs } = data;
  const save = (key: string, v: unknown) => update.mutate({ id, patch: { [key]: v } });
  const primary = def.fields.find((f) => f.key === def.primary)!;
  const longFields = def.fields.filter((f) => f.type === "longtext");
  const propFields = def.fields.filter((f) => f.key !== def.primary && f.type !== "longtext" && f.type !== "lines" && (f.key !== "lastName" || table !== "person"));
  const docKind = table === "quote" || table === "invoice" ? table : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <TableTile icon={def.icon} color={def.color} size="sm" />
        <span className="text-[13px] text-muted">{tr(def.singular)}</span>
        <div className="ml-auto flex items-center gap-1">
          {docKind && (
            <Button size="sm" variant="secondary" onClick={() => navigate({ to: "/documents/$kind/$id", params: { kind: docKind, id } })}>
              <FileText /> {tr({ fr: "Éditer le document", en: "Edit document" })}
            </Button>
          )}
          {!full && (
            <Button size="icon-sm" variant="ghost" onClick={() => navigate({ to: "/db/$table/$id", params: { table, id } })} title={t("openFull")}>
              <Maximize2 />
            </Button>
          )}
          <Dropdown>
            <DropdownTrigger asChild>
              <Button size="icon-sm" variant="ghost">
                <MoreHorizontal />
              </Button>
            </DropdownTrigger>
            <DropdownContent align="end">
              <DropdownItem
                onSelect={() => {
                  navigator.clipboard.writeText(`${location.origin}/db/${table}/${id}`);
                  toast.success(t("linkCopied"));
                }}
              >
                <Link2 /> {t("copyLink")}
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem
                danger
                onSelect={() => {
                  if (!confirm(t("confirmDelete"))) return;
                  del.mutate(id, {
                    onSuccess: () => {
                      toast.success(t("deleted"));
                      onClose?.();
                      if (full) navigate({ to: "/db/$table", params: { table } });
                    },
                  });
                }}
              >
                <Trash2 /> {t("delete")}
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
          {onClose && (
            <Button size="icon-sm" variant="ghost" onClick={onClose}>
              <X />
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn("mx-auto px-8 pb-16 pt-8", full ? "max-w-4xl" : "max-w-none")}>
          {/* Title */}
          <div className="mb-1 flex items-center gap-3">
            {table === "person" && <Avatar name={recordLabel(table, row)} size={40} />}
            <TitleInput key={`${id}-${String(row[primary.key])}`} value={String(row[primary.key] ?? "")} placeholder={t("untitled")} onSave={(v) => save(primary.key, v)} />
          </div>
          {table === "person" && (
            <div className="mb-3 w-64">
              <PropertyValue field={def.fields.find((f) => f.key === "lastName")!} row={row} refs={refs} table={table} onSave={(v) => save("lastName", v)} />
            </div>
          )}

          {/* Properties */}
          <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-0.5 md:grid-cols-[minmax(0,1fr)]">
            {propFields.map((f) => (
              <div key={f.key} className="grid grid-cols-[160px_minmax(0,1fr)] items-start gap-2">
                <div className="flex h-8 items-center gap-2 truncate text-[13px] text-muted">
                  <Icon name={fieldIcon(f)} className="size-3.5 shrink-0 text-subtle" />
                  <span className="truncate">{tr(f.label)}</span>
                </div>
                <PropertyValue field={f} row={row} refs={refs} table={table} onSave={(v) => save(f.key, v)} />
              </div>
            ))}
          </div>

          {table === "project" && row.githubRepo ? <GithubCard repo={String(row.githubRepo)} /> : null}

          {/* Long text */}
          {longFields.map((f) => (
            <div key={f.key} className="mt-6">
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-subtle">{tr(f.label)}</div>
              <LongText value={String(row[f.key] ?? "")} onSave={(v) => save(f.key, v)} placeholder={tr({ fr: "Écrire…", en: "Write…" })} />
            </div>
          ))}

          {/* Tabs */}
          <div className="mt-8 flex gap-1 border-b border-border">
            {(["related", "activity"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={cn("-mb-px border-b-2 px-2 pb-2 text-[13px] font-medium", tab === k ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg")}>
                {t(k)}
              </button>
            ))}
          </div>
          <div className="pt-4">{tab === "related" ? <Related table={table} id={id} /> : <Activity table={table} id={id} locale={locale} />}</div>
        </div>
      </div>
    </div>
  );
}

function TitleInput({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      placeholder={placeholder}
      className="w-full bg-transparent text-[26px] font-semibold tracking-tight outline-none placeholder:text-subtle"
    />
  );
}

function LongText({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder: string }) {
  const [v, setV] = useState(value);
  return (
    <textarea
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      placeholder={placeholder}
      rows={Math.max(3, v.split("\n").length + 1)}
      className="w-full resize-none rounded-xl border border-transparent bg-transparent p-2 text-[14px] leading-relaxed outline-none transition hover:border-border focus:border-border focus:bg-surface-2/40"
    />
  );
}

function Related({ table, id }: { table: TableKey; id: string }) {
  const { tr, t } = useI18n();
  const { data, isLoading } = useRelated(table, id);
  const navigate = useNavigate();
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data?.length) return <div className="py-6 text-center text-[13px] text-subtle">{tr({ fr: "Aucun élément lié.", en: "No related items." })}</div>;
  return (
    <div className="space-y-5">
      {data.map((g) => {
        const d = TABLES[g.table];
        const fieldLabel = d.fields.find((f) => f.key === g.field)?.label;
        const showFields = d.fields.filter((f) => ["select", "date", "currency", "percent"].includes(f.type) && !f.hidden).slice(0, 3);
        return (
          <div key={`${g.table}.${g.field}`}>
            <div className="mb-2 flex items-center gap-2 text-[13px] font-medium">
              <TableTile icon={d.icon} color={d.color} size="sm" />
              {tr(d.label)}
              <span className="text-xs font-normal text-subtle">· {tr(fieldLabel)}</span>
              <span className="text-xs tabular-nums text-subtle">{g.total}</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-border">
              {g.rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => navigate({ to: "/db/$table/$id", params: { table: g.table, id: r.id } })}
                  className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-[13px] last:border-0 hover:bg-hover"
                >
                  <span className="min-w-0 flex-1 truncate">{recordLabel(g.table, r) || t("untitled")}</span>
                  {showFields.map((f) => (
                    <span key={f.key} className="shrink-0">
                      <FieldDisplay field={f} row={r} refs={{} as Refs} table={g.table} />
                    </span>
                  ))}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type ActivityRow = { id: string; action: string; changes: Record<string, { from: unknown; to: unknown }> | null; comment: string | null; createdAt: string; userName: string | null };

function Activity({ table, id, locale }: { table: TableKey; id: string; locale: "fr" | "en" }) {
  const { t, tr } = useI18n();
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["activity", table, id], queryFn: () => api<ActivityRow[]>(`/activity/${table}/${id}`) });
  const [comment, setComment] = useState("");
  const post = async () => {
    if (!comment.trim()) return;
    await api(`/activity/${table}/${id}`, { method: "POST", json: { comment } });
    setComment("");
    qc.invalidateQueries({ queryKey: ["activity", table, id] });
  };
  const label = (k: string) => tr(TABLES[table].fields.find((f) => f.key === k)?.label) || k;
  return (
    <div>
      <div className="mb-4 flex items-start gap-2">
        <MessageSquare className="mt-2 size-4 text-subtle" />
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && post()}
          placeholder={t("comment")}
          rows={2}
          className="flex-1 resize-none rounded-xl border border-border bg-surface p-2.5 text-[13px] outline-none focus:ring-3 focus:ring-accent/15"
        />
        <Button size="sm" variant="primary" onClick={post} disabled={!comment.trim()}>
          {t("send")}
        </Button>
      </div>
      <ol className="relative space-y-3 border-l border-border pl-5">
        {data.map((a) => (
          <li key={a.id} className="text-[13px]">
            <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-surface bg-border-strong" />
            <div className="flex items-center gap-1.5">
              <Avatar name={a.userName ?? "?"} size={18} className="ring-0" />
              <span className="font-medium">{a.userName ?? "Système"}</span>
              <span className="text-subtle">· {fmtRelative(a.createdAt, locale)}</span>
            </div>
            {a.comment ? <div className="mt-1 whitespace-pre-wrap rounded-lg bg-surface-2 px-3 py-2">{a.comment}</div> : null}
            {a.action === "created" && <div className="mt-0.5 text-muted">{tr({ fr: "a créé cet élément", en: "created this item" })}</div>}
            {a.changes &&
              Object.entries(a.changes).map(([k, c]) => (
                <div key={k} className="mt-0.5 text-muted">
                  <span className="text-fg">{label(k)}</span> : <span className="line-through opacity-60">{String(c.from ?? "—")}</span> → <span className="text-fg">{String(c.to ?? "—")}</span>
                </div>
              ))}
          </li>
        ))}
        {!data.length && <li className="text-[13px] text-subtle">{tr({ fr: "Pas encore d'activité.", en: "No activity yet." })}</li>}
      </ol>
    </div>
  );
}

type GithubInfo = {
  connected: boolean;
  repo: { name: string; url: string; private?: boolean; description?: string | null; defaultBranch?: string; pushedAt?: string; language?: string | null; openIssues?: number };
  commits: { sha: string; url: string; message: string; author: string; date: string }[];
  error?: string;
};

function GithubCard({ repo }: { repo: string }) {
  const { tr, locale } = useI18n();
  const [owner, name] = repo.split("/");
  const { data } = useQuery({ queryKey: ["github", repo], queryFn: () => api<GithubInfo>(`/integrations/github/${owner}/${name}`), enabled: Boolean(owner && name) });
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-border">
      <div className="flex items-center gap-3 border-b border-border bg-surface-2/60 px-4 py-3">
        <span className="grid size-8 place-items-center rounded-lg bg-[#0d1117] text-white">
          <Github className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <a href={`https://github.com/${repo}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-mono text-[13px] font-medium hover:underline">
            {repo} <ExternalLink className="size-3 text-muted" />
          </a>
          <div className="truncate text-xs text-muted">
            {data?.connected
              ? [data.repo.private ? tr({ fr: "Privé", en: "Private" }) : "Public", data.repo.language, data.repo.defaultBranch, data.repo.pushedAt && `push ${fmtRelative(data.repo.pushedAt, locale)}`].filter(Boolean).join(" · ")
              : tr({ fr: "Ajoutez GITHUB_TOKEN pour afficher l'activité des repos privés.", en: "Add GITHUB_TOKEN to show private repo activity." })}
          </div>
        </div>
      </div>
      {data?.commits?.length ? (
        <div>
          {data.commits.map((c) => (
            <a key={c.sha} href={c.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 border-b border-border px-4 py-2 text-[13px] last:border-0 hover:bg-hover">
              <GitCommitHorizontal className="size-4 text-subtle" />
              <span className="min-w-0 flex-1 truncate">{c.message}</span>
              <span className="font-mono text-xs text-subtle">{c.sha}</span>
              <span className="text-xs text-subtle">{fmtRelative(c.date, locale)}</span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RecordLink({ table, row }: { table: TableKey; row: Row }) {
  return (
    <Link to="/db/$table/$id" params={{ table, id: row.id }} className="hover:underline">
      {recordLabel(table, row)}
    </Link>
  );
}
