// A pretend database for the Northwind Outfitters demo, ported from ccaf-study Build 01.
// No AI here, and no real data: every customer and order is fictional. It runs entirely in the browser.

export type Customer = { id: string; name: string; email: string };

export type Order = {
  id: string;
  customerId: string;
  item: string;
  total: number;
  statusCode: 1 | 2 | 3; // 1 processing, 2 shipped, 3 delivered
  deliveredAt: number | null; // Unix seconds
  warehouseBin: string; // noise the agent never needs
  carrierRouteCode: string; // more noise
};

export type Refund = { refundId: string; orderId: string; amount: number };
export type Ticket = { ticketId: string; queue: string };

export class TimeoutError extends Error {}

const DAY = 86_400;

export type BackendOptions = {
  /** Current time in Unix seconds. Delivery dates are relative to it, so refund windows always hold. */
  nowSeconds?: number;
  /** Make the first order lookup time out, to show how a retryable tool error flows through the loop. */
  flaky?: boolean;
};

export type Backend = ReturnType<typeof createBackend>;

// A factory rather than module state, so each session (and each test) gets a fresh, independent store.
export function createBackend({ nowSeconds = Math.floor(Date.now() / 1000), flaky = false }: BackendOptions = {}) {
  const customers: Customer[] = [
    { id: "C-1001", name: "Dana Whitfield", email: "dana@example.com" },
    { id: "C-1002", name: "Dana Whitfield", email: "dwhitfield@example.com" },
    { id: "C-1003", name: "Marcus Oyelaran", email: "marcus@example.com" },
  ];

  const orders: Order[] = [
    { id: "ORD-5001", customerId: "C-1001", item: "Trail headlamp", total: 48,
      statusCode: 3, deliveredAt: nowSeconds - 12 * DAY, warehouseBin: "A-14", carrierRouteCode: "RX-22" },
    { id: "ORD-5002", customerId: "C-1003", item: "Four-season tent", total: 729,
      statusCode: 3, deliveredAt: nowSeconds - 8 * DAY, warehouseBin: "D-02", carrierRouteCode: "RX-31" },
    { id: "ORD-5003", customerId: "C-1003", item: "Camp stove", total: 89.5,
      statusCode: 2, deliveredAt: null, warehouseBin: "B-07", carrierRouteCode: "RX-09" },
  ];

  let failNextLookup = flaky;
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${nowSeconds}-${++sequence}`;

  return {
    findCustomers(q: { email?: string | undefined; name?: string | undefined }): Customer[] {
      const email = q.email?.toLowerCase();
      const name = q.name?.toLowerCase();
      return customers.filter((c) => c.email.toLowerCase() === email || c.name.toLowerCase() === name);
    },

    getOrder(orderId: string): Order | undefined {
      if (failNextLookup) {
        failNextLookup = false;
        throw new TimeoutError("order service timed out");
      }
      return orders.find((o) => o.id === orderId);
    },

    issueRefund(orderId: string, amount: number): Refund {
      return { refundId: nextId("RF"), orderId, amount };
    },

    createTicket(_handoff: unknown): Ticket {
      return { ticketId: nextId("T"), queue: "tier-2" };
    },
  };
}
