// A scripted stand-in for the Messages API. Tests queue responses; nothing reaches the network.
import type { Message } from "../../src/api/types";

export type Sent = { url: string; headers: Record<string, string>; body: any };

type Scripted = { status: number; body: unknown; headers?: Record<string, string> } | { throws: Error };

export function mockApi(script: Scripted[]) {
  const sent: Sent[] = [];
  const queue = [...script];
  const fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    sent.push({
      url: String(url),
      headers: { ...(init?.headers as Record<string, string>) },
      body: JSON.parse(String(init?.body)),
    });
    const next = queue.shift();
    if (!next) throw new Error("mockApi: no scripted response left");
    if ("throws" in next) throw next.throws;
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { "content-type": "application/json", ...next.headers },
    });
  };
  return { fetch: fetch as typeof globalThis.fetch, sent, remaining: () => queue.length };
}

const usage = (input: number, output: number) => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
  output_tokens_details: null,
  server_tool_use: null,
  service_tier: "standard",
  inference_geo: "global",
});

let idCounter = 0;

export function message(
  content: unknown[],
  stop_reason: string,
  tokens: [number, number] = [100, 20],
  extra: Record<string, unknown> = {},
) {
  return {
    status: 200,
    headers: { "request-id": `req_${++idCounter}` },
    body: {
      id: `msg_${idCounter}`,
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5-5",
      content,
      stop_reason,
      stop_sequence: null,
      stop_details: null,
      container: null,
      usage: usage(...tokens),
      ...extra,
    } as unknown as Message,
  };
}

export const text = (t: string) => ({ type: "text", text: t });
export const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });
export const thinking = () => ({ type: "thinking", thinking: "", signature: "sig-abc" });

export const apiError = (status: number, type: string, msg: string, headers: Record<string, string> = {}) => ({
  status,
  headers,
  body: { type: "error", error: { type, message: msg }, request_id: "req_err" },
});
