// Northwind tools, ported from ccaf-study Build 01. The definitions are what the model sees. The
// handlers are our code, which the model never sees; it only gets the JSON results we send back.
import type { Tool } from "../api/types";
import { TimeoutError, type Backend } from "./backend";

export const SYSTEM_PROMPT =
  "You are a support agent for Northwind Outfitters, an outdoor gear store. " +
  "Verify the customer with get_customer before doing anything else.";

// ---------- Descriptions: the model's only documentation ----------
const descriptions = {
  get_customer: `Find and verify a customer account. Call this FIRST in every conversation, before any order lookup or refund.
Input: the account email (preferred) or the customer's full name.
Returns match_count and a list of matching accounts (customer_id, name, email).
If match_count is greater than 1, do not pick one: ask the customer for the email on the account.
If match_count is 0, the search worked and nobody matched: ask the customer to confirm their details.
This tool does NOT return orders, and an order ID is never a valid input here. Use lookup_order for orders.`,

  lookup_order: `Retrieve one order by its order ID (format ORD-1234).
Requires the customer_id returned by get_customer.
Returns item, total in USD, status, and delivery time.
Use for requests like "where is my order", "check order ORD-5001", or before any refund.
If the customer doesn't know the order ID, use list_orders first.
This tool does NOT look up people. To identify a customer, use get_customer.`,

  list_orders: `List every order on a verified customer's account.
Requires the customer_id returned by get_customer.
Returns order_count and, for each order, its ID, item, total in USD, status, and delivery time.
Use when the customer doesn't know an order ID or asks what orders they have.
An order_count of 0 means the account has no orders: the search worked, it is not an error.`,

  process_refund: `Refund money to the customer's original payment method. This moves real money and cannot be undone.
Requires customer_id from get_customer and an order_id you have already confirmed with lookup_order.
Only delivered orders can be refunded, and amount cannot exceed the order total.
Refunds over $500 cannot be processed here: use escalate_to_human instead.`,

  escalate_to_human: `Hand the conversation to a human support agent.
Use when the customer asks for a human, when policy does not cover the request, when a refund exceeds $500, or when you cannot make progress.
The human will NOT see this conversation. Every field must make sense on its own.
Use null for customer_id or refund_amount when they do not apply. Never invent a value.`,
};

export const TOOL_DEFS: Tool[] = [
  {
    name: "get_customer",
    description: descriptions.get_customer,
    input_schema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Email on the account. Preferred." },
        name: { type: "string", description: "Full name. Only if no email is available." },
      },
    },
  },
  {
    name: "lookup_order",
    description: descriptions.lookup_order,
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "From get_customer, e.g. C-1001" },
        order_id: { type: "string", description: "e.g. ORD-5001" },
      },
      required: ["customer_id", "order_id"],
    },
  },
  {
    name: "list_orders",
    description: descriptions.list_orders,
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "From get_customer, e.g. C-1004" },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "process_refund",
    description: descriptions.process_refund,
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        order_id: { type: "string" },
        amount: { type: "number", description: "USD" },
        reason: { type: "string" },
      },
      required: ["customer_id", "order_id", "amount", "reason"],
    },
  },
  {
    name: "escalate_to_human",
    description: descriptions.escalate_to_human,
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: ["string", "null"] },
        summary: { type: "string", description: "What the customer wants, in two sentences" },
        root_cause: { type: "string", description: "Why this needs a human" },
        recommended_action: { type: "string" },
        refund_amount: { type: ["number", "null"], description: "USD, if a refund is involved" },
      },
      required: ["customer_id", "summary", "root_cause", "recommended_action", "refund_amount"],
    },
  },
];

// ---------- Handlers ----------
export type ToolResult = { isError: boolean; data: unknown };
type ErrorCategory = "transient" | "validation" | "business" | "permission";

const ok = (data: unknown): ToolResult => ({ isError: false, data });
const fail = (errorCategory: ErrorCategory, isRetryable: boolean, message: string): ToolResult => ({
  isError: true,
  data: { errorCategory, isRetryable, message },
});

// The model's tool input is untrusted JSON, so read fields defensively rather than trusting the schema.
type Input = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

type Handler = (input: Input, backend: Backend) => ToolResult;

const handlers: Record<string, Handler> = {
  get_customer(input, backend) {
    const matches = backend.findCustomers({ email: str(input.email), name: str(input.name) });
    return ok({ match_count: matches.length, customers: matches });
  },

  lookup_order(input, backend) {
    const customerId = str(input.customer_id);
    const orderId = str(input.order_id) ?? "";
    const order = backend.getOrder(orderId);
    if (!order) return ok({ found: false }); // a successful search with no match is NOT an error
    if (order.customerId !== customerId) {
      return fail("permission", false, `Order ${orderId} does not belong to customer ${customerId}. Do not share its details.`);
    }
    // Only the fields the agent needs. Every field returned here is resent on every later request.
    const { id, item, total, statusCode, deliveredAt } = order;
    return ok({ found: true, order: { id, item, total, statusCode, deliveredAt } });
  },

  list_orders(input, backend) {
    const customerId = str(input.customer_id) ?? "";
    if (!backend.customerExists(customerId)) {
      return fail("validation", false, `No customer ${customerId}. Verify the customer with get_customer first.`);
    }
    // The same trimmed fields as lookup_order. With a long history this result is still large, and it's
    // resent on every later request.
    const orders = backend
      .listOrders(customerId)
      .map(({ id, item, total, statusCode, deliveredAt }) => ({ id, item, total, statusCode, deliveredAt }));
    return ok({ customer_id: customerId, order_count: orders.length, orders });
  },

  process_refund(input, backend) {
    const customerId = str(input.customer_id);
    const orderId = str(input.order_id) ?? "";
    const amount = typeof input.amount === "number" ? input.amount : NaN;
    const order = backend.getOrder(orderId);
    if (!order || order.customerId !== customerId) {
      return fail("validation", false, `No order ${orderId} on customer ${customerId}. Confirm it with lookup_order first.`);
    }
    if (order.statusCode === 4) {
      return fail("business", false, "This order was cancelled before it shipped, so there is nothing to refund.");
    }
    if (order.statusCode !== 3) {
      return fail("business", false, "This order has not been delivered yet, so it cannot be refunded. Tell the customer a refund becomes available once it arrives.");
    }
    if (!(amount > 0)) {
      return fail("validation", false, "Amount must be a positive number of USD.");
    }
    if (amount > order.total) {
      return fail("validation", false, `Amount ${amount} exceeds the order total of ${order.total}.`);
    }
    return ok(backend.issueRefund(orderId, amount));
  },

  escalate_to_human(input, backend) {
    return ok(backend.createTicket(input));
  },
};

export function runTool(name: string, input: unknown, backend: Backend): ToolResult {
  const handler = handlers[name];
  if (!handler) return { isError: true, data: `Unknown tool: ${name}` };
  const safeInput: Input = input !== null && typeof input === "object" ? (input as Input) : {};
  try {
    return handler(safeInput, backend);
  } catch (err) {
    if (err instanceof TimeoutError) {
      return fail("transient", true, "The order service timed out. Nothing was changed. Safe to retry once.");
    }
    return fail("transient", false, "Unexpected internal error. Do not retry; escalate if the customer is blocked.");
  }
}
