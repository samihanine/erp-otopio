/** Website CMS editors: image upload (Cloudflare R2), page sections and translations. */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ImagePlus, Languages, Link2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { TABLES, type FieldDef, type TableKey } from "@erp/shared";
import { api, type Row } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { qk } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/input";

export async function uploadPublicImage(file: File, table: string, recordId?: string) {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("table", table);
  fd.set("public", "1");
  if (recordId) fd.set("recordId", recordId);
  const res = await fetch("/api/files", { method: "POST", body: fd, credentials: "include" });
  const j = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !j.url) throw new Error(j.error ?? "Upload failed");
  return j.url;
}

/* --------------------------------- Image ---------------------------------- */

export function ImageField({ value, onSave, table, recordId, compact }: { value: unknown; onSave: (v: string | null) => void; table: string; recordId?: string; compact?: boolean }) {
  const { tr } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [editUrl, setEditUrl] = useState(false);
  const url = value ? String(value) : "";
  const pick = async (f?: File | null) => {
    if (!f) return;
    setBusy(true);
    try {
      onSave(await uploadPublicImage(f, table, recordId));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-8 w-full items-center gap-2 px-2 py-1" onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), pick(e.dataTransfer.files[0]))}>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
          <img src={url} alt="" className={cn("rounded-md object-cover ring-1 ring-border", compact ? "h-8 w-12" : "h-16 w-24")} />
        </a>
      ) : null}
      {editUrl ? (
        <input
          autoFocus
          defaultValue={url}
          onBlur={(e) => {
            setEditUrl(false);
            if (e.target.value !== url) onSave(e.target.value || null);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className={cn(inputClass, "h-7 flex-1")}
          placeholder="https://…"
        />
      ) : (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => input.current?.click()} disabled={busy}>
            <ImagePlus /> {busy ? tr({ fr: "Envoi…", en: "Uploading…" }) : url ? tr({ fr: "Remplacer", en: "Replace" }) : tr({ fr: "Ajouter une image", en: "Add image" })}
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setEditUrl(true)} title="URL">
            <Link2 />
          </Button>
          {url && (
            <Button size="icon-sm" variant="ghost" onClick={() => onSave(null)}>
              <X />
            </Button>
          )}
        </div>
      )}
      <input ref={input} type="file" accept="image/*,video/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

/* -------------------------------- Sections -------------------------------- */

type Sub = { title?: string; description?: string; imageUrl?: string; lucideIcon?: string };
type Section = Sub & { type: string; subsections?: Sub[] };
const LAYOUTS = ["image-text", "text-image", "card", "cards", "banner", "gallery", "stats", "quote"];

function SubEditor({ value, onChange, table, recordId, withType }: { value: Section | Sub; onChange: (v: Section | Sub) => void; table: string; recordId: string; withType?: boolean }) {
  const { tr } = useI18n();
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v || undefined });
  return (
    <div className="grid gap-1.5">
      <div className="flex gap-1.5">
        {withType && (
          <select value={(value as Section).type} onChange={(e) => set("type", e.target.value)} className={cn(inputClass, "h-8 w-36")}>
            {LAYOUTS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        )}
        <input value={value.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder={tr({ fr: "Titre", en: "Title" })} className={cn(inputClass, "h-8 flex-1")} />
        <input value={value.lucideIcon ?? ""} onChange={(e) => set("lucideIcon", e.target.value)} placeholder="Icône" className={cn(inputClass, "h-8 w-28")} />
      </div>
      <textarea value={value.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Description" className={cn(inputClass, "h-auto py-1.5")} />
      <div className="rounded-lg border border-border">
        <ImageField value={value.imageUrl} onSave={(v) => set("imageUrl", v)} table={table} recordId={recordId} compact />
      </div>
    </div>
  );
}

export function SectionsEditor({ value, onSave, table, recordId }: { value: unknown; onSave: (v: Section[]) => void; table: string; recordId: string }) {
  const { tr } = useI18n();
  const [list, setList] = useState<Section[]>(() => (Array.isArray(value) ? (value as Section[]) : []));
  const [dirty, setDirty] = useState(false);
  const update = (next: Section[]) => {
    setList(next);
    setDirty(true);
  };
  const move = (i: number, d: number) => {
    const n = [...list];
    const [s] = n.splice(i, 1);
    n.splice(i + d, 0, s!);
    update(n);
  };
  return (
    <div className="space-y-3">
      {list.map((s, i) => (
        <div key={i} className="rounded-xl border border-border p-3">
          <div className="mb-2 flex items-center gap-1 text-xs text-subtle">
            <span className="font-medium">#{i + 1}</span>
            <span className="ml-auto" />
            <Button size="icon-sm" variant="ghost" disabled={!i} onClick={() => move(i, -1)}>
              <ArrowUp />
            </Button>
            <Button size="icon-sm" variant="ghost" disabled={i === list.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => update(list.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </div>
          <SubEditor withType value={s} onChange={(v) => update(list.map((x, j) => (j === i ? (v as Section) : x)))} table={table} recordId={recordId} />
          {(s.subsections?.length || ["cards", "gallery", "stats", "card"].includes(s.type)) && (
            <div className="mt-2 space-y-2 border-l-2 border-border pl-3">
              {(s.subsections ?? []).map((sub, k) => (
                <div key={k} className="relative">
                  <button type="button" onClick={() => update(list.map((x, j) => (j === i ? { ...x, subsections: x.subsections!.filter((_, m) => m !== k) } : x)))} className="absolute -left-6 top-1 text-subtle hover:text-rose-600">
                    <X className="size-3.5" />
                  </button>
                  <SubEditor value={sub} onChange={(v) => update(list.map((x, j) => (j === i ? { ...x, subsections: x.subsections!.map((y, m) => (m === k ? v : y)) } : x)))} table={table} recordId={recordId} />
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={() => update(list.map((x, j) => (j === i ? { ...x, subsections: [...(x.subsections ?? []), {}] } : x)))}>
                <Plus /> {tr({ fr: "Sous-section", en: "Sub-section" })}
              </Button>
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => update([...list, { type: "image-text" }])}>
          <Plus /> {tr({ fr: "Ajouter une section", en: "Add section" })}
        </Button>
        {dirty && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              onSave(list);
              setDirty(false);
            }}
          >
            {tr({ fr: "Enregistrer les sections", en: "Save sections" })}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Translations ------------------------------ */

const LANGS = [{ code: "en", label: "English" }];

export function TranslationsPanel({ table, row, onSave }: { table: TableKey; row: Row; onSave: (translations: Record<string, Record<string, unknown>>) => void }) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const def = TABLES[table];
  const fields = (def.translatable ?? []).map((k) => def.fields.find((f) => f.key === k)).filter(Boolean) as FieldDef[];
  const all = (row.translations ?? {}) as Record<string, Record<string, unknown>>;
  const [lang, setLang] = useState("en");
  const [busy, setBusy] = useState(false);
  const cur = all[lang] ?? {};
  const set = (k: string, v: unknown) => onSave({ ...all, [lang]: { ...cur, [k]: v } });
  const auto = async () => {
    setBusy(true);
    try {
      await api(`/website/translate/${table}/${row.id}?to=${lang}`, { method: "POST" });
      await qc.invalidateQueries({ queryKey: qk.record(table, row.id) });
      toast.success(tr({ fr: "Traduction générée", en: "Translation generated" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const filled = fields.filter((f) => cur[f.key] != null && cur[f.key] !== "").length;
  return (
    <div className="mt-8 rounded-2xl border border-border">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Languages className="size-4 text-subtle" />
        <span className="text-[13px] font-medium">{tr({ fr: "Traductions", en: "Translations" })}</span>
        <span className="text-xs text-subtle">
          FR → {LANGS.find((l) => l.code === lang)?.label} · {filled}/{fields.length}
        </span>
        <select value={lang} onChange={(e) => setLang(e.target.value)} className="ml-auto h-7 rounded-md border border-border bg-surface px-2 text-xs">
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <Button size="sm" variant="secondary" onClick={auto} disabled={busy}>
          <Sparkles /> {busy ? "…" : tr({ fr: "Traduire avec l'IA", en: "Translate with AI" })}
        </Button>
      </div>
      <div className="space-y-3 p-4">
        {fields.map((f) => (
          <div key={f.key}>
            <div className="mb-1 flex items-center gap-2 text-xs text-muted">
              {tr(f.label)}
              <span className="truncate text-subtle">— FR : {f.type === "sections" ? `${(row[f.key] as unknown[] | null)?.length ?? 0} sections` : String(row[f.key] ?? "").slice(0, 80)}</span>
            </div>
            {f.type === "sections" ? (
              <textarea
                defaultValue={cur[f.key] ? JSON.stringify(cur[f.key], null, 2) : ""}
                onBlur={(e) => {
                  try {
                    set(f.key, e.target.value.trim() ? JSON.parse(e.target.value) : null);
                  } catch {
                    toast.error("JSON invalide");
                  }
                }}
                rows={4}
                placeholder={tr({ fr: "Générées par « Traduire avec l'IA » (même structure que les sections FR)", en: "Generated by “Translate with AI”" })}
                className={cn(inputClass, "h-auto py-2 font-mono text-xs")}
              />
            ) : f.type === "tags" ? (
              <input
                key={JSON.stringify(cur[f.key] ?? [])}
                defaultValue={((cur[f.key] as string[] | undefined) ?? []).join(", ")}
                onBlur={(e) => set(f.key, e.target.value.split(",").map((x) => x.trim()).filter(Boolean))}
                placeholder="tag 1, tag 2"
                className={inputClass}
              />
            ) : f.type === "longtext" ? (
              <textarea key={String(cur[f.key] ?? "")} defaultValue={String(cur[f.key] ?? "")} onBlur={(e) => e.target.value !== (cur[f.key] ?? "") && set(f.key, e.target.value)} rows={f.key === "content" ? 10 : 3} className={cn(inputClass, "h-auto py-2")} />
            ) : (
              <input key={String(cur[f.key] ?? "")} defaultValue={String(cur[f.key] ?? "")} onBlur={(e) => e.target.value !== (cur[f.key] ?? "") && set(f.key, e.target.value)} className={inputClass} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
