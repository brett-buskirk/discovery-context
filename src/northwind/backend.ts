// A pretend database for the Northwind Outfitters demo, ported from ccaf-study Build 01.
// No AI here, and no real data: every customer and order is fictional (see data.ts). It runs entirely in
// the browser.
import { CUSTOMERS, ORDERS, type CustomerRecord, type OrderRecord } from "./data";

export type Customer = CustomerRecord;

export type Order = Omit<OrderRecord, "deliveredDaysAgo"> & {
  deliveredAt: number | null; // Unix seconds
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
  // Copies, so nothing a session does can change the shared sample data.
  const customers: Customer[] = CUSTOMERS.map((c) => ({ ...c }));
  const orders: Order[] = ORDERS.map(({ deliveredDaysAgo, ...o }) => ({
    ...o,
    deliveredAt: deliveredDaysAgo === null ? null : nowSeconds - deliveredDaysAgo * DAY,
  }));

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

    /** Every order on an account, oldest first. */
    listOrders(customerId: string): Order[] {
      return orders.filter((o) => o.customerId === customerId);
    },

    customerExists(customerId: string): boolean {
      return customers.some((c) => c.id === customerId);
    },

    issueRefund(orderId: string, amount: number): Refund {
      return { refundId: nextId("RF"), orderId, amount };
    },

    createTicket(_handoff: unknown): Ticket {
      return { ticketId: nextId("T"), queue: "tier-2" };
    },
  };
}
