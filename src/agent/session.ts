// The agent loop, written out by hand (as in ccaf-study's raw-agent.ts), instrumented so every API call
// is kept as a record: the exact request body, the response, usage, and timing. Those records are the
// raw material for the timeline, growth chart, and cost panel.
import { ApiError, createMessage, type Attempt, type ClientOptions } from "../api/client";
import type {
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
  StopReason,
  ToolResultBlockParam,
} from "../api/types";
import { createBackend, type Backend, type BackendOptions } from "../northwind/backend";
import { SYSTEM_PROMPT, TOOL_DEFS, runTool, type ToolResult } from "../northwind/tools";

export const MODELS = [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
] as const;
export type ModelId = (typeof MODELS)[number]["id"];

export type Effort = "low" | "medium" | "high";

export type SessionConfig = {
  model: ModelId;
  /**
   * Sent explicitly because the default differs by model (medium on Opus 5.5 and Haiku 5.5, high on
   * Sonnet 5.5). Fixing it keeps model comparisons fair. Thinking is left at each model's default.
   */
  effort: Effort;
  maxTokens: number;
  /** A fuse, not a thermostat: the loop ends on stop_reason, and this only stops a runaway turn. */
  maxCallsPerTurn: number;
};

export const DEFAULT_CONFIG: Omit<SessionConfig, "model"> = {
  effort: "medium",
  maxTokens: 16_000,
  maxCallsPerTurn: 10,
};

export type ToolRun = { id: string; name: string; input: unknown; result: ToolResult };

/** One POST /v1/messages call, as sent and as received. */
export type CallRecord = {
  /** 0-based position across the whole session. */
  index: number;
  /** Which user message this call belongs to. */
  turn: number;
  startedAt: number; // epoch ms
  /**
   * A deep copy of the body taken at send time. The live messages array keeps growing, so without a
   * copy every record would show the latest history instead of what this call actually sent.
   */
  request: MessageCreateParamsNonStreaming;
  /** How many of request.messages had already been sent by the previous call (the resent part). */
  resentMessageCount: number;
  response: Message | null;
  error: { message: string; status: number | null; type: string } | null;
  attempts: Attempt[];
  requestId: string | null;
  /** The tools this response asked for, and what our code returned. */
  toolRuns: ToolRun[];
};

export type TurnOutcome =
  | { status: "done"; text: string }
  /** The turn ended early. Its messages are removed from the history so the conversation stays valid. */
  | { status: "stopped"; reason: StopReason | "error" | "call_limit"; detail: string };

export type Turn = { index: number; userText: string; outcome: TurnOutcome | null };

export type SessionOptions = Omit<ClientOptions, "signal"> & {
  config: SessionConfig;
  backend?: BackendOptions;
  /** Called after each API call completes (or fails), so the UI can update as the loop runs. */
  onCall?: (call: CallRecord) => void;
};

const textOf = (message: Message) =>
  message.content.map((block) => (block.type === "text" ? block.text : "")).join("");

export class Session {
  readonly config: SessionConfig;
  /** The conversation. The model has no memory between requests, so this array IS its memory. */
  readonly messages: MessageParam[] = [];
  readonly calls: CallRecord[] = [];
  readonly turns: Turn[] = [];
  private readonly backend: Backend;
  // A private field, not a property, because it holds the API key: it stays out of logs and JSON.
  readonly #client: Omit<ClientOptions, "signal">;
  private readonly onCall: ((call: CallRecord) => void) | undefined;
  /** messages.length at the time of the previous call; everything before it is being resent. */
  private lastSentCount = 0;
  private busy = false;

  constructor({ config, backend, onCall, ...client }: SessionOptions) {
    this.config = config;
    this.backend = createBackend(backend);
    this.#client = client;
    this.onCall = onCall;
  }

  /** Send one user message and run the tool loop until the model ends its turn. */
  async send(userText: string, signal?: AbortSignal): Promise<TurnOutcome> {
    if (this.busy) throw new Error("A turn is already running.");
    this.busy = true;
    const turn: Turn = { index: this.turns.length, userText, outcome: null };
    this.turns.push(turn);
    const historyBeforeTurn = this.messages.length;
    try {
      turn.outcome = await this.runTurn(turn.index, userText, signal);
    } finally {
      this.busy = false;
    }
    if (turn.outcome.status === "stopped") {
      // Roll back to before this user message. A half-finished turn (for example a tool_use with no
      // tool_result after it) would make every later request invalid. The call records stay, so the
      // timeline still shows what happened.
      this.messages.length = historyBeforeTurn;
      this.lastSentCount = Math.min(this.lastSentCount, historyBeforeTurn);
    }
    return turn.outcome;
  }

  private async runTurn(turn: number, userText: string, signal?: AbortSignal): Promise<TurnOutcome> {
    this.messages.push({ role: "user", content: userText });

    for (let callsThisTurn = 0; callsThisTurn < this.config.maxCallsPerTurn; callsThisTurn++) {
      const call = await this.call(turn, signal);
      const response = call.response;
      if (!response) {
        return { status: "stopped", reason: "error", detail: call.error?.message ?? "Request failed" };
      }

      // Decide what to do from stop_reason, and nothing else.
      switch (response.stop_reason) {
        case "end_turn":
          // Record everything the model said, thinking blocks included. They must go back unchanged.
          this.messages.push({ role: "assistant", content: response.content });
          return { status: "done", text: textOf(response) };

        case "tool_use": {
          this.messages.push({ role: "assistant", content: response.content });
          const results: ToolResultBlockParam[] = [];
          for (const block of response.content) {
            if (block.type !== "tool_use") continue;
            const result = runTool(block.name, block.input, this.backend);
            call.toolRuns.push({ id: block.id, name: block.name, input: block.input, result });
            results.push({
              type: "tool_result",
              tool_use_id: block.id, // ties this result to that request
              content: JSON.stringify(result.data),
              is_error: result.isError,
            });
          }
          // All results go back together, in one user message, then the loop calls the model again.
          this.messages.push({ role: "user", content: results });
          this.onCall?.(call);
          continue;
        }

        default:
          // refusal, max_tokens, model_context_window_exceeded, pause_turn, stop_sequence: none of these
          // are expected for this agent, so end the turn and show why rather than guess.
          return {
            status: "stopped",
            reason: response.stop_reason ?? "error",
            detail: response.stop_details?.explanation ?? textOf(response),
          };
      }
    }
    return {
      status: "stopped",
      reason: "call_limit",
      detail: `Stopped after ${this.config.maxCallsPerTurn} API calls in one turn.`,
    };
  }

  private async call(turn: number, signal?: AbortSignal): Promise<CallRecord> {
    const request: MessageCreateParamsNonStreaming = structuredClone({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFS,
      output_config: { effort: this.config.effort },
      messages: this.messages,
    });
    const record: CallRecord = {
      index: this.calls.length,
      turn,
      startedAt: Date.now(),
      request,
      resentMessageCount: this.lastSentCount,
      response: null,
      error: null,
      attempts: [],
      requestId: null,
      toolRuns: [],
    };
    this.calls.push(record);
    this.lastSentCount = this.messages.length;

    try {
      const result = await createMessage(request, { ...this.#client, ...(signal ? { signal } : {}) });
      record.response = result.message;
      record.attempts = result.attempts;
      record.requestId = result.requestId;
    } catch (err) {
      if (err instanceof ApiError) {
        record.error = { message: err.message, status: err.status, type: err.errorType };
        record.attempts = err.attempts;
        record.requestId = err.requestId;
      } else {
        record.error = { message: err instanceof Error ? err.message : String(err), status: null, type: "client_error" };
      }
    }
    // tool_use calls report after their tools run, so the record is complete when the UI sees it.
    if (record.response?.stop_reason !== "tool_use") this.onCall?.(record);
    return record;
  }
}
