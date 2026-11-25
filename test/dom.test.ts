import { describe, expect, it } from "vitest";
import { el } from "../src/ui/dom";

describe("el", () => {
  it("inserts strings as text, so markup in model output is never parsed", () => {
    const node = el("p", {}, '<img src=x onerror="alert(1)"> and <b>bold</b>');
    expect(node.querySelector("img, b")).toBeNull();
    expect(node.textContent).toBe('<img src=x onerror="alert(1)"> and <b>bold</b>');
  });

  it("sets attributes and skips false or undefined ones", () => {
    const node = el("button", { type: "submit", disabled: true, hidden: false, title: undefined });
    expect(node.getAttribute("type")).toBe("submit");
    expect(node.hasAttribute("disabled")).toBe(true);
    expect(node.hasAttribute("hidden")).toBe(false);
    expect(node.hasAttribute("title")).toBe(false);
  });

  it("refuses event-handler attributes", () => {
    expect(() => el("div", { onclick: "alert(1)" })).toThrow(/event attribute/);
    expect(() => el("div", { ONLOAD: "x" })).toThrow(/event attribute/);
  });
});
