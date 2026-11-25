import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Model output and tool results are untrusted. If any of it were parsed as HTML, injected script could
// read the API key. So src/ may not use any API that turns a string into markup or code. The CSP's
// require-trusted-types-for enforces the same thing at runtime in Chromium.
const BANNED = [
  /\.innerHTML\b/,
  /\.outerHTML\b/,
  /\binsertAdjacentHTML\b/,
  /\bdocument\.write(ln)?\b/,
  /\bcreateContextualFragment\b/,
  /\bDOMParser\b/,
  /\bsrcdoc\b/,
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\bsetHTMLUnsafe\b/,
  /\bparseHTMLUnsafe\b/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(ts|js)$/.test(entry.name) ? [path] : [];
  });
}

describe("src/", () => {
  it("uses no string-to-HTML or string-to-code APIs", () => {
    const offenders = sourceFiles("src").flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) =>
          BANNED.some((re) => re.test(line)) && !line.trim().startsWith("//") ? [`${file}:${i + 1}: ${line.trim()}`] : [],
        ),
    );
    expect(offenders).toEqual([]);
  });
});
