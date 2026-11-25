import { describe, expect, it } from "vitest";
import { renderHandoff } from "../src/ui/handoff";
import { renderApp } from "../src/ui/app";
import { message, mockApi, text, toolUse } from "./support/mock-api";

const input = {
  customer_id: "C-1003",
  summary: "Customer wants to know where order ORD-5003 is.",
  root_cause: "Status code 2 has no mapping I can explain.",
  recommended_action: "Check the carrier and update the customer.",
  refund_amount: null,
};

const fields = (node: HTMLElement) =>
  Object.fromEntries([...node.querySelectorAll("dt")].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]));

describe("renderHandoff", () => {
  it("shows every field the reviewer receives, and the ticket", () => {
    const node = renderHandoff({
      id: "tu_1",
      name: "escalate_to_human",
      input,
      result: { isError: false, data: { ticketId: "T-1", queue: "tier-2" } },
    });
    expect(node.querySelector("h3")?.textContent).toBe("Handed off to a human agent");
    expect(node.querySelector(".handoff-status")?.textContent).toBe("Ticket T-1 created in the tier-2 queue.");
    expect(fields(node)).toEqual({
      Customer: "C-1003",
      Summary: input.summary,
      "Why it needs a human": input.root_cause,
      "Recommended action": input.recommended_action,
      "Refund amount": "none",
    });
  });

  it("formats a refund amount and marks missing fields", () => {
    const node = renderHandoff({
      id: "x",
      name: "escalate_to_human",
      input: { customer_id: null, summary: "Refund over limit", refund_amount: 729 },
      result: { isError: false, data: { ticketId: "T-2", queue: "tier-2" } },
    });
    expect(fields(node)).toMatchObject({ Customer: "none", "Refund amount": "$729.00", "Recommended action": "(not provided)" });
  });

  it("says so when the handoff failed", () => {
    const node = renderHandoff({ id: "x", name: "escalate_to_human", input, result: { isError: true, data: "boom" } });
    expect(node.querySelector(".handoff-status")?.textContent).toBe("The handoff failed, so no ticket was created.");
  });

  it("keeps markup in model-written fields as text", () => {
    const node = renderHandoff({
      id: "x",
      name: "escalate_to_human",
      input: { ...input, summary: "<img src=x onerror=alert(1)>" },
      result: { isError: false, data: { ticketId: "T-3", queue: "tier-2" } },
    });
    expect(node.querySelector("img")).toBeNull();
    expect(fields(node).Summary).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("handoff in the conversation", () => {
  it("appears between the user's message and the agent's reply", async () => {
    const api = mockApi([
      message([toolUse("tu_1", "escalate_to_human", input)], "tool_use"),
      message([text("I've passed this to a human.")], "end_turn"),
    ]);
    const root = document.createElement("main");
    document.body.replaceChildren(root);
    renderApp(root, { fetch: api.fetch });
    const key = root.querySelector<HTMLInputElement>("#api-key")!;
    key.value = "sk-ant-test-key";
    root.querySelector("form.key-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    root.querySelector<HTMLInputElement>("#message")!.value = "Get me a human";
    root.querySelector("form.chat-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));

    const items = [...root.querySelectorAll(".transcript > li")].map((li) => li.className);
    expect(items).toEqual(["msg you", "msg handoff", "msg agent"]);
  });
});
