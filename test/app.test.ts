import { beforeEach, describe, expect, it } from "vitest";
import { renderApp } from "../src/ui/app";
import { message, mockApi, text, toolUse } from "./support/mock-api";

const KEY = "sk-ant-api03-test-key-0000-WXYZ";

function setup(api = mockApi([])) {
  document.body.replaceChildren();
  const root = document.createElement("main");
  document.body.append(root);
  renderApp(root, { fetch: api.fetch });
  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const submit = (form: HTMLFormElement) => form.dispatchEvent(new Event("submit", { cancelable: true }));
  const enterKey = (value: string) => {
    $<HTMLInputElement>("#api-key").value = value;
    submit($<HTMLFormElement>(".key-form"));
  };
  const sendMessage = async (value: string) => {
    $<HTMLInputElement>("#message").value = value;
    submit($<HTMLFormElement>(".chat-form"));
    // Let the mocked fetch and the loop settle.
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  };
  return { root, api, $, enterKey, sendMessage };
}

describe("key entry", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("starts with chat disabled and explains where the key goes", () => {
    const { root, $ } = setup();
    expect($<HTMLInputElement>("#message").disabled).toBe(true);
    expect(root.textContent).toContain("straight from this browser to api.anthropic.com");
    expect($<HTMLInputElement>("#api-key").type).toBe("password");
  });

  it("shows a reason and keeps chat disabled for a malformed key", () => {
    const { $, enterKey } = setup();
    enterKey("sk-proj-123");
    expect($(".error").textContent).toBe("Anthropic API keys start with sk-ant-.");
    expect($<HTMLInputElement>("#message").disabled).toBe(true);
  });

  it("accepts a key, clears it from the input, and enables chat", () => {
    const { $, enterKey } = setup();
    enterKey(KEY);
    expect($<HTMLInputElement>("#api-key").value).toBe("");
    expect($<HTMLInputElement>("#message").disabled).toBe(false);
    expect($(".key-status").textContent).toBe("Key loaded (sk-ant-…WXYZ).");
  });

  it("never writes the key to the DOM, storage, or cookies", async () => {
    const api = mockApi([message([text("Hi there.")], "end_turn")]);
    const { enterKey, sendMessage } = setup(api);
    enterKey(KEY);
    await sendMessage("Hello");
    expect(document.documentElement.outerHTML).not.toContain(KEY);
    expect(JSON.stringify({ ...localStorage })).not.toContain(KEY);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(KEY);
    expect(document.cookie).not.toContain(KEY);
    // ...but it did go to the API, in the header, and only there.
    expect(api.sent[0]!.headers["x-api-key"]).toBe(KEY);
    expect(JSON.stringify(api.sent[0]!.body)).not.toContain(KEY);
  });

  it("forgetting the key disables chat", () => {
    const { $, enterKey } = setup();
    enterKey(KEY);
    $<HTMLButtonElement>(".key-loaded button").click();
    expect($<HTMLInputElement>("#message").disabled).toBe(true);
    expect($<HTMLFormElement>(".key-form").hidden).toBe(false);
  });
});

describe("chat", () => {
  it("runs the tool loop and logs every API call, not just the reply", async () => {
    const api = mockApi([
      message([toolUse("tu_1", "get_customer", { email: "marcus@example.com" })], "tool_use", [1000, 40]),
      message([text("Found you, Marcus.")], "end_turn", [1200, 30]),
    ]);
    const { root, enterKey, sendMessage } = setup(api);
    enterKey(KEY);
    await sendMessage("I'm marcus@example.com");

    const transcript = [...root.querySelectorAll(".transcript li")].map((li) => li.textContent);
    expect(transcript).toEqual(["you: I'm marcus@example.com", "agent: Found you, Marcus."]);
    const turns = root.querySelectorAll(".timeline .turn");
    expect(turns).toHaveLength(1);
    expect(turns[0]!.querySelector("h3")?.textContent).toBe("Message 1: I'm marcus@example.com");
    const calls = [...turns[0]!.querySelectorAll(".call > details > summary")].map((s) => s.textContent);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("Call 1 · tool_use · 1 message sent (0 resent, 1 new) · 1000 in / 40 out tokens");
    expect(calls[1]).toContain("Call 2 · end_turn · 3 messages sent (1 resent, 2 new) · 1200 in / 30 out tokens");
  });

  it("shows model output containing markup as plain text", async () => {
    const api = mockApi([message([text('<img src=x onerror="alert(1)">')], "end_turn")]);
    const { root, enterKey, sendMessage } = setup(api);
    enterKey(KEY);
    await sendMessage("hi");
    expect(root.querySelector(".transcript img")).toBeNull();
    expect(root.querySelector(".transcript .agent")?.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it("sends the selected model", async () => {
    const api = mockApi([message([text("ok")], "end_turn")]);
    const { $, enterKey, sendMessage } = setup(api);
    const select = $<HTMLSelectElement>("#model");
    select.value = "claude-haiku-5-5";
    select.dispatchEvent(new Event("change"));
    enterKey(KEY);
    await sendMessage("hi");
    expect(api.sent[0]!.body.model).toBe("claude-haiku-5-5");
  });

  it("explains a failed turn instead of failing silently", async () => {
    const api = mockApi([
      { status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } },
    ]);
    const { root, enterKey, sendMessage } = setup(api);
    enterKey(KEY);
    await sendMessage("hi");
    expect(root.querySelector(".transcript .system")?.textContent).toContain("invalid x-api-key");
    const turn = root.querySelector(".timeline .turn")!;
    expect(turn.classList.contains("rolled-back")).toBe(true);
    expect(turn.querySelector(".turn-status")?.textContent).toContain("rolled back");
    expect(turn.querySelector(".call.failed")).not.toBeNull();
  });
});
