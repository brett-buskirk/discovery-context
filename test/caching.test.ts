import { describe, expect, it, vi } from "vitest";
import { parseSessionExport } from "../src/agent/export";
import { analyzeGrowth } from "../src/agent/growth";
import { DEFAULT_CONFIG, Session } from "../src/agent/session";
import { loadRecording } from "../src/recordings";
import { renderApp } from "../src/ui/app";
import { renderGrowthPanel } from "../src/ui/growth-panel";
import { message, mockApi, text, toolUse } from "./support/mock-api";

/** A response whose usage includes cache activity. */
function cached(content: unknown[], stop: string, u: { input: number; read: number; write: number; output: number }) {
  const m = message(content, stop, [u.input, u.output]);
  Object.assign((m.body as { usage: object }).usage, {
    cache_read_input_tokens: u.read,
    cache_creation_input_tokens: u.write,
    cache_creation: { ephemeral_5m_input_tokens: u.write, ephemeral_1h_input_tokens: 0 },
  });
  return m;
}

// A Sonnet 5.5 tool loop with caching on: the first call writes the prefix, later calls read it.
const cachedTurn = () => [
  cached([toolUse("a", "get_customer", { email: "marcus@example.com" })], "tool_use", { input: 3, read: 0, write: 1700, output: 50 }),
  cached([text("Found you.")], "end_turn", { input: 3, read: 1700, write: 110, output: 30 }),
];

async function run(caching: boolean, script = cachedTurn()) {
  const api = mockApi(script);
  const s = new Session({
    apiKey: "k",
    fetch: api.fetch,
    sleep: async () => {},
    config: { ...DEFAULT_CONFIG, model: "claude-sonnet-5-5", caching },
  });
  await s.send("I'm marcus@example.com");
  return { s, api };
}

describe("requests", () => {
  it("ask for automatic caching only when caching is on", async () => {
    const on = await run(true);
    for (const req of on.api.sent) expect(req.body.cache_control).toEqual({ type: "ephemeral" });
    const off = await run(false);
    for (const req of off.api.sent) expect(req.body).not.toHaveProperty("cache_control");
  });

  it("still send the whole history with caching on", async () => {
    const { api } = await run(true);
    expect(api.sent.map((r) => r.body.messages.length)).toEqual([1, 3]);
  });
});

describe("analyzeGrowth with caching", () => {
  it("reports cache reads and writes, and how much resent history came from the cache", async () => {
    const { s } = await run(true);
    const g = analyzeGrowth(s.calls);
    expect(g.calls.map((c) => [c.prompt, c.sentBefore, c.added, c.cacheRead, c.cacheWrite, c.sentBeforeCached])).toEqual([
      [1703, 0, 1703, 0, 1700, 0],
      [1813, 1703, 110, 1700, 110, 1700],
    ]);
    expect(g).toMatchObject({ cachingUsed: true, totalCacheRead: 1700, totalCacheWrite: 1810 });
  });

  it("prices the same tokens without caching as an estimate", async () => {
    const { s } = await run(true);
    const g = analyzeGrowth(s.calls);
    // Sonnet 5.5: input $2, 5m write $2.50, read $0.10, output $10 (per million).
    const actual = (6 * 2 + 1810 * 2.5 + 1700 * 0.1 + 80 * 10) / 1e6;
    const without = ((1703 + 1813) * 2 + 80 * 10) / 1e6;
    expect(g.totalCost).toBeCloseTo(actual, 9);
    expect(g.costWithoutCaching).toBeCloseTo(without, 9);
  });

  it("shows nothing cache-related when caching wasn't used", async () => {
    const api = mockApi([message([text("Hi.")], "end_turn", [900, 5])]);
    const s = new Session({ apiKey: "k", fetch: api.fetch, config: { ...DEFAULT_CONFIG, model: "claude-sonnet-5-5" } });
    await s.send("hi");
    expect(analyzeGrowth(s.calls)).toMatchObject({ cachingUsed: false, totalCacheRead: 0 });
  });
});

describe("growth panel with caching", () => {
  it("hatches the cached part of the bar, and adds a legend item, tiles, columns, and a note", async () => {
    const { s } = await run(true);
    const c = document.createElement("div");
    renderGrowthPanel(c, s.calls, "claude-sonnet-5-5");
    expect(c.querySelector("pattern#cache-hatch")).not.toBeNull();
    const hatches = c.querySelectorAll("svg .seg-cached");
    expect(hatches).toHaveLength(1); // only call 2 read from the cache
    expect(hatches[0]!.getAttribute("fill")).toBe("url(#cache-hatch)");
    expect([...c.querySelectorAll(".legend li")].map((li) => li.textContent)).toContain("Hatched: read from cache");
    const tiles = [...c.querySelectorAll(".tile")].map((t) => t.textContent);
    expect(tiles.some((t) => t?.startsWith("Read from cache48%"))).toBe(true); // 1700 / 3516 = 48.4%
    expect(tiles.some((t) => t?.startsWith("Without caching (estimate)"))).toBe(true);
    expect([...c.querySelectorAll("thead th")].map((th) => th.textContent)).toContain("From cache");
    expect(c.textContent).toContain("doesn't make the request smaller");
    expect(c.querySelector(".bar:last-of-type title")?.textContent).toContain("From cache: 1,700.");
  });

  it("stays as it was without caching", async () => {
    const { s } = await run(false, [message([text("Hi.")], "end_turn", [900, 5])]);
    const c = document.createElement("div");
    renderGrowthPanel(c, s.calls, "claude-sonnet-5-5");
    expect(c.querySelector("pattern, .seg-cached")).toBeNull();
    expect([...c.querySelectorAll("thead th")].map((th) => th.textContent)).not.toContain("From cache");
    expect(c.textContent).not.toContain("Without caching");
  });
});

describe("exports and recordings", () => {
  it("treat an export without a caching flag as caching off", async () => {
    const data = await loadRecording("haiku-where-is-my-order");
    expect(data.config.caching).toBe(false);
    const raw = { ...data, config: { ...data.config } } as Record<string, unknown> & { config: Record<string, unknown> };
    delete raw.config.caching;
    expect(parseSessionExport(raw).config.caching).toBe(false);
  });
});

describe("caching toggle in the app", () => {
  function setup(script: Parameters<typeof mockApi>[0]) {
    const api = mockApi(script);
    const root = document.createElement("main");
    document.body.replaceChildren(root);
    renderApp(root, { fetch: api.fetch });
    root.querySelector<HTMLInputElement>("#api-key")!.value = "sk-ant-test-key-1234";
    root.querySelector("form.key-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    const send = async (msg: string) => {
      root.querySelector<HTMLInputElement>("#message")!.value = msg;
      root.querySelector("form.chat-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
      await vi.waitFor(() => expect(root.querySelector<HTMLInputElement>("#message")!.disabled).toBe(false));
    };
    return { root, api, send };
  }

  it("turns caching on for the next conversation and labels it in the comparison table", async () => {
    const { root, api, send } = setup([message([text("A.")], "end_turn"), ...cachedTurn()]);
    await send("first, uncached");
    expect(api.sent[0]!.body).not.toHaveProperty("cache_control");

    const select = root.querySelector<HTMLSelectElement>("#caching")!;
    select.value = "on";
    select.dispatchEvent(new Event("change"));
    await send("second, cached");
    expect(api.sent[1]!.body.cache_control).toEqual({ type: "ephemeral" });
    expect(api.sent[1]!.body.messages).toHaveLength(1); // a new conversation

    const rows = [...root.querySelectorAll(".history-table tbody tr td:first-of-type")].map((td) => td.textContent);
    expect(rows).toEqual(["Claude Sonnet 5.5", "Claude Sonnet 5.5, caching on (current)"]);
  });
});
