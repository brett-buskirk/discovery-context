# CLAUDE.md — discovery-context

Project-level guide. The machine-wide policy (`/etc/claude-code/CLAUDE.md`) still applies in full:
branch → PR → Brett merges, never commit to `main`, tests ship with the change, signed commits with a
`Co-Authored-By:` trailer, no secrets anywhere.

## What this is
A public, static site in Brett's **AI Discovery** series, live at
https://brett-buskirk.github.io/discovery-context/. It shows what actually happens
during an agent interaction with the Claude API:
- **Every API call**, not just every user turn. A tool loop makes several requests per user message, and
  each one resends the entire conversation.
- **The exact request and response bodies**: `system`, `tools`, the full `messages[]`, and the
  `content` blocks that come back, including `tool_use`, `tool_result`, and empty `thinking` blocks.
- **Context growth**: how much of each request is resent history and how much is new.
- **Token usage and cost**, per call and cumulative, using the API's own `usage` numbers.

Public name: **Context Discovery**. The project grew out of Build 01 of
[ccaf-study](https://github.com/brett-buskirk/ccaf-study) (`raw-agent.ts`, the hand-written loop). The demo
scenario is the Northwind Outfitters support agent from that build.

## Core teaching points (keep the UI and copy anchored on these)
1. The model has no memory between requests. The `messages` array is its memory, and the whole array is
   sent every time.
2. Because the history is resent, billed input tokens grow with every call, and the cumulative cost grows
   faster than the conversation does. Every byte a tool returns is paid for again on every later call.
3. `stop_reason` drives the loop: `tool_use` means "run these and call me back", `end_turn` means done.
4. Tool definitions and the system prompt count as input on every request.
5. Prompt caching changes the price of the resent prefix, not its presence. Message threads (beta) shrink
   the upload but do not change billing. Say this precisely and don't overstate it.

## Accuracy rules (this is an educational tool, so correctness is the product)
- **Measured vs estimated is always labelled.** Numbers from a live `response.usage` or from
  `count_tokens` are measured. Anything computed (what-if caching, a different model's price, the
  ~4-chars-per-token heuristic) is labelled as an estimate in the UI.
- **Never use tiktoken or another non-Claude tokenizer.** Per-segment token counts come from
  `POST /v1/messages/count_tokens` (free, but rate-limited, so call it sparingly).
- **Pricing lives in one dated data file** with a source URL (Anthropic's pricing page) and an
  "as of" date shown in the UI. No prices hard-coded in logic. Cache reads, 5-minute and 1-hour cache
  writes, and output are priced separately.
- Don't guess Claude API or SDK shapes from memory. Check the current docs or SDK types.

## How it runs (decided)
- **Live, bring-your-own-key only.** The visitor pastes their own Anthropic API key, and the page calls
  the API directly from the browser. There is no server and there are no recordings.
- The Northwind tools (`get_customer`, `lookup_order`, `list_orders`, `process_refund`,
  `escalate_to_human`) and their fake backend run in the browser, ported from Build 01 and extended. All
  data is fictional.
- The visitor picks the model for each session (Sonnet 5.5, Opus 5.5, Haiku 5.5) to compare token use and
  cost. Changing models starts a new session. Switching partway through would invalidate caching and
  thinking blocks and confuse the comparison.

## Stack (decided)
- **Vite + TypeScript**, with no UI framework (plain DOM). Use `strict` TypeScript.
- **API calls use plain `fetch`** to `POST /v1/messages` (and, when per-segment counts land,
  `POST /v1/messages/count_tokens`), with the
  `anthropic-dangerous-direct-browser-access: true` header that browsers need. The inspector shows the exact
  body the code sends. Request and response shapes come from the SDK's types, not hand-written interfaces.
  Because there is no SDK client, the code handles retries (429, 5xx, `retry-after`) and error types itself.
- **Tests: Vitest** with `fetch` mocked. Tests never call the real API or spend money. The agent loop, tool
  handlers, token and cost math, and key-masking all need tests.
- **Deploy:** `.github/workflows/pages.yml` runs the CI gates, builds `dist/`, and publishes it with the
  official Pages actions on every push to `main`. Pages' source is set to "GitHub Actions" in the repo
  settings. Vite's `base` is `/discovery-context/`. AgentGate flags workflow edits as a scope warning, which
  is expected. Keep workflow changes in their own PR.

## Key-handling rules (this page holds a live credential, so these are non-negotiable)
- **The key stays in JavaScript memory only.** Never write it to localStorage, sessionStorage, cookies,
  the URL, logs, or the request/response inspector. Mask the key header in anything displayed or exported.
- **No third-party scripts, fonts, analytics, or CDNs.** Use a strict Content-Security-Policy that limits
  `connect-src` to `https://api.anthropic.com` and `script-src` to `'self'`. GitHub Pages can't set
  response headers, so the CSP goes in a `<meta>` tag (which can't express `frame-ancestors`).
- **Zero runtime dependencies.** `@anthropic-ai/sdk` is used for **types only** (`import type ...`), which
  erase at build time. Never add a value import from it or any other package without Brett's sign-off.
  Check the built bundle when dependencies change.
- **Model output and tool results are untrusted.** Render them as text (`textContent`, escaped JSON),
  never through `innerHTML` or any step that turns model text into an HTML string. Injected markup on this
  page could read the key. The one formatter is `src/ui/markdown.ts`, which parses a Markdown subset
  straight into elements built with `el()`, with every piece of text as a text node. It never makes
  clickable links from model text. Keep it that way, and keep its safety tests.
- Tell visitors plainly that the key goes straight from their browser to Anthropic. Recommend a dedicated
  key in a workspace with a low spend limit, and show running cost prominently.
- Exports (session JSON for sharing or replay) never contain the key or headers.
- Changes to key handling or the CSP get their own PR and a security review. Brett decides.

## Conventions (match the sibling `ccaf-study` repo)
- Writing style: plain language, short sentences, second person, no hype. Be candid about limits.
  It is never described as "vibe coding". Include the standard disclaimer: unofficial, not affiliated with
  or endorsed by Anthropic.
- The site is static and must work from GitHub Pages with no server.
- Styling and theming follow the `ccaf-study/practice-exam` palette and fonts: CSS variables,
  `:focus-visible` outlines, colour never the only signal, and respect for `prefers-reduced-motion`.
- **Themes**: Auto (follows the OS), Light, Dark, Sepia, and High contrast, as `data-theme` on `<html>`. Every
  theme defines the same CSS variables, its text clears WCAG AA (4.5:1), and its chart ramp passes the
  dataviz validator on its surface. Check both when adding or changing a theme. Auto-dark and Dark are
  duplicate blocks that must stay identical (tested).
- **localStorage holds only the theme name**, under `discovery-context-v1-theme`. Never store the API key or
  conversation data. Version any new key (`discovery-context-v1-*`) and change it when its format changes.

## Layout
- `index.html`: page entry (Vite).
- `src/main.ts`: app entry. `src/styles.css`: palette, theme, base styles.
- `src/api/types.ts`: the **only** place the SDK is referenced. Type-only re-exports of the request and
  response shapes. Import API types from here, not from the SDK directly.
- `src/api/client.ts`: `createMessage()` over `fetch`. It sets the headers and the `anthropic-version`
  (`2026-10-21`), and its retry rules mirror `@anthropic-ai/sdk` 1.14. Check both against the SDK when
  bumping it.
- `src/agent/session.ts`: the hand-written agent loop. `Session.send()` runs one user turn and keeps a
  `CallRecord` per API call: a deep-copied request snapshot, the response, attempts, tool runs, and
  `resentMessageCount`. A turn that can't finish (refusal, `max_tokens`, error, call limit) is rolled back
  out of `messages` so the conversation stays valid. Its call records are kept.
- `src/northwind/`: the fictional backend and tools, ported from ccaf-study Build 01 and extended.
  `data.ts` is the single source of the sample data: customers and orders, with dates stored as days ago.
  The first three customers and orders are the Build 01 originals; keep them unchanged. `createBackend()`
  copies the data, so each session and test is isolated. The tools are `get_customer`, `lookup_order`,
  `list_orders` (added here, not in Build 01), `process_refund`, and `escalate_to_human`.
- `src/security/csp.ts`: the CSP directives. `vite.config.ts` injects them as the first `<meta>` in the
  **built** page only (the dev server needs inline scripts). Use `npm run preview` to test under the CSP.
- `src/security/key-store.ts`: `KeyStore` holds the key in a `#private` field. Nothing else should keep a
  copy, except `Session`, which also uses a `#private` field.
- `src/ui/dom.ts`: `el()`, the only way the app builds DOM. Children are text, and `on*` attributes throw.
- `src/ui/app.ts`: the page (key entry, model picker, chat, timeline).
- `src/pricing/pricing.json`: list prices, with `asOf` and `source`. **Re-check against the source before
  changing it, and bump `asOf`.** `src/pricing/cost.ts`: `costOf()` (input, 5m/1h cache writes, cache reads,
  output; Haiku 5.5's >100K tier counts cache tokens toward the threshold) and `formatUsd()`.
- `src/agent/growth.ts`: `analyzeGrowth()`. A call's "sent before" is the prompt of the latest earlier call
  whose request it starts with, and "new" is the difference. That split is derived from measured totals,
  and the UI says so.
- `src/ui/growth-panel.ts` and `src/ui/svg.ts`: headline tiles, the stacked SVG bar chart (a native `<title>`
  tooltip per bar), and the per-call table, which is the chart's accessible view. Chart colours are a
  one-hue blue ramp checked with the dataviz palette validator in both modes (`--viz-*` in `styles.css`).
- `src/agent/history.ts` and `src/ui/history-panel.ts`: per-conversation summaries (numbers only, never
  message text or the key) kept in page memory for the comparison table. They're never persisted.
- `src/northwind/scenarios.ts` and `src/ui/sample-sheet.ts`: scenarios to try and the on-page sample-data
  reference, read from `data.ts`. `test/scenarios.test.ts` fails if a scenario names a customer or order
  that doesn't exist, or if its claim about the data stops being true. Update both together.
- `src/ui/theme.ts` and `public/theme-init.js`: the theme picker, and a classic script loaded in `<head>`
  that applies the saved theme before first paint. It's a file, not inline, because the CSP blocks inline
  scripts. Both list the same themes (tested).
- `src/agent/export.ts`: session export (`context-discovery-session`, version 1): config, turns, and every
  `CallRecord`. It never includes headers or the key, and anything key-shaped (`sk-ant-…`, or the current key)
  is redacted when serialised. Bump `EXPORT_VERSION` if the shape changes; replay reads this format.
- `src/ui/markdown.ts`: renders the agent's replies (tables, lists, bold, code) without HTML strings. Only
  the agent's chat bubbles use it. The inspector always shows the raw reply.
- `src/ui/handoff.ts`: the escalation card shown in the transcript when `escalate_to_human` runs.
- `src/ui/timeline.ts`: the timeline and inspector. Calls are grouped under the user message that caused
  them. Each call shows its headers (key replaced by a placeholder), settings, `system`, `tools`, and every
  message labelled `resent` or `new`, plus the raw body, response, usage, tool runs, and retries.
- `test/`: Vitest tests (jsdom). `test/support/mock-api.ts` is a scripted fake of the Messages API. Use
  it, never the real API. `test/no-runtime-deps.test.ts` fails if anything in `src/` imports
  runtime code from an npm package. `test/no-html-sinks.test.ts` fails on `innerHTML`, `eval`, and other
  string-to-HTML or string-to-code APIs. `test/build.test.ts` builds the real page and checks the CSP.
  Don't weaken or skip any of these.
- `.github/workflows/`: `ci.yml` (typecheck, tests, build, no SDK in `dist/`, on every PR), `pages.yml`
  (the same gates, then deploy on push to `main`), and `agentgate.yml` (the guardrail; don't edit without
  Brett). Third-party actions are pinned to commit SHAs.
- `tsconfig.json` covers browser code (`src/`, DOM types, no Node). `tsconfig.node.json` covers tests and
  `vite.config.ts` (Node types).

## Commands
- `npm run dev`: local dev server (no CSP). `npm run build`: typecheck, then build to `dist/`.
  `npm run preview`: serve the build with its CSP.
- `npm test`: run the tests once. `npm run typecheck`: both tsconfigs.
- Dependencies are pinned exactly (`--save-exact`). All of them are devDependencies.
