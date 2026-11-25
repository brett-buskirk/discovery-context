import { describe, expect, it } from "vitest";
import { MODELS } from "../src/agent/session";
import type { Usage } from "../src/api/types";
import { PRICING, costOf, formatUsd, promptTokens, tierFor } from "../src/pricing/cost";

const usage = (u: Partial<Usage>): Usage =>
  ({
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: null,
    ...u,
  }) as Usage;

describe("pricing.json", () => {
  it("prices every model the picker offers", () => {
    for (const m of MODELS) expect(PRICING.models[m.id], m.id).toBeDefined();
  });

  it("has a source and an as-of date", () => {
    expect(PRICING.source).toMatch(/^https:\/\/platform\.claude\.com\//);
    expect(PRICING.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("ends every model's tiers with an unbounded tier, in ascending order", () => {
    for (const [id, model] of Object.entries(PRICING.models)) {
      const limits = model.tiers.map((t) => t.maxPromptTokens);
      expect(limits.at(-1), id).toBeNull();
      const bounded = limits.slice(0, -1) as number[];
      expect([...bounded].sort((a, b) => a - b), id).toEqual(bounded);
    }
  });
});

describe("costOf", () => {
  it("prices input and output at the model's list rates", () => {
    // Sonnet 5.5: $2 in, $10 out per million.
    const c = costOf("claude-sonnet-5-5", usage({ input_tokens: 1_000_000, output_tokens: 100_000 }))!;
    expect(c.input).toBeCloseTo(2);
    expect(c.output).toBeCloseTo(1);
    expect(c.total).toBeCloseTo(3);
  });

  it("matches a real Build 01 call: 1,719 in / 197 out on Sonnet 5.5", () => {
    const c = costOf("claude-sonnet-5-5", usage({ input_tokens: 1719, output_tokens: 197 }))!;
    expect(c.total).toBeCloseTo(0.005408, 6);
  });

  it("prices cache reads and writes separately, by TTL", () => {
    // Opus 5.5: write 5m $5, write 1h $8, read $0.20.
    const c = costOf(
      "claude-opus-5-5",
      usage({
        cache_creation_input_tokens: 300_000,
        cache_read_input_tokens: 1_000_000,
        cache_creation: { ephemeral_5m_input_tokens: 200_000, ephemeral_1h_input_tokens: 100_000 },
      }),
    )!;
    expect(c.cacheWrite).toBeCloseTo(0.2 * 5 + 0.1 * 8);
    expect(c.cacheRead).toBeCloseTo(0.2);
  });

  it("treats unsplit cache writes as the default 5-minute TTL", () => {
    const c = costOf("claude-opus-5-5", usage({ cache_creation_input_tokens: 1_000_000 }))!;
    expect(c.cacheWrite).toBeCloseTo(5);
  });

  it("uses Haiku 5.5's higher tier once the prompt, cache included, passes 100K", () => {
    expect(tierFor("claude-haiku-5-5", 100_000)?.input).toBe(0.1);
    expect(tierFor("claude-haiku-5-5", 100_001)?.input).toBe(0.5);
    // 60K uncached + 50K cache read = 110K prompt, so the whole request is on the higher tier.
    const u = usage({ input_tokens: 60_000, cache_read_input_tokens: 50_000, output_tokens: 1_000 });
    expect(promptTokens(u)).toBe(110_000);
    const c = costOf("claude-haiku-5-5", u)!;
    expect(c.input).toBeCloseTo(0.06 * 0.5);
    expect(c.cacheRead).toBeCloseTo(0.05 * 0.05);
    expect(c.output).toBeCloseTo(0.001 * 2.5);
  });

  it("returns null for a model that isn't in the table", () => {
    expect(costOf("claude-unknown", usage({ input_tokens: 10 }))).toBeNull();
  });
});

describe("formatUsd", () => {
  it("shows enough precision for fractions of a cent", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.000183)).toBe("$0.00018");
    expect(formatUsd(0.0054)).toBe("$0.00540");
    expect(formatUsd(0.0412)).toBe("$0.0412");
    expect(formatUsd(1.5)).toBe("$1.50");
  });
});
