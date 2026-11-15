/**
 * Drive ↔ ERP
 *  - mirrors the two shared drives (Projets, Admin Otopio) into the `document` table (changes API)
 *  - one Drive folder per client organization (created / renamed automatically)
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@erp/db";
import { drive, FOLDER, type DriveFile } from "@erp/google";
import { ADMIN, getState, log, setState } from "./common";

export const PROJECTS_DRIVE = process.env.DRIVE_PROJECTS_NAME ?? "Projets";
export const ADMIN_DRIVE = process.env.DRIVE_ADMIN_NAME ?? "Admin Otopio";

let driveIds: Record<string, string> | null = null;
export async function sharedDriveIds() {
  if (driveIds) return driveIds;
  const list = await drive.sharedDrives(ADMIN, true);
  driveIds = Object.fromEntries(list.map((d) => [d.name, d.id]));
  return driveIds;
}

const typeOf = (name: string) =>
  /devis|quote/i.test(name) ? "quote" : /facture|invoice|reçu|receipt/i.test(name) ? "invoice" : /nda/i.test(name) ? "nda" : /contrat|entente|cession|agreement|contract/i.test(name) ? "contract" : /cahier|cdc|sow|scope|requirements/i.test(name) ? "sow" : /compte-rendu|réunion|reunion|cr /i.test(name) ? "report" : "free";

async function upsertFile(f: DriveFile, driveName: string, pathOf: (f: DriveFile) => string, clientFolders: Map<string, string>) {
  const path = pathOf(f);
  const top = path.split("/")[0] ?? "";
  const orgId = driveName === PROJECTS_DRIVE ? (clientFolders.get(top) ?? null) : null;
  const values = {
    title: f.name,
    kind: "document" as const,
    type: (f.mimeType === FOLDER ? "free" : typeOf(f.name)) as never,
    driveFileId: f.id,
    driveId: f.driveId,
    parentId: f.parents?.[0] ?? null,
    path: `${driveName}/${path}`,
    mimeType: f.mimeType,
    size: f.size ? Number(f.size) : null,
    webViewLink: f.webViewLink ?? null,
    thumbnailLink: f.thumbnailLink ?? null,
    isFolder: f.mimeType === FOLDER,
    modifiedAt: f.modifiedTime ? new Date(f.modifiedTime) : null,
    googleDocId: f.mimeType.startsWith("application/vnd.google-apps.") && f.mimeType !== FOLDER ? f.id : null,
  };
  await db
    .insert(schema.document)
    .values({ ...values, organizationId: orgId })
    .onConflictDoUpdate({ target: schema.document.driveFileId, set: { ...values, ...(orgId ? { organizationId: orgId } : {}) } });
}

/** Full index of a shared drive (first run) */
async function fullIndex(driveName: string, driveId: string, clientFolders: Map<string, string>) {
  const files = await drive.list(ADMIN, "trashed=false", { driveId });
  const byId = new Map(files.map((f) => [f.id, f]));
  const pathOf = (f: DriveFile): string => {
    const p = f.parents?.[0];
    return p && p !== driveId && byId.has(p) ? `${pathOf(byId.get(p)!)}/${f.name}` : f.name;
  };
  for (const f of files) await upsertFile(f, driveName, pathOf, clientFolders);
  // drop rows for files that no longer exist
  const ids = new Set(files.map((f) => f.id));
  const rows = await db.select({ id: schema.document.id, fid: schema.document.driveFileId }).from(schema.document).where(eq(schema.document.driveId, driveId));
  const gone = rows.filter((r) => r.fid && !ids.has(r.fid)).map((r) => r.id);
  if (gone.length) await db.delete(schema.document).where(inArray(schema.document.id, gone));
  return files.length;
}

export async function syncDrive() {
  const ids = await sharedDriveIds();
  const clientFolders = await ensureClientFolders();
  const stats: Record<string, number> = {};
  for (const name of [PROJECTS_DRIVE, ADMIN_DRIVE]) {
    const driveId = ids[name];
    if (!driveId) continue;
    const tokenKey = `drive:${driveId}:pageToken`;
    let token: string | null = await getState(tokenKey);
    if (!token) {
      const start = await drive.startPageToken(ADMIN, driveId);
      stats[name] = await fullIndex(name, driveId, clientFolders);
      await setState(tokenKey, start);
      continue;
    }
    let changed = 0;
    while (token) {
      const r = await drive.changes(ADMIN, driveId, token);
      for (const c of r.changes) {
        if (c.removed || !c.file || c.file.trashed) {
          await db.delete(schema.document).where(eq(schema.document.driveFileId, c.fileId));
          continue;
        }
        const f = c.file;
        const [parent] = f.parents?.[0] ? await db.select({ path: schema.document.path }).from(schema.document).where(eq(schema.document.driveFileId, f.parents[0])) : [];
        const parentPath = parent?.path?.split("/").slice(1).join("/");
        await upsertFile(f, name, () => (parentPath ? `${parentPath}/${f.name}` : f.name), clientFolders);
        changed++;
      }
      if (r.newStartPageToken) {
        await setState(tokenKey, r.newStartPageToken);
        token = null;
      } else token = r.nextPageToken ?? null;
    }
    // A renamed/moved folder changes the path of its children → reindex when folders changed
    if (changed) await fullIndex(name, driveId, clientFolders);
    stats[name] = changed;
  }
  return stats;
}

/**
 * Ensures every client organization has its folder in the "Projets" shared drive (and keeps the name in sync).
 * Returns folderName → organizationId.
 */
export async function ensureClientFolders(onlyOrgId?: string) {
  const ids = await sharedDriveIds();
  const root = ids[PROJECTS_DRIVE];
  const map = new Map<string, string>();
  if (!root) return map;
  const folders = await drive.list(ADMIN, `'${root}' in parents and mimeType='${FOLDER}' and trashed=false`, { driveId: root });
  const orgs = await db.select().from(schema.organization).where(onlyOrgId ? eq(schema.organization.id, onlyOrgId) : eq(schema.organization.type, "client"));
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const o of orgs) {
    if (o.type !== "client") continue;
    const safeName = o.name.replace(/[\/]/g, "-");
    let folder = o.driveFolderId ? folders.find((f) => f.id === o.driveFolderId) : folders.find((f) => norm(f.name) === norm(o.name));
    if (!folder && o.driveFolderId) {
      // folder may have been moved: look it up directly
      folder = await drive.get(ADMIN, o.driveFolderId).catch(() => undefined);
      if (folder?.trashed) folder = undefined;
    }
    if (!folder && o.status === "former" && !onlyOrgId) continue; // no empty folders for past clients
    if (!folder) {
      folder = await drive.createFolder(ADMIN, safeName, root);
      await log("drive-folder-created", "organization", o.id, `Dossier Drive « ${safeName} » créé dans ${PROJECTS_DRIVE}`, { trashDriveFile: folder.id });
    } else if (folder.name !== safeName) {
      const old = folder.name;
      folder = await drive.update(ADMIN, folder.id, { name: safeName });
      await log("drive-folder-renamed", "organization", o.id, `Dossier Drive renommé « ${old} » → « ${safeName} »`, { renameDriveFile: { id: folder.id, name: old } });
    }
    if (o.driveFolderId !== folder.id) await db.update(schema.organization).set({ driveFolderId: folder.id }).where(eq(schema.organization.id, o.id));
    map.set(safeName, o.id);
  }
  if (!onlyOrgId) for (const f of folders) if (!map.has(f.name)) {
    const o = orgs.find((x) => norm(x.name) === norm(f.name));
    if (o) map.set(f.name, o.id);
  }
  // also attach non-client orgs that already have a folder (prospects, internal…)
  if (!onlyOrgId) {
    const others = await db.select().from(schema.organization).where(isNull(schema.organization.driveFolderId));
    for (const f of folders) {
      if (map.has(f.name)) continue;
      const o = others.find((x) => norm(x.name) === norm(f.name) || (f.name.startsWith("Otopio") && x.type === "internal"));
      if (o) {
        await db.update(schema.organization).set({ driveFolderId: f.id }).where(and(eq(schema.organization.id, o.id), isNull(schema.organization.driveFolderId)));
        map.set(f.name, o.id);
      }
    }
  }
  return map;
}

/** Saves a generated PDF (quote / invoice) into the client's folder. */
export async function savePdfToClientFolder(orgId: string | null, name: string, pdf: Uint8Array) {
  if (!orgId) return null;
  await ensureClientFolders(orgId);
  const [o] = await db.select().from(schema.organization).where(eq(schema.organization.id, orgId));
  if (!o?.driveFolderId) return null;
  const existing = await drive.list(ADMIN, `'${o.driveFolderId}' in parents and name='${name.replace(/'/g, "\\'")}' and trashed=false`, { corpora: "allDrives" });
  for (const e of existing) await drive.update(ADMIN, e.id, { trashed: true } as never);
  const f = await drive.upload(ADMIN, name, o.driveFolderId, pdf, "application/pdf");
  return f.webViewLink ?? null;
}
