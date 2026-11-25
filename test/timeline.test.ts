import { describe, expect, it } from "vitest";
import type { CallRecord } from "../src/agent/session";
import type { Message } from "../src/api/types";
import { SYSTEM_PROMPT, TOOL_DEFS } from "../src/northwind/tools";
import {
  KEY_PLACEHOLDER,
  callSummary,
  describeMessage,
  formatBytes,
  renderCall,
  requestBytes,
} from "../src/ui/timeline";
import { message, text, thinking, toolUse } from "./support/mock-api";

const response = (...args: Parameters<typeof message>) => message(...args).body as Message;

function call(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    index: 1,
    turn: 0,
    startedAt: 0,
    request: {
      model: "claude-sonnet-5-5",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFS,
      output_config: { effort: "medium" },
      messages: [
        { role: "user", content: "Where is my stove?" },
        { role: "assistant", content: [toolUse("tu_1", "get_customer", { email: "marcus@example.com" })] as never },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: "{}", is_error: false }] },
      ],
    },
    resentMessageCount: 1,
    response: response([thinking(), text("It shipped.")], "end_turn", [1250, 80]),
    error: null,
    attempts: [{ status: 200, durationMs: 1234, requestId: "req_1" }],
    requestId: "req_1",
    toolRuns: [],
    ...overrides,
  };
}

const open = (node: HTMLElement) => {
  node.querySelectorAll("details").forEach((d) => (d.open = true));
  return node;
};

describe("callSummary", () => {
  it("says how many messages were resent and how many are new, plus usage", () => {
    expect(callSummary(call())).toBe(
      "Call 2 · end_turn · 3 messages sent (1 resent, 2 new) · 1250 in / 80 out tokens",
    );
  });

  it("describes a failed call", () => {
    const failed = call({ response: null, error: { message: "invalid x-api-key", status: 401, type: "authentication_error" } });
    expect(callSummary(failed)).toBe("Call 2 · failed · 3 messages sent (1 resent, 2 new) · invalid x-api-key");
  });
});

describe("describeMessage", () => {
  it("names the blocks in a message", () => {
    expect(describeMessage({ role: "user", content: "hi" })).toBe("user · text");
    expect(describeMessage({ role: "assistant", content: [thinking(), toolUse("a", "lookup_order", {})] as never })).toBe(
      "assistant · thinking, tool_use: lookup_order",
    );
    expect(
      describeMessage({ role: "user", content: [{ type: "tool_result", tool_use_id: "a", is_error: true }] }),
    ).toBe("user · tool_result (error)");
  });
});

describe("renderCall", () => {
  it("labels each message as resent or new, in text as well as style", () => {
    const node = open(renderCall(call()));
    const badges = [...node.querySelectorAll(".messages .badge")].map((b) => b.textContent);
    expect(badges).toEqual(["resent", "new", "new"]);
    expect(node.querySelectorAll(".message.resent")).toHaveLength(1);
  });

  it("opens new messages and leaves resent ones collapsed", () => {
    const node = renderCall(call());
    const states = [...node.querySelectorAll<HTMLDetailsElement>(".messages details")].map((d) => d.open);
    expect(states).toEqual([false, true, true]);
  });

  it("points out that system and tools are resent on every call after the first", () => {
    expect(renderCall(call()).textContent).toContain("sent again, unchanged, as on every call");
    expect(renderCall(call({ index: 0 })).textContent).toContain("sent for the first time");
  });

  it("shows the headers with the key replaced by a placeholder", () => {
    const node = open(renderCall(call()));
    expect(node.textContent).toContain(`"x-api-key": "${KEY_PLACEHOLDER}"`);
    expect(node.textContent).toContain('"anthropic-dangerous-direct-browser-access": "true"');
  });

  it("includes the raw body exactly as sent, and its size", () => {
    const c = call();
    const node = open(renderCall(c));
    expect(node.querySelector("pre.raw")?.textContent).toBe(JSON.stringify(c.request, null, 2));
    expect(node.textContent).toContain(formatBytes(requestBytes(c)));
  });

  it("explains an empty thinking block", () => {
    expect(renderCall(call()).textContent).toContain("Its tokens are still billed as output");
  });

  it("shows the tools our code ran, with input and result", () => {
    const c = call({
      response: response([toolUse("tu_9", "get_customer", { email: "x@example.com" })], "tool_use"),
      toolRuns: [{ id: "tu_9", name: "get_customer", input: { email: "x@example.com" }, result: { isError: false, data: { match_count: 0 } } }],
    });
    const node = open(renderCall(c));
    expect(node.textContent).toContain("Your code ran");
    expect(node.querySelector(".tool-runs")?.textContent).toContain('"match_count": 0');
    expect(node.textContent).toContain("run the tools it asked for, then call again");
  });

  it("lists retries when a call needed more than one attempt", () => {
    const c = call({
      attempts: [
        { status: 529, durationMs: 100, requestId: null, error: "overloaded" },
        { status: 200, durationMs: 900, requestId: "req_2" },
      ],
    });
    expect(renderCall(c).textContent).toContain("Attempt 1: 529, overloaded");
  });

  it("renders the API error for a failed call", () => {
    const c = call({ response: null, error: { message: "invalid x-api-key", status: 401, type: "authentication_error" } });
    const node = renderCall(c);
    expect(node.classList.contains("failed")).toBe(true);
    expect(node.querySelector(".response .error")?.textContent).toBe("authentication_error (HTTP 401): invalid x-api-key");
  });

  it("keeps markup in model output and tool results as text", () => {
    const c = call({ response: response([text("<script>alert(1)</script><img src=x>")], "end_turn") });
    const node = open(renderCall(c));
    expect(node.querySelector("script, img")).toBeNull();
    expect(node.textContent).toContain("<script>alert(1)</script>");
  });
});

describe("formatBytes", () => {
  it("uses bytes under 1 KB and one decimal above", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(9318)).toBe("9.1 KB");
  });
});
