import { describe, expect, it, vi } from "vitest";
import { createMessage } from "../src/api/client";
import { DEFAULT_CONFIG, Session } from "../src/agent/session";
import { renderApp } from "../src/ui/app";
import { apiError, message, mockApi, toolUse } from "./support/mock-api";

/** A fetch that never answers until it's aborted, like a slow model reply. */
function hangingFetch() {
  const calls: RequestInit[] = [];
  const fetch = ((_url: string, init: RequestInit) => {
    calls.push(init);
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const body = { model: "claude-haiku-5-5", max_tokens: 10, messages: [{ role: "user" as const, content: "hi" }] };

describe("cancelling in the client", () => {
  it("stops waiting between retries as soon as the request is cancelled", async () => {
    const api = mockApi([apiError(529, "overloaded_error", "busy", { "retry-after": "30" })]);
    const controller = new AbortController();
    const started = Date.now();
    const pending = createMessage(body, { apiKey: "k", fetch: api.fetch, signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(1000); // not the 30 s retry-after
    expect(api.sent).toHaveLength(1);
  });
});

describe("cancelling a turn", () => {
  it("ends the turn as cancelled, records the call, and rolls the history back", async () => {
    const { fetch } = hangingFetch();
    const s = new Session({ apiKey: "k", fetch, config: { model: "claude-haiku-5-5", ...DEFAULT_CONFIG } });
    const controller = new AbortController();
    const pending = s.send("hello", controller.signal);
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();

    expect(await pending).toEqual({ status: "stopped", reason: "cancelled", detail: "You stopped this message." });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]!.error).toMatchObject({ type: "cancelled", status: null });
    expect(s.calls[0]!.error!.message).toContain("may still bill");
    expect(s.messages).toHaveLength(0);
  });

  it("doesn't start another call after a tool round if it was stopped meanwhile", async () => {
    const api = mockApi([message([toolUse("a", "get_customer", { email: "marcus@example.com" })], "tool_use")]);
    const controller = new AbortController();
    const s = new Session({
      apiKey: "k",
      fetch: api.fetch,
      config: { model: "claude-haiku-5-5", ...DEFAULT_CONFIG },
      // Stop as soon as the first (tool_use) call is reported.
      onCall: () => controller.abort(),
    });
    const outcome = await s.send("where is my order", controller.signal);
    expect(outcome).toMatchObject({ status: "stopped", reason: "cancelled" });
    expect(api.sent).toHaveLength(1);
    expect(api.remaining()).toBe(0);
    expect(s.messages).toHaveLength(0);
  });
});

describe("Stop button", () => {
  it("appears while a message runs, stops it, and explains what happened", async () => {
    const { fetch, calls } = hangingFetch();
    const root = document.createElement("main");
    document.body.replaceChildren(root);
    renderApp(root, { fetch });
    const stop = [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Stop")!;
    expect(stop.hidden).toBe(true);

    root.querySelector<HTMLInputElement>("#api-key")!.value = "sk-ant-test-key-1234";
    root.querySelector("form.key-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    root.querySelector<HTMLInputElement>("#message")!.value = "hello";
    root.querySelector("form.chat-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(stop.hidden).toBe(false);
    expect(root.querySelector<HTMLInputElement>("#message")!.disabled).toBe(true);

    stop.click();
    await vi.waitFor(() => expect(stop.hidden).toBe(true));
    expect(root.querySelector(".transcript .system")?.textContent).toContain("You stopped this message");
    expect(root.querySelector(".timeline .turn")!.classList.contains("rolled-back")).toBe(true);
    expect(root.querySelector(".timeline .call.failed")).not.toBeNull();
    expect(root.querySelector<HTMLInputElement>("#message")!.disabled).toBe(false);
  });
});
