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
    const target = list.find((w) => w.id === id);
    setCurrentWorkspaceId(id);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "__workspaces" });
    location.href = target ? samePageIn(target) : "/";
  };
  return { list, ws, enabled, switchTo, isLoading };
}

/** Module (sidebar tab) a path + ?tab= belongs to. */
function moduleOf(path: string, tab: string | null): ModuleKey | null {
  if (path.startsWith("/calendar")) return "calendar";
  if (path.startsWith("/clients")) return "clients";
  if (path.startsWith("/db")) return "db";
  if (path.startsWith("/documents")) return "docs";
  if (path.startsWith("/finance")) return tab === "taxes" ? "taxes" : "finance";
  if (path.startsWith("/website")) return tab === "social" ? "social" : "website";
  return null;
}

/**
 * Same page in another workspace: records of the current workspace do not exist there, so a record page
 * falls back to its list; a page whose module is off in the target workspace falls back to the home page.
 */
export function samePageIn(ws: WorkspaceInfo) {
  const u = new URL(location.href);
  let path = u.pathname;
  path = path.replace(/^\/clients\/[^/]+$/, "/clients").replace(/^\/db\/([^/]+)\/[^/]+$/, "/db/$1").replace(/^\/documents\/(quote|invoice|doc)\/[^/]+$/, "/documents/models");
  if (path !== u.pathname) u.searchParams.delete("tab"); // a record's sub-tab means nothing on the list
  u.searchParams.delete("record");
  u.searchParams.delete("view"); // saved views belong to a workspace
  const m = moduleOf(path, u.searchParams.get("tab"));
  if (m && ws.disabledModules.includes(m)) return "/";
  const qs = u.searchParams.toString();
  return path + (qs ? `?${qs}` : "");
}
