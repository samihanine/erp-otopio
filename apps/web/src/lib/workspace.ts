/**
 * Current workspace (structure) — sent with every API call in the `x-workspace` header.
 * Switching workspace clears the query cache so nothing from another structure stays on screen.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type WorkspaceInfo = {
  id: string;
  code: string;
  slug: string | null;
  name: string;
  legalName: string;
  country: string;
  currency: string;
  color: string;
  role: "admin" | "member" | "viewer";
  disabledModules: string[];
  websiteDomain: string | null;
  mailboxes: string[];
  drive: { clients?: string; admin?: string; personalEmail?: string; folderId?: string };
};
export type ModuleKey = "home" | "calendar" | "clients" | "db" | "docs" | "finance" | "taxes" | "website" | "social";

const KEY = "erp.ws";
let current: string | null = (() => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
})();

export const currentWorkspaceId = () => current;
export const wsHeaders = (): Record<string, string> => (current ? { "x-workspace": current } : {});
export function setCurrentWorkspaceId(id: string) {
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {}
}

export async function fetchWorkspaces(): Promise<WorkspaceInfo[]> {
  const res = await fetch("/api/workspaces", { credentials: "include" });
  if (!res.ok) return [];
  return ((await res.json()) as { workspaces: WorkspaceInfo[] }).workspaces;
}

/** Makes sure the stored workspace is still accessible (first one otherwise). */
export function pickWorkspace(list: WorkspaceInfo[]) {
  const ws = list.find((w) => w.id === current) ?? list[0];
  if (ws && ws.id !== current) setCurrentWorkspaceId(ws.id);
  return ws ?? null;
}

export function useWorkspaces() {
  const qc = useQueryClient();
  const { data: list = [], isLoading } = useQuery({ queryKey: ["__workspaces"], queryFn: fetchWorkspaces, staleTime: 60_000 });
  const ws = list.find((w) => w.id === current) ?? list[0] ?? null;
  const enabled = (m: ModuleKey) => !ws || !ws.disabledModules.includes(m);
  const switchTo = (id: string) => {
    if (id === current) return;
    setCurrentWorkspaceId(id);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "__workspaces" });
    location.href = "/";
  };
  return { list, ws, enabled, switchTo, isLoading };
}
