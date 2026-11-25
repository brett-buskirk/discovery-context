import { describe, expect, it } from "vitest";
import { CUSTOMERS, ORDERS } from "../src/northwind/data";
import { SCENARIOS } from "../src/northwind/scenarios";
import { describeOrder, renderSampleSheet } from "../src/ui/sample-sheet";
import { renderApp } from "../src/ui/app";

describe("scenarios", () => {
  it("only mention customers and orders that exist", () => {
    const emails = new Set(CUSTOMERS.map((c) => c.email));
    const names = new Set(CUSTOMERS.map((c) => c.name));
    const orderIds = new Set(ORDERS.map((o) => o.id));
    for (const s of SCENARIOS) {
      for (const email of s.prompt.match(/[\w.]+@example\.com/g) ?? []) expect(emails, s.title).toContain(email);
      for (const id of s.prompt.match(/ORD-\d+/g) ?? []) expect(orderIds, s.title).toContain(id);
      const identifies = /@example\.com/.test(s.prompt) || [...names].some((n) => s.prompt.includes(n));
      expect(identifies, s.title).toBe(true);
    }
  });

  it("keep their claims about amounts true", () => {
    const total = (id: string) => ORDERS.find((o) => o.id === id)!.total;
    expect(total("ORD-5008")).toBeGreaterThan(500); // "Refund over the limit"
    expect(total("ORD-5012")).toBe(500); // "Right at the limit"
    expect(ORDERS.find((o) => o.id === "ORD-5014")!.statusCode).toBe(4); // "A cancelled order"
    expect(ORDERS.filter((o) => o.customerId === "C-1009")).toHaveLength(10); // "A long order history"
    expect(ORDERS.filter((o) => o.customerId === "C-1010")).toHaveLength(0); // "No orders at all"
  });
});

describe("renderSampleSheet", () => {
  it("lists every customer with their orders", () => {
    const sheet = renderSampleSheet(() => {});
    const rows = sheet.querySelectorAll(".sample-table tbody tr");
    expect(rows).toHaveLength(CUSTOMERS.length);
    const marcus = [...rows].find((r) => r.textContent?.includes("marcus@example.com"))!;
    expect([...marcus.querySelectorAll(".order-list li")].map((li) => li.textContent)).toEqual([
      "ORD-5002: Four-season tent, $729.00, delivered, 8 days ago",
      "ORD-5003: Camp stove, $89.50, shipped",
    ]);
    const liam = [...rows].find((r) => r.textContent?.includes("liam@example.com"))!;
    expect(liam.lastElementChild?.textContent).toBe("none");
  });

  it("calls back with a scenario's prompt", () => {
    const tried: string[] = [];
    const sheet = renderSampleSheet((p) => tried.push(p));
    sheet.querySelectorAll<HTMLButtonElement>(".scenarios button")[3]!.click();
    expect(tried).toEqual([SCENARIOS[3]!.prompt]);
  });

  it("formats order lines", () => {
    expect(describeOrder(ORDERS.find((o) => o.id === "ORD-5008")!)).toBe(
      "ORD-5008: Touring kayak, $1,249.00, delivered, 4 days ago",
    );
  });
});

describe("sample sheet in the app", () => {
  it("fills the message box without sending", () => {
    const root = document.createElement("main");
    document.body.replaceChildren(root);
    renderApp(root);
    root.querySelector<HTMLButtonElement>(".scenarios button")!.click();
    expect(root.querySelector<HTMLInputElement>("#message")!.value).toBe(SCENARIOS[0]!.prompt);
    expect(root.querySelectorAll(".transcript li")).toHaveLength(0);
  });
});
