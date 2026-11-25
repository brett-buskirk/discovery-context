import { describe, expect, it } from "vitest";
import { ANTHROPIC_VERSION, ApiError, createMessage, retryDelayMs } from "../src/api/client";
import type { MessageCreateParamsNonStreaming } from "../src/api/types";
import { apiError, message, mockApi, text } from "./support/mock-api";

const KEY = "sk-ant-test-0000";
const body: MessageCreateParamsNonStreaming = {
  model: "claude-sonnet-5-5",
  max_tokens: 100,
  messages: [{ role: "user", content: "hi" }],
};
const noSleep = async () => {};

describe("createMessage", () => {
  it("POSTs the body unchanged with the API key and browser-access headers", async () => {
    const api = mockApi([message([text("hello")], "end_turn")]);
    const result = await createMessage(body, { apiKey: KEY, fetch: api.fetch });

    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(api.sent[0]!.body).toEqual(body);
    expect(api.sent[0]!.headers).toMatchObject({
      "x-api-key": KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json",
    });
    expect(result.message.content).toEqual([text("hello")]);
    expect(result.attempts).toHaveLength(1);
    expect(result.requestId).toMatch(/^req_/);
  });

  it("retries a 429 and a 529, then succeeds", async () => {
    const waits: number[] = [];
    const api = mockApi([
      apiError(429, "rate_limit_error", "slow down", { "retry-after": "3" }),
      apiError(529, "overloaded_error", "overloaded"),
      message([text("ok")], "end_turn"),
    ]);
    const result = await createMessage(body, {
      apiKey: KEY,
      fetch: api.fetch,
      sleep: async (ms) => void waits.push(ms),
    });
    expect(result.attempts.map((a) => a.status)).toEqual([429, 529, 200]);
    expect(waits[0]).toBe(3000); // honoured retry-after
  });

  it("does not retry a 400 and throws ApiError with the API's message", async () => {
    const api = mockApi([apiError(400, "invalid_request_error", "messages: bad")]);
    const err = await createMessage(body, { apiKey: KEY, fetch: api.fetch, sleep: noSleep }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, errorType: "invalid_request_error", message: "messages: bad" });
    expect(api.sent).toHaveLength(1);
  });

  it("obeys x-should-retry: false even on a 500", async () => {
    const api = mockApi([apiError(500, "api_error", "boom", { "x-should-retry": "false" })]);
    await expect(createMessage(body, { apiKey: KEY, fetch: api.fetch, sleep: noSleep })).rejects.toThrow("boom");
    expect(api.sent).toHaveLength(1);
  });

  it("gives up after maxRetries and reports every attempt", async () => {
    const api = mockApi([
      apiError(500, "api_error", "a"),
      apiError(500, "api_error", "b"),
      apiError(500, "api_error", "c"),
    ]);
    const err = (await createMessage(body, { apiKey: KEY, fetch: api.fetch, sleep: noSleep }).catch((e) => e)) as ApiError;
    expect(err.attempts.map((a) => a.status)).toEqual([500, 500, 500]);
  });

  it("retries network errors and labels the final failure", async () => {
    const api = mockApi([{ throws: new TypeError("Failed to fetch") }, { throws: new TypeError("Failed to fetch") }]);
    const err = (await createMessage(body, { apiKey: KEY, fetch: api.fetch, sleep: noSleep, maxRetries: 1 }).catch(
      (e) => e,
    )) as ApiError;
    expect(err.errorType).toBe("network_error");
    expect(err.attempts).toHaveLength(2);
  });

  it("never puts the API key in an error", async () => {
    const api = mockApi([apiError(401, "authentication_error", "invalid x-api-key")]);
    const err = (await createMessage(body, { apiKey: KEY, fetch: api.fetch, sleep: noSleep }).catch((e) => e)) as ApiError;
    expect(JSON.stringify({ ...err, message: err.message })).not.toContain(KEY);
  });
});

describe("retryDelayMs", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("prefers retry-after-ms, then retry-after", () => {
    expect(retryDelayMs(h({ "retry-after-ms": "250", "retry-after": "9" }), 0)).toBe(250);
    expect(retryDelayMs(h({ "retry-after": "2" }), 0)).toBe(2000);
  });
  it("backs off exponentially, capped at 8s, with jitter", () => {
    expect(retryDelayMs(null, 0, () => 0)).toBe(500);
    expect(retryDelayMs(null, 2, () => 0)).toBe(2000);
    expect(retryDelayMs(null, 10, () => 0)).toBe(8000);
    expect(retryDelayMs(null, 0, () => 1)).toBe(375);
  });
});
