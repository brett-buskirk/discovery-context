// A minimal Messages API client over plain fetch. We don't use the SDK client here, so the inspector
// can show exactly what goes over the wire, and so no third-party code runs on a page that holds an API
// key. Headers and retry rules mirror @anthropic-ai/sdk 1.14 (client.mjs: shouldRetry, retryRequest).
import type { ErrorResponse, ErrorType, Message, MessageCreateParamsNonStreaming } from "./types";

export const API_BASE = "https://api.anthropic.com";
export const ANTHROPIC_VERSION = "2026-10-21";

export type ClientOptions = {
  apiKey: string;
  /** Injected for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Injected for tests so retries don't actually wait. */
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  signal?: AbortSignal;
};

/** One HTTP attempt. A call that was retried has several. */
export type Attempt = {
  status: number | null; // null when the request never got a response (network error)
  durationMs: number;
  requestId: string | null;
  error?: string;
};

export type CreateResult = {
  message: Message;
  attempts: Attempt[];
  requestId: string | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly errorType: ErrorType | "network_error" | "unknown_error",
    readonly requestId: string | null,
    readonly attempts: Attempt[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    // Browsers can only call the API directly with this opt-in header. It exists because a key in a
    // browser can be read by any script on the page; see CLAUDE.md, "Key-handling rules".
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

function shouldRetry(status: number, headers: Headers): boolean {
  // The server can say explicitly whether a retry is worthwhile. Obey it.
  const explicit = headers.get("x-should-retry");
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

/** How long to wait before the next attempt. Honours retry-after-ms / retry-after, else backs off. */
export function retryDelayMs(headers: Headers | null, retryNumber: number, random = Math.random): number {
  const ms = parseFloat(headers?.get("retry-after-ms") ?? "");
  if (ms > 0 && ms <= 2 ** 31 - 1) return ms;
  const after = headers?.get("retry-after");
  if (after) {
    const seconds = parseFloat(after);
    const fromHeader = Number.isNaN(seconds) ? Date.parse(after) - Date.now() : seconds * 1000;
    if (fromHeader > 0 && fromHeader <= 2 ** 31 - 1) return fromHeader;
  }
  // Exponential backoff from 0.5s, capped at 8s, with up to 25% jitter.
  const backoffSeconds = Math.min(0.5 * 2 ** retryNumber, 8);
  return backoffSeconds * (1 - random() * 0.25) * 1000;
}

async function readError(response: Response): Promise<{ type: ErrorType | "unknown_error"; message: string }> {
  try {
    const body = (await response.json()) as Partial<ErrorResponse>;
    if (body.error?.message) return { type: body.error.type, message: body.error.message };
  } catch {
    // Not JSON (a proxy or gateway page). Fall through to a generic message.
  }
  return { type: "unknown_error", message: `HTTP ${response.status}` };
}

/** POST /v1/messages, non-streaming. Retries transient failures; throws ApiError otherwise. */
export async function createMessage(
  body: MessageCreateParamsNonStreaming,
  { apiKey, fetch: fetchImpl = globalThis.fetch, sleep = defaultSleep, maxRetries = 2, signal }: ClientOptions,
): Promise<CreateResult> {
  const attempts: Attempt[] = [];
  const payload = JSON.stringify(body);

  for (let retry = 0; ; retry++) {
    const started = performance.now();
    let response: Response;
    try {
      response = await fetchImpl(`${API_BASE}/v1/messages`, {
        method: "POST",
        headers: buildHeaders(apiKey),
        body: payload,
        ...(signal ? { signal } : {}),
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      // Network failures and CORS rejections land here. The browser hides which one it was.
      const detail = err instanceof Error ? err.message : String(err);
      attempts.push({ status: null, durationMs: performance.now() - started, requestId: null, error: detail });
      if (retry < maxRetries) {
        await sleep(retryDelayMs(null, retry));
        continue;
      }
      throw new ApiError(`Network error: ${detail}`, null, "network_error", null, attempts);
    }

    const requestId = response.headers.get("request-id");
    const durationMs = performance.now() - started;

    if (response.ok) {
      attempts.push({ status: response.status, durationMs, requestId });
      return { message: (await response.json()) as Message, attempts, requestId };
    }

    const error = await readError(response);
    attempts.push({ status: response.status, durationMs, requestId, error: error.message });
    if (retry < maxRetries && shouldRetry(response.status, response.headers)) {
      await sleep(retryDelayMs(response.headers, retry));
      continue;
    }
    throw new ApiError(error.message, response.status, error.type, requestId, attempts);
  }
}
