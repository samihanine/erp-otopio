/**
 * Upload local files listed in a manifest to a shared Drive folder (skips names already present).
 *   GOOGLE_SERVICE_ACCOUNT_FILE=sa.json bun scripts/drive-upload.ts manifest.json <folderId> [--dry]
 * manifest: [{ path, name }] → writes back { driveFileId } per entry.
 */
import { readFile, writeFile } from "node:fs/promises";
import { drive } from "@erp/google";

const [manifestPath, folder] = process.argv.slice(2);
const DRY = process.argv.includes("--dry");
const ADMIN = "contact@otopio.ca";
const MIME: Record<string, string> = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword" };

const manifest = JSON.parse(await readFile(manifestPath!, "utf8")) as { path: string; name: string; driveFileId?: string }[];
const existing = await drive.list(ADMIN, `'${folder}' in parents and trashed=false`);
const names = new Set(existing.map((f) => f.name.toLowerCase()));
let n = 0;
for (const m of manifest) {
  if (m.driveFileId || names.has(m.name.toLowerCase())) continue;
  if (DRY) {
    console.log("would upload", m.name);
    continue;
  }
  const ext = m.name.split(".").pop()!.toLowerCase();
  const f = await drive.upload(ADMIN, m.name, folder!, new Uint8Array(await readFile(m.path)), MIME[ext] ?? "application/octet-stream");
  m.driveFileId = f.id;
  names.add(m.name.toLowerCase());
  n++;
}
await writeFile(manifestPath!, JSON.stringify(manifest, null, 1));
console.log(`uploaded ${n}, already present ${manifest.length - n}`);
