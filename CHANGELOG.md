# Changelog

All notable changes to discovery-context are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial scaffold.
- Project plan: `CLAUDE.md` with scope, stack, accuracy and key-handling rules; README; roadmap.
- Vite + TypeScript scaffold with Vitest. `@anthropic-ai/sdk` is used for types only, and a test fails
  if `src/` imports runtime code from any npm package.
- Agent core: Northwind tools and fake backend ported to the browser, a `fetch`-based Messages API
  client with SDK-equivalent retries, and an instrumented agent loop that records every API call.
- Key entry and Content-Security-Policy: in-memory key handling, a strict CSP (with Trusted Types)
  in the built page, text-only rendering, and a first working chat page with a per-call log.
- Timeline and inspector: every API call grouped under its user message, with the exact request
  (resent history labelled and dimmed) and response, tool runs, retries, and rolled-back turns.
- Context growth and cost panel: headline numbers (input billed, conversation size, resend multiplier,
  output, cost), a per-call stacked chart of resent vs new input, and a per-call table. Prices from a
  dated `pricing.json`.
- Handoff card: an `escalate_to_human` call appears in the conversation as a card showing every field
  the human reviewer receives and the ticket number.
- Comparison history: each conversation's numbers are kept in memory, in a table that survives model
  switches, "New conversation", and forgetting the key, so models can be compared.
- Sample data grows to 10 customers and 25 orders (Build 01's originals unchanged), with a cancelled
  status and a new `list_orders` tool.
- CI workflow: typecheck, tests, build, and a check that no SDK code ships in the bundle.
