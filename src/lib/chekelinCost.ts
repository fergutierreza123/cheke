// What chekelin's model calls cost (issue #9). Pure: used by the server when
// it records each call (chekelin_usage, migration 0037) and by
// `npm run report:chekelin-cost`, which runs this file directly in Node, so
// it imports nothing.

// US dollars per million tokens, Anthropic's first-party API.
// Source: https://platform.claude.com/docs/en/about-claude/pricing ("Model
// pricing" table: base input, 5m cache writes, cache hits, output), read on
// 2026-10-20. Haiku 5.5: the "prompts up to 100,000 tokens" row (chekelin's
// prompts are a few thousand tokens). chekelin only writes 5-minute cache
// entries (cache_control "ephemeral"), so the 1-hour price isn't needed.
// Check this table against the pricing page whenever CHEKELIN_MODEL changes
// (src/lib/ai.ts). Fallback models are here because a refused request can be
// answered by another model ("fallbacks: default"), billed at its own price.
export const CHEKELIN_PRICES_USD_PER_MTOK: Record<
  string,
  { input: number; output: number; cacheWrite: number; cacheRead: number }
> = {
  // chekelin's model today.
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  // The cheaper model it could go back to.
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  // Possible server-side fallbacks.
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-opus-4-8": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
};

// Lempiras per US dollar, only to show the report in the plan's currency.
// APPROXIMATE (Banco Central de Honduras, late 2026): update when it moves.
export const HNL_PER_USD = 26.5;

// One billed model attempt.
export type UsageRecord = {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
};

// The parts of the API's `usage` object this reads (Anthropic.Beta.BetaUsage).
type ApiTokens = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};
export type ApiUsage = ApiTokens & {
  iterations?: Array<ApiTokens & { type: string; model?: string | null }> | null;
};

// One record per billed attempt. With a server-side fallback (or any
// multi-step call) `usage.iterations` lists every attempt with its own model;
// the top-level numbers cover only the attempt that answered.
export function usageRecords(responseModel: string, usage: ApiUsage): UsageRecord[] {
  const record = (tokens: ApiTokens, model: string): UsageRecord => ({
    model,
    input_tokens: tokens.input_tokens ?? 0,
    output_tokens: tokens.output_tokens ?? 0,
    cache_read_tokens: tokens.cache_read_input_tokens ?? 0,
    cache_write_tokens: tokens.cache_creation_input_tokens ?? 0,
  });
  const attempts = usage.iterations ?? [];
  if (attempts.length > 0) return attempts.map((it) => record(it, it.model ?? responseModel));
  return [record(usage, responseModel)];
}

// US dollars, or null for a model missing from the price table.
export function usageCostUsd(record: UsageRecord): number | null {
  const price = CHEKELIN_PRICES_USD_PER_MTOK[record.model];
  if (!price) return null;
  return (
    (record.input_tokens * price.input +
      record.output_tokens * price.output +
      record.cache_read_tokens * price.cacheRead +
      record.cache_write_tokens * price.cacheWrite) /
    1_000_000
  );
}

export type UsageRow = UsageRecord & { business_id: string; conversation_id: string | null };

export type ChekelinCostReport = {
  totalUsd: number;
  // Most expensive first.
  conversations: Array<{ businessId: string; conversationId: string; calls: number; costUsd: number }>;
  // Most expensive first. perConversationUsd = the cost of its conversations'
  // calls / how many conversations (comment replies and Sugerencias count in
  // costUsd only).
  businesses: Array<{ businessId: string; conversations: number; calls: number; costUsd: number; perConversationUsd: number | null }>;
  // Models seen without a price: their calls are left out of every total.
  unpricedModels: string[];
};

export function chekelinCostReport(rows: UsageRow[]): ChekelinCostReport {
  const conversations = new Map<string, ChekelinCostReport["conversations"][number]>();
  const businesses = new Map<string, { calls: number; costUsd: number; conversationUsd: number; conversations: Set<string> }>();
  const unpriced = new Set<string>();
  let totalUsd = 0;

  for (const row of rows) {
    const cost = usageCostUsd(row);
    if (cost === null) {
      unpriced.add(row.model);
      continue;
    }
    totalUsd += cost;
    const biz = businesses.get(row.business_id) ?? { calls: 0, costUsd: 0, conversationUsd: 0, conversations: new Set<string>() };
    biz.calls += 1;
    biz.costUsd += cost;
    if (row.conversation_id) {
      biz.conversationUsd += cost;
      biz.conversations.add(row.conversation_id);
      const conv = conversations.get(row.conversation_id) ?? {
        businessId: row.business_id,
        conversationId: row.conversation_id,
        calls: 0,
        costUsd: 0,
      };
      conv.calls += 1;
      conv.costUsd += cost;
      conversations.set(row.conversation_id, conv);
    }
    businesses.set(row.business_id, biz);
  }

  return {
    totalUsd,
    conversations: [...conversations.values()].sort((a, b) => b.costUsd - a.costUsd || a.conversationId.localeCompare(b.conversationId)),
    businesses: [...businesses.entries()]
      .map(([businessId, b]) => ({
        businessId,
        conversations: b.conversations.size,
        calls: b.calls,
        costUsd: b.costUsd,
        perConversationUsd: b.conversations.size > 0 ? b.conversationUsd / b.conversations.size : null,
      }))
      .sort((a, b) => b.costUsd - a.costUsd),
    unpricedModels: [...unpriced].sort(),
  };
}
