import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as Dl from "@radix-ui/react-dialog";
import { FileText, Globe, Home, Plus, Search, Wallet } from "lucide-react";
import { TABLES, type TableKey } from "@erp/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { TableTile } from "@/components/ui/misc";
import { useCreateRecord } from "@/lib/data";

type Hit = { table: TableKey; id: string; label: string };

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, tr } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 160);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  const { data: hits = [], isFetching } = useQuery({ queryKey: ["search", debounced], queryFn: () => api<Hit[]>(`/search?q=${encodeURIComponent(debounced)}`), enabled: debounced.length > 1 });
  const go = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const createIn = useCreateRecordFor();

  const item = "flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-fg aria-selected:bg-hover [&_svg]:size-4 [&_svg]:text-muted";
  const group = "px-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-subtle";

  return (
    <Dl.Root open={open} onOpenChange={onOpenChange}>
      <Dl.Portal>
        <Dl.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px] animate-fade" />
        <Dl.Content aria-describedby={undefined} className="fixed left-1/2 top-[12vh] z-50 w-[min(94vw,640px)] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-pop animate-pop">
          <Dl.Title className="sr-only">Command menu</Dl.Title>
          <Command shouldFilter={debounced.length < 2} loop>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 text-subtle" />
              <Command.Input value={q} onValueChange={setQ} autoFocus placeholder={t("searchAnything")} className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-subtle" />
              {isFetching && <span className="size-3.5 animate-spin rounded-full border-2 border-border-strong border-t-fg" />}
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto pb-2">
              <Command.Empty className="px-4 py-8 text-center text-[13px] text-muted">{t("noResults")}</Command.Empty>
              {hits.length > 0 && (
                <Command.Group heading={tr({ fr: "Résultats", en: "Results" })} className={group}>
                  {hits.map((h) => (
                    <Command.Item key={`${h.table}-${h.id}`} value={`${h.label} ${h.table} ${h.id}`} onSelect={() => go(() => navigate({ to: "/db/$table/$id", params: { table: h.table, id: h.id } }))} className={item}>
                      <TableTile icon={TABLES[h.table].icon} color={TABLES[h.table].color} size="sm" />
                      <span className="truncate">{h.label}</span>
                      <span className="ml-auto text-xs text-subtle">{tr(TABLES[h.table].singular)}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading={tr({ fr: "Navigation", en: "Navigate" })} className={group}>
                <Command.Item onSelect={() => go(() => navigate({ to: "/" }))} className={item}>
                  <Home /> {t("home")}
                </Command.Item>
                <Command.Item onSelect={() => go(() => navigate({ to: "/documents" }))} className={item}>
                  <FileText /> {t("documents")}
                </Command.Item>
                <Command.Item onSelect={() => go(() => navigate({ to: "/finance" }))} className={item}>
                  <Wallet /> {t("finance")}
                </Command.Item>
                <Command.Item onSelect={() => go(() => navigate({ to: "/website" }))} className={item}>
                  <Globe /> {t("website")}
                </Command.Item>
                {Object.values(TABLES).map((d) => (
                  <Command.Item key={d.key} value={`table ${tr(d.label)}`} onSelect={() => go(() => navigate({ to: "/db/$table", params: { table: d.key } }))} className={item}>
                    <TableTile icon={d.icon} color={d.color} size="sm" /> {tr(d.label)}
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading={tr({ fr: "Créer", en: "Create" })} className={group}>
                {(["task", "project", "organization", "person", "invoice", "quote", "bill", "ticket", "article", "post"] as TableKey[]).map((k) => (
                  <Command.Item key={k} value={`create ${tr(TABLES[k].singular)}`} onSelect={() => go(() => createIn(k))} className={item}>
                    <Plus /> {tr({ fr: "Nouveau·elle", en: "New" })} {tr(TABLES[k].singular).toLowerCase()}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </Dl.Content>
      </Dl.Portal>
    </Dl.Root>
  );
}

function useCreateRecordFor() {
  const navigate = useNavigate();
  const mutations = {
    task: useCreateRecord("task"),
    project: useCreateRecord("project"),
    organization: useCreateRecord("organization"),
    person: useCreateRecord("person"),
    invoice: useCreateRecord("invoice"),
    quote: useCreateRecord("quote"),
    bill: useCreateRecord("bill"),
    ticket: useCreateRecord("ticket"),
    article: useCreateRecord("article"),
    post: useCreateRecord("post"),
  } as Partial<Record<TableKey, ReturnType<typeof useCreateRecord>>>;
  return async (k: TableKey) => {
    const m = mutations[k];
    if (!m) return;
    const res = await m.mutateAsync({});
    if (k === "invoice" || k === "quote") navigate({ to: "/documents/$kind/$id", params: { kind: k, id: res.row.id } });
    else navigate({ to: "/db/$table", params: { table: k }, search: { record: res.row.id } as never });
  };
}
