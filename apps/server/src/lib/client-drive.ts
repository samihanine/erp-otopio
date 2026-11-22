/**
 * Client folders: one per client in the workspace's « Clients » storage, with one sub-folder per category.
 * Files dropped by a client in the portal land in « À trier » until an admin files them.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@erp/db";
import { drive, FOLDER } from "@erp/google";
import { driveSubject } from "./drive-access";
import type { Workspace } from "./workspace";

export const CATEGORY_FOLDERS: Record<string, string> = { invoice: "Factures", quote: "Devis", expense: "Dépenses", legal: "Juridique", deliverable: "Livrables", other: "Autres" };
export const TO_SORT = "À trier";
export const CLIENT_SUBFOLDERS = [TO_SORT, ...Object.values(CATEGORY_FOLDERS)];

type Ws = Pick<Workspace, "id" | "code" | "drive">;
const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export async function findOrCreateFolder(subject: string, parent: string, name: string) {
  const [hit] = await drive.list(subject, `'${parent}' in parents and name='${q(name)}' and mimeType='${FOLDER}' and trashed=false`, { corpora: "allDrives" });
  return hit ?? (await drive.createFolder(subject, name, parent));
}

/** Root folder holding the client folders of a workspace. */
export async function clientsRoot(ws: Ws, subject: string) {
  if (ws.drive?.clientsFolder) return ws.drive.clientsFolder;
  const base = ws.drive?.root ?? ws.drive?.folderId;
  if (base) return (await findOrCreateFolder(subject, base, "Clients")).id;
  if (ws.drive?.clients) return ws.drive.clients;
  if (ws.code === "OTP") {
    const d = (await drive.sharedDrives(subject, true)).find((x) => x.name === "Clients");
    if (d) return d.id;
  }
  throw new Error("Stockage Drive de l'espace non configuré");
}

/** Client folder (created with its category sub-folders when missing). */
export async function ensureClientFolder(ws: Ws, orgId: string) {
  const subject = await driveSubject(ws);
  const [o] = await db.select().from(schema.organization).where(eq(schema.organization.id, orgId));
  if (!o) throw new Error("Client introuvable");
  let folderId = o.driveFolderId;
  if (folderId) {
    const f = await drive.get(subject, folderId).catch(() => null);
    if (!f || f.trashed) folderId = null;
  }
  if (!folderId) {
    const f = await findOrCreateFolder(subject, await clientsRoot(ws, subject), o.name.replace(/[\/]/g, "-"));
    folderId = f.id;
    await db.update(schema.organization).set({ driveFolderId: folderId }).where(eq(schema.organization.id, o.id));
    for (const name of CLIENT_SUBFOLDERS) await findOrCreateFolder(subject, folderId, name);
  }
  return { subject, folderId, org: o };
}

export async function clientSubfolder(ws: Ws, orgId: string, name: string) {
  const { subject, folderId, org } = await ensureClientFolder(ws, orgId);
  const f = await findOrCreateFolder(subject, folderId, name);
  return { subject, folderId: f.id, clientFolderId: folderId, org };
}
