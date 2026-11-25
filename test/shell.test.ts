import { describe, expect, it } from "vitest";
import { renderShell } from "../src/main";

describe("renderShell", () => {
  it("renders the title and tagline as text", () => {
    const root = document.createElement("main");
    renderShell(root);
    expect(root.querySelector("h1")?.textContent).toBe("Context Discovery");
    expect(root.textContent).toContain("one API call at a time");
  });
});
