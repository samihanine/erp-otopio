import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, Outlet, redirect, RouterProvider } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { TABLE_KEYS, type TableKey } from "@erp/shared";
import "./styles/index.css";
import { I18nProvider } from "./lib/i18n";
import { authClient } from "./lib/auth-client";
import { TooltipProvider } from "./components/ui/tooltip";
import { LoginPage } from "./routes/login";
import { HomePage } from "./routes/home";
import { DatabasePage, RecordPage } from "./routes/db";
import { DocumentsPage, DocumentEditorPage, FreeDocPage } from "./routes/documents";
import { FinancePage } from "./routes/finance";
import { WebsitePage } from "./routes/website";
import { SettingsPage } from "./routes/settings";
import { ClientsPage, ClientPage } from "./routes/clients";
import { FilesPage } from "./routes/files";
import { CalendarPage } from "./routes/calendar";

try {
  if (localStorage.getItem("erp.theme") === "dark") document.documentElement.classList.add("dark");
} catch {}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
});

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const requireAuth = async () => {
  const { data } = await authClient.getSession();
  if (!data) throw redirect({ to: "/login", search: { next: location.pathname + location.search } as never });
};

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", component: LoginPage, validateSearch: (s: Record<string, unknown>): { next?: string } => (typeof s.next === "string" ? { next: s.next } : {}) });
const appRoute = createRoute({ getParentRoute: () => rootRoute, id: "app", beforeLoad: requireAuth, component: () => <Outlet /> });

const homeRoute = createRoute({ getParentRoute: () => appRoute, path: "/", component: HomePage });
const dbIndexRoute = createRoute({ getParentRoute: () => appRoute, path: "/db", beforeLoad: () => { throw redirect({ to: "/db/$table", params: { table: "project" }, search: {} }); } });
export const dbRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/db/$table",
  validateSearch: (s: Record<string, unknown>): { view?: string; record?: string } => ({ ...(typeof s.view === "string" ? { view: s.view } : {}), ...(typeof s.record === "string" ? { record: s.record } : {}) }),
  beforeLoad: ({ params }) => {
    if (!TABLE_KEYS.includes(params.table as TableKey)) throw redirect({ to: "/db/$table", params: { table: "project" } });
  },
  component: DatabasePage,
});
export const recordRoute = createRoute({ getParentRoute: () => appRoute, path: "/db/$table/$id", component: RecordPage });
const docsRoute = createRoute({ getParentRoute: () => appRoute, path: "/documents", component: FilesPage });
const docsModelsRoute = createRoute({ getParentRoute: () => appRoute, path: "/documents/models", component: DocumentsPage });
const clientsRoute = createRoute({ getParentRoute: () => appRoute, path: "/clients", component: ClientsPage });
export const clientRoute = createRoute({ getParentRoute: () => appRoute, path: "/clients/$id", component: ClientPage });
const calendarRoute = createRoute({ getParentRoute: () => appRoute, path: "/calendar", component: CalendarPage });
export const docEditorRoute = createRoute({ getParentRoute: () => appRoute, path: "/documents/$kind/$id", component: DocumentEditorPage });
export const freeDocRoute = createRoute({ getParentRoute: () => appRoute, path: "/documents/doc/$id", component: FreeDocPage });
const financeRoute = createRoute({ getParentRoute: () => appRoute, path: "/finance", component: FinancePage });
const websiteRoute = createRoute({ getParentRoute: () => appRoute, path: "/website", component: WebsitePage });
const settingsRoute = createRoute({ getParentRoute: () => appRoute, path: "/settings", component: SettingsPage });

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([homeRoute, dbIndexRoute, dbRoute, recordRoute, docsRoute, docsModelsRoute, clientsRoute, clientRoute, calendarRoute, freeDocRoute, docEditorRoute, financeRoute, websiteRoute, settingsRoute]),
]);

const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster position="bottom-right" toastOptions={{ className: "!rounded-xl !border-border !bg-surface !text-fg !shadow-pop !text-[13px]" }} />
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
