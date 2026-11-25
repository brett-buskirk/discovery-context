import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { CSP } from "../src/security/csp";

// Builds the real page and checks the security properties survive into what ships.
let outDir: string;
let html: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "discovery-context-build-"));
  await build({ logLevel: "silent", build: { outDir, emptyOutDir: true } });
  html = readFileSync(join(outDir, "index.html"), "utf8");
}, 60_000);

afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe("built index.html", () => {
  it("has the CSP as the first element in <head>, so it applies before any script loads", () => {
    // Parse rather than string-match: Vite entity-encodes the quotes in the attribute value.
    const doc = new DOMParser().parseFromString(html, "text/html");
    const first = doc.head.firstElementChild;
    expect(first?.getAttribute("http-equiv")).toBe("Content-Security-Policy");
    expect(first?.getAttribute("content")).toBe(CSP);
  });

  it("lets the page connect only to the Claude API", () => {
    expect(CSP).toContain("connect-src https://api.anthropic.com;");
    expect(CSP).toContain("default-src 'none'");
    expect(CSP).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
  });

  it("has no inline scripts and loads nothing from another origin", () => {
    for (const tag of html.match(/<script\b[^>]*>/g) ?? []) expect(tag).toMatch(/\ssrc="\/discovery-context\//);
    expect(html).not.toMatch(/<script\b[^>]*>[^<]+<\/script>/);
    const urls = html.match(/https?:\/\/[^\s"'<>;]+/g) ?? [];
    expect(urls.filter((u) => u !== "https://api.anthropic.com")).toEqual([]);
  });

  it("loads the theme script before the app, as a classic (blocking) script", () => {
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts[0]).toBe('<script src="/discovery-context/theme-init.js">');
    expect(scripts[1]).toMatch(/type="module"/);
  });

  it("sends no referrer", () => {
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
  });
});
