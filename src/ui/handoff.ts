// The escalation handoff, shown in the conversation as a card. The human reviewer never sees the chat,
// only these fields, so the card shows exactly what was handed over. The fields are model-written, so
// they're rendered as text like everything else.
import type { ToolRun } from "../agent/session";
import { el } from "./dom";

export const HANDOFF_TOOL = "escalate_to_human";

const FIELDS: [key: string, label: string][] = [
  ["customer_id", "Customer"],
  ["summary", "Summary"],
  ["root_cause", "Why it needs a human"],
  ["recommended_action", "Recommended action"],
  ["refund_amount", "Refund amount"],
];

function display(key: string, value: unknown): string {
  if (value === undefined) return "(not provided)";
  if (value === null) return "none";
  if (key === "refund_amount" && typeof value === "number") return `$${value.toFixed(2)}`;
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function renderHandoff(run: ToolRun): HTMLElement {
  const input = run.input !== null && typeof run.input === "object" ? (run.input as Record<string, unknown>) : {};
  const result = run.result.data as { ticketId?: unknown; queue?: unknown } | null;

  const status = run.result.isError
    ? "The handoff failed, so no ticket was created."
    : `Ticket ${String(result?.ticketId ?? "?")} created in the ${String(result?.queue ?? "?")} queue.`;

  return el(
    "li",
    { class: "msg handoff" },
    el(
      "article",
      { "aria-label": "Handoff to a human agent" },
      el("h3", {}, "Handed off to a human agent"),
      el("p", { class: "handoff-status" }, status),
      el(
        "dl",
        {},
        ...FIELDS.flatMap(([key, label]) => [el("dt", {}, label), el("dd", {}, display(key, input[key]))]),
      ),
      el(
        "p",
        { class: "note" },
        "This is everything the reviewer receives. They don't see the conversation, so these fields have to " +
          "stand on their own. The ticket stays created even if this turn is later rolled back.",
      ),
    ),
  );
}
