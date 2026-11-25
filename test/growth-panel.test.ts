import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, Session } from "../src/agent/session";
import { niceScale, renderGrowthPanel } from "../src/ui/growth-panel";
import { message, mockApi, text, toolUse } from "./support/mock-api";

async function panelFor() {
  const api = mockApi([
    message([toolUse("a", "get_customer", { email: "marcus@example.com" })], "tool_use", [1000, 50]),
    message([text("Found you.")], "end_turn", [1200, 30]),
  ]);
  const s = new Session({
    apiKey: "k",
    fetch: api.fetch,
    sleep: async () => {},
    config: { model: "claude-sonnet-5-5", ...DEFAULT_CONFIG },
  });
  await s.send("I'm marcus@example.com");
  const container = document.createElement("div");
  renderGrowthPanel(container, s.calls, "claude-sonnet-5-5");
  return container;
}

describe("renderGrowthPanel", () => {
  it("shows a prompt before any call", () => {
    const c = document.createElement("div");
    renderGrowthPanel(c, [], "claude-sonnet-5-5");
    expect(c.textContent).toContain("Send a message to see the context grow.");
  });

  it("shows the headline numbers", async () => {
    const c = await panelFor();
    const tiles = [...c.querySelectorAll(".tile")].map((t) => t.textContent);
    expect(tiles[0]).toContain("Input tokens billed2,200");
    expect(tiles[1]).toContain("Conversation size now1,200");
    expect(tiles[2]).toContain("1.8×");
    expect(tiles[3]).toContain("Output tokens80");
    expect(tiles[4]).toContain("$0.00520"); // (2200 * 2 + 80 * 10) / 1e6
  });

  it("draws one bar per call, each with a text tooltip, and a stacked split", async () => {
    const c = await panelFor();
    const bars = c.querySelectorAll("svg .bar");
    expect(bars).toHaveLength(2);
    expect(bars[1]!.querySelector("title")?.textContent).toBe(
      "Call 2, message 1: 1,200 input tokens. 1,000 sent before, 200 new. 30 output tokens.",
    );
    expect(bars[0]!.querySelector(".seg-resent")).toBeNull(); // the first call has no history yet
    expect(bars[1]!.querySelector(".seg-resent")).not.toBeNull();
    expect(bars[1]!.querySelector(".seg-new")).not.toBeNull();
    expect(c.querySelector("svg")?.getAttribute("aria-label")).toContain("Exact values are in the table below");
  });

  it("has a legend in text and a table with every value", async () => {
    const c = await panelFor();
    expect([...c.querySelectorAll(".legend li")].map((li) => li.textContent)).toEqual([
      "Sent before (resent history)",
      "New since that call",
    ]);
    const rows = [...c.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent));
    expect(rows[1]).toEqual(["2", "1", "end_turn", "1,000", "200", "1,200", "30", "$0.00270", "$0.00520"]);
  });

  it("cites the price source and date, and says the split is derived", async () => {
    const c = await panelFor();
    const link = c.querySelector<HTMLAnchorElement>("a")!;
    expect(link.href).toBe("https://platform.claude.com/docs/en/about-claude/pricing");
    expect(link.rel).toBe("noopener noreferrer");
    expect(c.textContent).toContain("derived from measured totals");
    expect(c.textContent).toMatch(/as of \d{4}-\d{2}-\d{2}/);
  });
});

describe("niceScale", () => {
  it("rounds the axis up to a 1/2/5 step", () => {
    expect(niceScale(1300)).toEqual({ max: 1500, step: 500 });
    expect(niceScale(2621)).toEqual({ max: 3000, step: 1000 });
    expect(niceScale(0)).toEqual({ max: 1, step: 1 });
  });
});
