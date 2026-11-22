import type { TableKey } from "@erp/shared";
import { currentWorkspaceId } from "./workspace";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(currentWorkspaceId() ? { "x-workspace": currentWorkspaceId()! } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401 && !path.startsWith("/auth")) {
    if (!location.pathname.startsWith("/login")) location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    throw new ApiError(401, "Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // signed in but member of no workspace → client portal
    if (res.status === 403 && (body as { portal?: boolean }).portal && !location.pathname.startsWith("/portail")) location.href = "/portail";
    throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
  }
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

export type Row = Record<string, unknown> & { id: string };
export type Refs = Record<string, Record<string, { label: string; color?: string | null }>>;
export type ListResponse = { rows: Row[]; total: number; refs: Refs };

export type ListParams = {
  filters?: { field: string; op: string; value?: unknown }[];
  mode?: "and" | "or";
  sorts?: { field: string; dir: "asc" | "desc" }[];
  search?: string;
  limit?: number;
};

export function listUrl(table: TableKey, p: ListParams) {
  const q = new URLSearchParams();
  if (p.filters?.length) q.set("filters", JSON.stringify(p.filters));
  if (p.mode) q.set("mode", p.mode);
  if (p.sorts?.length) q.set("sorts", JSON.stringify(p.sorts));
  if (p.search) q.set("search", p.search);
  q.set("limit", String(p.limit ?? 1000));
  return `/data/${table}?${q}`;
}
