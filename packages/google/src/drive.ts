import { gfetch, SCOPES } from "./index";

const D = "https://www.googleapis.com/drive/v3";
export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  driveId?: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  md5Checksum?: string;
  owners?: { emailAddress: string }[];
  trashed?: boolean;
  shortcutDetails?: { targetId: string };
};
export const FOLDER = "application/vnd.google-apps.folder";
const FIELDS = "id,name,mimeType,parents,driveId,size,modifiedTime,createdTime,webViewLink,iconLink,thumbnailLink,md5Checksum,owners(emailAddress),trashed";
const ALL = "supportsAllDrives=true&includeItemsFromAllDrives=true";

export const drive = {
  sharedDrives: async (user: string, admin = false) =>
    (await gfetch<{ drives: { id: string; name: string }[] }>(user, SCOPES.drive, `${D}/drives?pageSize=100${admin ? "&useDomainAdminAccess=true" : ""}`)).drives,
  createSharedDrive: (user: string, name: string) =>
    gfetch<{ id: string; name: string }>(user, SCOPES.drive, `${D}/drives?requestId=${crypto.randomUUID()}`, { method: "POST", json: { name } }),
  updateSharedDrive: (user: string, id: string, body: Record<string, unknown>) => gfetch(user, SCOPES.drive, `${D}/drives/${id}?useDomainAdminAccess=true`, { method: "PATCH", json: body }),
  list: async (user: string, q: string, opts: { driveId?: string; corpora?: string } = {}) => {
    const out: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const r = await gfetch<{ files: DriveFile[]; nextPageToken?: string }>(
        user,
        SCOPES.drive,
        `${D}/files?pageSize=1000&${ALL}&fields=nextPageToken,files(${FIELDS})&q=${encodeURIComponent(q)}${opts.driveId ? `&corpora=drive&driveId=${opts.driveId}` : opts.corpora ? `&corpora=${opts.corpora}` : ""}${pageToken ? `&pageToken=${pageToken}` : ""}`,
      );
      out.push(...r.files);
      pageToken = r.nextPageToken;
    } while (pageToken);
    return out;
  },
  get: (user: string, id: string) => gfetch<DriveFile>(user, SCOPES.drive, `${D}/files/${id}?${ALL}&fields=${FIELDS}`),
  createFolder: (user: string, name: string, parent: string) =>
    gfetch<DriveFile>(user, SCOPES.drive, `${D}/files?${ALL}&fields=${FIELDS}`, { method: "POST", json: { name, mimeType: FOLDER, parents: [parent] } }),
  update: (user: string, id: string, body: { name?: string }, move?: { add?: string; remove?: string }) =>
    gfetch<DriveFile>(
      user,
      SCOPES.drive,
      `${D}/files/${id}?${ALL}&fields=${FIELDS}${move?.add ? `&addParents=${move.add}` : ""}${move?.remove ? `&removeParents=${move.remove}` : ""}`,
      { method: "PATCH", json: body },
    ),
  copy: (user: string, id: string, name: string, parent: string) =>
    gfetch<DriveFile>(user, SCOPES.drive, `${D}/files/${id}/copy?${ALL}&fields=${FIELDS}`, { method: "POST", json: { name, parents: [parent] } }),
  upload: async (user: string, name: string, parent: string, data: Uint8Array, mimeType: string) => {
    const boundary = `b${crypto.randomUUID()}`;
    const meta = JSON.stringify({ name, parents: [parent] });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      Buffer.from(data),
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    return gfetch<DriveFile>(user, SCOPES.drive, `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&${ALL}&fields=${FIELDS}`, {
      method: "POST",
      body,
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
    });
  },
  download: async (user: string, id: string) => {
    const r = await gfetch<Response>(user, SCOPES.drive, `${D}/files/${id}?alt=media&supportsAllDrives=true`, { raw: true });
    return new Uint8Array(await r.arrayBuffer());
  },
  permissions: async (user: string, id: string, admin = false) =>
    (await gfetch<{ permissions: { id: string; emailAddress?: string; role: string; type: string }[] }>(user, SCOPES.drive, `${D}/files/${id}/permissions?supportsAllDrives=true&fields=permissions(id,emailAddress,role,type)${admin ? "&useDomainAdminAccess=true" : ""}`)).permissions,
  addPermission: (user: string, id: string, email: string, role: "organizer" | "fileOrganizer" | "writer" | "reader", admin = false) =>
    gfetch(user, SCOPES.drive, `${D}/files/${id}/permissions?supportsAllDrives=true&sendNotificationEmail=false${admin ? "&useDomainAdminAccess=true" : ""}`, { method: "POST", json: { type: "user", role, emailAddress: email } }),
  removePermission: (user: string, id: string, permId: string, admin = false) =>
    gfetch(user, SCOPES.drive, `${D}/files/${id}/permissions/${permId}?supportsAllDrives=true${admin ? "&useDomainAdminAccess=true" : ""}`, { method: "DELETE" }),
  startPageToken: async (user: string, driveId: string) =>
    (await gfetch<{ startPageToken: string }>(user, SCOPES.drive, `${D}/changes/startPageToken?supportsAllDrives=true&driveId=${driveId}`)).startPageToken,
  changes: (user: string, driveId: string, pageToken: string) =>
    gfetch<{ changes: { fileId: string; removed: boolean; file?: DriveFile }[]; nextPageToken?: string; newStartPageToken?: string }>(
      user,
      SCOPES.drive,
      `${D}/changes?pageToken=${pageToken}&driveId=${driveId}&${ALL}&pageSize=1000&fields=nextPageToken,newStartPageToken,changes(fileId,removed,file(${FIELDS}))`,
    ),
};
