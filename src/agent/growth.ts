// Derives the context-growth numbers from the call records. Everything here comes from the API's own usage
// numbers; nothing is estimated with a tokenizer heuristic.
import type { CallRecord } from "./session";
import { costOf, promptTokens, type CostBreakdown } from "../pricing/cost";

export type CallGrowth = {
  call: CallRecord;
  /** All prompt tokens billed for this call (input + cache reads + cache writes). */
  prompt: number;
  /**
   * The part of the prompt that an earlier call already sent: that call's whole prompt, because this
   * request starts with exactly the same system, tools, and messages. Derived, not separately measured.
   */
  sentBefore: number;
  /** prompt - sentBefore: what this call added. */
  added: number;
  /** Prompt tokens served from the cache (billed at the cache-read price). Measured. */
  cacheRead: number;
  /** Prompt tokens written to the cache this call (billed at the cache-write price). Measured. */
  cacheWrite: number;
  /**
   * The part of sentBefore that came from the cache, for the chart: min(sentBefore, cacheRead). The rest of
   * sentBefore was resent at full price.
   */
  sentBeforeCached: number;
  /**
   * True when the subtraction came out negative and was clamped to 0. This can happen if the API counts
   * an earlier part of the history differently later on (for example, older thinking blocks).
   */
  clamped: boolean;
  output: number;
  cost: CostBreakdown | null;
  runningCost: number;
  runningPrompt: number;
};

export type GrowthSummary = {
  calls: CallGrowth[];
  totalPrompt: number;
  totalOutput: number;
  totalCost: number;
  /** The prompt size of the most recent call: how big the conversation is now. */
  latestPrompt: number;
  /** totalPrompt / latestPrompt: how many times over the context has been paid for. */
  resendMultiplier: number | null;
  /** True if any call used a model the price table doesn't cover. */
  unpriced: boolean;
  totalCacheRead: number;
  totalCacheWrite: number;
  /** True if any call read from or wrote to the cache. */
  cachingUsed: boolean;
  /**
   * An estimate: the same prompt and output tokens priced as plain input, with no cache. The token counts
   * would be identical without caching; only the prices differ. Null if a model isn't priced.
   */
  costWithoutCaching: number | null;
};

const sameRequestPrefix = (earlier: CallRecord, later: CallRecord): boolean => {
  const a = earlier.request;
  const b = later.request;
  if (a.model !== b.model || a.messages.length > b.messages.length) return false;
  if (JSON.stringify(a.system) !== JSON.stringify(b.system) || JSON.stringify(a.tools) !== JSON.stringify(b.tools)) {
    return false;
  }
  return a.messages.every((m, i) => JSON.stringify(m) === JSON.stringify(b.messages[i]));
};

export function analyzeGrowth(calls: readonly CallRecord[]): GrowthSummary {
  const out: CallGrowth[] = [];
  let runningCost = 0;
  let runningPrompt = 0;
  let unpriced = false;

  for (const call of calls) {
    const usage = call.response?.usage;
    if (!usage) continue; // failed requests return no usage and aren't billed

    const prompt = promptTokens(usage);
    // The latest earlier call whose request this one starts with. Usually the previous call; after a
    // rolled-back turn it's the last call of the previous good turn.
    const base = [...out].reverse().find((g) => sameRequestPrefix(g.call, call));
    const raw = base ? prompt - base.prompt : prompt;
    const sentBefore = base ? Math.min(base.prompt, prompt) : 0;

    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;
    const cost = costOf(call.request.model, usage);
    if (!cost) unpriced = true;
    runningCost += cost?.total ?? 0;
    runningPrompt += prompt;

    out.push({
      call,
      prompt,
      sentBefore,
      added: Math.max(raw, 0),
      clamped: raw < 0,
      cacheRead,
      cacheWrite,
      sentBeforeCached: Math.min(sentBefore, cacheRead),
      output: usage.output_tokens,
      cost,
      runningCost,
      runningPrompt,
    });
  }

  const latestPrompt = out.at(-1)?.prompt ?? 0;
  const totalCacheRead = out.reduce((sum, g) => sum + g.cacheRead, 0);
  const totalCacheWrite = out.reduce((sum, g) => sum + g.cacheWrite, 0);
  const uncachedCosts = out.map(
    (g) =>
      costOf(g.call.request.model, {
        ...g.call.response!.usage,
        input_tokens: g.prompt,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_creation: null,
      })?.total ?? null,
  );
  return {
    calls: out,
    totalPrompt: runningPrompt,
    totalOutput: out.reduce((sum, g) => sum + g.output, 0),
    totalCost: runningCost,
    latestPrompt,
    resendMultiplier: latestPrompt > 0 ? runningPrompt / latestPrompt : null,
    unpriced,
    totalCacheRead,
    totalCacheWrite,
    cachingUsed: totalCacheRead + totalCacheWrite > 0,
    costWithoutCaching: uncachedCosts.includes(null)
      ? null
      : uncachedCosts.reduce<number>((sum, c) => sum + (c ?? 0), 0),
  };
}
