import { describe, expect, it } from "vitest";
import { createBackend } from "../src/northwind/backend";
import { runTool } from "../src/northwind/tools";

const NOW = 1_800_000_000;
const fresh = (flaky = false) => createBackend({ nowSeconds: NOW, flaky });

describe("get_customer", () => {
  it("finds one account by email, case-insensitively", () => {
    const r = runTool("get_customer", { email: "MARCUS@example.com" }, fresh());
    expect(r).toEqual({
      isError: false,
      data: { match_count: 1, customers: [{ id: "C-1003", name: "Marcus Oyelaran", email: "marcus@example.com" }] },
    });
  });

  it("reports two matches for a shared name instead of picking one", () => {
    const r = runTool("get_customer", { name: "Dana Whitfield" }, fresh());
    expect(r.data).toMatchObject({ match_count: 2 });
  });

  it("treats no match as a successful search, not an error", () => {
    expect(runTool("get_customer", { email: "nobody@example.com" }, fresh())).toEqual({
      isError: false,
      data: { match_count: 0, customers: [] },
    });
  });
});

describe("lookup_order", () => {
  it("returns only the fields the agent needs, dropping internal noise", () => {
    const r = runTool("lookup_order", { customer_id: "C-1003", order_id: "ORD-5003" }, fresh());
    expect(r).toEqual({
      isError: false,
      data: { found: true, order: { id: "ORD-5003", item: "Camp stove", total: 89.5, statusCode: 2, deliveredAt: null } },
    });
    expect(JSON.stringify(r.data)).not.toMatch(/warehouseBin|carrierRouteCode/);
  });

  it("refuses to show another customer's order", () => {
    const r = runTool("lookup_order", { customer_id: "C-1001", order_id: "ORD-5003" }, fresh());
    expect(r.isError).toBe(true);
    expect(r.data).toMatchObject({ errorCategory: "permission", isRetryable: false });
  });

  it("turns a backend timeout into a retryable transient error", () => {
    const backend = fresh(true);
    const first = runTool("lookup_order", { customer_id: "C-1003", order_id: "ORD-5003" }, backend);
    expect(first.data).toMatchObject({ errorCategory: "transient", isRetryable: true });
    const second = runTool("lookup_order", { customer_id: "C-1003", order_id: "ORD-5003" }, backend);
    expect(second.isError).toBe(false);
  });
});

describe("process_refund", () => {
  const refund = (input: object) => runTool("process_refund", input, fresh());
  const base = { customer_id: "C-1001", order_id: "ORD-5001", reason: "broken" };

  it("refunds a delivered order up to its total", () => {
    const r = refund({ ...base, amount: 48 });
    expect(r.isError).toBe(false);
    expect(r.data).toMatchObject({ orderId: "ORD-5001", amount: 48 });
  });

  it("rejects an amount over the order total", () => {
    expect(refund({ ...base, amount: 49 }).data).toMatchObject({ errorCategory: "validation" });
  });

  it("rejects a missing or non-positive amount", () => {
    expect(refund({ ...base }).data).toMatchObject({ errorCategory: "validation" });
    expect(refund({ ...base, amount: 0 }).data).toMatchObject({ errorCategory: "validation" });
  });

  it("rejects an order that hasn't been delivered", () => {
    const r = refund({ customer_id: "C-1003", order_id: "ORD-5003", amount: 10, reason: "late" });
    expect(r.data).toMatchObject({ errorCategory: "business" });
  });

  it("rejects an order that belongs to someone else", () => {
    expect(refund({ ...base, customer_id: "C-1003", amount: 10 }).data).toMatchObject({ errorCategory: "validation" });
  });
});

describe("runTool", () => {
  it("returns an error result for an unknown tool", () => {
    expect(runTool("delete_everything", {}, fresh())).toEqual({ isError: true, data: "Unknown tool: delete_everything" });
  });

  it("tolerates a non-object input", () => {
    expect(runTool("get_customer", null, fresh()).data).toMatchObject({ match_count: 0 });
  });

  it("escalate_to_human returns a ticket", () => {
    const r = runTool("escalate_to_human", { summary: "x" }, fresh());
    expect(r.data).toMatchObject({ queue: "tier-2" });
  });
});
