/** Inventory of shared drives + personal "My Drive" files of each member → JSON */
import { drive, FOLDER, type DriveFile } from "@erp/google";
const ADMIN = "contact@otopio.ca";
const USERS = ["sami@otopio.ca", "contact@otopio.ca", "maissane@otopio.ca", "noah@otopio.ca"];
const out: Record<string, unknown> = {};
const drives = await drive.sharedDrives(ADMIN, true);
for (const d of drives) {
  const perms = await drive.permissions(ADMIN, d.id, true);
  if (!perms.some((p) => p.emailAddress === ADMIN)) {
    await drive.addPermission(ADMIN, d.id, ADMIN, "organizer", true);
    console.log("added contact@ as organizer of", d.name);
  }
}
for (const d of drives) {
  const files = await drive.list(ADMIN, "trashed=false", { driveId: d.id });
  const byId = new Map(files.map((f) => [f.id, f]));
  const path = (f: DriveFile): string => {
    const p = f.parents?.[0];
    if (!p || p === d.id || !byId.has(p)) return f.name;
    return `${path(byId.get(p)!)}/${f.name}`;
  };
  const perms = await drive.permissions(ADMIN, d.id, true);
  out[d.name] = { id: d.id, members: perms.map((p) => `${p.emailAddress ?? p.type}:${p.role}`), files: files.map((f) => ({ id: f.id, path: path(f), mime: f.mimeType, size: Number(f.size ?? 0), md5: f.md5Checksum, modified: f.modifiedTime, parent: f.parents?.[0] })) };
  console.log(d.name, files.length, "files,", files.filter((f) => f.mimeType === FOLDER).length, "folders");
}
for (const u of USERS) {
  const files = await drive.list(u, "'me' in owners and trashed=false", { corpora: "user" });
  out[`personal:${u}`] = files.map((f) => ({ id: f.id, name: f.name, mime: f.mimeType, size: Number(f.size ?? 0), md5: f.md5Checksum, modified: f.modifiedTime, parent: f.parents?.[0] }));
  console.log(u, files.length, "personal files");
}
await Bun.write(process.argv[2]!, JSON.stringify(out, null, 1));
