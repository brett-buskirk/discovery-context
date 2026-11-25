// Session export: a conversation's full record as JSON, for sharing and for the replay mode. It holds
// exactly what the page shows (every request body, response, usage, tool run, and the turns) and never the
// API key or any HTTP headers. CallRecord doesn't carry headers in the first place; as a second line of
// defence, anything shaped like an Anthropic key is redacted before the file is written, which also
// catches a key pasted into the chat by mistake.
import { version as appVersion } from "../../package.json";
import { PRICING } from "../pricing/cost";
import { MODELS, type CallRecord, type SessionConfig, type Turn } from "./session";

export const EXPORT_FORMAT = "context-discovery-session";
export const EXPORT_VERSION = 1;

export type SessionExport = {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  app: { name: "Context Discovery"; version: string };
  /** The price table's date, so a reader knows which prices the page used. */
  pricingAsOf: string;
  config: SessionConfig;
  turns: Turn[];
  calls: CallRecord[];
};

/** Matches Anthropic API keys (sk-ant-...). Admin and other key types share the prefix. */
const KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]{8,}/g;
export const REDACTED = "[redacted API key]";

export function buildSessionExport(
  source: { config: SessionConfig; turns: readonly Turn[]; calls: readonly CallRecord[] },
  now: Date = new Date(),
): SessionExport {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    app: { name: "Context Discovery", version: appVersion },
    pricingAsOf: PRICING.asOf,
    config: { ...source.config },
    turns: structuredClone([...source.turns]),
    calls: structuredClone([...source.calls]),
  };
}

/**
 * Serialises an export with any key-shaped string redacted. `knownKey` is the key currently in use, if
 * any. It's redacted even if it doesn't match the pattern.
 */
export function serializeSessionExport(data: SessionExport, knownKey?: string): string {
  let json = JSON.stringify(data, null, 2).replace(KEY_PATTERN, REDACTED);
  if (knownKey && knownKey.length >= 8) json = json.split(knownKey).join(REDACTED);
  return json;
}

export function exportFileName(model: string, now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, "-"); // 2026-11-25-14-03
  return `context-discovery-${model}-${stamp}.json`;
}

/**
 * Checks that a parsed JSON value is a session export this version can read. Light structural checks,
 * enough to fail clearly on the wrong file rather than half-render it.
 */
export function parseSessionExport(value: unknown): SessionExport {
  const v = value as Partial<SessionExport> | null;
  if (!v || typeof v !== "object" || v.format !== EXPORT_FORMAT) {
    throw new Error("This isn't a Context Discovery session export.");
  }
  if (v.version !== EXPORT_VERSION) throw new Error(`Unsupported export version: ${String(v.version)}.`);
  if (!v.config || !MODELS.some((m) => m.id === v.config?.model)) throw new Error("The export names an unknown model.");
  if (!Array.isArray(v.turns) || !Array.isArray(v.calls)) throw new Error("The export has no turns or calls.");
  const turnIndexes = new Set(v.turns.map((t) => t.index));
  for (const call of v.calls) {
    if (!Array.isArray(call?.request?.messages) || !turnIndexes.has(call.turn)) {
      throw new Error("The export has a call that doesn't match its turns.");
    }
  }
  return v as SessionExport;
}
