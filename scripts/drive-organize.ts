/**
 * Executes a Drive reorganization plan (see drive-plan.json):
 * renames legacy client folders, creates the target tree, moves + renames files, trashes empty leftovers.
 * Moves only — nothing is deleted (empty folders go to the trash, recoverable 30 days).
 */
import { drive, FOLDER, pool } from "@erp/google";
const ADMIN = "contact@otopio.ca";
const plan = JSON.parse(await Bun.file(process.argv[2]!).text()) as {
  folders: [string, string][];
  moves: { id: string; as: string; drive: string; path: string; rename: string | null; src: string }[];
  renameDrive: { from: string; to: string }[];
  members: { drive: string; email: string; role: "organizer" | "fileOrganizer" | "writer" }[];
};
const LEGACY: Record<string, string> = { MTaRegion: "M ta région", TEA: "Tealecom", "Epik EATS": "Epik Eats", "Boréal": "Boréal Technologie", PFE: "Otopio (interne)" };

const drives = await drive.sharedDrives(ADMIN, true);
const driveId = (name: string) => drives.find((d) => d.name === name)!.id;
for (const m of plan.members) {
  const perms = await drive.permissions(ADMIN, driveId(m.drive), true);
  if (!perms.some((p) => p.emailAddress === m.email)) await drive.addPermission(ADMIN, driveId(m.drive), m.email, m.role, true);
}
// Rename legacy client folders in place (keeps ids/links)
const proj = driveId("Projets");
const top = await drive.list(ADMIN, `'${proj}' in parents and trashed=false and mimeType='${FOLDER}'`, { driveId: proj });
for (const f of top) if (LEGACY[f.name] && !top.some((x) => x.name === LEGACY[f.name])) await drive.update(ADMIN, f.id, { name: LEGACY[f.name] });

// Folder cache: drive/path -> id
const cache = new Map<string, string>();
async function ensure(dName: string, path: string): Promise<string> {
  const key = `${dName}/${path}`;
  if (cache.has(key)) return cache.get(key)!;
  const did = driveId(dName);
  let parent = did;
  let acc = "";
  for (const seg of path.split("/").filter(Boolean)) {
    acc = acc ? `${acc}/${seg}` : seg;
    const k = `${dName}/${acc}`;
    if (cache.has(k)) {
      parent = cache.get(k)!;
      continue;
    }
    const safe = seg.replace(/'/g, "\\'");
    const found = await drive.list(ADMIN, `'${parent}' in parents and name='${safe}' and mimeType='${FOLDER}' and trashed=false`, { driveId: did });
    parent = found[0]?.id ?? (await drive.createFolder(ADMIN, seg, parent)).id;
    cache.set(k, parent);
  }
  return parent;
}
for (const [d, p] of plan.folders) await ensure(d, p);
// Pre-create every target folder sequentially (no races)
for (const m of plan.moves) await ensure(m.drive, m.path);

let ok = 0, fail = 0;
const touchedParents = new Set<string>();
await pool(plan.moves, 3, async (m) => {
  try {
    const f = await drive.get(m.as, m.id);
    const target = cache.get(`${m.drive}/${m.path}`)!;
    const already = f.parents?.includes(target);
    (f.parents ?? []).forEach((p) => touchedParents.add(p));
    if (already && (!m.rename || m.rename === f.name)) return ok++;
    await drive.update(m.as, m.id, m.rename ? { name: m.rename } : {}, already ? undefined : { add: target, remove: (f.parents ?? []).join(",") });
    ok++;
  } catch (e) {
    fail++;
    console.warn("FAIL", m.src, (e as Error).message.slice(0, 160));
  }
});
// Trash now-empty legacy folders (recursively bottom-up)
let trashed = 0;
for (const name of ["Projets", "Administratif Otopio", "Directeurs Otopio"]) {
  const did = driveId(name);
  for (let pass = 0; pass < 4; pass++) {
    const folders = await drive.list(ADMIN, `mimeType='${FOLDER}' and trashed=false`, { driveId: did });
    const keep = new Set(cache.values());
    for (const f of folders) {
      if (keep.has(f.id)) continue;
      const kids = await drive.list(ADMIN, `'${f.id}' in parents and trashed=false`, { driveId: did });
      if (!kids.length) {
        await drive.update(ADMIN, f.id, { trashed: true } as never);
        trashed++;
      }
    }
  }
}
for (const r of plan.renameDrive) {
  const d = drives.find((x) => x.name === r.from);
  if (d) await drive.updateSharedDrive(ADMIN, d.id, { name: r.to });
}
console.log({ moved: ok, failed: fail, emptyFoldersTrashed: trashed });
