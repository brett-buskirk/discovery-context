// Ready-made prompts for the sample-data sheet. Each one exercises a different path through the agent
// and the tools. test/scenarios.test.ts checks every email and order ID here exists in data.ts.

export type Scenario = { title: string; prompt: string; watch: string };

export const SCENARIOS: Scenario[] = [
  {
    title: "Where is my order?",
    prompt: "Hi, I'm marcus@example.com. Where is my stove? Order ORD-5003.",
    watch: "One message, three API calls: get_customer, lookup_order, then the reply. Each call resends the last.",
  },
  {
    title: "A simple refund",
    prompt: "I'm dana@example.com. The headlamp from order ORD-5001 broke. Can I get a refund of $48?",
    watch: "The agent should confirm the order with lookup_order before calling process_refund.",
  },
  {
    title: "Two people, one name",
    prompt: "Hi, this is Jordan Ellis. I'd like to check on an order.",
    watch: "get_customer finds two accounts, so the agent should ask for the email instead of guessing.",
  },
  {
    title: "Refund over the limit",
    prompt: "I'm jordan.ellis@example.com. I want a full refund for my kayak, order ORD-5008.",
    watch: "$1,249 is over the $500 limit, so this should end in a handoff card, not a refund.",
  },
  {
    title: "Right at the limit",
    prompt: "I'm sofia@example.com. I'd like a refund for my ultralight tent, order ORD-5012.",
    watch: "The tent is exactly $500. The limit is for refunds over $500, so the agent can process this one.",
  },
  {
    title: "No order number",
    prompt: "I'm priya@example.com. What orders do I have, and which ones have shipped?",
    watch: "list_orders returns status codes 1, 2, and 3. Nothing tells the agent what they mean.",
  },
  {
    title: "A long order history",
    prompt: "I'm amara@example.com. Can you list all of my orders?",
    watch: "Ten orders come back in one tool result. Send a follow-up and watch that result get resent.",
  },
  {
    title: "A cancelled order",
    prompt: "I'm wei.chen@example.com. Please refund my GPS watch, order ORD-5014.",
    watch: "process_refund returns a business error. The agent should explain it, not retry.",
  },
  {
    title: "Someone else's order",
    prompt: "I'm priya@example.com. What's the status of order ORD-5008?",
    watch: "That order belongs to another customer. lookup_order returns a permission error.",
  },
  {
    title: "No orders at all",
    prompt: "Hi, I'm liam@example.com. Where are my orders?",
    watch: "list_orders returns an empty list. That's a successful search, not an error.",
  },
];
