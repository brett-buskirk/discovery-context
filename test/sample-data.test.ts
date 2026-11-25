import { describe, expect, it } from "vitest";
import { createBackend } from "../src/northwind/backend";
import { CUSTOMERS, ORDERS } from "../src/northwind/data";
import { TOOL_DEFS, runTool } from "../src/northwind/tools";

const NOW = 1_800_000_000;
const DAY = 86_400;
const backend = () => createBackend({ nowSeconds: NOW });

describe("sample data", () => {
  it("has unique IDs and emails, and every order belongs to a real customer", () => {
    const ids = CUSTOMERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(CUSTOMERS.map((c) => c.email)).size).toBe(CUSTOMERS.length);
    expect(new Set(ORDERS.map((o) => o.id)).size).toBe(ORDERS.length);
    for (const o of ORDERS) expect(ids, o.id).toContain(o.customerId);
  });

  it("only gives delivered orders a delivery date", () => {
    for (const o of ORDERS) expect(o.deliveredDaysAgo === null, o.id).toBe(o.statusCode !== 3);
  });

  it("keeps the Build 01 originals unchanged", () => {
    expect(CUSTOMERS.slice(0, 3)).toEqual([
      { id: "C-1001", name: "Dana Whitfield", email: "dana@example.com" },
      { id: "C-1002", name: "Dana Whitfield", email: "dwhitfield@example.com" },
      { id: "C-1003", name: "Marcus Oyelaran", email: "marcus@example.com" },
    ]);
    expect(ORDERS.slice(0, 3).map(({ id, customerId, item, total, statusCode }) => [id, customerId, item, total, statusCode])).toEqual([
      ["ORD-5001", "C-1001", "Trail headlamp", 48, 3],
      ["ORD-5002", "C-1003", "Four-season tent", 729, 3],
      ["ORD-5003", "C-1003", "Camp stove", 89.5, 2],
    ]);
  });

  it("turns days-ago into timestamps relative to now", () => {
    expect(backend().getOrder("ORD-5011")?.deliveredAt).toBe(NOW - 45 * DAY);
  });

  it("gives each backend its own copy of the data", () => {
    const a = backend();
    a.getOrder("ORD-5001")!.total = 1;
    expect(backend().getOrder("ORD-5001")?.total).toBe(48);
    expect(ORDERS[0]!.total).toBe(48);
  });
});

describe("list_orders", () => {
  it("is offered to the model", () => {
    expect(TOOL_DEFS.map((t) => t.name)).toEqual([
      "get_customer",
      "lookup_order",
      "list_orders",
      "process_refund",
      "escalate_to_human",
    ]);
  });

  it("lists every order on an account, without internal noise fields", () => {
    const r = runTool("list_orders", { customer_id: "C-1004" }, backend());
    expect(r.isError).toBe(false);
    expect(r.data).toEqual({
      customer_id: "C-1004",
      order_count: 3,
      orders: [
        { id: "ORD-5005", item: "Down sleeping bag", total: 189, statusCode: 3, deliveredAt: NOW - 6 * DAY },
        { id: "ORD-5006", item: "Trekking poles", total: 74.99, statusCode: 2, deliveredAt: null },
        { id: "ORD-5007", item: "65L backpack", total: 249, statusCode: 1, deliveredAt: null },
      ],
    });
    expect(JSON.stringify(r.data)).not.toMatch(/warehouseBin|carrierRouteCode/);
  });

  it("treats an account with no orders as a successful, empty search", () => {
    expect(runTool("list_orders", { customer_id: "C-1010" }, backend())).toEqual({
      isError: false,
      data: { customer_id: "C-1010", order_count: 0, orders: [] },
    });
  });

  it("rejects an unknown customer ID", () => {
    const r = runTool("list_orders", { customer_id: "C-9999" }, backend());
    expect(r.data).toMatchObject({ errorCategory: "validation", isRetryable: false });
  });

  it("returns a long history for the large account", () => {
    const r = runTool("list_orders", { customer_id: "C-1009" }, backend());
    expect(r.data).toMatchObject({ order_count: 10 });
  });
});

describe("new cases", () => {
  it("finds both people named Jordan Ellis", () => {
    expect(runTool("get_customer", { name: "jordan ellis" }, backend()).data).toMatchObject({ match_count: 2 });
  });

  it("won't refund a cancelled order, and says why", () => {
    const r = runTool("process_refund", { customer_id: "C-1008", order_id: "ORD-5014", amount: 399, reason: "x" }, backend());
    expect(r.data).toMatchObject({ errorCategory: "business" });
    expect(JSON.stringify(r.data)).toContain("cancelled");
  });

  it("still hides another customer's order", () => {
    const r = runTool("lookup_order", { customer_id: "C-1004", order_id: "ORD-5008" }, backend());
    expect(r.data).toMatchObject({ errorCategory: "permission" });
  });
});
