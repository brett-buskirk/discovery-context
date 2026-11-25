import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findRuntimeImports } from "./support/imports";

// The page holds a live API key, so it ships zero third-party runtime code (CLAUDE.md, "Key-handling
// rules"). Packages may be imported for types only.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [path] : [];
  });
}

describe("findRuntimeImports", () => {
  it("allows type-only imports and exports of packages", () => {
    const src = `
      import type { Message } from "@anthropic-ai/sdk/resources/messages";
      export type {
        Tool,
        Usage,
      } from "@anthropic-ai/sdk/resources/messages";
    `;
    expect(findRuntimeImports(src)).toEqual([]);
  });

  it("allows relative imports, including side-effect CSS", () => {
    expect(findRuntimeImports(`import "./styles.css";\nimport { a } from "../a";`)).toEqual([]);
  });

  it("flags value imports, re-exports, side-effect and dynamic imports of packages", () => {
    const src = `
      import Anthropic from "@anthropic-ai/sdk";
      import {
        thing,
      } from "some-pkg";
      export { x } from "other-pkg";
      import "polyfill-pkg";
      const lazy = await import("lazy-pkg");
    `;
    expect(findRuntimeImports(src).map((i) => i.specifier)).toEqual([
      "@anthropic-ai/sdk",
      "some-pkg",
      "other-pkg",
      "polyfill-pkg",
      "lazy-pkg",
    ]);
  });
});

describe("src/", () => {
  it("imports no runtime code from npm packages", () => {
    const offenders = sourceFiles("src").flatMap((file) =>
      findRuntimeImports(readFileSync(file, "utf8")).map((i) => `${file}: ${i.statement}`),
    );
    expect(offenders).toEqual([]);
  });
});
