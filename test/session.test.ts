import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, Session, type CallRecord } from "../src/agent/session";
import { SYSTEM_PROMPT, TOOL_DEFS } from "../src/northwind/tools";
import { apiError, message, mockApi, text, thinking, toolUse } from "./support/mock-api";

const KEY = "sk-ant-test-0000";
const noSleep = async () => {};

function session(api: ReturnType<typeof mockApi>, overrides: Partial<typeof DEFAULT_CONFIG> = {}) {
  const seen: CallRecord[] = [];
  const s = new Session({
    apiKey: KEY,
    fetch: api.fetch,
    sleep: noSleep,
    config: { model: "claude-sonnet-5-5", ...DEFAULT_CONFIG, ...overrides },
    backend: { nowSeconds: 1_800_000_000 },
    onCall: (c) => seen.push(c),
  });
  return { s, seen };
}

// A typical turn: look up the customer, then the order, then answer. Three API calls for one message.
const lookupTurn = () => [
  message([toolUse("tu_1", "get_customer", { email: "marcus@example.com" })], "tool_use", [1000, 50]),
  message([toolUse("tu_2", "lookup_order", { customer_id: "C-1003", order_id: "ORD-5003" })], "tool_use", [1100, 60]),
  message([thinking(), text("Your stove has shipped.")], "end_turn", [1250, 80]),
];

describe("Session tool loop", () => {
  it("makes one API call per loop iteration and finishes on end_turn", async () => {
    const api = mockApi(lookupTurn());
    const { s } = session(api);
    const outcome = await s.send("Where is my stove? ORD-5003, marcus@example.com");

    expect(outcome).toEqual({ status: "done", text: "Your stove has shipped." });
    expect(s.calls).toHaveLength(3);
    expect(s.calls.map((c) => c.response?.stop_reason)).toEqual(["tool_use", "tool_use", "end_turn"]);
    expect(s.calls.every((c) => c.turn === 0)).toBe(true);
    expect(api.remaining()).toBe(0);
  });

  it("resends the whole conversation, system prompt, and tools on every call", async () => {
    const api = mockApi(lookupTurn());
    const { s } = session(api);
    await s.send("Where is my stove?");

    // The history grows: 1 message, then 3, then 5.
    expect(api.sent.map((r) => r.body.messages.length)).toEqual([1, 3, 5]);
    for (const req of api.sent) {
      expect(req.body.system).toBe(SYSTEM_PROMPT);
      expect(req.body.tools).toEqual(TOOL_DEFS);
      expect(req.body.output_config).toEqual({ effort: "medium" });
      expect(req.body.model).toBe("claude-sonnet-5-5");
    }
    // Each request starts with everything the previous one sent.
    expect(api.sent[1]!.body.messages.slice(0, 1)).toEqual(api.sent[0]!.body.messages);
    expect(api.sent[2]!.body.messages.slice(0, 3)).toEqual(api.sent[1]!.body.messages);
  });

  it("snapshots each request, so later growth doesn't rewrite earlier records", async () => {
    const api = mockApi(lookupTurn());
    const { s } = session(api);
    await s.send("Where is my stove?");

    expect(s.calls.map((c) => c.request.messages.length)).toEqual([1, 3, 5]);
    expect(s.calls.map((c) => c.resentMessageCount)).toEqual([0, 1, 3]);
    expect(s.calls[0]!.request).toEqual(api.sent[0]!.body);
  });

  it("sends tool results back as a user message tied to each tool_use id", async () => {
    const api = mockApi(lookupTurn());
    const { s } = session(api);
    await s.send("Where is my stove?");

    const second = api.sent[1]!.body.messages;
    expect(second[1]).toEqual({ role: "assistant", content: [toolUse("tu_1", "get_customer", { email: "marcus@example.com" })] });
    expect(second[2]).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_1",
          content: JSON.stringify({
            match_count: 1,
            customers: [{ id: "C-1003", name: "Marcus Oyelaran", email: "marcus@example.com" }],
          }),
          is_error: false,
        },
      ],
    });
    expect(s.calls[0]!.toolRuns).toMatchObject([{ id: "tu_1", name: "get_customer" }]);
  });

  it("keeps thinking blocks in the history unchanged", async () => {
    const api = mockApi([...lookupTurn(), message([text("You're welcome.")], "end_turn")]);
    const { s } = session(api);
    await s.send("Where is my stove?");
    await s.send("Thanks");
    const assistant = api.sent[3]!.body.messages[5];
    expect(assistant).toEqual({ role: "assistant", content: [thinking(), text("Your stove has shipped.")] });
  });

  it("returns all results from parallel tool calls in one user message", async () => {
    const api = mockApi([
      message(
        [toolUse("a", "get_customer", { email: "dana@example.com" }), toolUse("b", "get_customer", { name: "Marcus Oyelaran" })],
        "tool_use",
      ),
      message([text("Found both.")], "end_turn"),
    ]);
    const { s } = session(api);
    await s.send("Look up two people");
    const results = api.sent[1]!.body.messages[2];
    expect(results.role).toBe("user");
    expect(results.content.map((r: { tool_use_id: string }) => r.tool_use_id)).toEqual(["a", "b"]);
  });

  it("tracks turns across messages and reports each call to onCall once, complete", async () => {
    const api = mockApi([...lookupTurn(), message([text("Bye!")], "end_turn")]);
    const { s, seen } = session(api);
    await s.send("Where is my stove?");
    await s.send("Thanks, bye");
    expect(s.calls.map((c) => c.turn)).toEqual([0, 0, 0, 1]);
    expect(seen.map((c) => c.index)).toEqual([0, 1, 2, 3]);
    expect(seen[0]!.toolRuns).toHaveLength(1); // tool results were attached before the UI was told
    expect(s.turns.map((t) => t.outcome?.status)).toEqual(["done", "done"]);
  });
});

describe("Session when a turn can't finish", () => {
  it("rolls back a refused turn so the next request is still valid", async () => {
    const api = mockApi([
      message([text("Sure.")], "end_turn"),
      message([toolUse("tu_1", "get_customer", { email: "x@example.com" })], "tool_use"),
      message([], "refusal", [100, 0], { stop_details: { type: "refusal", category: null, explanation: "Declined." } }),
      message([text("Hello again.")], "end_turn"),
    ]);
    const { s } = session(api);
    await s.send("Hi");
    const outcome = await s.send("Something refused");
    expect(outcome).toEqual({ status: "stopped", reason: "refusal", detail: "Declined." });

    // History is back to the first exchange; the failed calls are still on record.
    expect(s.messages).toHaveLength(2);
    expect(s.calls).toHaveLength(3);

    await s.send("Hi again");
    expect(api.sent[3]!.body.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(s.calls[3]!.resentMessageCount).toBe(2);
  });

  it("stops on max_tokens rather than continuing with a partial reply", async () => {
    const api = mockApi([message([text("Partial")], "max_tokens")]);
    const { s } = session(api);
    expect(await s.send("Write a lot")).toMatchObject({ status: "stopped", reason: "max_tokens" });
    expect(s.messages).toHaveLength(0);
  });

  it("records an API error on the call and rolls back the turn", async () => {
    const api = mockApi([apiError(401, "authentication_error", "invalid x-api-key")]);
    const { s, seen } = session(api);
    const outcome = await s.send("Hi");
    expect(outcome).toEqual({ status: "stopped", reason: "error", detail: "invalid x-api-key" });
    expect(s.calls[0]!.error).toEqual({ message: "invalid x-api-key", status: 401, type: "authentication_error" });
    expect(seen).toHaveLength(1);
    expect(s.messages).toHaveLength(0);
  });

  it("stops a runaway tool loop at the call limit", async () => {
    const loop = Array.from({ length: 3 }, (_, i) => message([toolUse(`t${i}`, "get_customer", { name: "x" })], "tool_use"));
    const api = mockApi(loop);
    const { s } = session(api, { maxCallsPerTurn: 3 });
    expect(await s.send("Loop forever")).toMatchObject({ status: "stopped", reason: "call_limit" });
    expect(s.calls).toHaveLength(3);
    expect(s.messages).toHaveLength(0);
  });

  it("rejects a second message while a turn is running", async () => {
    const api = mockApi(lookupTurn());
    const { s } = session(api);
    const first = s.send("one");
    await expect(s.send("two")).rejects.toThrow("already running");
    await first;
  });

  it("never stores the API key in call records", async () => {
    const api = mockApi([...lookupTurn()]);
    const { s } = session(api);
    await s.send("Where is my stove?");
    expect(JSON.stringify(s.calls)).not.toContain(KEY);
    expect(JSON.stringify(s.messages)).not.toContain(KEY);
  });
});
