import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXPORT_FORMAT,
  REDACTED,
  buildSessionExport,
  exportFileName,
  serializeSessionExport,
} from "../src/agent/export";
import { DEFAULT_CONFIG, Session } from "../src/agent/session";
import { renderApp } from "../src/ui/app";
import { message, mockApi, text, toolUse } from "./support/mock-api";

const KEY = "sk-ant-api03-SECRETSECRETSECRET-abcd";
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

async function session(userText = "Where is my stove?") {
  const api = mockApi([
    message([toolUse("a", "get_customer", { email: "marcus@example.com" })], "tool_use", [1000, 50]),
    message([text("It shipped.")], "end_turn", [1200, 30]),
  ]);
  const s = new Session({
    apiKey: KEY,
    fetch: api.fetch,
    sleep: async () => {},
    config: { model: "claude-haiku-5-5", ...DEFAULT_CONFIG },
    backend: { nowSeconds: 1_800_000_000 },
  });
  await s.send(userText);
  return { s, api };
}

describe("buildSessionExport", () => {
  it("captures the config, turns, and every call as the page recorded them", async () => {
    const { s } = await session();
    const data = buildSessionExport(s, new Date("2026-11-25T14:03:00Z"));
    expect(data).toMatchObject({
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt: "2026-11-25T14:03:00.000Z",
      app: { name: "Context Discovery", version: pkg.version },
      config: { model: "claude-haiku-5-5", effort: "medium" },
    });
    expect(data.pricingAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.turns).toEqual(s.turns);
    expect(data.calls).toEqual(s.calls);
    expect(data.calls[0]!.toolRuns[0]!.name).toBe("get_customer");
  });

  it("is a snapshot: later changes to the session don't alter it", async () => {
    const { s } = await session();
    const data = buildSessionExport(s);
    s.calls[0]!.request.messages.length = 0;
    expect(data.calls[0]!.request.messages).toHaveLength(1);
  });
});

describe("serializeSessionExport", () => {
  it("contains no API key and no HTTP headers", async () => {
    const { s, api } = await session();
    expect(api.sent[0]!.headers["x-api-key"]).toBe(KEY); // the key really was used
    const json = serializeSessionExport(buildSessionExport(s), KEY);
    expect(json).not.toContain(KEY);
    expect(json).not.toMatch(/x-api-key|anthropic-version|anthropic-dangerous/);
    expect(JSON.parse(json).format).toBe(EXPORT_FORMAT);
  });

  it("redacts a key that was pasted into the chat", async () => {
    const { s } = await session(`my key is ${KEY}, why isn't it working?`);
    const json = serializeSessionExport(buildSessionExport(s));
    expect(json).not.toContain(KEY);
    expect(json).toContain(`my key is ${REDACTED}, why`);
  });

  it("redacts the known key even if it doesn't look like one", async () => {
    const { s } = await session("token abc123XYZ987 test");
    const json = serializeSessionExport(buildSessionExport(s), "abc123XYZ987");
    expect(json).not.toContain("abc123XYZ987");
  });
});

describe("exportFileName", () => {
  it("names the file by model and time", () => {
    expect(exportFileName("claude-haiku-5-5", new Date("2026-11-25T14:03:59Z"))).toBe(
      "context-discovery-claude-haiku-5-5-2026-11-25-14-03.json",
    );
  });
});

describe("export button", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is disabled until there's a call, then downloads the conversation without the key", async () => {
    const blobs: Blob[] = [];
    const downloads: string[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => (blobs.push(b), "blob:test"));
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });

    const api = mockApi([message([text("Hi.")], "end_turn", [900, 5])]);
    const root = document.createElement("main");
    document.body.replaceChildren(root);
    renderApp(root, { fetch: api.fetch });
    const button = [...root.querySelectorAll("button")].find((b) => b.textContent === "Export conversation (JSON)")!;
    expect(button.disabled).toBe(true);

    root.querySelector<HTMLInputElement>("#api-key")!.value = KEY;
    root.querySelector("form.key-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    root.querySelector<HTMLInputElement>("#message")!.value = "hello";
    root.querySelector("form.chat-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));

    expect(button.disabled).toBe(false);
    button.click();
    expect(downloads).toEqual([expect.stringMatching(/^context-discovery-claude-sonnet-5-5-.*\.json$/)]);
    const json = await blobs[0]!.text();
    expect(json).not.toContain(KEY);
    expect(JSON.parse(json).turns[0].userText).toBe("hello");
  });
});
