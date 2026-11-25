// Turns a response's usage into dollars, using the list prices in pricing.json. Usage is measured by the
// API; the dollar figure is calculated from it, so the UI labels it as "at list prices".
import type { Usage } from "../api/types";
import pricing from "./pricing.json";

export type Tier = {
  maxPromptTokens: number | null;
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
};

export type ModelPricing = { label: string; tiers: Tier[] };

export const PRICING = pricing as {
  asOf: string;
  source: string;
  currency: string;
  unit: string;
  note: string;
  models: Record<string, ModelPricing>;
};

/** Everything that counts as prompt: uncached input plus cache reads and cache writes. */
export function promptTokens(usage: Usage): number {
  return usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
}

export function tierFor(model: string, prompt: number): Tier | null {
  const tiers = PRICING.models[model]?.tiers;
  if (!tiers) return null;
  return tiers.find((t) => t.maxPromptTokens === null || prompt <= t.maxPromptTokens) ?? null;
}

export type CostBreakdown = {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  /** Includes thinking: the usage object reports thinking tokens as part of output_tokens. */
  output: number;
  total: number;
};

const PER_TOKEN = 1 / 1_000_000;

/** Dollars for one call, or null when the model isn't in the price table. */
export function costOf(model: string, usage: Usage): CostBreakdown | null {
  const tier = tierFor(model, promptTokens(usage));
  if (!tier) return null;

  // Split cache writes by TTL when the API reports it. If it doesn't, assume the default 5-minute TTL.
  const writes = usage.cache_creation_input_tokens ?? 0;
  const writes1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const writes5m = usage.cache_creation ? (usage.cache_creation.ephemeral_5m_input_tokens ?? 0) : writes;

  const input = usage.input_tokens * tier.input * PER_TOKEN;
  const cacheWrite = (writes5m * tier.cacheWrite5m + writes1h * tier.cacheWrite1h) * PER_TOKEN;
  const cacheRead = (usage.cache_read_input_tokens ?? 0) * tier.cacheRead * PER_TOKEN;
  const output = usage.output_tokens * tier.output * PER_TOKEN;
  return { input, cacheWrite, cacheRead, output, total: input + cacheWrite + cacheRead + output };
}

/** Small amounts need more precision than cents: a Haiku call can cost a few hundredths of a cent. */
export function formatUsd(amount: number): string {
  if (amount === 0) return "$0";
  if (amount < 0.01) return `$${amount.toFixed(5)}`;
  if (amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
