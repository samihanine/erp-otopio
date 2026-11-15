import { drive, FOLDER } from "@erp/google";
const A = "contact@otopio.ca";
for (const d of await drive.sharedDrives(A, true)) {
  const files = await drive.list(A, "trashed=false", { driveId: d.id });
  const byParent = new Map<string, typeof files>();
  for (const f of files) { const p = f.parents?.[0] ?? d.id; if (!byParent.has(p)) byParent.set(p, []); byParent.get(p)!.push(f); }
  const lines: string[] = [];
  const walk = (id: string, depth: number) => {
    const kids = (byParent.get(id) ?? []).sort((a, b) => Number(b.mimeType === FOLDER) - Number(a.mimeType === FOLDER) || a.name.localeCompare(b.name));
    const folders = kids.filter((k) => k.mimeType === FOLDER), docs = kids.filter((k) => k.mimeType !== FOLDER);
    for (const f of folders) { lines.push(`${"  ".repeat(depth)}📁 ${f.name} (${(byParent.get(f.id) ?? []).length})`); if (depth < 1 || !/Médias/.test(f.name)) walk(f.id, depth + 1); }
    if (depth >= 1) docs.slice(0, depth === 1 ? 4 : 2).forEach((f) => lines.push(`${"  ".repeat(depth)}📄 ${f.name}`));
    if (depth >= 1 && docs.length > (depth === 1 ? 4 : 2)) lines.push(`${"  ".repeat(depth)}… +${docs.length - (depth === 1 ? 4 : 2)}`);
  };
  console.log(`\n### ${d.name} (${files.length})`); walk(d.id, 0); console.log(lines.join("\n"));
}
