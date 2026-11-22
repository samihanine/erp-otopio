/**
 * Background worker (BullMQ on Redis)
 *  - render-pdf : prints the branded HTML of a quote / invoice with Chromium
 *  - db-backup  : pg_dump → gzip → Cloudflare R2 (repeatable, BACKUP_CRON)
 */
import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { S3Client } from "bun";
import puppeteer, { type Browser } from "puppeteer-core";
import { googleConfigured } from "@erp/google";
import { ensureClientFolderById, savePdfToClientFolder, syncDrive } from "./sync/drive";
import { MEMBERS, setState } from "./sync/common";
import { deleteEventInGoogle, patchEventInGoogle, pushEventToGoogle, syncCalendars } from "./sync/calendar";
import { attachMissingReceipts, syncGmail } from "./sync/gmail";
import { syncPersonalGmail } from "./sync/personal";
import { qontoConfigured, syncQonto } from "./sync/qonto";
import { dashboardDigest, summarizeClients, summarizeCommunications } from "./sync/ai";
import { runOneOffReports } from "./sync/reports";

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

async function renderPdf(data: { kind: string; id: string; html: string; organizationId?: string | null; fileName?: string }) {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setContent(data.html, { waitUntil: "load", timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    let url: string | null = null;
    if (googleConfigured() && data.organizationId && data.fileName) {
      url = await savePdfToClientFolder(data.organizationId, data.fileName, pdf, data.kind).catch((e) => {
        console.warn("[pdf] drive upload failed", (e as Error).message);
        return null;
      });
    }
    if (!url && r2Ready) {
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
      case "drive-sync":
        return googleConfigured() ? syncDrive() : null;
      case "client-folder":
        return googleConfigured() ? Object.fromEntries(await ensureClientFolderById(job.data.organizationId)) : null;
      case "calendar-sync":
        if (job.data?.full) for (const m of MEMBERS) await setState(`calendar:${m}:syncToken`, "");
        return googleConfigured() ? syncCalendars() : null;
      case "event-push":
        return googleConfigured() ? (job.data.action === "delete" ? deleteEventInGoogle(job.data.owner, job.data.googleEventId) : job.data.action === "update" ? patchEventInGoogle(job.data.id) : pushEventToGoogle(job.data.id)) : null;
      case "gmail-sync": {
        if (!googleConfigured()) return null;
        const stats = await syncGmail();
        const receipts = await attachMissingReceipts().catch(() => 0);
        return { ...stats, receipts };
      }
      case "qonto-sync":
        return qontoConfigured() ? syncQonto() : null;
      case "personal-gmail-sync":
        return syncPersonalGmail(Boolean(job.data?.full));
      case "ai-sync": {
        const comms = await summarizeCommunications();
        const clients = await summarizeClients();
        const digest = await dashboardDigest();
        return { comms, clients, digest };
      }
      default:
        throw new Error(`Unknown job ${job.name}`);
    }
  },
  { connection, concurrency: 2, lockDuration: 10 * 60_000 },
);

worker.on("completed", (job) => console.log(`[worker] ${job.name} #${job.id} done`));
worker.on("failed", (job, err) => console.error(`[worker] ${job?.name} #${job?.id} failed:`, err.message));

// Schedule the recurring backup
const queue = new Queue(QUEUE, { connection });
await queue.upsertJobScheduler("db-backup", { pattern: env.BACKUP_CRON ?? "0 3 * * *" }, { name: "db-backup", opts: { removeOnComplete: 30, removeOnFail: 30 } });
const keep = { removeOnComplete: 20, removeOnFail: 50 };
if (env.SYNC_ENABLED !== "false") {
  await queue.upsertJobScheduler("drive-sync", { every: 5 * 60_000 }, { name: "drive-sync", opts: keep });
  await queue.upsertJobScheduler("calendar-sync", { every: 2 * 60_000 }, { name: "calendar-sync", opts: keep });
  await queue.upsertJobScheduler("gmail-sync", { every: 5 * 60_000 }, { name: "gmail-sync", opts: keep });
  await queue.upsertJobScheduler("qonto-sync", { every: 15 * 60_000 }, { name: "qonto-sync", opts: keep });
  await queue.upsertJobScheduler("personal-gmail-sync", { every: 5 * 60_000 }, { name: "personal-gmail-sync", opts: keep });
  await queue.upsertJobScheduler("ai-sync", { every: 60 * 60_000 }, { name: "ai-sync", opts: keep });
} else {
  for (const id of ["drive-sync", "calendar-sync", "gmail-sync", "qonto-sync", "personal-gmail-sync", "ai-sync"]) await queue.removeJobScheduler(id).catch(() => {});
}

if (googleConfigured()) runOneOffReports().catch((e) => console.error("[report]", (e as Error).message));
console.log(`[worker] ready — R2 ${r2Ready ? "configured" : "not configured"}, backups "${env.BACKUP_CRON ?? "0 3 * * *"}"`);

const shutdown = async () => {
  await worker.close();
  await browser?.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
