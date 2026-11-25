import { describe, expect, it } from "vitest";
import { summarizeConversation } from "../src/agent/history";
import { DEFAULT_CONFIG, Session } from "../src/agent/session";
import { renderHistoryPanel } from "../src/ui/history-panel";
import { renderApp } from "../src/ui/app";
import { apiError, message, mockApi, text, toolUse } from "./support/mock-api";

async function finishedSession() {
  const api = mockApi([
    message([toolUse("a", "get_customer", { email: "marcus@example.com" })], "tool_use", [1000, 50]),
    message([text("Found you.")], "end_turn", [1200, 30]),
    apiError(400, "invalid_request_error", "bad"),
  ]);
  const s = new Session({
    apiKey: "k",
    fetch: api.fetch,
    sleep: async () => {},
    config: { model: "claude-sonnet-5-5", ...DEFAULT_CONFIG },
  });
  await s.send("hi");
  await s.send("this one fails");
  return s;
}

describe("summarizeConversation", () => {
  it("rolls a conversation up into numbers only", async () => {
    const s = await finishedSession();
    const summary = summarizeConversation(3, "claude-sonnet-5-5", s.calls, s.turns);
    expect(summary).toEqual({
      number: 3,
      model: "claude-sonnet-5-5",
      messages: 2,
      rolledBack: 1,
      apiCalls: 3,
      failedCalls: 1,
      inputBilled: 2200,
      conversationSize: 1200,
      resendMultiplier: 2200 / 1200,
      output: 80,
      cost: (2200 * 2 + 80 * 10) / 1e6,
      priced: true,
    });
    // No message text, so nothing the user typed is kept.
    expect(JSON.stringify(summary)).not.toContain("hi");
  });
});

describe("renderHistoryPanel", () => {
  it("lists past conversations and marks the current one", async () => {
    const s = await finishedSession();
    const past = summarizeConversation(1, "claude-haiku-5-5", s.calls, s.turns);
    const current = summarizeConversation(2, "claude-sonnet-5-5", s.calls, s.turns);
    const c = document.createElement("div");
    renderHistoryPanel(c, [past], current, () => {});
    const rows = [...c.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent));
    expect(rows).toEqual([
      ["1", "Claude Haiku 5.5", "2 (1 rolled back, 1 failed)", "3", "2,200", "1,200", "1.8×", "80", "$0.00520"],
      ["2", "Claude Sonnet 5.5 (current)", "2 (1 rolled back, 1 failed)", "3", "2,200", "1,200", "1.8×", "80", "$0.00520"],
    ]);
  });

  it("explains itself when empty and offers clearing only when there's history", () => {
    const c = document.createElement("div");
    renderHistoryPanel(c, [], null, () => {});
    expect(c.textContent).toContain("Finished conversations appear here");
  });
});

describe("history in the app", () => {
  it("keeps a conversation's numbers after switching models, and clears on request", async () => {
    const api = mockApi([message([text("Hi.")], "end_turn", [900, 10]), message([text("Hello.")], "end_turn", [905, 12])]);
    const root = document.createElement("main");
    document.body.replaceChildren(root);
    renderApp(root, { fetch: api.fetch });
    const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
    const settle = async () => {
      for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
    };
    const send = async (msg: string) => {
      $<HTMLInputElement>("#message").value = msg;
      $("form.chat-form").dispatchEvent(new Event("submit", { cancelable: true }));
      await settle();
    };
    $<HTMLInputElement>("#api-key").value = "sk-ant-test-key";
    $("form.key-form").dispatchEvent(new Event("submit", { cancelable: true }));

    await send("hello");
    const rowsNow = () => [...root.querySelectorAll(".history-table tbody tr")].map((tr) => tr.children[1]!.textContent);
    expect(rowsNow()).toEqual(["Claude Sonnet 5.5 (current)"]);

    const select = $<HTMLSelectElement>("#model");
    select.value = "claude-haiku-5-5";
    select.dispatchEvent(new Event("change"));
    expect(rowsNow()).toEqual(["Claude Sonnet 5.5"]);

    await send("hello");
    expect(rowsNow()).toEqual(["Claude Sonnet 5.5", "Claude Haiku 5.5 (current)"]);

    [...root.querySelectorAll<HTMLButtonElement>(".history button")].find((b) => b.textContent === "Clear history")!.click();
    expect(rowsNow()).toEqual(["Claude Haiku 5.5 (current)"]);
  });

  it("keeps the numbers when the key is forgotten", async () => {
    const api = mockApi([message([text("Hi.")], "end_turn", [900, 10])]);
    const root = document.createElement("main");
    document.body.replaceChildren(root);
    renderApp(root, { fetch: api.fetch });
    root.querySelector<HTMLInputElement>("#api-key")!.value = "sk-ant-test-key";
    root.querySelector("form.key-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    root.querySelector<HTMLInputElement>("#message")!.value = "hello";
    root.querySelector("form.chat-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));

    root.querySelector<HTMLButtonElement>(".key-loaded button")!.click();
    expect(root.querySelectorAll(".history-table tbody tr")).toHaveLength(1);
    expect(root.querySelector<HTMLInputElement>("#message")!.disabled).toBe(true);
  });
});
