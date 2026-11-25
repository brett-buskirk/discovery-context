// The page: key entry, model choice, the chat, and the timeline of API calls behind it.
import { DEFAULT_CONFIG, MODELS, Session, type CallRecord, type ModelId, type TurnOutcome } from "../agent/session";
import { KeyStore } from "../security/key-store";
import { el } from "./dom";
import { summarizeConversation, type ConversationSummary } from "../agent/history";
import { renderGrowthPanel } from "./growth-panel";
import { renderHistoryPanel } from "./history-panel";
import { renderSampleSheet } from "./sample-sheet";
import { HANDOFF_TOOL, renderHandoff } from "./handoff";
import { renderCall, renderTurn } from "./timeline";

export type AppOptions = {
  /** Injected for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
};

export function renderApp(root: HTMLElement, options: AppOptions = {}): void {
  const keys = new KeyStore();
  let session: Session | null = null;
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
      "with a low spend limit. A short conversation costs a few cents.",
  );

  // ---------- Model and chat ----------
  const modelSelect = el(
    "select",
    { id: "model" },
    ...MODELS.map((m) => el("option", { value: m.id }, m.label)),
  );
  const newSessionButton = el("button", { type: "button", class: "secondary" }, "New conversation");
  const transcript = el("ol", { class: "transcript", "aria-live": "polite" });
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
  const chatForm = el(
    "form",
    { class: "chat-form" },
    el("label", { for: "message" }, "Message the Northwind support agent"),
    el("div", { class: "row" }, messageInput, sendButton),
  );

  root.replaceChildren(
    el("h1", {}, "Context Discovery"),
    el("p", { class: "tagline" }, "See what an AI agent actually sends and receives, one API call at a time."),
    el("section", { class: "panel", "aria-label": "API key" }, keyForm, keyLoaded, keyNote),
    el(
      "section",
      { class: "panel", "aria-label": "Conversation" },
      el("div", { class: "row" }, el("label", { for: "model" }, "Model"), modelSelect, newSessionButton),
      renderSampleSheet((prompt) => {
        messageInput.value = prompt;
        if (!messageInput.disabled) messageInput.focus();
      }),
      transcript,
      chatForm,
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
    el("p", { class: "disclaimer" }, "Unofficial educational project. Not affiliated with or endorsed by Anthropic."),
  );

  renderGrowthPanel(growth, [], modelSelect.value);
  renderHistory();

  // ---------- Behaviour ----------
  function setChatEnabled(enabled: boolean) {
    messageInput.disabled = !enabled;
    sendButton.disabled = !enabled;
  }

  function currentSummary(): ConversationSummary | null {
    return session ? summarizeConversation(conversationNumber, session.config.model, session.calls, session.turns) : null;
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
  }

  function startSession() {
    inFlight?.abort();
    inFlight = null;
    archiveSession();
    transcript.replaceChildren();
    timeline.replaceChildren();
    currentTurn = null;
    renderGrowthPanel(growth, [], modelSelect.value);
    renderHistory();
    setChatEnabled(keys.has());
  }

  function logCall(call: CallRecord) {
    currentTurn?.calls.append(renderCall(call));
    // Show each handoff in the conversation as it happens, before the agent's reply about it.
    for (const run of call.toolRuns) if (run.name === HANDOFF_TOOL) transcript.append(renderHandoff(run));
    if (session) renderGrowthPanel(growth, session.calls, session.config.model);
    renderHistory();
  }

  function say(who: "you" | "agent" | "system", text: string) {
    transcript.append(el("li", { class: `msg ${who}` }, el("span", { class: "who" }, `${who}: `), text));
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

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !keys.has()) return;

    session ??= new Session({
      apiKey: keys.get(),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      config: { model: modelSelect.value as ModelId, ...DEFAULT_CONFIG },
      onCall: logCall,
    });
    const current = session;
    inFlight = new AbortController();
    messageInput.value = "";
    setChatEnabled(false);
    say("you", text);
    const turn = renderTurn(current.turns.length, text);
    currentTurn = turn;
    timeline.append(turn.root);

    try {
      const outcome = await current.send(text, inFlight.signal);
      if (session !== current) return; // the conversation was reset while this turn was running
      if (outcome.status === "done") {
        say("agent", outcome.text);
      } else {
        say("system", describeStop(outcome));
        turn.root.classList.add("rolled-back");
        turn.status.textContent =
          "This message was rolled back: it and these calls are no longer part of the history sent to the model.";
      }
    } finally {
      if (session === current) {
        inFlight = null;
        setChatEnabled(keys.has());
        messageInput.focus();
      }
    }
  });
}
