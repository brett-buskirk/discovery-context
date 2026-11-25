// Recorded conversations for visitors without an API key. Each file is a real session, exported from the
// live page with "Export conversation (JSON)" and checked before it was committed (no keys, no headers;
// test/recordings.test.ts keeps checking). They load on demand as separate chunks, so they don't weigh down
// the first page load, and they arrive as scripts from this site, so the CSP needs no change.
import { parseSessionExport, type SessionExport } from "../agent/export";
import type { ModelId } from "../agent/session";

export type RecordingInfo = {
  /** The file name without .json. */
  id: string;
  title: string;
  model: ModelId;
  description: string;
};

export const RECORDINGS: RecordingInfo[] = [
  {
    id: "haiku-where-is-my-order",
    title: "Where is my order?",
    model: "claude-haiku-5-5",
    description: "One message, three API calls: look up the customer, then the order, then reply.",
  },
  {
    id: "opus-where-is-my-order",
    title: "Where is my order? (on Opus)",
    model: "claude-opus-5-5",
    description: "The same message on Claude Opus 5.5. Compare its cost with the Haiku recording.",
  },
  {
    id: "sonnet-refund-over-limit",
    title: "Refund over the limit",
    model: "claude-sonnet-5-5",
    description: "A $1,249 refund the agent can't process, so it hands off to a human.",
  },
  {
    id: "sonnet-long-order-history",
    title: "A long order history",
    model: "claude-sonnet-5-5",
    description: "Ten orders come back in one tool result, then get resent on every follow-up.",
  },
];

const loaders = import.meta.glob<{ default: unknown }>("./*.json");

export async function loadRecording(id: string): Promise<SessionExport> {
  const loader = loaders[`./${id}.json`];
  if (!loader) throw new Error(`No recording named ${id}.`);
  return parseSessionExport((await loader()).default);
}
