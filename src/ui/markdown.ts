// Renders the agent's Markdown replies as formatted text, safely. Models write Markdown by habit (tables,
// lists, bold), and showing the raw asterisks and pipes is hard to read.
//
// This is a small parser for a common subset, and it never produces an HTML string: every element is built
// with el() and every piece of model text goes in as a text node. Model output can't become markup, so the
// "no string-to-HTML" rule in CLAUDE.md still holds. Anything it doesn't recognise stays as plain text.
// Links are shown as text with the URL beside them, not as clickable links, because the model writes them.
import { el } from "./dom";

type Inline = Node | string;

const isWordChar = (ch: string | undefined) => ch !== undefined && /\w/.test(ch);

/** Inline formatting: `code`, **bold**, *italic* / _italic_, [text](url), and backslash escapes. */
export function renderInline(text: string): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push(buffer);
    buffer = "";
  };

  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const prev = text[i - 1];
    let m: RegExpExecArray | null;

    if ((m = /^`([^`\n]+)`/.exec(rest))) {
      flush();
      out.push(el("code", {}, m[1]!)); // code content is never parsed further
    } else if ((m = /^\*\*(?=\S)([\s\S]*?\S)\*\*/.exec(rest)) || (!isWordChar(prev) && (m = /^__(?=\S)([\s\S]*?\S)__(?!\w)/.exec(rest)))) {
      flush();
      out.push(el("strong", {}, ...renderInline(m[1]!)));
    } else if ((m = /^\*(?=[^\s*])([^*\n]*?[^\s*])\*/.exec(rest)) || (!isWordChar(prev) && (m = /^_(?=[^\s_])([^_\n]*?[^\s_])_(?!\w)/.exec(rest)))) {
      // The word-boundary checks on _ keep identifiers like get_customer as they are.
      flush();
      out.push(el("em", {}, ...renderInline(m[1]!)));
    } else if ((m = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(rest))) {
      flush();
      out.push(...renderInline(m[1]!), ` (${m[2]!})`);
    } else if ((m = /^\\([\\`*_[\]()#|>+\-.!])/.exec(rest))) {
      buffer += m[1];
    } else {
      buffer += rest[0];
      i += 1;
      continue;
    }
    i += m[0].length;
  }
  flush();
  return out;
}

// ---------- Blocks ----------

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/** Split a table row into cells, respecting escaped pipes. */
export function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  return row.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

const isTableStart = (lines: string[], i: number) =>
  (lines[i] ?? "").includes("|") && TABLE_DIVIDER.test(lines[i + 1] ?? "") && (lines[i + 1] ?? "").includes("-");

const startsBlock = (lines: string[], i: number) => {
  const line = lines[i] ?? "";
  return (
    FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) ||
    BULLET.test(line) || NUMBERED.test(line) || isTableStart(lines, i)
  );
};

function alignment(divider: string): ("left" | "center" | "right" | null)[] {
  return splitRow(divider).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    return left && right ? "center" : right ? "right" : left ? "left" : null;
  });
}

function renderTable(header: string, divider: string, body: string[]): HTMLElement {
  const align = alignment(divider);
  const cls = (i: number) => (align[i] ? { class: `align-${align[i]}` } : {});
  const headCells = splitRow(header);
  return el(
    "div",
    { class: "table-wrap" },
    el(
      "table",
      { class: "md-table" },
      el("thead", {}, el("tr", {}, ...headCells.map((c, i) => el("th", { scope: "col", ...cls(i) }, ...renderInline(c))))),
      el(
        "tbody",
        {},
        ...body.map((line) => {
          const cells = splitRow(line);
          // Pad or trim to the header's width, as Markdown renderers do.
          const row = headCells.map((_, i) => cells[i] ?? "");
          return el("tr", {}, ...row.map((c, i) => el("td", cls(i), ...renderInline(c))));
        }),
      ),
    ),
  );
}

/** Lines joined with <br>, so single line breaks in a chat reply survive. */
function withBreaks(lines: string[]): Inline[] {
  return lines.flatMap((line, i) => (i === 0 ? renderInline(line) : [el("br"), ...renderInline(line)]));
}

export function renderMarkdown(text: string): HTMLElement {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: HTMLElement[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    let m: RegExpExecArray | null;

    if (line.trim() === "") {
      i++;
    } else if (FENCE.test(line)) {
      const marker = FENCE.exec(line)![1]!;
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith(marker)) code.push(lines[i++]!);
      i++; // closing fence (or end of text)
      blocks.push(el("pre", { class: "md-code" }, el("code", {}, code.join("\n"))));
    } else if ((m = HEADING.exec(line))) {
      blocks.push(el("p", { class: "md-heading" }, el("strong", {}, ...renderInline(m[2]!))));
      i++;
    } else if (RULE.test(line)) {
      blocks.push(el("hr"));
      i++;
    } else if (isTableStart(lines, i)) {
      const header = lines[i]!;
      const divider = lines[i + 1]!;
      const body: string[] = [];
      i += 2;
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim() !== "") body.push(lines[i++]!);
      blocks.push(renderTable(header, divider, body));
    } else if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && (m = QUOTE.exec(lines[i]!))) {
        quoted.push(m[1]!);
        i++;
      }
      blocks.push(el("blockquote", {}, renderMarkdown(quoted.join("\n"))));
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = !BULLET.test(line);
      const pattern = ordered ? NUMBERED : BULLET;
      const items: Inline[][] = [];
      const start = ordered ? Number(NUMBERED.exec(line)![1]) : 1;
      while (i < lines.length && lines[i]!.trim() !== "") {
        const current = lines[i]!;
        const item = pattern.exec(current);
        if (item) {
          items.push(renderInline(ordered ? item[2]! : item[1]!));
        } else if (/^\s+\S/.test(current) && items.length > 0 && !startsBlock(lines, i)) {
          // An indented continuation line belongs to the previous item.
          items[items.length - 1]!.push(el("br"), ...renderInline(current.trim()));
        } else if (BULLET.test(current) || NUMBERED.test(current)) {
          // A nested list of the other kind: shown as items of this list rather than dropped.
          const nested = BULLET.exec(current) ?? NUMBERED.exec(current)!;
          items.push(renderInline(nested[nested.length - 1]!));
        } else {
          break;
        }
        i++;
      }
      const lis = items.map((content) => el("li", {}, ...content));
      blocks.push(ordered ? el("ol", start !== 1 ? { start: String(start) } : {}, ...lis) : el("ul", {}, ...lis));
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i]!.trim() !== "" && (para.length === 0 || !startsBlock(lines, i))) {
        para.push(lines[i++]!);
      }
      blocks.push(el("p", {}, ...withBreaks(para)));
    }
  }

  return el("div", { class: "md" }, ...blocks);
}
