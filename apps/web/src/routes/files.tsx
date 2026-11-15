import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ExternalLink, HardDrive, Maximize2, RefreshCw, Search, X } from "lucide-react";
import { TABLES } from "@erp/shared";
import { AppShell } from "@/components/layout/app-shell";
import { api, type Row } from "@/lib/api";
import { fmtDate, useI18n } from "@/lib/i18n";
import { useRecord, useUpdateRecord } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { PropertyValue } from "@/components/database/fields";
import { FileIcon, filePreviewUrl, humanSize } from "./drive-ui";
import { PreviewOverlay } from "./clients";

export function DocsTabs({ active }: { active: "files" | "models" }) {
  const { tr } = useI18n();
  return (
    <div className="flex gap-1 border-b border-border px-6">
      {[
        { k: "files", to: "/documents", label: tr({ fr: "Fichiers", en: "Files" }) },
        { k: "models", to: "/documents/models", label: tr({ fr: "Devis, factures & modèles", en: "Quotes, invoices & templates" }) },
      ].map((t) => (
        <Link key={t.k} to={t.to} className={cn("-mb-px border-b-2 px-2 py-2.5 text-[13px] font-medium", active === t.k ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg")}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

function TreeNode({ id, name, depth, selected, onSelect }: { id: string; name: string; depth: number; selected: string | null; onSelect: (id: string, name: string) => void }) {
  const [open, setOpen] = useState(depth === 0);
  const { data = [] } = useQuery({ queryKey: ["drive", "children", id], queryFn: () => api<Row[]>(`/ws/drive/children?parent=${id}`), enabled: open });
  const folders = data.filter((d) => d.isFolder);
  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(id, name)}
        className={cn("flex h-7 w-full items-center gap-1 rounded-md pr-2 text-left text-[13px] text-muted hover:bg-hover hover:text-fg", selected === id && "bg-hover font-medium text-fg")}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        <span
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          className="grid size-4 place-items-center rounded text-subtle hover:text-fg"
        >
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </span>
        {depth === 0 ? <HardDrive className="size-4 shrink-0" /> : <FileIcon mime="application/vnd.google-apps.folder" />}
        <span className="truncate">{name}</span>
      </button>
      {open && folders.map((f) => <TreeNode key={f.id} id={String(f.driveFileId)} name={String(f.title)} depth={depth + 1} selected={selected} onSelect={onSelect} />)}
    </div>
  );
}

export function FilesPage() {
  const { tr, locale } = useI18n();
  const { data: roots = [] } = useQuery({ queryKey: ["drive", "roots"], queryFn: () => api<{ id: string; name: string }[]>("/ws/drive/roots") });
  const [folder, setFolder] = useState<{ id: string; name: string } | null>(null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [type, setType] = useState<"all" | "pdf" | "doc" | "sheet" | "media">("all");
  const [selected, setSelected] = useState<Row | null>(null);
  const [full, setFull] = useState<Row | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!folder && roots[0]) setFolder(roots[0]);
  }, [roots, folder]);
  const searching = debounced.length > 1 || type !== "all";
  const { data: list = [], isFetching } = useQuery({
    queryKey: ["drive", searching ? "search" : "children", searching ? `${debounced}|${type}` : folder?.id],
    queryFn: () => (searching ? api<Row[]>(`/ws/drive/search?q=${encodeURIComponent(debounced)}&type=${type}`) : api<Row[]>(`/ws/drive/children?parent=${folder!.id}`)),
    enabled: searching || Boolean(folder),
  });

  return (
    <AppShell
      title={tr({ fr: "Documents", en: "Documents" })}
      actions={
        <Button size="md" variant="ghost" onClick={() => api("/ws/sync/drive-sync", { method: "POST" })} title={tr({ fr: "Synchroniser le Drive", en: "Sync Drive" })}>
          <RefreshCw /> {tr({ fr: "Synchroniser", en: "Sync" })}
        </Button>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <DocsTabs active="files" />
        <div className="flex min-h-0 flex-1">
          {/* Tree */}
          <aside className="w-60 shrink-0 overflow-y-auto border-r border-border px-2 py-3">
            {roots.map((r) => (
              <TreeNode key={r.id} id={r.id} name={r.name} depth={0} selected={folder?.id ?? null} onSelect={(id, name) => { setFolder({ id, name }); setQ(""); setType("all"); }} />
            ))}
            {!roots.length && <div className="px-2 text-xs text-subtle">{tr({ fr: "Synchronisation du Drive en cours…", en: "Drive sync in progress…" })}</div>}
          </aside>

          {/* List */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr({ fr: "Rechercher dans le nom et le contenu…", en: "Search name and content…" })} className="h-8 w-80 rounded-lg border border-border pl-8 pr-7 text-[13px] outline-none focus:ring-3 focus:ring-accent/15" />
                {q && (
                  <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle hover:text-fg">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <Segmented
                value={type}
                onChange={setType}
                options={[
                  { value: "all", label: tr({ fr: "Tout", en: "All" }) },
                  { value: "pdf", label: "PDF" },
                  { value: "doc", label: "Docs" },
                  { value: "sheet", label: "Sheets" },
                  { value: "media", label: tr({ fr: "Médias", en: "Media" }) },
                ]}
              />
              {isFetching && <RefreshCw className="size-3.5 animate-spin text-subtle" />}
              <span className="ml-auto truncate text-xs text-subtle">{searching ? `${list.length} ${tr({ fr: "résultats", en: "results" })}` : folder?.name}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {list.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => (d.isFolder ? setFolder({ id: String(d.driveFileId), name: String(d.title) }) : setSelected(d))}
                  onDoubleClick={() => !d.isFolder && setFull(d)}
                  className={cn("grid w-full grid-cols-[minmax(0,1fr)_120px_80px] items-center gap-3 border-b border-border px-4 py-2 text-left hover:bg-hover/60", selected?.id === d.id && "bg-accent/5")}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <FileIcon mime={String(d.mimeType ?? "")} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px]">{String(d.title)}</span>
                      {searching && <span className="block truncate text-[11px] text-subtle">{String(d.path ?? "").split("/").slice(0, -1).join(" / ")}</span>}
                    </span>
                  </span>
                  <span className="text-xs text-subtle">{d.modifiedAt ? fmtDate(d.modifiedAt, locale) : ""}</span>
                  <span className="text-right text-xs tabular-nums text-subtle">{d.isFolder ? "" : humanSize(d.size)}</span>
                </button>
              ))}
              {!list.length && !isFetching && <div className="p-10 text-center text-[13px] text-subtle">{tr({ fr: "Aucun fichier.", en: "No files." })}</div>}
            </div>
          </div>

          {/* Preview + links */}
          {selected && <Inspector doc={selected} onClose={() => setSelected(null)} onFull={() => setFull(selected)} />}
        </div>
      </div>
      {full && <PreviewOverlay doc={full} onClose={() => setFull(null)} />}
    </AppShell>
  );
}

function Inspector({ doc, onClose, onFull }: { doc: Row; onClose: () => void; onFull: () => void }) {
  const { tr } = useI18n();
  const { data } = useRecord("document", doc.id);
  const update = useUpdateRecord("document");
  const url = filePreviewUrl(doc);
  const def = TABLES.document;
  const links = ["organizationId", "projectId", "invoiceId", "quoteId", "billId", "type"];
  return (
    <aside className="flex w-[440px] shrink-0 flex-col border-l border-border">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <FileIcon mime={String(doc.mimeType ?? "")} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{String(doc.title)}</span>
        <Button size="icon-sm" variant="ghost" onClick={onFull} title={tr({ fr: "Plein écran", en: "Full screen" })}>
          <Maximize2 />
        </Button>
        {doc.webViewLink ? (
          <a href={String(doc.webViewLink)} target="_blank" rel="noreferrer" className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg" title="Drive">
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
        <Button size="icon-sm" variant="ghost" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="h-[55%] min-h-60 border-b border-border bg-surface-2">{url ? <iframe key={url} title="preview" src={url} className="size-full bg-white" /> : <Skeleton className="size-full" />}</div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle">{tr({ fr: "Lié à", en: "Linked to" })}</div>
        {data ? (
          links.map((k) => {
            const f = def.fields.find((x) => x.key === k)!;
            return (
              <div key={k} className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                <span className="truncate text-xs text-muted">{tr(f.label)}</span>
                <PropertyValue field={f} row={data.row} refs={data.refs} table="document" onSave={(v) => update.mutate({ id: doc.id, patch: { [k]: v } })} />
              </div>
            );
          })
        ) : (
          <Skeleton className="h-32" />
        )}
        <div className="mt-3 break-all text-[11px] text-subtle">{String(doc.path ?? "")}</div>
      </div>
    </aside>
  );
}
