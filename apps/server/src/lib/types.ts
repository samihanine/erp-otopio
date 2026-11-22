import type { auth } from "./auth";
import type { Workspace } from "./workspace";
export type AppEnv = {
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
    ws: Workspace | null;
    workspaces: Workspace[];
  };
};
