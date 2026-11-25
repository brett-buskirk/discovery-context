// The page: key entry, model choice, the chat, and the timeline of API calls behind it.
import { buildSessionExport, exportFileName, serializeSessionExport, type SessionExport } from "../agent/export";
import { summarizeConversation, type ConversationSummary } from "../agent/history";
import {
  DEFAULT_CONFIG,
  MODELS,
  Session,
  type CallRecord,
  type ModelId,
  type SessionConfig,
  type Turn,
  type TurnOutcome,
} from "../agent/session";
import { PRICING } from "../pricing/cost";
import { RECORDINGS, loadRecording, type RecordingInfo } from "../recordings";
import { KeyStore } from "../security/key-store";
import { el, externalLink } from "./dom";
import { renderGrowthPanel } from "./growth-panel";
import { HANDOFF_TOOL, renderHandoff } from "./handoff";
import { renderHistoryPanel } from "./history-panel";
import { renderMarkdown } from "./markdown";
import { renderSampleSheet } from "./sample-sheet";
import { renderThemePicker } from "./theme";
import { renderCall, renderTurn } from "./timeline";

export const SOURCE_URL = "https://github.com/brett-buskirk/discovery-context";

/** What the panels render from: a live Session, or a recording being replayed. */
type Conversation = { config: SessionConfig; calls: readonly CallRecord[]; turns: readonly Turn[] };

/** A recording being played back. Calls and turns are revealed one at a time. */
type Replay = { info: RecordingInfo; data: SessionExport; calls: CallRecord[]; turns: Turn[] };

/** Pause between replayed steps, so the timeline and chart build up the way they did live. */
const REPLAY_STEP_MS = 700;

export type AppOptions = {
  /** Injected for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Injected for tests. Pause between replay steps. */
  replayDelay?: (ms: number) => Promise<void>;
};

export function renderApp(root: HTMLElement, options: AppOptions = {}): void {
  const keys = new KeyStore();
  let session: Session | null = null;
  let replay: Replay | null = null;
  // Bumped whenever the view resets, so a replay still stepping in the background stops.
  let replayToken = 0;
  let replaySkip = false;
  let inFlight: AbortController | null = null;

  // ---------- Key panel ----------
  const keyInput = el("input", {
    id: "api-key",
    type: "password",
    autocomplete: "off",
    spellcheck: "false",
    autocapitalize: "off",
    placeholder: "sk-ant-…",
    "aria-describedby": "key-note",
  });
  const keyError = el("p", { class: "error", role: "alert" });
  const keyForm = el(
    "form",
    { class: "key-form" },
    el("label", { for: "api-key" }, "Anthropic API key"),
    el("div", { class: "row" }, keyInput, el("button", { type: "submit" }, "Use this key")),
    keyError,
  );
  const keyStatus = el("p", { class: "key-status" });
  const forgetButton = el("button", { type: "button", class: "secondary" }, "Forget key");
  const keyLoaded = el("div", { class: "row key-loaded", hidden: true }, keyStatus, forgetButton);

  const keyNote = el(
    "p",
    { id: "key-note", class: "note" },
    "Your key goes straight from this browser to api.anthropic.com. It's kept in this tab's memory only. " +
      "It's never saved, and it's gone when you close or reload the page. Use a dedicated key in a workspace " +
      "with a low spend limit. A short conversation costs a few cents. No key? You can still watch a recorded " +
      "conversation in the next section.",
  );

  // ---------- Model and chat ----------
  const modelSelect = el(
    "select",
    { id: "model" },
    ...MODELS.map((m) => el("option", { value: m.id }, m.label)),
  );
  const newSessionButton = el("button", { type: "button", class: "secondary" }, "New conversation");
  const exportButton = el("button", { type: "button", class: "secondary", disabled: true }, "Export conversation (JSON)");
  // The conversation scrolls inside its own card, so a long chat doesn't push everything else down.
  const transcript = el("ol", { class: "transcript", "aria-live": "polite", "aria-label": "Conversation" });
  const growth = el("div", { class: "growth" });
  const historyView = el("div", { class: "history" });
  // Finished conversations, numbers only, in memory only.
  const history: ConversationSummary[] = [];
  let conversationNumber = 1;
  const timeline = el("ol", { class: "timeline" });
  // The turn group that calls are currently being added to.
  let currentTurn: ReturnType<typeof renderTurn> | null = null;
  const messageInput = el("input", { id: "message", type: "text", autocomplete: "off", disabled: true });
  const sendButton = el("button", { type: "submit", disabled: true }, "Send");
  // ---------- Recordings ----------
  const recordingList = el(
    "ul",
    { class: "recordings" },
    ...RECORDINGS.map((info) => {
      const button = el("button", { type: "button", class: "secondary" }, "Watch");
      button.addEventListener("click", () => void playRecording(info));
      return el(
        "li",
        {},
        el("div", { class: "scenario-head" }, el("strong", {}, info.title), button),
        el("p", { class: "note" }, `${modelLabel(info.model)}. ${info.description}`),
      );
    }),
  );
  const replayText = el("p", {});
  const skipButton = el("button", { type: "button", class: "secondary" }, "Show all now");
  const replayBanner = el("div", { class: "replay-banner", role: "status", hidden: true }, replayText, skipButton);
  skipButton.addEventListener("click", () => {
    replaySkip = true;
  });

  const chatForm = el(
    "form",
    { class: "chat-form" },
    el("label", { for: "message" }, "Message the Northwind support agent"),
    el("div", { class: "row" }, messageInput, sendButton),
  );

  root.replaceChildren(
    el(
      "header",
      { class: "page-header" },
      el("h1", {}, "Context Discovery"),
      el("div", { class: "header-tools row" }, externalLink(SOURCE_URL, "Source on GitHub"), renderThemePicker()),
    ),
    el("p", { class: "tagline" }, "See what an AI agent actually sends and receives, one API call at a time."),
    el(
      "aside",
      { class: "callout", "aria-label": "About this demo" },
      el("strong", {}, "This is a simulation. "),
      "Northwind Outfitters is a made-up outdoor gear store, and its support agent only knows that store's " +
        "sample customers and orders. It can look them up, issue refunds, and hand off to a human, and nothing " +
        "else: it isn't a general-purpose chatbot. The point is to watch what gets sent to the Claude API, and " +
        "what it costs, while it works.",
    ),
    el("section", { class: "panel", "aria-label": "API key" }, keyForm, keyLoaded, keyNote),
    el(
      "section",
      { class: "panel", "aria-label": "Conversation" },
      el("div", { class: "row" }, el("label", { for: "model" }, "Model"), modelSelect, newSessionButton, exportButton),
      renderSampleSheet((prompt) => {
        messageInput.value = prompt;
        if (!messageInput.disabled) messageInput.focus();
      }),
      el(
        "details",
        { class: "sample-sheet recordings-panel", open: true },
        el("summary", {}, "Recorded conversations (no key needed)"),
        el(
          "p",
          { class: "note" },
          "Real conversations, recorded on this page and played back here. Nothing is sent to the API during a " +
            "replay, so it's free. Everything below the chat fills in just as it did live.",
        ),
        recordingList,
      ),
      el(
        "div",
        { class: "chat-card" },
        el(
          "div",
          { class: "chat-header" },
          el("h2", {}, "Northwind Outfitters support"),
          el("span", { class: "sim-badge" }, "Simulated"),
        ),
        el(
          "p",
          { class: "chat-sub" },
          "A fictional store's support agent, running on the model you picked. Sample data only.",
        ),
        replayBanner,
        transcript,
        chatForm,
      ),
    ),
    el("section", { class: "panel", "aria-label": "Context growth and cost" }, el("h2", {}, "Context growth and cost"), growth),
    el("section", { class: "panel", "aria-label": "Compare conversations" }, el("h2", {}, "Compare conversations"), historyView),
    el(
      "section",
      { class: "panel", "aria-label": "API calls" },
      el("h2", {}, "API calls"),
      el(
        "p",
        { class: "note" },
        "Every request this page sends to the Claude API, in order. One message from you can take several calls " +
          "when the agent uses tools. Open a call to see exactly what was sent and what came back.",
      ),
      timeline,
    ),
    el(
      "footer",
      { class: "page-footer" },
      el(
        "p",
        {},
        "Context Discovery is part of the AI Discovery series. ",
        externalLink(SOURCE_URL, "Source code on GitHub"),
        " (MIT License).",
      ),
      el("p", { class: "disclaimer" }, "Unofficial educational project. Not affiliated with or endorsed by Anthropic."),
    ),
  );

  renderGrowthPanel(growth, [], modelSelect.value);
  renderHistory();

  // ---------- Behaviour ----------
  function setChatEnabled(enabled: boolean) {
    messageInput.disabled = !enabled;
    sendButton.disabled = !enabled;
  }

  function modelLabel(id: string): string {
    return MODELS.find((m) => m.id === id)?.label ?? id;
  }

  function current(): Conversation | null {
    if (session) return session;
    return replay ? { config: replay.data.config, calls: replay.calls, turns: replay.turns } : null;
  }

  function currentSummary(): ConversationSummary | null {
    const c = current();
    return c ? summarizeConversation(conversationNumber, c.config.model, c.calls, c.turns, !session && !!replay) : null;
  }

  function renderHistory() {
    renderHistoryPanel(historyView, history, currentSummary(), () => {
      history.length = 0;
      renderHistory();
    });
  }

  /** Move the current conversation into the history, if it made any API calls. */
  function archiveSession() {
    const summary = currentSummary();
    if (summary && summary.apiCalls > 0) {
      history.push(summary);
      conversationNumber++;
    }
    session = null;
    replay = null;
  }

  function startSession() {
    inFlight?.abort();
    inFlight = null;
    replayToken++;
    archiveSession();
    replayBanner.hidden = true;
    transcript.replaceChildren();
    timeline.replaceChildren();
    currentTurn = null;
    renderGrowthPanel(growth, [], modelSelect.value);
    renderHistory();
    updateExportButton();
    setChatEnabled(keys.has());
  }

  function updateExportButton() {
    exportButton.disabled = (current()?.calls.length ?? 0) === 0;
  }

  function logCall(call: CallRecord) {
    updateExportButton();
    currentTurn?.calls.append(renderCall(call));
    // Show each handoff in the conversation as it happens, before the agent's reply about it.
    for (const run of call.toolRuns) {
      if (run.name === HANDOFF_TOOL) {
        transcript.append(renderHandoff(run));
        scrollToEnd();
      }
    }
    const c = current();
    if (c) renderGrowthPanel(growth, c.calls, c.config.model);
    renderHistory();
  }

  /** Shows how a turn ended, in the chat and on its timeline group. Shared by live turns and replays. */
  function finishTurn(view: ReturnType<typeof renderTurn>, outcome: TurnOutcome) {
    if (outcome.status === "done") {
      say("agent", outcome.text);
    } else {
      say("system", describeStop(outcome));
      view.root.classList.add("rolled-back");
      view.status.textContent =
        "This message was rolled back: it and these calls are no longer part of the history sent to the model.";
    }
  }

  function prefersReducedMotion(): boolean {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /** Waits between replay steps. Returns false if the replay was cancelled while waiting. */
  async function step(token: number): Promise<boolean> {
    if (!replaySkip && !prefersReducedMotion()) {
      await (options.replayDelay ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(REPLAY_STEP_MS);
    }
    return token === replayToken;
  }

  async function playRecording(info: RecordingInfo) {
    startSession();
    const token = replayToken;
    replaySkip = false;
    let data: SessionExport;
    try {
      data = await loadRecording(info.id);
    } catch (err) {
      say("system", `Couldn't load the recording: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (token !== replayToken) return;

    const playing: Replay = { info, data, calls: [], turns: [] };
    replay = playing;
    modelSelect.value = data.config.model;
    const recordedOn = data.exportedAt.slice(0, 10);
    replayText.textContent =
      `Replaying a recorded conversation: “${info.title}” on ${modelLabel(data.config.model)}, recorded ` +
      `${recordedOn}. Nothing is being sent to the API. Token counts are from the original run; costs use ` +
      `today's list prices (as of ${PRICING.asOf}).`;
    skipButton.hidden = false;
    replayBanner.hidden = false;
    setChatEnabled(false);

    for (const turn of data.turns) {
      if (!(await step(token))) return;
      say("you", turn.userText);
      const view = renderTurn(turn.index, turn.userText);
      currentTurn = view;
      timeline.append(view.root);
      playing.turns.push(turn);
      for (const call of data.calls.filter((c) => c.turn === turn.index)) {
        if (!(await step(token))) return;
        playing.calls.push(call);
        logCall(call);
      }
      if (turn.outcome) finishTurn(view, turn.outcome);
    }

    skipButton.hidden = true;
    replayText.textContent += " Replay finished.";
    // The visitor can continue live with their own key; their message starts a new conversation.
    setChatEnabled(keys.has());
  }

  const SPEAKERS = { you: "You", agent: "Northwind agent", system: "Note" } as const;

  function say(who: keyof typeof SPEAKERS, text: string) {
    // The agent's replies are Markdown, rendered safely (see markdown.ts). What you and the page write is
    // shown exactly as typed. The inspector always shows the raw reply.
    const bubble = who === "agent" ? el("div", { class: "bubble" }, renderMarkdown(text)) : el("p", { class: "bubble" }, text);
    transcript.append(el("li", { class: `msg ${who}` }, el("span", { class: "who" }, SPEAKERS[who]), bubble));
    scrollToEnd();
  }

  function scrollToEnd() {
    transcript.scrollTop = transcript.scrollHeight;
  }

  function describeStop(outcome: Extract<TurnOutcome, { status: "stopped" }>): string {
    const why = outcome.reason === "error" ? "The request failed" : `The turn stopped (${outcome.reason})`;
    return `${why}: ${outcome.detail} This message was removed from the history, so you can try again.`;
  }

  keyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const check = keys.set(keyInput.value);
    keyInput.value = ""; // don't leave the key sitting in the DOM
    if (!check.ok) {
      keyError.textContent = check.reason;
      return;
    }
    keyError.textContent = "";
    keyStatus.textContent = `Key loaded (${keys.describe()}).`;
    keyForm.hidden = true;
    keyLoaded.hidden = false;
    setChatEnabled(true);
    messageInput.focus();
  });

  forgetButton.addEventListener("click", () => {
    keys.clear();
    startSession(); // aborts any request, keeps the numbers in the comparison table, clears the view
    keyLoaded.hidden = true;
    keyForm.hidden = false;
    setChatEnabled(false);
    keyInput.focus();
  });

  modelSelect.addEventListener("change", startSession);
  newSessionButton.addEventListener("click", startSession);

  exportButton.addEventListener("click", () => {
    const c = current();
    if (!c || c.calls.length === 0) return;
    const json = serializeSessionExport(buildSessionExport(c), keys.has() ? keys.get() : undefined);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = el("a", { href: url, download: exportFileName(c.config.model) });
    link.click();
    // Give the browser a moment to start the download before releasing the object URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !keys.has()) return;
    if (replay) startSession(); // a live message after a replay starts a fresh conversation

    session ??= new Session({
      apiKey: keys.get(),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      config: { model: modelSelect.value as ModelId, ...DEFAULT_CONFIG },
      onCall: logCall,
    });
    const live = session;
    inFlight = new AbortController();
    messageInput.value = "";
    setChatEnabled(false);
    say("you", text);
    const turn = renderTurn(live.turns.length, text);
    currentTurn = turn;
    timeline.append(turn.root);

    try {
      const outcome = await live.send(text, inFlight.signal);
      if (session !== live) return; // the conversation was reset while this turn was running
      finishTurn(turn, outcome);
    } finally {
      if (session === live) {
        inFlight = null;
        setChatEnabled(keys.has());
        messageInput.focus();
      }
    }
  });
}
