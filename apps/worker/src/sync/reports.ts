/**
 * One-off reports requested by the owner, computed in production and dropped as a private file
 * in contact@otopio.ca's own Drive (not a shared drive), then read and deleted by the operator.
 */
import { sql } from "drizzle-orm";
import { db } from "@erp/db";
import { drive } from "@erp/google";
import { ADMIN, getState, setState } from "./common";

const AI = "(anthropic|claude|openai|chatgpt|gpt|cursor|midjourney|perplexity|mistral|gemini|copilot|elevenlabs|replicate|runpod|hugging ?face|groq|deepseek|v0\\.dev|lovable|bolt\\.new)";

export async function runOneOffReports() {
  if ((process.env.APP_ENV ?? "production") !== "production") return;
  const key = "report:ai-spend:v1";
  if (await getState(key)) return;
  const rows = (await db.execute(sql`
    select le.code as ws, le.name, extract(year from t.date)::int as year, t.currency, t.scope::text as scope,
           (t.category::text = 'ai') as by_category, t.date::text as date, t.label, t.total::float as total, t.paid_by
    from "transaction" t join legal_entity le on le.id = t.workspace_id
    where t.kind = 'expense' and t.status <> 'cancelled' and extract(year from t.date) in (2025, 2026)
      and (t.category::text = 'ai' or t.label ~* ${AI} or coalesce(t.counterparty, '') ~* ${AI})
    order by le.code, t.date`)) as unknown as { ws: string; name: string; year: number; currency: string; scope: string; by_category: boolean; date: string; label: string; total: number; paid_by: string }[];
  const usage = (await db.execute(sql`select extract(year from created_at)::int as year, round(sum(cost)::numeric, 2)::float as usd, count(*)::int as calls from ai_usage group by 1 order by 1`)) as unknown as { year: number; usd: number; calls: number }[];
  const summary: Record<string, Record<string, Record<string, number>>> = {};
  for (const r of rows) {
    const k = `${r.ws} ${r.name}`;
    summary[k] ??= {};
    summary[k][r.year] ??= {};
    const cur = `${r.currency}${r.scope === "perso" ? " (perso)" : ""}`;
    summary[k][r.year]![cur] = Math.round(((summary[k][r.year]![cur] ?? 0) + r.total) * 100) / 100;
  }
  const report = { generatedAt: new Date().toISOString(), summary, erpClaudeApi: usage, rows };
  await drive.upload(ADMIN, `erp-report-ai-spend-${Date.now()}.json`, "root", new TextEncoder().encode(JSON.stringify(report, null, 1)), "application/json");
  await setState(key, new Date().toISOString());
  console.log(`[report] ai-spend: ${rows.length} rows`);
}
