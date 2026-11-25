// Session export: a conversation's full record as JSON, for sharing and for the replay mode. It holds
// exactly what the page shows (every request body, response, usage, tool run, and the turns) and never the
// API key or any HTTP headers. CallRecord doesn't carry headers in the first place; as a second line of
// defence, anything shaped like an Anthropic key is redacted before the file is written, which also
// catches a key pasted into the chat by mistake.
import { version as appVersion } from "../../package.json";
import { PRICING } from "../pricing/cost";
import type { CallRecord, SessionConfig, Turn } from "./session";

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
