/**
 * Claude (Anthropic) for every AI feature of the ERP — cheap by design:
 *  - Claude Haiku 5.5 ($0.10 / $0.50 per MTok), effort "low", short max_tokens
 *  - stable system prompts first (prompt caching when long enough)
 *  - every call logged in `ai_usage` (tokens + USD cost) → Settings › IA
 *  - hard monthly budget (AI_MONTHLY_BUDGET_USD, default 10 $): calls are refused beyond it
 */
import Anthropic from "@anthropic-ai/sdk";
import { gte, sql } from "drizzle-orm";
import { db, schema } from "@erp/db";

export const AI_MODEL = process.env.AI_MODEL || "claude-haiku-5-5";
/** USD per million tokens */
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-opus-5-5": { in: 4, out: 20 },
};
const budget = () => Number(process.env.AI_MONTHLY_BUDGET_USD || 10);

let client: Anthropic | null = null;
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
const getClient = () => (client ??= new Anthropic({ maxRetries: 3 }));

export function costOf(model: string, u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) {
  const p = PRICES[model] ?? PRICES["claude-haiku-5-5"]!;
  const read = u.cache_read_input_tokens ?? 0;
  const write = u.cache_creation_input_tokens ?? 0;
  return (u.input_tokens * p.in + read * p.in * 0.1 + write * p.in * 1.25 + u.output_tokens * p.out) / 1e6;
}

let monthCache = { at: 0, spent: 0 };
export async function monthSpent() {
  if (Date.now() - monthCache.at < 60_000) return monthCache.spent;
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [r] = await db.select({ s: sql<string>`coalesce(sum(${schema.aiUsage.cost}),0)` }).from(schema.aiUsage).where(gte(schema.aiUsage.createdAt, start));
  monthCache = { at: Date.now(), spent: Number(r?.s ?? 0) };
  return monthCache.spent;
}

function parseJson(text: string) {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e < s) throw new Error("Réponse IA sans JSON");
  return JSON.parse(text.slice(s, e + 1));
}

/**
 * One cheap completion. `feature` names the caller (shown in the cost dashboard).
 * json=true → returns the parsed object.
 */
export async function ai<T = string>(feature: string, system: string, user: string, json = false, maxTokens = 1200): Promise<T> {
  if (!aiEnabled()) throw new Error("ANTHROPIC_API_KEY manquante");
  if ((await monthSpent()) >= budget()) throw new Error(`Budget IA mensuel atteint (${budget()} $)`);
  const model = AI_MODEL;
  try {
    const res = await getClient().messages.create({
      model,
      max_tokens: maxTokens,
      output_config: { effort: "low" },
      system: [{ type: "text", text: system + (json ? "\n\nRéponds uniquement avec un objet JSON valide, sans texte autour." : ""), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user.slice(0, 24_000) }],
    });
    const u = res.usage;
    const cost = costOf(model, u);
    monthCache.spent += cost;
    await db
      .insert(schema.aiUsage)
      .values({ feature, model, inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0, cost: cost.toFixed(6) })
      .catch(() => {});
    if (res.stop_reason === "refusal") throw new Error("Requête refusée par le modèle");
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return (json ? parseJson(text) : text) as T;
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : (e as Error).message;
    await db.insert(schema.aiUsage).values({ feature, model, ok: false, error: msg.slice(0, 300) }).catch(() => {});
    throw new Error(`IA: ${msg}`);
  }
}
