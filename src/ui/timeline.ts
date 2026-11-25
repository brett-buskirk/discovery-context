// The timeline: every API call, grouped under the user message that caused it, each expandable to show
// exactly what was sent and what came back. Everything is rendered as text (see dom.ts); request and
// response bodies are untrusted model output.
import { buildHeaders } from "../api/client";
import type { ContentBlock, MessageParam } from "../api/types";
import type { CallRecord } from "../agent/session";
import { el } from "./dom";

/** Shown in place of the key in the headers view. The real key is never passed in here. */
export const KEY_PLACEHOLDER = "‹your key, not shown›";

const json = (value: unknown) => JSON.stringify(value, null, 2);
const pre = (value: unknown, cls = "json") => el("pre", { class: cls }, json(value));

/** Size of the body as actually sent: compact JSON, UTF-8. */
export function requestBytes(call: CallRecord): number {
  return new TextEncoder().encode(JSON.stringify(call.request)).length;
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A one-line description of a message, e.g. "assistant · tool_use: get_customer". */
export function describeMessage(message: MessageParam): string {
  if (typeof message.content === "string") return `${message.role} · text`;
  const parts = message.content.map((block) => {
    switch (block.type) {
      case "tool_use":
        return `tool_use: ${block.name}`;
      case "tool_result":
        return block.is_error ? "tool_result (error)" : "tool_result";
      default:
        return block.type;
    }
  });
  return `${message.role} · ${parts.join(", ")}`;
}

function hasEmptyThinking(blocks: readonly ContentBlock[]): boolean {
  return blocks.some((b) => b.type === "thinking" && b.thinking === "");
}

/** The summary line for a call. Plain text, so it reads the same to a screen reader. */
export function callSummary(call: CallRecord): string {
  const sent = call.request.messages.length;
  const resent = call.resentMessageCount;
  const head = `Call ${call.index + 1}`;
  const shape = `${plural(sent, "message")} sent (${resent} resent, ${sent - resent} new)`;
  if (!call.response) return `${head} · failed · ${shape} · ${call.error?.message ?? "unknown error"}`;
  const { usage, stop_reason } = call.response;
  return `${head} · ${stop_reason} · ${shape} · ${usage.input_tokens} in / ${usage.output_tokens} out tokens`;
}

// ---------- Request ----------

function renderRequest(call: CallRecord): HTMLElement {
  const { system, tools, messages, ...settings } = call.request;
  const repeatNote = call.index === 0 ? "sent for the first time" : "sent again, unchanged, as on every call";

  const headers = buildHeaders(KEY_PLACEHOLDER);

  const messageList = el(
    "ol",
    { class: "messages" },
    ...messages.map((message, i) => {
      const resent = i < call.resentMessageCount;
      return el(
        "li",
        { class: resent ? "message resent" : "message new" },
        el(
          "details",
          { open: !resent },
          el(
            "summary",
            {},
            el("span", { class: resent ? "badge resent" : "badge new" }, resent ? "resent" : "new"),
            ` messages[${i}] · ${describeMessage(message)}`,
          ),
          pre(message),
        ),
      );
    }),
  );

  return el(
    "section",
    { class: "request" },
    el("h4", {}, "Request"),
    el(
      "p",
      { class: "note" },
      `POST https://api.anthropic.com/v1/messages · ${formatBytes(requestBytes(call))} body. ` +
        "The model keeps nothing between calls, so the whole conversation goes out every time.",
    ),
    el("details", {}, el("summary", {}, "Headers"), pre(headers)),
    el("details", {}, el("summary", {}, "Settings (model, max_tokens, effort)"), pre(settings)),
    el("details", {}, el("summary", {}, `system · ${repeatNote}`), pre(system)),
    el(
      "details",
      {},
      el("summary", {}, `tools · ${plural(tools?.length ?? 0, "definition")}, ${repeatNote}`),
      pre(tools),
    ),
    el("h5", {}, `messages · ${plural(messages.length, "message")}`),
    messageList,
    el("details", {}, el("summary", {}, "Raw body, exactly as sent (pretty-printed)"), pre(call.request, "json raw")),
  );
}

// ---------- Response ----------

function renderResponse(call: CallRecord): HTMLElement {
  const section = el("section", { class: "response" }, el("h4", {}, "Response"));

  if (!call.response) {
    section.append(
      el("p", { class: "error" }, `${call.error?.type ?? "error"}${call.error?.status ? ` (HTTP ${call.error.status})` : ""}: ${call.error?.message ?? ""}`),
    );
  } else {
    const r = call.response;
    section.append(el("p", { class: "note" }, `stop_reason: ${r.stop_reason}. ${stopReasonMeaning(r.stop_reason)}`));
    if (hasEmptyThinking(r.content)) {
      section.append(
        el(
          "p",
          { class: "note" },
          "The empty thinking block is the model's reasoning, hidden by default. Its tokens are still billed " +
            "as output, and the block (with its signature) is sent back on every later call.",
        ),
      );
    }
    section.append(
      el("details", { open: true }, el("summary", {}, "content"), pre(r.content)),
      el("details", {}, el("summary", {}, "usage"), pre(r.usage)),
      el("details", {}, el("summary", {}, "Full response body"), pre(r)),
    );
  }

  if (call.toolRuns.length > 0) {
    section.append(
      el("h4", {}, "Your code ran"),
      el(
        "p",
        { class: "note" },
        "The model never runs anything. It asked for these tools; this page ran them and will send the results " +
          "back as a user message on the next call.",
      ),
      el(
        "ul",
        { class: "tool-runs" },
        ...call.toolRuns.map((run) =>
          el(
            "li",
            {},
            el("span", { class: run.result.isError ? "badge error" : "badge ok" }, run.result.isError ? "error" : "ok"),
            ` ${run.name}`,
            pre({ input: run.input, result: run.result.data }),
          ),
        ),
      ),
    );
  }

  if (call.attempts.length > 1) {
    section.append(
      el("h4", {}, "Retries"),
      el(
        "ul",
        {},
        ...call.attempts.map((a, i) =>
          el("li", {}, `Attempt ${i + 1}: ${a.status ?? "no response"}${a.error ? `, ${a.error}` : ""} (${Math.round(a.durationMs)} ms)`),
        ),
      ),
    );
  }
  return section;
}

export function stopReasonMeaning(reason: string | null): string {
  switch (reason) {
    case "tool_use":
      return "The model is waiting on us: run the tools it asked for, then call again.";
    case "end_turn":
      return "The model is done with this message.";
    case "max_tokens":
      return "The reply hit the max_tokens limit and was cut off.";
    case "refusal":
      return "The model declined this request.";
    default:
      return "";
  }
}

// ---------- Timeline ----------

export function renderCall(call: CallRecord): HTMLElement {
  const duration = call.attempts.reduce((sum, a) => sum + a.durationMs, 0);
  return el(
    "li",
    { class: call.response ? "call" : "call failed" },
    el(
      "details",
      {},
      el("summary", {}, callSummary(call), el("span", { class: "muted" }, ` · ${(duration / 1000).toFixed(1)} s`)),
      el("div", { class: "call-body" }, renderRequest(call), renderResponse(call)),
    ),
  );
}

/** A group for one user message. The app appends calls to it as they complete. */
export function renderTurn(turnIndex: number, userText: string): { root: HTMLElement; calls: HTMLElement; status: HTMLElement } {
  const calls = el("ol", { class: "calls" });
  const status = el("p", { class: "turn-status" });
  const root = el(
    "li",
    { class: "turn" },
    el("h3", {}, `Message ${turnIndex + 1}: `, el("q", {}, userText)),
    calls,
    status,
  );
  return { root, calls, status };
}
