import { Hono } from "hono";
import { S3Client } from "bun";
import { db, schema } from "@erp/db";
import type { AppEnv } from "../lib/types";
import { env, r2Configured } from "../lib/env";

export const files = new Hono<AppEnv>();

const client = (bucket = env.r2.bucket) => new S3Client({ endpoint: env.r2.endpoint, accessKeyId: env.r2.accessKeyId, secretAccessKey: env.r2.secretAccessKey, bucket });

files.post("/", async (c) => {
  if (!r2Configured()) return c.json({ error: "Stockage R2 non configuré" }, 503);
  const form = await c.req.formData();
  const f = form.get("file");
  if (!(f instanceof File)) return c.json({ error: "Missing file" }, 400);
  const table = (form.get("table") as string) || null;
  const recordId = (form.get("recordId") as string) || null;
  const safe = f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_");
  // Website media go to the public bucket served by the CDN (media.otopio.ca)
  if (form.get("public") === "1" && env.r2.publicBucket && env.r2.publicMediaUrl) {
    const key = `${table ?? "misc"}/${crypto.randomUUID().slice(0, 8)}-${safe}`;
    await client(env.r2.publicBucket).write(key, f, { type: f.type || "application/octet-stream" });
    return c.json({ key, url: `${env.r2.publicMediaUrl.replace(/\/$/, "")}/${key}` }, 201);
  }
  const key = `${table ?? "misc"}/${crypto.randomUUID()}-${safe}`;
  await client().write(key, f, { type: f.type });
  const [row] = await db
    .insert(schema.file)
    .values({ key, name: f.name, size: f.size, mimeType: f.type || "application/octet-stream", table, recordId, uploadedBy: c.get("user")?.id })
    .returning();
  const url = env.r2.publicUrl ? `${env.r2.publicUrl.replace(/\/$/, "")}/${key}` : `/api/files/${row!.id}`;
  return c.json({ ...row, url }, 201);
});

files.get("/:id", async (c) => {
  const { eq } = await import("drizzle-orm");
  const [row] = await db.select().from(schema.file).where(eq(schema.file.id, c.req.param("id")));
  if (!row || !r2Configured()) return c.json({ error: "Not found" }, 404);
  return c.redirect(client().presign(row.key, { expiresIn: 600 }));
});
