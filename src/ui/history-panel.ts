// The comparison table: earlier conversations plus the current one, so models can be compared after
// switching. Numbers only.
import type { ConversationSummary } from "../agent/history";
import { PRICING, formatUsd } from "../pricing/cost";
import { el } from "./dom";

const n = (value: number) => value.toLocaleString("en-US");
const modelLabel = (id: string) => PRICING.models[id]?.label ?? id;

export function renderHistoryPanel(
  container: HTMLElement,
  past: readonly ConversationSummary[],
  current: ConversationSummary | null,
  onClear: () => void,
): void {
  const rows = [...past, ...(current && current.apiCalls > 0 ? [current] : [])];
  if (rows.length === 0) {
    container.replaceChildren(
      el("p", { class: "note" }, "Finished conversations appear here, so you can compare models side by side."),
    );
    return;
  }

  const head = [
    "#",
    "Model",
    "Messages",
    "API calls",
    "Input billed",
    "Conversation size",
    "Paid for the context",
    "Output",
    "Cost",
  ];

  const clear = el("button", { type: "button", class: "secondary", disabled: past.length === 0 }, "Clear history");
  clear.addEventListener("click", onClear);

  container.replaceChildren(
    el(
      "p",
      { class: "note" },
      "For a fair comparison, send the same messages to each model. Kept in this tab's memory only; " +
        "a reload clears it.",
    ),
    el(
      "div",
      { class: "table-wrap" },
      el(
        "table",
        { class: "growth-table history-table" },
        el("caption", {}, "Conversations in this tab"),
        el("thead", {}, el("tr", {}, ...head.map((h) => el("th", { scope: "col" }, h)))),
        el(
          "tbody",
          {},
          ...rows.map((r) => {
            const isCurrent = r === current;
            const extras = [
              r.rolledBack > 0 ? `${r.rolledBack} rolled back` : "",
              r.failedCalls > 0 ? `${r.failedCalls} failed` : "",
            ].filter(Boolean);
            return el(
              "tr",
              { class: isCurrent ? "current" : undefined },
              el("th", { scope: "row" }, String(r.number)),
              el("td", {}, `${modelLabel(r.model)}${r.recorded ? " (recorded)" : ""}${isCurrent ? " (current)" : ""}`),
              el("td", {}, `${r.messages}${extras.length ? ` (${extras.join(", ")})` : ""}`),
              el("td", {}, String(r.apiCalls)),
              el("td", {}, n(r.inputBilled)),
              el("td", {}, n(r.conversationSize)),
              el("td", {}, r.resendMultiplier ? `${r.resendMultiplier.toFixed(1)}×` : "n/a"),
              el("td", {}, n(r.output)),
              el("td", {}, r.priced ? formatUsd(r.cost) : `${formatUsd(r.cost)}*`),
            );
          }),
        ),
      ),
    ),
    rows.some((r) => !r.priced) ? el("p", { class: "note" }, "* Model not in the price table; cost incomplete.") : "",
    el("div", { class: "row" }, clear),
  );
}
