import { describe, expect, it } from "vitest";
import { renderInline, renderMarkdown, splitRow } from "../src/ui/markdown";

const md = (text: string) => renderMarkdown(text);
const inlineHtml = (text: string) => {
  const span = document.createElement("span");
  span.append(...renderInline(text));
  return span.innerHTML; // test-only: inspect the structure produced
};

describe("tables", () => {
  // The shape of a real reply to "list all my orders" for Amara.
  const reply = [
    "Here are your orders, Amara:",
    "",
    "| Order | Item | Total | Status |",
    "|---|---|---:|---|",
    "| ORD-5016 | Climbing harness | $74.95 | Delivered |",
    "| ORD-5024 | **Crash pad** | $229.00 | Shipped |",
    "",
    "Anything else?",
  ].join("\n");

  it("renders a pipe table as a real table, with the text around it as paragraphs", () => {
    const node = md(reply);
    const table = node.querySelector("table")!;
    expect([...table.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["Order", "Item", "Total", "Status"]);
    const rows = [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent));
    expect(rows).toEqual([
      ["ORD-5016", "Climbing harness", "$74.95", "Delivered"],
      ["ORD-5024", "Crash pad", "$229.00", "Shipped"],
    ]);
    expect(table.querySelector("tbody strong")?.textContent).toBe("Crash pad");
    expect([...node.querySelectorAll(":scope > p")].map((p) => p.textContent)).toEqual([
      "Here are your orders, Amara:",
      "Anything else?",
    ]);
    expect(node.textContent).not.toContain("|");
  });

  it("applies column alignment as a class, not an inline style (the CSP blocks those)", () => {
    const cells = md(reply).querySelectorAll("tbody tr:first-child td");
    expect(cells[2]!.className).toBe("align-right");
    expect(cells[0]!.hasAttribute("style")).toBe(false);
  });

  it("pads short rows and drops extra cells to match the header", () => {
    const node = md("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |");
    const rows = [...node.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent));
    expect(rows).toEqual([["1", ""], ["1", "2"]]);
  });

  it("keeps escaped pipes inside cells", () => {
    expect(splitRow("| a \\| b | c |")).toEqual(["a | b", "c"]);
  });

  it("leaves a lone pipe in a sentence alone", () => {
    expect(md("Use a | b here").querySelector("table")).toBeNull();
  });
});

describe("blocks", () => {
  it("renders bullet and numbered lists, keeping the start number", () => {
    const node = md("Steps:\n- one\n- two\n\n3. three\n4. four");
    expect([...node.querySelectorAll("ul li")].map((li) => li.textContent)).toEqual(["one", "two"]);
    const ol = node.querySelector("ol")!;
    expect(ol.getAttribute("start")).toBe("3");
    expect([...ol.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["three", "four"]);
  });

  it("joins an indented continuation line onto its list item", () => {
    const li = md("- ORD-5003: Camp stove\n  Shipped, no delivery date yet").querySelector("li")!;
    expect(li.textContent).toBe("ORD-5003: Camp stoveShipped, no delivery date yet");
    expect(li.querySelector("br")).not.toBeNull();
  });

  it("shows a nested list's items rather than dropping them", () => {
    const node = md("- Orders\n  1. ORD-5001\n  2. ORD-5004");
    expect([...node.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Orders", "ORD-5001", "ORD-5004"]);
  });

  it("renders headings, quotes, rules, and code blocks", () => {
    const node = md("## Your orders\n\n> Quoted note\n\n---\n\n```\n**not bold** | not | a table\n```");
    expect(node.querySelector(".md-heading strong")?.textContent).toBe("Your orders");
    expect(node.querySelector("blockquote")?.textContent).toBe("Quoted note");
    expect(node.querySelector("hr")).not.toBeNull();
    expect(node.querySelector("pre code")?.textContent).toBe("**not bold** | not | a table");
  });

  it("keeps single line breaks inside a paragraph", () => {
    const p = md("Line one\nLine two").querySelector("p")!;
    expect(p.querySelectorAll("br")).toHaveLength(1);
  });
});

describe("inline", () => {
  it("handles bold, italic, and code", () => {
    expect(inlineHtml("**bold**, *it*, _it_, and `code`")).toBe(
      "<strong>bold</strong>, <em>it</em>, <em>it</em>, and <code>code</code>",
    );
  });

  it("leaves identifiers with underscores alone", () => {
    expect(inlineHtml("I called get_customer and lookup_order.")).toBe("I called get_customer and lookup_order.");
  });

  it("leaves unclosed markers as literal text", () => {
    expect(inlineHtml("2 * 3 and **open")).toBe("2 * 3 and **open");
  });

  it("doesn't format inside code", () => {
    expect(inlineHtml("`**x**`")).toBe("<code>**x**</code>");
  });

  it("honours backslash escapes", () => {
    expect(inlineHtml("\\*not italic\\*")).toBe("*not italic*");
  });
});

describe("safety", () => {
  it("shows HTML in a reply as text, everywhere", () => {
    const evil = '<img src=x onerror="alert(1)">';
    const node = md(`${evil}\n\n| ${evil} |\n|---|\n| ${evil} |\n\n- ${evil}\n\n**${evil}**\n\n\`\`\`\n${evil}\n\`\`\``);
    expect(node.querySelector("img, script, [onerror]")).toBeNull();
    expect(node.textContent).toContain(evil);
  });

  it("shows links as text with the URL, never as a clickable link", () => {
    const node = md("See [our policy](https://evil.example/phish) or [this](javascript:alert(1)).");
    expect(node.querySelector("a")).toBeNull();
    expect(node.textContent).toBe("See our policy (https://evil.example/phish) or this (javascript:alert(1)).");
  });
});
