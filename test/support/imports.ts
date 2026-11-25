// Finds imports of npm packages (bare specifiers) that would ship runtime code to the browser.
// `import type` / `export type` erase at build time and are allowed; relative imports are our own code.

export type RuntimeImport = { specifier: string; statement: string };

// Static import/export statements (multi-line safe) and side-effect imports like `import "pkg"`.
const STATIC = /^\s*(import|export)\s+(type\s+)?([\s\S]*?)\s*from\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']/gm;
const DYNAMIC = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

const isBare = (spec: string) => !spec.startsWith(".") && !spec.startsWith("/");

export function findRuntimeImports(source: string): RuntimeImport[] {
  const found: RuntimeImport[] = [];
  for (const m of source.matchAll(STATIC)) {
    const typeOnly = Boolean(m[2]);
    const specifier = m[4] ?? m[5] ?? "";
    if (isBare(specifier) && !typeOnly) found.push({ specifier, statement: m[0].trim() });
  }
  for (const m of source.matchAll(DYNAMIC)) {
    const specifier = m[1] ?? "";
    if (isBare(specifier)) found.push({ specifier, statement: m[0] });
  }
  return found;
}
