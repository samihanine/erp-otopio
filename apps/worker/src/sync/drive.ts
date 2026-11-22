/**
 * Drive ↔ ERP, one storage per workspace
 *  - Otopio Inc.  : shared drives « Clients » + « Administratif »
 *  - Megascale    : shared drives « Megascale — Clients » + « Megascale — Administratif »
 *  - freelances   : an « ERP » folder in the owner's personal Drive (OAuth, drive.file scope — nothing else is read)
 * Every file is mirrored into `document` (workspace_id set), and every client has a folder with category sub-folders.
 */
import { and, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { db, schema, type WorkspaceDrive } from "@erp/db";
import { drive, FOLDER, gfetch, SCOPES, type DriveFile } from "@erp/google";
import { ADMIN, COMPANIES, getState, log, setState, workspaces, type Ws } from "./common";
import { accessToken, unseal } from "./personal";

export const PROJECTS_DRIVE = process.env.DRIVE_PROJECTS_NAME ?? "Clients";
export const ADMIN_DRIVE = process.env.DRIVE_ADMIN_NAME ?? "Administratif";
const MGS_CLIENTS = "Megascale — Clients";
const MGS_ADMIN = "Megascale — Administratif";
/** former names (before the Nov. 2026 reorganisation) */
const ALIASES: Record<string, string> = { Projets: PROJECTS_DRIVE, "Admin Otopio": ADMIN_DRIVE };
/** client folder layout (same categories as the portal uploads) */
export const CLIENT_SUBFOLDERS = ["À trier", "Factures", "Devis", "Dépenses", "Juridique", "Livrables", "Autres"];
const ADMIN_SECTIONS = ["Juridique", "Recettes", "Dépenses", "Fiscal"];

const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/* ------------------------------------------------------------------------ */
/*  Storage resolution                                                      */
/* ------------------------------------------------------------------------ */

let driveIds: Record<string, string> | null = null;
export async function sharedDriveIds(refresh = false) {
  if (driveIds && !refresh) return driveIds;
  const list = await drive.sharedDrives(ADMIN, true);
  driveIds = Object.fromEntries(list.map((d) => [d.name, d.id]));
  for (const [old, now] of Object.entries(ALIASES)) if (driveIds[old] && !driveIds[now]) driveIds[now] = driveIds[old];
  return driveIds;
}

const tokens = new Map<string, { t: string; exp: number }>();
/** OAuth access token of a connected personal Google account, or null. */
export async function personalToken(email: string) {
  const c = tokens.get(email);
  if (c && c.exp > Date.now() + 60_000) return c.t;
  const rows = await db.select().from(schema.syncState).where(like(schema.syncState.key, `personal-google:%:${email}`));
  const row = rows.find((r) => !r.key.startsWith("personal-google:entity:") && !r.key.startsWith("personal-google:nonce:"));
  if (!row) return null;
  const { refreshToken } = await unseal<{ refreshToken: string }>(row.value);
  const t = await accessToken(refreshToken);
  if (t) tokens.set(email, { t, exp: Date.now() + 3000_000 });
  return t;
}

export async function subjectOf(ws: Pick<Ws, "drive">) {
  const email = ws.drive?.personalEmail;
  if (!email) return ADMIN;
  const t = await personalToken(email);
  return t ? `oauth:${t}` : null;
}

export async function findOrCreateFolder(subject: string, parent: string, name: string) {
  const [hit] = await drive.list(subject, `'${parent}' in parents and name='${q(name)}' and mimeType='${FOLDER}' and trashed=false`, { corpora: "allDrives" });
  return hit ?? (await drive.createFolder(subject, name, parent));
}

async function saveDrive(ws: Ws, patch: WorkspaceDrive) {
  const next = { ...(ws.drive ?? {}), ...patch };
  if (JSON.stringify(next) === JSON.stringify(ws.drive ?? {})) return;
  await db.update(schema.legalEntity).set({ drive: next }).where(eq(schema.legalEntity.id, ws.id));
  ws.drive = next;
}

/** Ensures the storage of every workspace exists and records its ids in legal_entity.drive. */
export async function ensureStorage() {
  const wss = await workspaces();
  const ids = await sharedDriveIds();
  const otp = wss.find((w) => w.code === "OTP");
  for (const ws of wss) {
    if (ws.code === "OTP") {
      if (ids[PROJECTS_DRIVE] && ids[ADMIN_DRIVE]) await saveDrive(ws, { clients: ids[PROJECTS_DRIVE], admin: ids[ADMIN_DRIVE] });
    } else if (ws.code === "MGS") {
      let created = false;
      for (const name of [MGS_CLIENTS, MGS_ADMIN]) {
        if (ids[name]) continue;
        const d = await drive.createSharedDrive(ADMIN, name);
        ids[name] = d.id;
        created = true;
        await log("drive-created", "legal_entity", ws.id, `Drive partagé « ${name} » créé pour Megascale`);
      }
      if (created && otp?.drive?.clients) await copyMembers(otp.drive.clients, [ids[MGS_CLIENTS]!, ids[MGS_ADMIN]!]);
      await saveDrive(ws, { clients: ids[MGS_CLIENTS], admin: ids[MGS_ADMIN] });
    } else if (ws.drive?.personalEmail) {
      const subject = await subjectOf(ws);
      if (!subject) continue; // personal account not connected yet
      if (!ws.drive.folderId) {
        const root = await findOrCreateFolder(subject, "root", "ERP");
        await saveDrive(ws, { folderId: root.id });
      }
    }
    if (ws.drive?.admin && !(await getState(`drive:sections:${ws.id}`))) {
      const subject = (await subjectOf(ws))!;
      for (const s of ADMIN_SECTIONS) await findOrCreateFolder(subject, ws.drive.admin, s);
      await setState(`drive:sections:${ws.id}`, "1");
    }
    if (ws.drive?.folderId && !(await getState(`drive:sections:${ws.id}`))) {
      const subject = await subjectOf(ws);
      if (subject) {
        await findOrCreateFolder(subject, ws.drive.folderId, "Clients");
        const adm = await findOrCreateFolder(subject, ws.drive.folderId, "Administratif");
        for (const s of ADMIN_SECTIONS) await findOrCreateFolder(subject, adm.id, s);
        await setState(`drive:sections:${ws.id}`, "1");
      }
    }
  }
  return wss;
}

/** Same people on the new Megascale drives as on the Otopio « Clients » drive. */
async function copyMembers(from: string, to: string[]) {
  const perms = await drive.permissions(ADMIN, from, true).catch(() => []);
  for (const d of to)
    for (const p of perms)
      if (p.type === "user" && p.emailAddress && p.emailAddress !== ADMIN)
        await drive.addPermission(ADMIN, d, p.emailAddress, p.role === "organizer" ? "organizer" : p.role === "fileOrganizer" ? "fileOrganizer" : "writer", true).catch(() => {});
}

/** Root folders that hold client folders / admin sections for a workspace. */
async function roots(ws: Ws, subject: string) {
  if (ws.drive?.folderId) {
    const clients = await findOrCreateFolder(subject, ws.drive.folderId, "Clients");
    const admin = await findOrCreateFolder(subject, ws.drive.folderId, "Administratif");
    return { clients: clients.id, admin: admin.id };
  }
  return { clients: ws.drive?.clients ?? null, admin: ws.drive?.admin ?? null };
}

/** Folder where supplier invoices of a workspace are filed: Administratif › Dépenses (› Otopio Inc. for the legacy layout). */
export async function expensesFolder(ws: Ws) {
  const subject = await subjectOf(ws);
  if (!subject) return null;
  const r = await roots(ws, subject);
  if (!r.admin) return null;
  const dep = await findOrCreateFolder(subject, r.admin, "Dépenses");
  const folderId = ws.code === "OTP" ? (await findOrCreateFolder(subject, dep.id, "Otopio Inc.")).id : dep.id;
  return { subject, folderId };
}

/* ------------------------------------------------------------------------ */
/*  Index (document table)                                                  */
/* ------------------------------------------------------------------------ */

const typeOf = (name: string) =>
  /devis|quote/i.test(name) ? "quote" : /facture|invoice|reçu|receipt/i.test(name) ? "invoice" : /nda/i.test(name) ? "nda" : /contrat|entente|cession|agreement|contract/i.test(name) ? "contract" : /cahier|cdc|sow|scope|requirements/i.test(name) ? "sow" : /compte-rendu|réunion|reunion|cr /i.test(name) ? "report" : "free";

/** Legacy Otopio « Administratif » layout: <section>/<structure>/… → workspace (until the split is done). */
function legacyAdminWs(path: string, byCode: Map<string, string>, fallback: string) {
  const seg = path.split("/")[2] ?? "";
  if (/^megascale$/i.test(seg)) return byCode.get("MGS") ?? fallback;
  if (/^freelance$/i.test(seg)) return (/ma[iï]ssane/i.test(path) ? byCode.get("MTF") : byCode.get("SHF")) ?? fallback;
  return fallback;
}

type Ctx = { ws: Ws; rootName: string; rootId: string; byCode: Map<string, string>; clientFolders: Map<string, string> };

async function upsertFile(f: DriveFile, ctx: Ctx, rel: string) {
  const path = `${ctx.rootName}/${rel}`;
  const top = rel.split("/")[0] ?? "";
  const isClients = ctx.rootName.endsWith("Clients");
  const orgId = isClients ? (ctx.clientFolders.get(top) ?? null) : null;
  const workspaceId = ctx.ws.code === "OTP" && !isClients ? legacyAdminWs(path, ctx.byCode, ctx.ws.id) : ctx.ws.id;
  const values = {
    workspaceId,
    title: f.name,
    kind: "document" as const,
    type: (f.mimeType === FOLDER ? "free" : typeOf(f.name)) as never,
    driveFileId: f.id,
    driveId: ctx.rootId,
    parentId: f.parents?.[0] ?? null,
    path,
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

/** All files under a folder / shared drive (recursive listing for personal folders). */
async function listTree(subject: string, rootId: string, shared: boolean) {
  if (shared) return drive.list(subject, "trashed=false", { driveId: rootId });
  // drive.file scope: only files created by the ERP are visible → small trees
  const out: DriveFile[] = [];
  const queue = [rootId];
  while (queue.length) {
    const p = queue.shift()!;
    const kids = await drive.list(subject, `'${p}' in parents and trashed=false`);
    for (const k of kids) {
      out.push(k);
      if (k.mimeType === FOLDER) queue.push(k.id);
    }
  }
  return out;
}

async function fullIndex(subject: string, ctx: Ctx, shared: boolean) {
  const files = await listTree(subject, ctx.rootId, shared);
  const byId = new Map(files.map((f) => [f.id, f]));
  const relOf = (f: DriveFile): string => {
    const p = f.parents?.[0];
    return p && p !== ctx.rootId && byId.has(p) ? `${relOf(byId.get(p)!)}/${f.name}` : f.name;
  };
  for (const f of files) await upsertFile(f, ctx, relOf(f));
  const ids = new Set(files.map((f) => f.id));
  const rows = await db.select({ id: schema.document.id, fid: schema.document.driveFileId }).from(schema.document).where(eq(schema.document.driveId, ctx.rootId));
  const gone = rows.filter((r) => r.fid && !ids.has(r.fid)).map((r) => r.id);
  if (gone.length) await db.delete(schema.document).where(inArray(schema.document.id, gone));
  return files.length;
}

export async function syncDrive() {
  const wss = await ensureStorage();
  await splitDrives(wss).catch((e) => console.warn("[drive] split", (e as Error).message));
  const byCode = new Map(wss.map((w) => [w.code, w.id]));
  const stats: Record<string, number | string> = {};
  for (const ws of wss) {
    const subject = await subjectOf(ws);
    if (!subject) {
      stats[ws.code] = "Drive personnel non connecté";
      continue;
    }
    const clientFolders = await ensureClientFolders(ws).catch(() => new Map<string, string>());
    const list: { name: string; id: string; shared: boolean }[] = ws.drive?.folderId
      ? [{ name: "ERP", id: ws.drive.folderId, shared: false }]
      : [
          ...(ws.drive?.clients ? [{ name: ws.code === "MGS" ? MGS_CLIENTS : PROJECTS_DRIVE, id: ws.drive.clients, shared: true }] : []),
          ...(ws.drive?.admin ? [{ name: ws.code === "MGS" ? MGS_ADMIN : ADMIN_DRIVE, id: ws.drive.admin, shared: true }] : []),
        ];
    for (const r of list) {
      const ctx: Ctx = { ws, rootName: r.name === "ERP" ? "ERP" : r.name, rootId: r.id, byCode, clientFolders };
      if (!r.shared) {
        stats[`${ws.code}:${r.name}`] = await fullIndex(subject, ctx, false);
        continue;
      }
      const tokenKey = `drive:${r.id}:pageToken`;
      let token: string | null = await getState(tokenKey);
      if (!token) {
        const start = await drive.startPageToken(subject, r.id);
        stats[`${ws.code}:${r.name}`] = await fullIndex(subject, ctx, true);
        await setState(tokenKey, start);
        continue;
      }
      let changed = 0;
      while (token) {
        const res = await drive.changes(subject, r.id, token);
        for (const c of res.changes) {
          if (c.removed || !c.file || c.file.trashed) {
            await db.delete(schema.document).where(eq(schema.document.driveFileId, c.fileId));
            continue;
          }
          const f = c.file;
          const [parent] = f.parents?.[0] ? await db.select({ path: schema.document.path }).from(schema.document).where(eq(schema.document.driveFileId, f.parents[0])) : [];
          const parentRel = parent?.path?.split("/").slice(1).join("/");
          await upsertFile(f, ctx, parentRel ? `${parentRel}/${f.name}` : f.name);
          changed++;
        }
        if (res.newStartPageToken) {
          await setState(tokenKey, res.newStartPageToken);
          token = null;
        } else token = res.nextPageToken ?? null;
      }
      // A renamed/moved folder changes the path of its children → reindex when something changed
      if (changed) await fullIndex(subject, ctx, true);
      stats[`${ws.code}:${r.name}`] = changed;
    }
  }
  return stats;
}

/* ------------------------------------------------------------------------ */
/*  Client folders                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Every client of the workspace has its folder (with category sub-folders) in the workspace's « Clients » storage,
 * kept in sync with the client's name. Returns folderName → organizationId.
 */
export async function ensureClientFolders(ws: Ws, onlyOrgId?: string) {
  const map = new Map<string, string>();
  const subject = await subjectOf(ws);
  if (!subject) return map;
  const root = (await roots(ws, subject)).clients;
  if (!root) return map;
  const folders = await drive.list(subject, `'${root}' in parents and mimeType='${FOLDER}' and trashed=false`, ws.drive?.folderId ? {} : { driveId: root });
  const orgs = await db
    .select()
    .from(schema.organization)
    .where(and(eq(schema.organization.workspaceId, ws.id), onlyOrgId ? eq(schema.organization.id, onlyOrgId) : eq(schema.organization.type, "client")));
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const o of orgs) {
    if (o.type !== "client") continue;
    const safeName = o.name.replace(/[\/]/g, "-");
    let folder = o.driveFolderId ? folders.find((f) => f.id === o.driveFolderId) : folders.find((f) => norm(f.name) === norm(o.name));
    if (!folder && o.driveFolderId) {
      folder = await drive.get(subject, o.driveFolderId).catch(() => undefined);
      if (folder?.trashed) folder = undefined;
      else if (folder && folder.parents?.[0] !== root) continue; // still in the former shared drive: moved by splitDrives
    }
    if (!folder && o.status === "former" && !onlyOrgId) continue; // no empty folders for past clients
    if (!folder) {
      folder = await drive.createFolder(subject, safeName, root);
      for (const s of CLIENT_SUBFOLDERS) await drive.createFolder(subject, s, folder.id);
      await log("drive-folder-created", "organization", o.id, `Dossier Drive « ${safeName} » créé (${ws.name})`, ws.drive?.folderId ? undefined : { trashDriveFile: folder.id });
    } else if (folder.name !== safeName) {
      const old = folder.name;
      folder = await drive.update(subject, folder.id, { name: safeName });
      await log("drive-folder-renamed", "organization", o.id, `Dossier Drive renommé « ${old} » → « ${safeName} »`, ws.drive?.folderId ? undefined : { renameDriveFile: { id: folder.id, name: old } });
    }
    if (o.driveFolderId !== folder.id) await db.update(schema.organization).set({ driveFolderId: folder.id }).where(eq(schema.organization.id, o.id));
    map.set(safeName, o.id);
  }
  if (!onlyOrgId) {
    for (const f of folders) if (!map.has(f.name)) {
      const o = orgs.find((x) => norm(x.name) === norm(f.name));
      if (o) map.set(f.name, o.id);
    }
    // non-client companies of the workspace that already have a folder (prospects, internal…)
    const others = await db.select().from(schema.organization).where(and(eq(schema.organization.workspaceId, ws.id), isNull(schema.organization.driveFolderId)));
    for (const f of folders) {
      if (map.has(f.name)) continue;
      const o = others.find((x) => norm(x.name) === norm(f.name) || (f.name.startsWith("Otopio") && x.type === "internal"));
      if (o) {
        await db.update(schema.organization).set({ driveFolderId: f.id }).where(and(eq(schema.organization.id, o.id), isNull(schema.organization.driveFolderId)));
        map.set(f.name, o.id);
      }
    }
    for (const f of folders) if (!map.has(f.name)) {
      const [o] = await db.select({ id: schema.organization.id }).from(schema.organization).where(and(eq(schema.organization.workspaceId, ws.id), eq(schema.organization.driveFolderId, f.id)));
      if (o) map.set(f.name, o.id);
    }
  }
  return map;
}

export async function ensureClientFolderById(orgId: string) {
  const [o] = await db.select().from(schema.organization).where(eq(schema.organization.id, orgId));
  if (!o) return new Map<string, string>();
  const [ws] = await db.select().from(schema.legalEntity).where(eq(schema.legalEntity.id, o.workspaceId));
  return ensureClientFolders(ws!, orgId);
}

/** Saves a generated PDF (quote / invoice) into the client's « Factures » / « Devis » folder. */
export async function savePdfToClientFolder(orgId: string | null, name: string, pdf: Uint8Array, kind = "invoice") {
  if (!orgId) return null;
  await ensureClientFolderById(orgId);
  const [o] = await db.select().from(schema.organization).where(eq(schema.organization.id, orgId));
  if (!o?.driveFolderId) return null;
  const [ws] = await db.select().from(schema.legalEntity).where(eq(schema.legalEntity.id, o.workspaceId));
  const subject = await subjectOf(ws!);
  if (!subject) return null;
  const target = (await findOrCreateFolder(subject, o.driveFolderId, kind === "quote" ? "Devis" : "Factures")).id;
  for (const parent of [target, o.driveFolderId]) {
    const existing = await drive.list(subject, `'${parent}' in parents and name='${q(name)}' and trashed=false`, { corpora: "allDrives" });
    for (const e of existing) await drive.update(subject, e.id, { trashed: true } as never);
  }
  const f = await drive.upload(subject, name, target, pdf, "application/pdf");
  return f.webViewLink ?? null;
}

/* ------------------------------------------------------------------------ */
/*  One-time split of the former shared layout into workspaces              */
/* ------------------------------------------------------------------------ */

const BATCH = Number(process.env.DRIVE_SPLIT_BATCH ?? 250);

/** Moves (shared → shared) or copies then trashes (shared → personal) a whole folder tree. */
async function transferTree(from: string, toSubject: string, toParent: string, budget: { n: number }, personal: boolean): Promise<boolean> {
  const kids = await drive.list(ADMIN, `'${from}' in parents and trashed=false`, { corpora: "allDrives" });
  let done = true;
  for (const k of kids) {
    if (budget.n <= 0) return false;
    if (k.mimeType === FOLDER) {
      const target = await findOrCreateFolder(toSubject, toParent, k.name);
      if (!(await transferTree(k.id, toSubject, target.id, budget, personal))) done = false;
      else await drive.update(ADMIN, k.id, { trashed: true }).catch(() => {});
      continue;
    }
    budget.n--;
    try {
      if (!personal) await drive.update(ADMIN, k.id, {}, { add: toParent, remove: k.parents?.[0] });
      // shared drive → personal Drive: copy then trash the original
      else await transferSingle(k, toSubject, toParent);
    } catch (e) {
      done = false;
      console.warn(`[drive] transfer « ${k.name} » failed:`, (e as Error).message);
    }
  }
  return done;
}

/**
 * Moves what belongs to Megascale / the freelances out of the Otopio shared drives (runs a batch per sync, resumable):
 *  - Administratif/<section>/Megascale/**  → « Megascale — Administratif »/<section>/**
 *  - Administratif/<section>/Freelance/*   → ERP/Administratif/<section>/ of Sami or Maïssane (file suffix « (Maïssane) »)
 *  - client folders of companies now in another workspace → that workspace's « Clients »
 *  - every client folder gets the category sub-folders
 */
async function splitDrives(wss: Ws[]) {
  const otp = wss.find((w) => w.code === "OTP");
  if (!otp?.drive?.clients || !otp.drive.admin) return;
  const budget = { n: BATCH };
  const byCode = new Map(wss.map((w) => [w.code, w]));
  const otpAdmin = otp.drive.admin;

  // 1. Administratif sections
  for (const section of await drive.list(ADMIN, `'${otpAdmin}' in parents and mimeType='${FOLDER}' and trashed=false`, { driveId: otpAdmin })) {
    for (const sub of await drive.list(ADMIN, `'${section.id}' in parents and mimeType='${FOLDER}' and trashed=false`, { driveId: otpAdmin })) {
      if (budget.n <= 0) return;
      if (/^megascale$/i.test(sub.name)) {
        const mgs = byCode.get("MGS");
        if (!mgs?.drive?.admin) continue;
        const target = await findOrCreateFolder(ADMIN, mgs.drive.admin, section.name);
        if (await transferTree(sub.id, ADMIN, target.id, budget, false)) {
          await drive.update(ADMIN, sub.id, { trashed: true });
          await log("drive-split", "legal_entity", mgs.id, `« ${ADMIN_DRIVE}/${section.name}/Megascale » déplacé vers « ${MGS_ADMIN}/${section.name} »`);
        }
      } else if (/^freelance$/i.test(sub.name)) {
        const files = await drive.list(ADMIN, `'${sub.id}' in parents and trashed=false`, { driveId: otpAdmin });
        let left = 0;
        for (const f of files) {
          const ws = byCode.get(/ma[iï]ssane/i.test(f.name) ? "MTF" : "SHF");
          const subject = ws ? await subjectOf(ws) : null;
          if (!ws?.drive?.folderId || !subject) {
            left++;
            continue;
          }
          if (budget.n <= 0) return;
          const adm = await findOrCreateFolder(subject, ws.drive.folderId, "Administratif");
          const target = await findOrCreateFolder(subject, adm.id, section.name);
          if (f.mimeType === FOLDER) {
            const t2 = await findOrCreateFolder(subject, target.id, f.name);
            if (await transferTree(f.id, subject, t2.id, budget, true)) await drive.update(ADMIN, f.id, { trashed: true });
            else left++;
          } else {
            await transferSingle(f, subject, target.id);
            budget.n--;
          }
        }
        if (!left && files.length) await drive.update(ADMIN, sub.id, { trashed: true }).catch(() => {});
      }
    }
  }

  // 2. client folders living in the Otopio « Clients » drive but owned by another workspace
  const moved = await db
    .select()
    .from(schema.organization)
    .where(and(sql`${schema.organization.driveFolderId} is not null`, sql`${schema.organization.workspaceId} <> ${otp.id}`));
  for (const o of moved) {
    if (budget.n <= 0) return;
    const f = await drive.get(ADMIN, o.driveFolderId!).catch(() => null);
    if (!f || f.trashed || f.driveId !== otp.drive.clients) continue;
    const ws = wss.find((w) => w.id === o.workspaceId);
    if (!ws) continue;
    const subject = await subjectOf(ws);
    if (!subject) continue; // personal Drive not connected yet → retried later
    const root = (await roots(ws, subject)).clients;
    if (!root) continue;
    const target = await findOrCreateFolder(subject, root, f.name);
    const done = await transferTree(f.id, subject, target.id, budget, !COMPANIES.has(ws.code));
    if (done) {
      await drive.update(ADMIN, f.id, { trashed: true });
      await db.update(schema.organization).set({ driveFolderId: target.id }).where(eq(schema.organization.id, o.id));
      await db.update(schema.document).set({ workspaceId: ws.id }).where(eq(schema.document.organizationId, o.id));
      await log("drive-split", "organization", o.id, `Dossier client « ${f.name} » déplacé vers ${ws.name}`);
    }
  }

  // 3. category sub-folders in every client folder (once per folder) + obvious files filed
  for (const ws of wss) {
    const subject = await subjectOf(ws);
    if (!subject) continue;
    const orgs = await db.select().from(schema.organization).where(and(eq(schema.organization.workspaceId, ws.id), sql`${schema.organization.driveFolderId} is not null`));
    for (const o of orgs) {
      const key = `drive:client-layout:${o.driveFolderId}`;
      if (await getState(key)) continue;
      if (budget.n <= 0) return;
      const sub = new Map<string, string>();
      for (const s of CLIENT_SUBFOLDERS) sub.set(s, (await findOrCreateFolder(subject, o.driveFolderId!, s)).id);
      const files = await drive.list(subject, `'${o.driveFolderId}' in parents and mimeType!='${FOLDER}' and trashed=false`, { corpora: "allDrives" });
      for (const f of files) {
        const t = typeOf(f.name);
        const target = /— (Facture|Avoir) —/i.test(f.name) || t === "invoice" ? "Factures" : /— Devis —/i.test(f.name) || t === "quote" ? "Devis" : /— (Contrat|NDA|Mise en demeure|Entente) —/i.test(f.name) || t === "contract" || t === "nda" ? "Juridique" : null;
        if (!target) continue;
        budget.n--;
        await drive.update(subject, f.id, {}, { add: sub.get(target)!, remove: o.driveFolderId! }).catch(() => {});
      }
      await setState(key, "1");
    }
  }
}

/** shared drive → personal Drive: download (Google files exported to Office formats), upload, trash the original */
async function transferSingle(f: DriveFile, subject: string, parent: string) {
  const native = f.mimeType.startsWith("application/vnd.google-apps.");
  const exportAs: Record<string, string> = {
    "application/vnd.google-apps.document": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.google-apps.spreadsheet": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.google-apps.presentation": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  if (native && !exportAs[f.mimeType]) return;
  const data = native
    ? new Uint8Array(await (await gfetch<Response>(ADMIN, SCOPES.drive, `https://www.googleapis.com/drive/v3/files/${f.id}/export?mimeType=${encodeURIComponent(exportAs[f.mimeType]!)}`, { raw: true })).arrayBuffer())
    : await drive.download(ADMIN, f.id);
  const copy = await drive.upload(subject, f.name, parent, data, native ? exportAs[f.mimeType]! : f.mimeType);
  // records pointing at the original now point at the copy
  await db.update(schema.transaction).set({ driveFileId: copy.id, fileUrl: copy.webViewLink ?? null }).where(eq(schema.transaction.driveFileId, f.id));
  await db.update(schema.transaction).set({ fileUrl: copy.webViewLink ?? null }).where(like(schema.transaction.fileUrl, `%${f.id}%`));
  await db.update(schema.quote).set({ fileUrl: copy.webViewLink ?? null }).where(like(schema.quote.fileUrl, `%${f.id}%`));
  await drive.update(ADMIN, f.id, { trashed: true });
}
