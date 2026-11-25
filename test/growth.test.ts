import { describe, expect, it } from "vitest";
import { analyzeGrowth } from "../src/agent/growth";
import { DEFAULT_CONFIG, Session } from "../src/agent/session";
import { message, mockApi, text, toolUse } from "./support/mock-api";

async function run(script: ReturnType<typeof message>[], ...turns: string[]) {
  const api = mockApi(script);
  const s = new Session({
    apiKey: "sk-ant-test",
    fetch: api.fetch,
    sleep: async () => {},
    config: { model: "claude-sonnet-5-5", ...DEFAULT_CONFIG },
    backend: { nowSeconds: 1_800_000_000 },
  });
  for (const t of turns) await s.send(t);
  return s;
}

describe("analyzeGrowth", () => {
  it("splits each call's input into what the previous call sent and what's new", async () => {
    const s = await run(
      [
        message([toolUse("a", "get_customer", { email: "marcus@example.com" })], "tool_use", [1000, 50]),
        message([toolUse("b", "lookup_order", { customer_id: "C-1003", order_id: "ORD-5003" })], "tool_use", [1150, 60]),
        message([text("Shipped.")], "end_turn", [1300, 40]),
        message([text("Bye.")], "end_turn", [1360, 10]),
      ],
      "Where is my stove?",
      "Thanks",
    );
    const g = analyzeGrowth(s.calls);
    expect(g.calls.map((c) => [c.sentBefore, c.added])).toEqual([
      [0, 1000],
      [1000, 150],
      [1150, 150],
      [1300, 60],
    ]);
    expect(g.totalPrompt).toBe(1000 + 1150 + 1300 + 1360);
    expect(g.latestPrompt).toBe(1360);
    expect(g.resendMultiplier).toBeCloseTo(4810 / 1360);
    expect(g.totalOutput).toBe(160);
    // Sonnet 5.5: $2/M in, $10/M out.
    expect(g.totalCost).toBeCloseTo((4810 * 2 + 160 * 10) / 1e6);
    expect(g.calls.at(-1)!.runningCost).toBeCloseTo(g.totalCost);
  });

  it("after a rolled-back turn, measures against the last call of the previous good turn", async () => {
    const s = await run(
      [
        message([text("Hi.")], "end_turn", [1000, 10]),
        message([], "refusal", [1050, 0]),
        message([text("Hello again.")], "end_turn", [1040, 10]),
      ],
      "Hi",
      "refused",
      "Hello",
    );
    const g = analyzeGrowth(s.calls);
    // The refused call (index 1) is billed and shown, but call 2 doesn't start with its request.
    expect(g.calls.map((c) => c.sentBefore)).toEqual([0, 1000, 1000]);
    expect(g.calls[2]!.added).toBe(40);
  });

  it("skips failed calls, which return no usage and aren't billed", async () => {
    const api = mockApi([
      { status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "bad" } } },
      message([text("ok")], "end_turn", [900, 5]),
    ]);
    const s = new Session({
      apiKey: "k",
      fetch: api.fetch,
      sleep: async () => {},
      config: { model: "claude-sonnet-5-5", ...DEFAULT_CONFIG },
    });
    await s.send("one");
    await s.send("two");
    const g = analyzeGrowth(s.calls);
    expect(g.calls.map((c) => c.call.index)).toEqual([1]);
  });

  it("clamps a negative difference to zero and flags it", async () => {
    const s = await run(
      [message([text("A.")], "end_turn", [1000, 10]), message([text("B.")], "end_turn", [900, 10])],
      "one",
      "two",
    );
    const last = analyzeGrowth(s.calls).calls[1]!;
    expect(last).toMatchObject({ sentBefore: 900, added: 0, clamped: true });
  });

  it("is empty before any call", () => {
    expect(analyzeGrowth([])).toMatchObject({ calls: [], totalPrompt: 0, resendMultiplier: null });
  });
});
