# CLAUDE.md — discovery-context

Project-level guide. The machine-wide policy (`/etc/claude-code/CLAUDE.md`) still applies in full:
branch → PR → Brett merges, never commit to `main`, tests ship with the change, signed commits with a
`Co-Authored-By:` trailer, no secrets anywhere.

## What this is
A public, static site (GitHub Pages) in Brett's **AI Discovery** series. It shows what actually happens
during an agent interaction with the Claude API:
- **Every API call**, not just every user turn. A tool loop makes several requests per user message, and
  each one resends the entire conversation.
- **The exact request and response bodies**: `system`, `tools`, the full `messages[]`, and the
  `content` blocks that come back, including `tool_use`, `tool_result`, and empty `thinking` blocks.
- **Context growth**: how much of each request is resent history and how much is new.
- **Token usage and cost**, per call and cumulative, using the API's own `usage` numbers.

Public name: **Context Discovery**. The project grew out of
`~/ccaf-study/build-01-support-resolution-agent` (`raw-agent.ts`, the hand-written loop). The demo
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
- The Northwind tools (`get_customer`, `lookup_order`, `process_refund`, `escalate_to_human`) and their
  fake backend run in the browser, ported from build-01. All data is fictional.
- The visitor picks the model for each session (Sonnet 5.5, Opus 5.5, Haiku 5.5) to compare token use and
  cost. Changing models starts a new session. Switching partway through would invalidate caching and
  thinking blocks and confuse the comparison.

## Stack (decided)
- **Vite + TypeScript**, with no UI framework (plain DOM). Use `strict` TypeScript.
- **API calls use plain `fetch`** to `POST /v1/messages` and `POST /v1/messages/count_tokens`, with the
  `anthropic-dangerous-direct-browser-access: true` header that browsers need. The inspector shows the exact
  body the code sends. Request and response shapes come from the SDK's types, not hand-written interfaces.
  Because there is no SDK client, the code handles retries (429, 5xx, `retry-after`) and error types itself.
- **Tests: Vitest** with `fetch` mocked. Tests never call the real API or spend money. The agent loop, tool
  handlers, token and cost math, and key-masking all need tests.
- **Deploy:** a GitHub Actions workflow builds `dist/` and publishes it with the official Pages actions.
  Set Vite's `base` to the repo path. AgentGate flags CI workflow edits as a scope warning, which is
  expected. Keep workflow changes in their own PR.

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
  never through `innerHTML` or a markdown-to-HTML step. Injected markup on this page could read the key.
- Tell visitors plainly that the key goes straight from their browser to Anthropic. Recommend a dedicated
  key in a workspace with a low spend limit, and show running cost prominently.
- Exports (session JSON for sharing or replay) never contain the key or headers.
- Changes to key handling or the CSP get their own PR and a security review. Brett decides.

## Conventions (match the sibling `ccaf-study` repo)
- Writing style: plain language, short sentences, second person, no hype. Be candid about limits.
  It is never described as "vibe coding". Include the standard disclaimer: unofficial, not affiliated with
  or endorsed by Anthropic.
- The site is static and must work from GitHub Pages with no server.
- Styling and theming follow the `ccaf-study/practice-exam` palette and fonts: CSS variables, Auto/Dark/Light
  theme applied before first paint, `:focus-visible` outlines, colour never the only signal, and respect for
  `prefers-reduced-motion`.
- localStorage keys are versioned (`discovery-context-v1-*`). Change the key if the stored format changes.

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
- `src/northwind/`: the fictional backend and tools, ported from ccaf-study Build 01. `createBackend()` is a
  factory, so each session and test is isolated.
- `test/`: Vitest tests (jsdom). `test/support/mock-api.ts` is a scripted fake of the Messages API. Use
  it, never the real API. `test/no-runtime-deps.test.ts` fails if anything in `src/` imports
  runtime code from an npm package. Don't weaken or skip it.
- `tsconfig.json` covers browser code (`src/`, DOM types, no Node). `tsconfig.node.json` covers tests and
  `vite.config.ts` (Node types).

## Commands
- `npm run dev`: local dev server. `npm run build`: typecheck, then build to `dist/`.
- `npm test`: run the tests once. `npm run typecheck`: both tsconfigs.
- Dependencies are pinned exactly (`--save-exact`). All of them are devDependencies.
