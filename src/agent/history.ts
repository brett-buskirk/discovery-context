// One row per conversation for the comparison table. Numbers only: no message text, no key. Kept in
// memory by the page, so it survives model switches and "New conversation" but not a reload.
import { analyzeGrowth } from "./growth";
import type { CallRecord, Turn } from "./session";

export type ConversationSummary = {
  /** 1-based, in the order conversations were started. */
  number: number;
  model: string;
  messages: number;
  rolledBack: number;
  apiCalls: number;
  failedCalls: number;
  inputBilled: number;
  conversationSize: number;
  resendMultiplier: number | null;
  output: number;
  cost: number;
  /** False when the model isn't in the price table, so cost is incomplete. */
  priced: boolean;
  /** True for a replayed recording rather than a live conversation. */
  recorded: boolean;
  /** Whether prompt caching was on. */
  caching: boolean;
};

export function summarizeConversation(
  number: number,
  model: string,
  calls: readonly CallRecord[],
  turns: readonly Turn[],
  recorded = false,
  caching = false,
): ConversationSummary {
  const growth = analyzeGrowth(calls);
  return {
    number,
    model,
    messages: turns.length,
    rolledBack: turns.filter((t) => t.outcome?.status === "stopped").length,
    apiCalls: calls.length,
    failedCalls: calls.filter((c) => !c.response).length,
    inputBilled: growth.totalPrompt,
    conversationSize: growth.latestPrompt,
    resendMultiplier: growth.resendMultiplier,
    output: growth.totalOutput,
    cost: growth.totalCost,
    priced: !growth.unpriced,
    recorded,
    caching,
  };
}
