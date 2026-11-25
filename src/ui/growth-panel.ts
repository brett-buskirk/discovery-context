// The context-growth chart and the cost panel. Both read from analyzeGrowth(), which only uses the API's
// own usage numbers. The table doubles as the accessible view of the chart.
import { analyzeGrowth, type CallGrowth, type GrowthSummary } from "../agent/growth";
import { PRICING, formatUsd } from "../pricing/cost";
import { el } from "./dom";
import { svgEl } from "./svg";

const n = (value: number) => value.toLocaleString("en-US");

/** A "nice" axis maximum and step: 1, 2, or 5 times a power of ten, giving about four gridlines. */
export function niceScale(max: number, targetTicks = 4): { max: number; step: number } {
  if (max <= 0) return { max: 1, step: 1 };
  const rough = max / targetTicks;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  return { max: Math.ceil(max / step) * step, step };
}

export function barTitle(g: CallGrowth): string {
  const extra = g.clamped ? " (the difference was negative and is shown as 0)" : "";
  return (
    `Call ${g.call.index + 1}, message ${g.call.turn + 1}: ${n(g.prompt)} input tokens. ` +
    `${n(g.sentBefore)} sent before, ${n(g.added)} new${extra}. ${n(g.output)} output tokens.`
  );
}

// ---------- Chart ----------

const W = 640;
const H = 240;
const M = { top: 12, right: 8, bottom: 28, left: 56 };
const GAP = 2; // surface gap between stacked segments
const RADIUS = 4; // rounded data-end

/** A bar with only its top corners rounded, so it stays anchored to the baseline. */
function topRoundedBar(x: number, y: number, w: number, h: number, cls: string): SVGPathElement {
  const r = Math.min(RADIUS, w / 2, h);
  const d =
    `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} ` +
    `V${y + h} Z`;
  return svgEl("path", { d, class: cls });
}

export function renderChart(summary: GrowthSummary): SVGSVGElement {
  const calls = summary.calls;
  const { max, step } = niceScale(Math.max(...calls.map((g) => g.prompt), 0));
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const y = (v: number) => M.top + plotH - (v / max) * plotH;
  const slot = plotW / Math.max(calls.length, 1);
  const barW = Math.max(Math.min(slot * 0.6, 36), 2);

  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "growth-chart",
    role: "img",
    "aria-label":
      `Input tokens per API call, for ${calls.length} calls. ` +
      `The latest call sent ${n(summary.latestPrompt)} input tokens. Exact values are in the table below.`,
  });

  // Gridlines and y-axis labels.
  for (let v = 0; v <= max; v += step) {
    svg.append(
      svgEl("line", { x1: M.left, x2: W - M.right, y1: y(v), y2: y(v), class: v === 0 ? "axis" : "grid" }),
      svgEl("text", { x: M.left - 6, y: y(v) + 4, class: "tick", "text-anchor": "end" }, n(v)),
    );
  }

  calls.forEach((g, i) => {
    const x = M.left + slot * i + (slot - barW) / 2;
    const group = svgEl("g", { class: "bar" }, svgEl("title", {}, barTitle(g)));
    const hBefore = (g.sentBefore / max) * plotH;
    const hAdded = (g.added / max) * plotH;
    const base = y(0);

    if (g.added > 0) {
      // "new" sits on top of "sent before", separated by a surface gap, and carries the rounded end.
      const top = base - hBefore - hAdded;
      const height = Math.max(hAdded - (hBefore > 0 ? GAP : 0), 1);
      group.append(topRoundedBar(x, top, barW, height, "seg-new"));
      if (hBefore > 0) group.append(svgEl("rect", { x, y: base - hBefore, width: barW, height: hBefore, class: "seg-resent" }));
    } else if (hBefore > 0) {
      group.append(topRoundedBar(x, base - hBefore, barW, hBefore, "seg-resent"));
    }
    // A full-height transparent hit area, so hovering anywhere in the column shows the tooltip.
    group.append(svgEl("rect", { x: M.left + slot * i, y: M.top, width: slot, height: plotH, class: "hit" }));

    // Label calls sparsely so numbers never collide.
    const every = Math.ceil(calls.length / 12);
    if (i % every === 0 || i === calls.length - 1) {
      group.append(svgEl("text", { x: x + barW / 2, y: H - M.bottom + 16, class: "tick", "text-anchor": "middle" }, String(g.call.index + 1)));
    }
    svg.append(group);
  });

  svg.append(svgEl("text", { x: M.left + plotW / 2, y: H - 2, class: "axis-label", "text-anchor": "middle" }, "API call"));
  return svg;
}

// ---------- Panel ----------

function tile(label: string, value: string, note: string): HTMLElement {
  return el("div", { class: "tile" }, el("p", { class: "tile-label" }, label), el("p", { class: "tile-value" }, value), el("p", { class: "tile-note" }, note));
}

function renderTable(summary: GrowthSummary): HTMLElement {
  const head = ["Call", "Message", "stop_reason", "Sent before", "New", "Input total", "Output", "Cost", "Running cost"];
  return el(
    "div",
    { class: "table-wrap" },
    el(
      "table",
      { class: "growth-table" },
      el("caption", {}, "Tokens and cost per API call"),
      el("thead", {}, el("tr", {}, ...head.map((h) => el("th", { scope: "col" }, h)))),
      el(
        "tbody",
        {},
        ...summary.calls.map((g) =>
          el(
            "tr",
            {},
            el("th", { scope: "row" }, String(g.call.index + 1)),
            el("td", {}, String(g.call.turn + 1)),
            el("td", {}, g.call.response?.stop_reason ?? ""),
            el("td", {}, n(g.sentBefore)),
            el("td", {}, `${n(g.added)}${g.clamped ? "*" : ""}`),
            el("td", {}, n(g.prompt)),
            el("td", {}, n(g.output)),
            el("td", {}, g.cost ? formatUsd(g.cost.total) : "n/a"),
            el("td", {}, formatUsd(g.runningCost)),
          ),
        ),
      ),
    ),
  );
}

export function renderGrowthPanel(container: HTMLElement, calls: Parameters<typeof analyzeGrowth>[0], model: string): void {
  const summary = analyzeGrowth(calls);
  if (summary.calls.length === 0) {
    container.replaceChildren(el("p", { class: "note" }, "Send a message to see the context grow."));
    return;
  }

  const multiplier = summary.resendMultiplier;
  const price = PRICING.models[model];
  const anyClamped = summary.calls.some((g) => g.clamped);

  container.replaceChildren(
    el(
      "div",
      { class: "tiles" },
      tile("Input tokens billed", n(summary.totalPrompt), `across ${summary.calls.length} API calls`),
      tile("Conversation size now", n(summary.latestPrompt), "input tokens in the latest request"),
      tile(
        "Paid for the context",
        multiplier ? `${multiplier.toFixed(1)}×` : "n/a",
        "input billed ÷ conversation size: the cost of resending the history",
      ),
      tile("Output tokens", n(summary.totalOutput), "including hidden thinking"),
      tile("Cost at list prices", formatUsd(summary.totalCost), price ? price.label : "model not in price table"),
    ),
    el("h3", {}, "Input tokens per API call"),
    el(
      "ul",
      { class: "legend" },
      el("li", {}, el("span", { class: "swatch seg-resent", "aria-hidden": "true" }), "Sent before (resent history)"),
      el("li", {}, el("span", { class: "swatch seg-new", "aria-hidden": "true" }), "New since that call"),
    ),
    renderChart(summary),
    renderTable(summary),
    el(
      "p",
      { class: "note" },
      "Token counts are the API's own usage numbers. \"Sent before\" is the full input of the earlier call this " +
        "request starts with, and \"New\" is the difference, so the split is derived from measured totals. " +
        (anyClamped ? "* A negative difference is shown as 0. " : "") +
        `Costs are calculated from those counts at ${PRICING.currency} list prices ${PRICING.unit}, as of ${PRICING.asOf} `,
      el("a", { href: PRICING.source, target: "_blank", rel: "noopener noreferrer" }, "(source)"),
      ". Your actual bill can differ.",
    ),
  );
}
