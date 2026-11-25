import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { EXPORT_FORMAT, parseSessionExport } from "../src/agent/export";
import { RECORDINGS, loadRecording } from "../src/recordings";
import { renderApp } from "../src/ui/app";
import { message, mockApi, text } from "./support/mock-api";

const DIR = "src/recordings";
const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));

describe("committed recordings", () => {
  it("are all listed, and every listing has a file", () => {
    expect(files.map((f) => f.replace(/\.json$/, "")).sort()).toEqual(RECORDINGS.map((r) => r.id).sort());
  });

  it.each(files)("%s contains no API key or HTTP headers", (file) => {
    const raw = readFileSync(`${DIR}/${file}`, "utf8");
    expect(raw).not.toMatch(/sk-ant-[A-Za-z0-9_-]{8,}/);
    expect(raw).not.toMatch(/x-api-key|anthropic-version|authorization/i);
  });

  it.each(RECORDINGS)("$id parses and matches its listing", async (info) => {
    const data = await loadRecording(info.id);
    expect(data.config.model).toBe(info.model);
    expect(data.calls.length).toBeGreaterThan(0);
    for (const call of data.calls) {
      expect(call.request.model).toBe(info.model);
      expect(call.response?.model).toBe(info.model);
    }
  });
});

describe("parseSessionExport", () => {
  const valid = () => JSON.parse(readFileSync(`${DIR}/${files[0]}`, "utf8"));

  it("accepts a real export", () => {
    expect(parseSessionExport(valid()).format).toBe(EXPORT_FORMAT);
  });

  it.each([
    ["not an object", null, "isn't a Context Discovery session export"],
    ["another format", { ...valid(), format: "something-else" }, "isn't a Context Discovery session export"],
    ["a newer version", { ...valid(), version: 2 }, "Unsupported export version: 2"],
    ["an unknown model", { ...valid(), config: { ...valid().config, model: "gpt-x" } }, "unknown model"],
    ["calls without turns", { ...valid(), turns: [] }, "doesn't match its turns"],
  ])("rejects %s", (_label, value, error) => {
    expect(() => parseSessionExport(value)).toThrow(error);
  });
});

// ---------- Replay in the app ----------

function app(fetchScript: Parameters<typeof mockApi>[0] = [], replayDelay?: (ms: number) => Promise<void>) {
  const api = mockApi(fetchScript);
  const root = document.createElement("main");
  document.body.replaceChildren(root);
  renderApp(root, { fetch: api.fetch, replayDelay: replayDelay ?? (async () => {}) });
  const watch = (title: string) =>
    [...root.querySelectorAll(".recordings li")]
      .find((li) => li.querySelector("strong")?.textContent === title)!
      .querySelector("button")!
      .click();
  return { root, api, watch };
}

const finished = (root: HTMLElement) => root.querySelector(".replay-banner p")?.textContent?.includes("Replay finished");

describe("replay", () => {
  it("plays a recording through the same views as a live conversation, without calling the API", async () => {
    const { root, api, watch } = app();
    watch("A long order history");
    await vi.waitFor(() => expect(finished(root)).toBe(true));

    expect(api.sent).toHaveLength(0);
    const banner = root.querySelector(".replay-banner")!;
    expect(banner.hasAttribute("hidden")).toBe(false);
    expect(banner.textContent).toContain("Nothing is being sent to the API");
    expect(banner.textContent).toContain("Claude Sonnet 5.5");

    const speakers = [...root.querySelectorAll(".transcript .who")].map((w) => w.textContent);
    expect(speakers).toEqual(["You", "Northwind agent", "You", "Northwind agent", "You", "Northwind agent"]);
    // The Markdown table in the first reply renders as a table.
    expect(root.querySelector(".transcript .agent table")).not.toBeNull();

    expect(root.querySelectorAll(".timeline .turn")).toHaveLength(3);
    expect(root.querySelectorAll(".timeline .call")).toHaveLength(7);
    const billed = 1685 + 1790 + 2347 + 2995 + 3380 + 3641 + 3924;
    expect(root.querySelector(".tile")?.textContent).toContain(billed.toLocaleString("en-US"));
    expect(root.querySelector(".history-table tbody tr td")?.textContent).toBe("Claude Sonnet 5.5 (recorded) (current)");
    expect(root.querySelector<HTMLSelectElement>("#model")!.value).toBe("claude-sonnet-5-5");
    expect(root.querySelector<HTMLInputElement>("#message")!.disabled).toBe(true); // no key
  });

  it("shows the handoff card from a recorded escalation", async () => {
    const { root, watch } = app();
    watch("Refund over the limit");
    await vi.waitFor(() => expect(finished(root)).toBe(true));
    expect(root.querySelector(".transcript .handoff .handoff-status")?.textContent).toMatch(/^Ticket T-.* created/);
  });

  it("stops when the visitor starts a new conversation mid-replay", async () => {
    let release!: () => void;
    const gate = () => new Promise<void>((r) => (release = r));
    const { root, watch } = app([], gate);
    watch("A long order history");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    [...root.querySelectorAll("button")].find((b) => b.textContent === "New conversation")!.click();
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(root.querySelectorAll(".timeline .call")).toHaveLength(0);
    expect(root.querySelector(".replay-banner")!.hasAttribute("hidden")).toBe(true);
    // The partial replay had no calls yet, so it isn't kept in the comparison table.
    expect(root.querySelectorAll(".history-table tbody tr")).toHaveLength(0);
  });

  it("'Show all now' skips the pauses", async () => {
    let pauses = 0;
    let release!: () => void;
    const { root, watch } = app([], () => {
      pauses++;
      return new Promise<void>((r) => (release = r));
    });
    watch("Where is my order?");
    await vi.waitFor(() => expect(pauses).toBe(1));
    [...root.querySelectorAll("button")].find((b) => b.textContent === "Show all now")!.click();
    release();
    await vi.waitFor(() => expect(finished(root)).toBe(true));
    expect(pauses).toBe(1);
  });

  it("a live message after a replay starts a new conversation and keeps the replay's numbers", async () => {
    const { root, api, watch } = app([message([text("Hello!")], "end_turn", [900, 5])]);
    watch("Where is my order?");
    await vi.waitFor(() => expect(finished(root)).toBe(true));

    root.querySelector<HTMLInputElement>("#api-key")!.value = "sk-ant-test-key-1234";
    root.querySelector("form.key-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    root.querySelector<HTMLInputElement>("#message")!.value = "hi";
    root.querySelector("form.chat-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(api.sent).toHaveLength(1));
    await vi.waitFor(() => expect(root.querySelectorAll(".history-table tbody tr")).toHaveLength(2));

    const rows = [...root.querySelectorAll(".history-table tbody tr td:first-of-type")].map((td) => td.textContent);
    expect(rows).toEqual(["Claude Haiku 5.5 (recorded)", "Claude Haiku 5.5 (current)"]);
    expect(api.sent[0]!.body.messages).toHaveLength(1); // the replay's history isn't sent
    expect(root.querySelector(".replay-banner")!.hasAttribute("hidden")).toBe(true);
  });
});
