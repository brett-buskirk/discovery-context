// The sample-data sheet: who and what exists in the Northwind demo, and scenarios to try. It reads the
// same data the tools use, so it can't drift from what the agent can actually find.
import { CUSTOMERS, ORDERS, STATUS_LABELS, type OrderRecord } from "../northwind/data";
import { SCENARIOS } from "../northwind/scenarios";
import { el } from "./dom";

const usd = (amount: number) =>
  amount.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export function describeOrder(o: OrderRecord): string {
  const status = STATUS_LABELS[o.statusCode];
  const when =
    o.deliveredDaysAgo === null ? "" : `, ${o.deliveredDaysAgo} day${o.deliveredDaysAgo === 1 ? "" : "s"} ago`;
  return `${o.id}: ${o.item}, ${usd(o.total)}, ${status}${when}`;
}

/** @param onTry called with a scenario's prompt, to put it in the message box. */
export function renderSampleSheet(onTry: (prompt: string) => void): HTMLElement {
  const scenarios = el(
    "ul",
    { class: "scenarios" },
    ...SCENARIOS.map((s) => {
      const button = el("button", { type: "button", class: "secondary" }, "Use this");
      button.addEventListener("click", () => onTry(s.prompt));
      return el(
        "li",
        {},
        el("div", { class: "scenario-head" }, el("strong", {}, s.title), button),
        el("p", { class: "scenario-prompt" }, s.prompt),
        el("p", { class: "note" }, `Watch for: ${s.watch}`),
      );
    }),
  );

  const customers = el(
    "div",
    { class: "table-wrap" },
    el(
      "table",
      { class: "sample-table" },
      el("caption", {}, "Customers and their orders"),
      el(
        "thead",
        {},
        el("tr", {}, ...["ID", "Name", "Email", "Orders"].map((h) => el("th", { scope: "col" }, h))),
      ),
      el(
        "tbody",
        {},
        ...CUSTOMERS.map((c) => {
          const orders = ORDERS.filter((o) => o.customerId === c.id);
          return el(
            "tr",
            {},
            el("th", { scope: "row" }, c.id),
            el("td", {}, c.name),
            el("td", {}, c.email),
            el(
              "td",
              {},
              orders.length === 0
                ? "none"
                : el("ul", { class: "order-list" }, ...orders.map((o) => el("li", {}, describeOrder(o)))),
            ),
          );
        }),
      ),
    ),
  );

  return el(
    "details",
    { class: "sample-sheet" },
    el("summary", {}, "Sample data and scenarios to try"),
    el(
      "p",
      { class: "note" },
      "Everything here is made up, and it all lives in this page. The agent can only find it through its tools. " +
        "Pick a scenario to put its message in the box, then press Send.",
    ),
    el("h3", {}, "Scenarios"),
    scenarios,
    el("h3", {}, "Customers and orders"),
    customers,
    el(
      "p",
      { class: "note" },
      "Order statuses: 1 processing, 2 shipped, 3 delivered, 4 cancelled. The agent only ever sees the number, " +
        "because no tool explains it. Refunds over $500 have to go to a human.",
    ),
  );
}
