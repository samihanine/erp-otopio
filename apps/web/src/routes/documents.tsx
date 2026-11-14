import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Download, ExternalLink, FilePlus2, FileSignature, GripVertical, Mail, Plus, Receipt, RefreshCw, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { computeTotals, formatMoney, miniMarkdown, renderDocumentHtml, TABLES, type Line, type TaxRate } from "@erp/shared";
import { AppShell } from "@/components/layout/app-shell";
import { api, type Row } from "@/lib/api";
import { fmtDate, useI18n } from "@/lib/i18n";
import { recordLabel, useCreateRecord, useList, useRecord, useUpdateRecord } from "@/lib/data";
import { cn, uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, inputClass, Textarea } from "@/components/ui/input";
import { Icon, OptionBadge, Segmented, Skeleton, StatusDot } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PropertyValue } from "@/components/database/fields";

/* -------------------------------------------------------------------------- */
/*  Index                                                                     */
/* -------------------------------------------------------------------------- */

const TYPE_COLORS: Record<string, string> = { quote: "#6366f1", invoice: "#10b981", contract: "#f97316", sow: "#0ea5e9", nda: "#64748b", report: "#ec4899", free: "#a1a1aa" };

export function DocumentsPage() {
  const { tr, t, locale } = useI18n();
  const navigate = useNavigate();
  const { data: templates } = useDocs("template");
  const { data: free } = useDocs("document");
  const { data: quotes } = useList("quote", { sorts: [{ field: "issueDate", dir: "desc" }], limit: 8 });
  const { data: invoices } = useList("invoice", { sorts: [{ field: "issueDate", dir: "desc" }], limit: 8 });
  const createQuote = useCreateRecord("quote");
  const createInvoice = useCreateRecord("invoice");

  const newDoc = async (kind: "quote" | "invoice") => {
    const res = await (kind === "quote" ? createQuote : createInvoice).mutateAsync({ status: "draft", issueDate: new Date().toISOString().slice(0, 10) });
    navigate({ to: "/documents/$kind/$id", params: { kind, id: res.row.id } });
  };

  return (
    <AppShell title={t("documents")}>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 pb-16 pt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight">{t("documents")}</h1>
              <p className="text-[13px] text-muted">{tr({ fr: "Devis, cahiers des charges, factures et documents libres — générés au format Otopio.", en: "Quotes, specs, invoices and free documents — generated in Otopio format." })}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => newDoc("quote")}>
                <FileSignature /> {tr({ fr: "Nouveau devis", en: "New quote" })}
              </Button>
              <Button variant="primary" onClick={() => newDoc("invoice")}>
                <Receipt /> {tr({ fr: "Nouvelle facture", en: "New invoice" })}
              </Button>
            </div>
          </div>

          {/* Google Docs integration */}
          <div className="mt-6 flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-card">
            <span className="grid size-11 place-items-center rounded-xl bg-[#1a73e8]/10">
              <svg viewBox="0 0 48 48" className="size-6"><path fill="#1a73e8" d="M29 4H12a4 4 0 0 0-4 4v32a4 4 0 0 0 4 4h24a4 4 0 0 0 4-4V15z"/><path fill="#a1c2fa" d="M29 4v11h11z"/><path fill="#fff" d="M15 23h18v2.5H15zm0 5h18v2.5H15zm0 5h12v2.5H15z"/></svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[14px] font-semibold">
                Google Docs & Drive <StatusDot ok={false} /> <span className="text-xs font-normal text-muted">{t("notConnected")}</span>
              </div>
              <p className="text-[13px] text-muted">{tr({ fr: "Synchronisez les templates avec Google Docs, enregistrez les PDF dans le Drive partagé et envoyez-les depuis Gmail.", en: "Sync templates with Google Docs, save PDFs to the shared Drive and send them from Gmail." })}</p>
            </div>
            <Button disabled title={t("comingSoon")}>
              {t("connect")} · {t("comingSoon")}
            </Button>
          </div>

          {/* Templates */}
          <h2 className="mb-3 mt-10 text-lg font-semibold">{tr({ fr: "Templates", en: "Templates" })}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(templates ?? []).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => (d.type === "quote" ? newDoc("quote") : d.type === "invoice" ? newDoc("invoice") : navigate({ to: "/documents/doc/$id", params: { id: d.id } }))}
                className="group relative overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="dot-grid relative h-28 border-b border-border bg-surface-2">
                  <div className="absolute bottom-0 left-6 h-20 w-32 rounded-t-lg border border-b-0 border-border bg-surface p-3 shadow-card transition group-hover:h-[86px]">
                    <div className="h-1.5 w-12 rounded-full" style={{ background: TYPE_COLORS[d.type] }} />
                    <div className="mt-2 space-y-1">
                      <div className="h-1 w-24 rounded-full bg-border" />
                      <div className="h-1 w-20 rounded-full bg-border" />
                      <div className="h-1 w-16 rounded-full bg-border" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4">
                  <span className="grid size-8 place-items-center rounded-lg text-white" style={{ background: TYPE_COLORS[d.type] }}>
                    <Icon name={d.icon ?? "FileText"} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{d.title}</div>
                    <div className="text-xs text-muted">{d.type === "quote" || d.type === "invoice" ? tr({ fr: "Génération auto + PDF", en: "Auto-generated + PDF" }) : tr({ fr: "Modèle de document", en: "Document template" })}</div>
                  </div>
                  <FilePlus2 className="size-4 text-subtle transition group-hover:text-fg" />
                </div>
              </button>
            ))}
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <DocList title={tr(TABLES.quote.label)} kind="quote" rows={quotes?.rows ?? []} refs={quotes?.refs ?? {}} />
            <DocList title={tr(TABLES.invoice.label)} kind="invoice" rows={invoices?.rows ?? []} refs={invoices?.refs ?? {}} />
          </div>

          <h2 className="mb-3 mt-10 text-lg font-semibold">{tr({ fr: "Documents libres", en: "Free documents" })}</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            {(free ?? []).map((d) => (
              <Link key={d.id} to="/documents/doc/$id" params={{ id: d.id }} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-hover">
                <span className="grid size-8 place-items-center rounded-lg" style={{ background: `${TYPE_COLORS[d.type]}1a`, color: TYPE_COLORS[d.type] }}>
                  <Icon name="FileText" className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{d.title}</span>
                  <span className="block text-xs text-subtle">{d.googleDocId ? "Google Docs" : tr({ fr: "Document ERP", en: "ERP document" })} · {fmtDate(d.updatedAt, locale)}</span>
                </span>
                {d.googleDocId && <ExternalLink className="size-3.5 text-subtle" />}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

type Doc = { id: string; title: string; kind: string; type: string; icon: string | null; content: string | null; googleDocId: string | null; updatedAt: string };
function useDocs(kind: "template" | "document") {
  return useQuery({ queryKey: ["documents", kind], queryFn: () => api<Doc[]>(`/documents/list?kind=${kind}`) });
}

function DocList({ title, kind, rows, refs }: { title: string; kind: "quote" | "invoice"; rows: Row[]; refs: Record<string, Record<string, { label: string }>> }) {
  const { locale, tr } = useI18n();
  const status = TABLES[kind].fields.find((f) => f.key === "status")!;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Link to="/db/$table" params={{ table: kind }} className="text-[13px] text-muted hover:text-fg">
          {tr({ fr: "Tout voir", en: "View all" })} →
        </Link>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {rows.map((r) => (
          <Link key={r.id} to="/documents/$kind/$id" params={{ kind, id: r.id }} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-hover">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted">{String(r.number)}</span>
                <span className="truncate text-[13px] font-medium">{refs.organization?.[String(r.organizationId)]?.label ?? "—"}</span>
              </span>
              <span className="block truncate text-xs text-subtle">{String(r.title ?? "")}</span>
            </span>
            <span className="text-right">
              <span className="block text-[13px] font-medium tabular-nums">{formatMoney(Number(r.total), String(r.currency), locale)}</span>
              <span className="block text-[11px] text-subtle">{fmtDate(r.issueDate, locale)}</span>
            </span>
            <OptionBadge option={status.options!.find((o) => o.value === r.status)} />
          </Link>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Quote / invoice editor                                                    */
/* -------------------------------------------------------------------------- */

export function DocumentEditorPage() {
  const { kind, id } = useParams({ from: "/app/documents/$kind/$id" });
  const k = (kind === "quote" ? "quote" : "invoice") as "quote" | "invoice";
  const { tr, t, locale } = useI18n();
  const navigate = useNavigate();
  const { data, isLoading } = useRecord(k, id);
  const update = useUpdateRecord(k);
  const row = data?.row;
  const { data: entityData } = useRecord("legal_entity", row?.legalEntityId as string | undefined);
  const { data: clientData } = useRecord("organization", row?.organizationId as string | undefined);
  const { data: contactData } = useRecord("person", (row?.contactId as string | undefined) ?? undefined);
  const [lines, setLines] = useState<Line[]>([]);
  const [taxes, setTaxes] = useState<TaxRate[]>([]);
  const [previewLocale, setPreviewLocale] = useState<"fr" | "en">(locale);
  const [sendOpen, setSendOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (row && loadedFor.current !== row.id) {
      loadedFor.current = row.id;
      setLines((row.lines as Line[]) ?? []);
      setTaxes(((row.taxes as TaxRate[]) ?? []).map(({ code, label, rate }) => ({ code, label, rate })));
    }
  }, [row]);

  // Debounced save of lines/taxes
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scheduleSave = (nextLines: Line[], nextTaxes: TaxRate[]) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => update.mutate({ id, patch: { lines: nextLines, taxes: nextTaxes } }), 500);
  };
  const setL = (l: Line[]) => {
    setLines(l);
    scheduleSave(l, taxes);
  };
  const setT = (tx: TaxRate[]) => {
    setTaxes(tx);
    scheduleSave(lines, tx);
  };

  const totals = computeTotals(lines, taxes);
  const html = useMemo(() => {
    if (!row || !entityData) return "";
    const e = entityData.row;
    return renderDocumentHtml({
      kind: k,
      locale: previewLocale,
      number: String(row.number),
      title: row.title as string,
      issueDate: row.issueDate as string,
      dueDate: (k === "quote" ? row.validUntil : row.dueDate) as string,
      currency: String(row.currency),
      lines,
      taxes,
      amountPaid: Number(row.amountPaid ?? 0),
      introduction: row.introduction as string,
      scope: row.scope as string,
      terms: row.terms as string,
      entity: e as never,
      client: (clientData?.row as never) ?? null,
      contactName: contactData ? recordLabel("person", contactData.row) : null,
    });
  }, [row, entityData, clientData, contactData, lines, taxes, k, previewLocale]);

  if (isLoading || !row || !data)
    return (
      <AppShell>
        <div className="p-8">
          <Skeleton className="h-96 w-full" />
        </div>
      </AppShell>
    );

  const def = TABLES[k];
  const f = (key: string) => def.fields.find((x) => x.key === key)!;
  const save = (key: string, v: unknown) => update.mutate({ id, patch: { [key]: v } });
  const money = (n: number) => formatMoney(n, String(row.currency), locale);

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/documents/${k}/${id}/pdf?locale=${previewLocale}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${row.number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
      // fallback: browser print of the preview
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
        setTimeout(() => w.print(), 600);
      }
    } finally {
      setDownloading(false);
    }
  };

  const toInvoice = async () => {
    const inv = await api<{ id: string }>(`/documents/quote/${id}/invoice`, { method: "POST" });
    toast.success(tr({ fr: "Facture brouillon créée", en: "Draft invoice created" }));
    navigate({ to: "/documents/$kind/$id", params: { kind: "invoice", id: inv.id } });
  };

  const label = (key: string) => tr(f(key).label);
  const Prop = ({ k: key }: { k: string }) => (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-2">
      <span className="truncate text-[13px] text-muted">{label(key)}</span>
      <PropertyValue field={f(key)} row={row} refs={data.refs} table={k} onSave={(v) => save(key, v)} />
    </div>
  );

  return (
    <AppShell
      title={`${tr(def.singular)} ${row.number}`}
      actions={
        <div className="flex items-center gap-2">
          {k === "quote" && (
            <Button size="sm" onClick={toInvoice}>
              <Wand2 /> {tr({ fr: "Convertir en facture", en: "Convert to invoice" })}
            </Button>
          )}
          <Button size="sm" onClick={() => setSendOpen(true)}>
            <Mail /> {tr({ fr: "Envoyer", en: "Send" })}
          </Button>
          <Button size="sm" variant="primary" onClick={downloadPdf} disabled={downloading}>
            {downloading ? <RefreshCw className="animate-spin" /> : <Download />} PDF
          </Button>
        </div>
      }
    >
      <div className="flex h-full min-h-0">
        {/* Form */}
        <div className="w-[460px] shrink-0 overflow-y-auto border-r border-border bg-surface">
          <div className="p-6">
            <Link to="/documents" className="mb-4 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
              <ArrowLeft className="size-3" /> {t("documents")}
            </Link>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] text-muted">{String(row.number)}</span>
              <OptionBadge option={f("status").options!.find((o) => o.value === row.status)} />
            </div>
            <input
              key={String(row.title)}
              defaultValue={String(row.title ?? "")}
              onBlur={(e) => e.target.value !== row.title && save("title", e.target.value)}
              placeholder={tr({ fr: "Objet du document", en: "Document subject" })}
              className="mt-1 w-full bg-transparent text-[22px] font-semibold tracking-tight outline-none placeholder:text-subtle"
            />

            <div className="mt-4 space-y-0.5">
              <Prop k="status" />
              <Prop k="legalEntityId" />
              <Prop k="organizationId" />
              {k === "quote" && <Prop k="contactId" />}
              <Prop k="projectId" />
              <Prop k="number" />
              <Prop k="currency" />
              <Prop k="issueDate" />
              <Prop k={k === "quote" ? "validUntil" : "dueDate"} />
              {k === "invoice" && <Prop k="amountPaid" />}
            </div>

            {/* Lines */}
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wider text-subtle">{tr({ fr: "Lignes", en: "Line items" })}</h3>
                <Button size="xs" variant="ghost" onClick={() => setL([...lines, { id: uid(), description: "", quantity: 1, unitPrice: 0 }])}>
                  <Plus /> {tr({ fr: "Ligne", en: "Line" })}
                </Button>
              </div>
              <div className="space-y-2">
                {lines.map((l, i) => (
                  <div key={l.id} className="group rounded-xl border border-border bg-surface-2/50 p-2.5">
                    <div className="flex items-start gap-1.5">
                      <GripVertical className="mt-2 size-3.5 shrink-0 text-subtle" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <input value={l.description} onChange={(e) => setL(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} placeholder={tr({ fr: "Description", en: "Description" })} className={cn(inputClass, "font-medium")} />
                        <textarea value={l.details ?? ""} onChange={(e) => setL(lines.map((x, j) => (j === i ? { ...x, details: e.target.value } : x)))} placeholder={tr({ fr: "Détails (optionnel)", en: "Details (optional)" })} rows={1} className={cn(inputClass, "h-auto min-h-8 resize-y py-1.5 text-xs")} />
                        <div className="flex items-center gap-1.5">
                          <input type="number" value={l.quantity} onChange={(e) => setL(lines.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))} className={cn(inputClass, "w-20 text-right tabular-nums")} />
                          <span className="text-xs text-subtle">×</span>
                          <input type="number" value={l.unitPrice} onChange={(e) => setL(lines.map((x, j) => (j === i ? { ...x, unitPrice: Number(e.target.value) } : x)))} className={cn(inputClass, "w-32 text-right tabular-nums")} />
                          <span className="ml-auto text-[13px] font-medium tabular-nums">{money(l.quantity * l.unitPrice - (l.discount ?? 0))}</span>
                        </div>
                      </div>
                      <button type="button" onClick={() => setL(lines.filter((_, j) => j !== i))} className="rounded p-1 text-subtle opacity-0 hover:text-rose-600 group-hover:opacity-100">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {!lines.length && (
                  <button type="button" onClick={() => setL([{ id: uid(), description: "", quantity: 1, unitPrice: 0 }])} className="w-full rounded-xl border border-dashed border-border-strong py-6 text-[13px] text-muted hover:bg-hover">
                    <Plus className="mr-1 inline size-4" /> {tr({ fr: "Ajouter une première ligne", en: "Add a first line" })}
                  </button>
                )}
              </div>

              {/* Taxes + totals */}
              <div className="mt-3 rounded-xl border border-border p-3 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted">{tr({ fr: "Sous-total HT", en: "Subtotal" })}</span>
                  <span className="tabular-nums">{money(totals.subtotal)}</span>
                </div>
                {taxes.map((tx, i) => (
                  <div key={i} className="mt-1.5 flex items-center gap-1.5">
                    <input value={tx.label} onChange={(e) => setT(taxes.map((x, j) => (j === i ? { ...x, label: e.target.value, code: e.target.value } : x)))} className={cn(inputClass, "h-7 w-20")} />
                    <input type="number" step="0.001" value={Math.round(tx.rate * 100000) / 1000} onChange={(e) => setT(taxes.map((x, j) => (j === i ? { ...x, rate: Number(e.target.value) / 100 } : x)))} className={cn(inputClass, "h-7 w-20 text-right")} />
                    <span className="text-xs text-subtle">%</span>
                    <button type="button" onClick={() => setT(taxes.filter((_, j) => j !== i))} className="text-subtle hover:text-rose-600">
                      <Trash2 className="size-3" />
                    </button>
                    <span className="ml-auto tabular-nums text-muted">{money(totals.taxes[i]?.amount ?? 0)}</span>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setT([...taxes, ...(((entityData?.row.defaultTaxes as TaxRate[]) ?? []).filter((d) => !taxes.some((x) => x.code === d.code)).slice(0, 1).length ? ((entityData?.row.defaultTaxes as TaxRate[]) ?? []).filter((d) => !taxes.some((x) => x.code === d.code)).slice(0, 1) : [{ code: "TAX", label: "Taxe", rate: 0 }])])}
                  className="mt-1.5 text-xs text-muted hover:text-fg"
                >
                  + {tr({ fr: "Taxe", en: "Tax" })}
                </button>
                <div className="mt-2 flex justify-between border-t border-border pt-2 text-[15px] font-semibold">
                  <span>{tr({ fr: "Total TTC", en: "Total" })}</span>
                  <span className="tabular-nums">{money(totals.total)}</span>
                </div>
                {k === "invoice" && Number(row.amountPaid) > 0 && (
                  <div className="mt-1 flex justify-between text-muted">
                    <span>{tr({ fr: "Solde dû", en: "Balance due" })}</span>
                    <span className="tabular-nums">{money(totals.total - Number(row.amountPaid))}</span>
                  </div>
                )}
              </div>
            </div>

            {k === "quote" && (
              <div className="mt-6 space-y-4">
                <TextBlock label={tr({ fr: "Introduction", en: "Introduction" })} value={row.introduction as string} onSave={(v) => save("introduction", v)} />
                <TextBlock label={tr({ fr: "Cahier des charges (markdown)", en: "Scope of work (markdown)" })} value={row.scope as string} onSave={(v) => save("scope", v)} rows={10} mono />
                <TextBlock label={tr({ fr: "Conditions", en: "Terms" })} value={row.terms as string} onSave={(v) => save("terms", v)} />
              </div>
            )}
            {k === "invoice" && <div className="mt-6"><TextBlock label="Notes" value={row.notes as string} onSave={(v) => save("notes", v)} /></div>}
          </div>
        </div>

        {/* Preview */}
        <div className="flex min-w-0 flex-1 flex-col bg-[#eef0f5] dark:bg-canvas">
          <div className="flex items-center gap-2 border-b border-border bg-surface/70 px-4 py-2 text-xs text-muted backdrop-blur">
            {tr({ fr: "Aperçu en direct", en: "Live preview" })}
            {update.isPending && <RefreshCw className="size-3 animate-spin" />}
            <Segmented className="ml-auto" value={previewLocale} onChange={setPreviewLocale} options={[{ value: "fr", label: "FR" }, { value: "en", label: "EN" }]} />
          </div>
          {html ? <PreviewFrame html={html} /> : <Skeleton className="m-8 flex-1" />}
        </div>
      </div>

      <SendDialog open={sendOpen} onOpenChange={setSendOpen} kind={k} row={row} clientEmail={(contactData?.row.email ?? clientData?.row.email) as string | undefined} total={money(totals.total)} />
    </AppShell>
  );
}

/** A4 preview that scales down to fit the available width. */
function PreviewFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const fit = () => {
    const f = ref.current;
    const doc = f?.contentDocument;
    if (!f || !doc?.documentElement) return;
    const zoom = Math.min(1, (f.clientWidth - 32) / 794);
    doc.documentElement.style.zoom = String(zoom);
  };
  useEffect(() => {
    const ro = new ResizeObserver(fit);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return <iframe ref={ref} title="preview" srcDoc={html} onLoad={fit} className="min-h-0 w-full flex-1" />;
}

function TextBlock({ label, value, onSave, rows = 4, mono }: { label: string; value: string | null; onSave: (v: string) => void; rows?: number; mono?: boolean }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-subtle">{label}</span>
      <Textarea value={v} rows={rows} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value ?? "") && onSave(v)} className={cn(mono && "font-mono text-xs")} />
    </label>
  );
}

function SendDialog({ open, onOpenChange, kind, row, clientEmail, total }: { open: boolean; onOpenChange: (o: boolean) => void; kind: "quote" | "invoice"; row: Row; clientEmail?: string; total: string }) {
  const { tr } = useI18n();
  const [to, setTo] = useState(clientEmail ?? "");
  useEffect(() => setTo(clientEmail ?? ""), [clientEmail]);
  const subject = kind === "quote" ? `Devis ${row.number} — ${row.title ?? ""}` : `Facture ${row.number} — ${row.title ?? ""}`;
  const body = `Bonjour,\n\nVous trouverez ci-joint ${kind === "quote" ? "le devis" : "la facture"} ${row.number} d'un montant de ${total}.\n\nNous restons à votre entière disposition.\n\nCordialement,\nL'équipe Otopio`;
  const [text, setText] = useState(body);
  useEffect(() => setText(body), [body]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={tr({ fr: "Envoyer par courriel", en: "Send by email" })} description={tr({ fr: "L'envoi direct via Gmail arrive avec l'intégration Google Workspace. En attendant, ouvrez le brouillon dans votre messagerie et joignez le PDF.", en: "Direct Gmail sending ships with the Google Workspace integration. Meanwhile, open the draft in your mail client and attach the PDF." })} className="w-[min(92vw,580px)]">
        <div className="space-y-3 p-5">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">{tr({ fr: "Destinataire", en: "To" })}</span>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@exemple.com" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">{tr({ fr: "Objet", en: "Subject" })}</span>
            <Input value={subject} readOnly />
          </label>
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tr({ fr: "Annuler", en: "Cancel" })}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              window.location.href = `mailto:${encodeURIComponent(to)}?cc=contact@otopio.ca&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
              onOpenChange(false);
            }}
          >
            <Mail /> {tr({ fr: "Ouvrir le brouillon", en: "Open draft" })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Free documents / templates                                                */
/* -------------------------------------------------------------------------- */

export function FreeDocPage() {
  const { id } = useParams({ from: "/app/documents/doc/$id" });
  const { tr, t } = useI18n();
  const { data: doc, refetch } = useQuery({ queryKey: ["documents", "one", id], queryFn: () => api<Doc>(`/documents/doc/${id}`) });
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"edit" | "preview" | "google">("preview");
  useEffect(() => {
    if (doc) {
      setContent(doc.content ?? "");
      setTitle(doc.title);
      setMode(doc.googleDocId && !doc.content ? "google" : "preview");
    }
  }, [doc]);
  const save = async (patch: Partial<Doc>) => {
    await api(`/documents/doc/${id}`, { method: "PATCH", json: patch });
    refetch();
  };
  if (!doc)
    return (
      <AppShell>
        <Skeleton className="m-8 h-96" />
      </AppShell>
    );
  return (
    <AppShell
      title={doc.title}
      actions={
        <div className="flex items-center gap-2">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "preview", label: tr({ fr: "Lecture", en: "Read" }) },
              { value: "edit", label: tr({ fr: "Édition", en: "Edit" }) },
              ...(doc.googleDocId ? [{ value: "google" as const, label: "Google Docs" }] : []),
            ]}
          />
          {doc.googleDocId && (
            <a href={`https://docs.google.com/document/d/${doc.googleDocId}/edit`} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[13px] font-medium hover:bg-hover">
              <ExternalLink className="size-3.5" /> {tr({ fr: "Ouvrir dans Google Docs", en: "Open in Google Docs" })}
            </a>
          )}
        </div>
      }
    >
      {mode === "google" && doc.googleDocId ? (
        <iframe title="google-doc" src={`https://docs.google.com/document/d/${doc.googleDocId}/preview`} className="size-full bg-white" />
      ) : (
        <div className="h-full overflow-y-auto bg-surface">
          <div className="mx-auto max-w-3xl px-10 pb-24 pt-12">
            <Link to="/documents" className="mb-6 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
              <ArrowLeft className="size-3" /> {t("documents")}
            </Link>
            <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== doc.title && save({ title })} className="w-full bg-transparent text-[34px] font-semibold tracking-tight outline-none" />
            {doc.kind === "template" && <div className="mt-1 text-xs text-muted">{tr({ fr: "Template · variables {{client.name}}, {{project.name}}, {{entity.legalName}}…", en: "Template · variables {{client.name}}, {{project.name}}, {{entity.legalName}}…" })}</div>}
            {mode === "edit" ? (
              <textarea value={content} onChange={(e) => setContent(e.target.value)} onBlur={() => content !== (doc.content ?? "") && save({ content })} rows={24} className="mt-6 w-full resize-none rounded-xl border border-border bg-surface-2/40 p-4 font-mono text-[13px] leading-relaxed outline-none focus:ring-3 focus:ring-accent/15" />
            ) : (
              <div className="prose-doc mt-6 text-[15px]" dangerouslySetInnerHTML={{ __html: miniMarkdown(content) || `<p style="color:var(--subtle)">${tr({ fr: "Document vide — passez en mode édition.", en: "Empty document — switch to edit mode." })}</p>` }} />
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
