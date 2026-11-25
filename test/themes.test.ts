import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { THEMES, THEME_STORAGE_KEY, applyTheme, currentTheme, renderThemePicker } from "../src/ui/theme";

const css = readFileSync("src/styles.css", "utf8");
const initScript = readFileSync("public/theme-init.js", "utf8");

/** The declarations inside the first `{ ... }` after `selector`, normalised for comparison. */
function block(selector: string): string[] {
  const start = css.indexOf(selector);
  expect(start, selector).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css
    .slice(open + 1, close)
    .replace(/\/\*[\s\S]*?\*\//g, "") // drop comments
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);
}

const runInit = () => new Function(initScript)();

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("theme CSS", () => {
  it("has a block for every named theme except light, which is the default", () => {
    for (const t of THEMES.filter((t) => t.id !== "auto" && t.id !== "light")) {
      expect(css, t.id).toContain(`:root[data-theme="${t.id}"] {`);
    }
  });

  it("keeps Auto-dark and explicit Dark identical", () => {
    expect(block(":root:not([data-theme]) {")).toEqual(block(':root[data-theme="dark"] {'));
  });

  it("defines the same variables in every theme", () => {
    const names = (decls: string[]) => decls.map((d) => d.split(":")[0]).sort();
    const base = names(block(":root {")).filter((n) => !["--ui", "--read", "--mono"].includes(n!));
    for (const id of ["dark", "sepia", "contrast"]) {
      expect(names(block(`:root[data-theme="${id}"] {`)), id).toEqual(base);
    }
  });
});

describe("theme-init.js", () => {
  it("knows the same themes as the picker", () => {
    const list = JSON.parse(initScript.match(/THEMES = (\[[^\]]*\])/)![1]!.replace(/'/g, '"'));
    expect(list).toEqual(THEMES.map((t) => t.id).filter((id) => id !== "auto"));
    expect(initScript).toContain(`"${THEME_STORAGE_KEY}"`);
  });

  it("applies a saved theme before the app runs", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    runInit();
    expect(document.documentElement.getAttribute("data-theme")).toBe("sepia");
  });

  it("ignores an unknown saved value, leaving Auto", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "</style><script>");
    runInit();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});

describe("applyTheme and the picker", () => {
  it("sets the attribute and remembers the choice", () => {
    applyTheme("contrast");
    expect(document.documentElement.getAttribute("data-theme")).toBe("contrast");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("contrast");
    expect(currentTheme()).toBe("contrast");
  });

  it("Auto clears both, so the OS decides again", () => {
    applyTheme("dark");
    applyTheme("auto");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("stores only the theme name", () => {
    applyTheme("sepia");
    expect(Object.keys(localStorage)).toEqual([THEME_STORAGE_KEY]);
  });

  it("starts on the current theme and applies a change", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const picker = renderThemePicker();
    const select = picker.querySelector("select")!;
    expect(select.value).toBe("dark");
    select.value = "light";
    select.dispatchEvent(new Event("change"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
