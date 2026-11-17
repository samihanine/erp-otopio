import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TABLES, type TableKey, type ViewType } from "@erp/shared";
import { api, listUrl, type ListParams, type ListResponse, type Refs, type Row } from "./api";

export type ViewConfig = {
  filters: { id: string; field: string; op: string; value?: unknown }[];
  filterMode?: "and" | "or";
  sorts: { field: string; dir: "asc" | "desc" }[];
  hiddenFields: string[];
  fieldOrder?: string[];
  columnWidths?: Record<string, number>;
  groupBy?: string | null;
  dateField?: string | null;
  endDateField?: string | null;
  coverField?: string | null;
  search?: string;
};

export type SavedView = { id: string; table: TableKey; name: string; type: ViewType; icon?: string | null; config: ViewConfig; position: number };

export function defaultConfig(table: TableKey, type: ViewType = "table"): ViewConfig {
  const def = TABLES[table];
  return {
    filters: [],
    filterMode: "and",
    sorts: [],
    hiddenFields: def.fields.filter((f) => f.hidden).map((f) => f.key),
    groupBy: type === "kanban" ? (def.kanbanField ?? null) : null,
    dateField: type === "gantt" ? (def.startField ?? def.dateField ?? null) : (def.dateField ?? null),
    endDateField: def.endField ?? null,
    coverField: def.coverField ?? null,
  };
}

export const qk = {
  list: (table: TableKey, p: ListParams) => ["data", table, "list", p] as const,
  table: (table: TableKey) => ["data", table] as const,
  record: (table: TableKey, id: string) => ["data", table, "record", id] as const,
  views: (table?: TableKey) => ["views", table ?? "all"] as const,
};

export function useList(table: TableKey, p: ListParams, enabled = true) {
  return useQuery({
    queryKey: qk.list(table, p),
    queryFn: () => api<ListResponse>(listUrl(table, p)),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useRecord(table: TableKey, id: string | null | undefined) {
  return useQuery({
    queryKey: qk.record(table, id ?? ""),
    queryFn: () => api<{ row: Row; refs: Refs }>(`/data/${table}/${id}`),
    enabled: Boolean(id),
  });
}

export function useRelated(table: TableKey, id: string | null | undefined) {
  return useQuery({
    queryKey: ["data", table, "related", id],
    queryFn: () => api<{ table: TableKey; field: string; rows: Row[]; total: number }[]>(`/data/${table}/${id}/related`),
    enabled: Boolean(id),
  });
}

export function useOptions(table: TableKey | undefined, q: string, enabled = true, scope?: string) {
  return useQuery({
    queryKey: ["options", table, q, scope],
    queryFn: () => api<{ id: string; label: string; subtitle?: string | null }[]>(`/data/${table}/options?q=${encodeURIComponent(q)}${scope ? `&scope=${scope}` : ""}`),
    enabled: Boolean(table) && enabled,
    staleTime: 30_000,
  });
}

/** Optimistic single-record update that patches every cached list of the table. */
export function useUpdateRecord(table: TableKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => api<{ row: Row; refs: Refs }>(`/data/${table}/${id}`, { method: "PATCH", json: patch }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.table(table) });
      const snapshots = qc.getQueriesData({ queryKey: qk.table(table) });
      qc.setQueriesData<ListResponse>({ queryKey: [...qk.table(table), "list"] }, (old) =>
        old ? { ...old, rows: old.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : old,
      );
      qc.setQueryData<{ row: Row; refs: Refs }>(qk.record(table, id), (old) => (old ? { ...old, row: { ...old.row, ...patch } } : old));
      return { snapshots };
    },
    onError: (e, _v, ctx) => {
      ctx?.snapshots.forEach(([k, v]) => qc.setQueryData(k, v));
      toast.error((e as Error).message);
    },
    onSuccess: (res, { id }) => {
      qc.setQueriesData<ListResponse>({ queryKey: [...qk.table(table), "list"] }, (old) =>
        old ? { ...old, rows: old.rows.map((r) => (r.id === id ? res.row : r)), refs: mergeRefs(old.refs, res.refs) } : old,
      );
      qc.setQueryData(qk.record(table, id), res);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
  });
}

export function useCreateRecord(table: TableKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Record<string, unknown>) => api<{ row: Row; refs: Refs }>(`/data/${table}`, { method: "POST", json: values }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.table(table) });
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
}

export function useDeleteRecord(table: TableKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/data/${table}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.table(table) });
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
}

export function mergeRefs(a: Refs, b: Refs): Refs {
  const out: Refs = { ...a };
  for (const [t, m] of Object.entries(b)) out[t] = { ...(out[t] ?? {}), ...m };
  return out;
}

/* ------------------------------ saved views ------------------------------ */

export function useViews(table?: TableKey) {
  return useQuery({ queryKey: qk.views(table), queryFn: () => api<SavedView[]>(`/views${table ? `?table=${table}` : ""}`) });
}

export function useViewMutations() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ["views"] });
  return {
    create: useMutation({ mutationFn: (v: Omit<SavedView, "id" | "position">) => api<SavedView>("/views", { method: "POST", json: v }), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, ...v }: Partial<SavedView> & { id: string }) => api<SavedView>(`/views/${id}`, { method: "PATCH", json: v }), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: string) => api(`/views/${id}`, { method: "DELETE" }), onSuccess: inv }),
  };
}

/** Display label of a record (handles person names). */
export function recordLabel(table: TableKey, row: Row | Record<string, unknown> | undefined | null) {
  if (!row) return "";
  if (table === "person") return `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
  if (table === "ticket") return `#${row.number ?? ""} ${row.title ?? ""}`;
  return String(row[TABLES[table].primary] ?? "");
}
