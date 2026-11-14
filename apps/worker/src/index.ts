/**
 * Background worker (BullMQ on Redis)
 *  - render-pdf : prints the branded HTML of a quote / invoice with Chromium
 *  - db-backup  : pg_dump → gzip → Cloudflare R2 (repeatable, BACKUP_CRON)
 */
import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { S3Client } from "bun";
import puppeteer, { type Browser } from "puppeteer-core";

const env = process.env;
const QUEUE = "erp";
const connection = new IORedis(env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
const r2Ready = Boolean(env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);
const s3 = (bucket: string) =>
  new S3Client({ endpoint: env.R2_ENDPOINT, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, bucket });

let browser: Browser | null = null;
async function getBrowser() {
  if (browser?.connected) return browser;
  browser = await puppeteer.launch({
    executablePath: env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });
  return browser;
}

async function renderPdf(data: { kind: string; id: string; html: string }) {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setContent(data.html, { waitUntil: "load", timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    let url: string | null = null;
    if (r2Ready) {
      const key = `documents/${data.kind}/${data.id}.pdf`;
      await s3(env.R2_BUCKET ?? "otopio-erp").write(key, pdf, { type: "application/pdf" });
      url = env.R2_PUBLIC_URL ? `${env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}` : null;
    }
    return { pdfBase64: Buffer.from(pdf).toString("base64"), url };
  } finally {
    await page.close();
  }
}

async function backupDatabase() {
  if (!r2Ready) {
    console.log("[backup] R2 not configured — skipping");
    return { skipped: true };
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const proc = Bun.spawn(["pg_dump", "--no-owner", "--no-privileges", "--format=custom", env.DATABASE_URL!], { stdout: "pipe", stderr: "pipe" });
  const dump = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
  const code = await proc.exited;
  if (code !== 0) throw new Error(`pg_dump failed: ${await new Response(proc.stderr).text()}`);
  const key = `${env.APP_ENV ?? "dev"}/erp-${stamp}.dump`;
  await s3(env.R2_BACKUP_BUCKET ?? "otopio-erp-backups").write(key, dump, { type: "application/octet-stream" });
  console.log(`[backup] uploaded ${key} (${(dump.byteLength / 1024).toFixed(0)} KiB)`);
  return { key, size: dump.byteLength };
}

const worker = new Worker(
  QUEUE,
  async (job) => {
    switch (job.name) {
      case "render-pdf":
        return renderPdf(job.data);
      case "db-backup":
        return backupDatabase();
      default:
        throw new Error(`Unknown job ${job.name}`);
    }
  },
  { connection, concurrency: 2 },
);

worker.on("completed", (job) => console.log(`[worker] ${job.name} #${job.id} done`));
worker.on("failed", (job, err) => console.error(`[worker] ${job?.name} #${job?.id} failed:`, err.message));

// Schedule the recurring backup
const queue = new Queue(QUEUE, { connection });
await queue.upsertJobScheduler("db-backup", { pattern: env.BACKUP_CRON ?? "0 3 * * *" }, { name: "db-backup", opts: { removeOnComplete: 30, removeOnFail: 30 } });

console.log(`[worker] ready — R2 ${r2Ready ? "configured" : "not configured"}, backups "${env.BACKUP_CRON ?? "0 3 * * *"}"`);

const shutdown = async () => {
  await worker.close();
  await browser?.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
