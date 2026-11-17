import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ChevronDown, ChevronRight, ExternalLink, FolderInput, HardDrive, LayoutGrid, List, Maximize2, MoreHorizontal, Pencil, RefreshCw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { TABLES } from "@erp/shared";
import { AppShell } from "@/components/layout/app-shell";
import { api, type Row } from "@/lib/api";
import { fmtDate, useI18n } from "@/lib/i18n";
import { useRecord, useUpdateRecord } from "@/lib/data";
import { usePref } from "@/lib/use-media";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { PropertyValue } from "@/components/database/fields";
import { FileIcon, filePreviewUrl, humanSize } from "./drive-ui";
import { PreviewOverlay } from "./clients";

type Folder = { id: string; name: string; path?: string };
const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRAG_TYPE = "application/x-erp-drive";

export function DocsTabs({ active }: { active: "files" | "models" }) {
  const { tr } = useI18n();
  return (
    <div className="flex gap-1 border-b border-border px-4 md:px-6">
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

/* ----------------------------------- data ---------------------------------- */

function useExplorerActions() {
  const qc = useQueryClient();
  const { tr } = useI18n();
  const refresh = () => qc.invalidateQueries({ queryKey: ["drive"] });
  const run = async (p: Promise<unknown>, ok: string) => {
    try {
      await p;
      toast.success(ok);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return {
    rename: (d: Row, name: string) => run(api(`/ws/drive/file/${d.driveFileId}`, { method: "PATCH", json: { name } }), tr({ fr: "Renommé", en: "Renamed" })),
    move: (d: Row, parent: string, label: string) => run(api(`/ws/drive/file/${d.driveFileId}`, { method: "PATCH", json: { parent } }), `${tr({ fr: "Déplacé vers", en: "Moved to" })} ${label}`),
    archive: (d: Row) => run(api(`/ws/drive/file/${d.driveFileId}/archive`, { method: "POST" }), tr({ fr: "Archivé", en: "Archived" })),
    remove: (d: Row) => run(api(`/ws/drive/file/${d.driveFileId}`, { method: "DELETE" }), tr({ fr: "Mis à la corbeille du Drive", en: "Moved to Drive trash" })),
  };
}

/* ----------------------------------- tree ---------------------------------- */

function TreeNode({ folder, depth, selected, onSelect, onDropItem, defaultOpen }: { folder: Folder; depth: number; selected: string | null; onSelect: (f: Folder) => void; onDropItem: (target: Folder, driveFileId: string) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [over, setOver] = useState(false);
  const { data = [] } = useQuery({ queryKey: ["drive", "children", folder.id], queryFn: () => api<Row[]>(`/ws/drive/children?parent=${folder.id}`), enabled: open });
  const folders = data.filter((d) => d.isFolder && d.title !== "_Archives");
  return (
    <div>
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DRAG_TYPE)) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          const id = e.dataTransfer.getData(DRAG_TYPE);
          if (id && id !== folder.id) onDropItem(folder, id);
        }}
        className={cn("flex h-8 items-center rounded-md pr-2 text-[13px] text-muted hover:bg-hover hover:text-fg", selected === folder.id && "bg-hover font-medium text-fg", over && "bg-accent/10 ring-1 ring-inset ring-accent/40")}
        style={{ paddingLeft: 4 + depth * 16 }}
      >
        <button type="button" onClick={() => setOpen(!open)} className="grid size-5 shrink-0 place-items-center rounded text-subtle hover:text-fg" aria-label="toggle">
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <button type="button" onClick={() => onSelect(folder)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="grid size-5 shrink-0 place-items-center">{depth === 0 ? <HardDrive className="size-4" /> : <FileIcon mime={FOLDER_MIME} />}</span>
          <span className="truncate">{folder.name}</span>
        </button>
      </div>
      {open && folders.map((f) => <TreeNode key={f.id} folder={{ id: String(f.driveFileId), name: String(f.title), path: String(f.path ?? "") }} depth={depth + 1} selected={selected} onSelect={onSelect} onDropItem={onDropItem} />)}
    </div>
  );
}

/* ---------------------------------- page ----------------------------------- */

export function FilesPage() {
  const { tr, locale } = useI18n();
  const { data: roots = [] } = useQuery({ queryKey: ["drive", "roots"], queryFn: () => api<Folder[]>("/ws/drive/roots") });
  const [folder, setFolder] = useState<Folder | null>(null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [type, setType] = useState<"all" | "pdf" | "doc" | "sheet" | "media">("all");
  const [selected, setSelected] = useState<Row | null>(null);
  const [full, setFull] = useState<Row | null>(null);
  const [grid, setGrid] = usePref("erp.files.grid", false);
  const [renaming, setRenaming] = useState<Row | null>(null);
  const [moving, setMoving] = useState<Row | null>(null);
  const actions = useExplorerActions();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!folder && roots[0]) setFolder(roots[0]);
  }, [roots, folder]);
  const searching = debounced.length > 1 || type !== "all";
  const { data: list = [], isFetching } = useQuery({
    queryKey: ["drive", searching ? "search" : "children", searching ? `${debounced}|${type}|${folder?.id}` : folder?.id],
    queryFn: () =>
      searching
        ? api<Row[]>(`/ws/drive/search?q=${encodeURIComponent(debounced)}&type=${type}${folder ? `&parent=${folder.id}` : ""}`)
        : api<Row[]>(`/ws/drive/children?parent=${folder!.id}`),
    enabled: searching || Boolean(folder),
  });
  const items = useMemo(() => list.filter((d) => d.title !== "_Archives"), [list]);
  const crumbs = useMemo(() => {
    const parts = (folder?.path || folder?.name || "").split("/").filter(Boolean);
    return parts;
  }, [folder]);

  const openItem = (d: Row) => {
    if (d.isFolder) {
      setFolder({ id: String(d.driveFileId), name: String(d.title), path: String(d.path ?? "") });
      setQ("");
      setType("all");
      setSelected(null);
    } else setSelected(d);
  };
  const dropOnFolder = (target: Folder, driveFileId: string) => {
    const d = items.find((x) => x.driveFileId === driveFileId) ?? (selected?.driveFileId === driveFileId ? selected : null);
    if (d) actions.move(d, target.id, target.name);
  };

  const menu = (d: Row) => (
    <Dropdown>
      <DropdownTrigger asChild>
        <button type="button" onClick={(e) => e.stopPropagation()} className="grid size-7 shrink-0 place-items-center rounded-md text-subtle opacity-0 hover:bg-hover hover:text-fg group-hover:opacity-100 data-[state=open]:opacity-100" aria-label="actions">
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownTrigger>
      <DropdownContent align="end" onClick={(e) => e.stopPropagation()}>
        {!d.isFolder && (
          <DropdownItem onSelect={() => setFull(d)}>
            <Maximize2 /> {tr({ fr: "Aperçu", en: "Preview" })}
          </DropdownItem>
        )}
        {d.webViewLink ? (
          <DropdownItem onSelect={() => window.open(String(d.webViewLink), "_blank")}>
            <ExternalLink /> {tr({ fr: "Ouvrir dans Drive", en: "Open in Drive" })}
          </DropdownItem>
        ) : null}
        <DropdownSeparator />
        <DropdownItem onSelect={() => setRenaming(d)}>
          <Pencil /> {tr({ fr: "Renommer", en: "Rename" })}
        </DropdownItem>
        <DropdownItem onSelect={() => setMoving(d)}>
          <FolderInput /> {tr({ fr: "Déplacer vers…", en: "Move to…" })}
        </DropdownItem>
        <DropdownItem onSelect={() => actions.archive(d)}>
          <Archive /> {tr({ fr: "Archiver", en: "Archive" })}
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem
          danger
          onSelect={() => {
            if (confirm(tr({ fr: `Mettre « ${d.title} » à la corbeille du Drive ? (récupérable 30 jours)`, en: `Move "${d.title}" to the Drive trash? (recoverable 30 days)` }))) actions.remove(d);
          }}
        >
          <Trash2 /> {tr({ fr: "Supprimer", en: "Delete" })}
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );

  const dragProps = (d: Row) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, String(d.driveFileId));
      e.dataTransfer.effectAllowed = "move";
    },
  });
  const folderDrop = (d: Row) =>
    d.isFolder
      ? {
          onDragOver: (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE) && e.preventDefault(),
          onDrop: (e: React.DragEvent) => {
            const id = e.dataTransfer.getData(DRAG_TYPE);
            if (id && id !== d.driveFileId) dropOnFolder({ id: String(d.driveFileId), name: String(d.title) }, id);
          },
        }
      : {};

  return (
    <AppShell
      title={tr({ fr: "Documents", en: "Documents" })}
      actions={
        <Button size="md" variant="ghost" onClick={() => api("/ws/sync/drive-sync", { method: "POST" }).then(() => toast.success(tr({ fr: "Synchronisation lancée", en: "Sync started" })))} title={tr({ fr: "Synchroniser le Drive", en: "Sync Drive" })}>
          <RefreshCw className={cn(isFetching && "animate-spin")} /> <span className="max-sm:hidden">{tr({ fr: "Synchroniser", en: "Sync" })}</span>
        </Button>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <DocsTabs active="files" />
        <div className="flex min-h-0 flex-1">
          {/* Tree */}
          <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-border px-2 py-3 md:block">
            {roots.map((r) => (
              <TreeNode key={r.id} folder={{ ...r, path: r.name }} depth={0} defaultOpen selected={folder?.id ?? null} onSelect={(f) => openItem({ id: f.id, isFolder: true, driveFileId: f.id, title: f.name, path: f.path })} onDropItem={dropOnFolder} />
            ))}
            {!roots.length && <div className="px-2 text-xs text-subtle">{tr({ fr: "Synchronisation du Drive en cours…", en: "Drive sync in progress…" })}</div>}
          </aside>

          {/* Content */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 md:px-4">
              {/* breadcrumb */}
              <div className="flex min-w-0 items-center gap-1 text-[13px] max-md:w-full">
                {crumbs.map((c, i) => (
                  <span key={i} className="flex min-w-0 items-center gap-1">
                    {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-subtle" />}
                    <span className={cn("truncate", i === crumbs.length - 1 ? "font-medium" : "text-muted")}>{c}</span>
                  </span>
                ))}
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2 max-md:ml-0 max-md:w-full">
                <div className="relative max-md:flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={tr({ fr: `Rechercher dans ${folder?.name ?? "le Drive"}…`, en: `Search in ${folder?.name ?? "Drive"}…` })}
                    className="h-8 w-72 rounded-lg border border-border pl-8 pr-7 text-[13px] outline-none focus:ring-3 focus:ring-accent/15 max-md:w-full"
                  />
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
                <Segmented value={grid ? "grid" : "list"} onChange={(v) => setGrid(v === "grid")} options={[{ value: "list", label: <List className="size-3.5" /> }, { value: "grid", label: <LayoutGrid className="size-3.5" /> }]} />
              </div>
            </div>
            {searching && (
              <div className="border-b border-border bg-surface-2/50 px-4 py-1.5 text-xs text-muted">
                {items.length} {tr({ fr: "résultat(s) dans", en: "result(s) in" })} <strong className="font-medium text-fg">{folder?.name}</strong> {tr({ fr: "et ses sous-dossiers", en: "and subfolders" })}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {grid ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-1 p-3">
                  {items.map((d) => (
                    <div
                      key={d.id}
                      {...dragProps(d)}
                      {...folderDrop(d)}
                      onClick={() => (d.isFolder ? openItem(d) : setSelected(d))}
                      onDoubleClick={() => !d.isFolder && setFull(d)}
                      className={cn("group relative flex cursor-default flex-col items-center gap-2 rounded-xl px-2 pb-3 pt-4 text-center hover:bg-hover/70", selected?.id === d.id && "bg-accent/10 ring-1 ring-inset ring-accent/30")}
                      title={String(d.title)}
                    >
                      <div className="absolute right-1 top-1">{menu(d)}</div>
                      <FileIcon mime={String(d.mimeType ?? "")} className="size-12 [stroke-width:1.2]" />
                      <span className="line-clamp-2 w-full break-words text-[12px] leading-tight">{String(d.title)}</span>
                      {!d.isFolder && <span className="text-[10.5px] text-subtle">{d.modifiedAt ? fmtDate(d.modifiedAt, locale) : ""}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <div className="sticky top-0 z-[1] grid grid-cols-[minmax(0,1fr)_120px_80px_36px] gap-3 border-b border-border bg-surface px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle max-sm:grid-cols-[minmax(0,1fr)_36px]">
                    <span>{tr({ fr: "Nom", en: "Name" })}</span>
                    <span className="max-sm:hidden">{tr({ fr: "Modifié", en: "Modified" })}</span>
                    <span className="text-right max-sm:hidden">{tr({ fr: "Taille", en: "Size" })}</span>
                    <span />
                  </div>
                  {items.map((d) => (
                    <div
                      key={d.id}
                      {...dragProps(d)}
                      {...folderDrop(d)}
                      onClick={() => openItem(d)}
                      onDoubleClick={() => !d.isFolder && setFull(d)}
                      className={cn("group grid cursor-default grid-cols-[minmax(0,1fr)_120px_80px_36px] items-center gap-3 border-b border-border px-4 py-1.5 hover:bg-hover/60 max-sm:grid-cols-[minmax(0,1fr)_36px]", selected?.id === d.id && "bg-accent/5")}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="grid size-5 shrink-0 place-items-center">
                          <FileIcon mime={String(d.mimeType ?? "")} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px]">{String(d.title)}</span>
                          {searching && <span className="block truncate text-[11px] text-subtle">{String(d.path ?? "").split("/").slice(0, -1).join(" / ")}</span>}
                        </span>
                      </span>
                      <span className="text-xs text-subtle max-sm:hidden">{d.modifiedAt ? fmtDate(d.modifiedAt, locale) : ""}</span>
                      <span className="text-right text-xs tabular-nums text-subtle max-sm:hidden">{d.isFolder ? "" : humanSize(d.size)}</span>
                      {menu(d)}
                    </div>
                  ))}
                </div>
              )}
              {!items.length && !isFetching && <div className="p-10 text-center text-[13px] text-subtle">{searching ? tr({ fr: "Aucun fichier de ce type dans ce dossier.", en: "No matching files in this folder." }) : tr({ fr: "Dossier vide.", en: "Empty folder." })}</div>}
            </div>
            <div className="border-t border-border px-4 py-1.5 text-[11px] text-subtle max-md:hidden">
              {tr({ fr: "Glissez un fichier sur un dossier pour le déplacer · double-clic pour l'aperçu · menu « … » pour renommer, archiver ou supprimer.", en: "Drag a file onto a folder to move it · double-click to preview · “…” menu to rename, archive or delete." })}
            </div>
          </div>

          {/* Preview + links */}
          {selected && <Inspector doc={selected} onClose={() => setSelected(null)} onFull={() => setFull(selected)} />}
        </div>
      </div>
      {full && <PreviewOverlay doc={full} onClose={() => setFull(null)} />}
      <RenameDialog doc={renaming} onClose={() => setRenaming(null)} onSave={(d, n) => actions.rename(d, n)} />
      <MoveDialog doc={moving} roots={roots} onClose={() => setMoving(null)} onMove={(d, f) => actions.move(d, f.id, f.name)} />
    </AppShell>
  );
}

function RenameDialog({ doc, onClose, onSave }: { doc: Row | null; onClose: () => void; onSave: (d: Row, name: string) => void }) {
  const { tr } = useI18n();
  const [name, setName] = useState("");
  useEffect(() => setName(String(doc?.title ?? "")), [doc]);
  return (
    <Dialog open={Boolean(doc)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={tr({ fr: "Renommer", en: "Rename" })}>
        <form
          className="space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (doc && name.trim() && name !== doc.title) onSave(doc, name.trim());
            onClose();
          }}
        >
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-full rounded-lg border border-border px-3 text-[13px] outline-none focus:ring-3 focus:ring-accent/15" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {tr({ fr: "Annuler", en: "Cancel" })}
            </Button>
            <Button type="submit" variant="primary">
              {tr({ fr: "Renommer", en: "Rename" })}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({ doc, roots, onClose, onMove }: { doc: Row | null; roots: Folder[]; onClose: () => void; onMove: (d: Row, f: Folder) => void }) {
  const { tr } = useI18n();
  const [target, setTarget] = useState<Folder | null>(null);
  useEffect(() => setTarget(null), [doc]);
  const root = roots.find((r) => r.id === doc?.driveId);
  return (
    <Dialog open={Boolean(doc)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`${tr({ fr: "Déplacer", en: "Move" })} « ${doc?.title ?? ""} »`} description={tr({ fr: "Choisissez le dossier de destination.", en: "Pick the destination folder." })}>
        <div className="max-h-[50vh] overflow-y-auto p-3">
          {root ? <TreeNode folder={{ ...root, path: root.name }} depth={0} defaultOpen selected={target?.id ?? null} onSelect={setTarget} onDropItem={() => {}} /> : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <span className="mr-auto truncate text-xs text-muted">{target ? target.path || target.name : ""}</span>
          <Button variant="ghost" onClick={onClose}>
            {tr({ fr: "Annuler", en: "Cancel" })}
          </Button>
          <Button
            variant="primary"
            disabled={!target || target.id === doc?.parentId}
            onClick={() => {
              if (doc && target) onMove(doc, target);
              onClose();
            }}
          >
            {tr({ fr: "Déplacer ici", en: "Move here" })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
    <aside className="fixed inset-0 z-30 flex flex-col border-l border-border bg-surface lg:static lg:z-auto lg:w-[420px] lg:shrink-0">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="grid size-5 shrink-0 place-items-center">
          <FileIcon mime={String(doc.mimeType ?? "")} />
        </span>
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
