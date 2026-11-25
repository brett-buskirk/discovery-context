# Roadmap

_What's planned for Context Discovery. Each item is one focused pull request. Check items off as they ship._

## v0.1: first public version
- [x] **Project plan**: `CLAUDE.md`, README, roadmap.
- [x] **Scaffold**: Vite + TypeScript (strict), Vitest, `@anthropic-ai/sdk` as a types-only dependency.
- [x] **CI**: GitHub Actions job running typecheck, tests, and build on every PR.
- [x] **Agent core**: browser port of the Northwind tools and fake backend, plus the agent loop over
      `fetch` (`stop_reason`-driven, with retries and error handling). Tested with a mocked `fetch`.
- [x] **Key entry, CSP, and model picker**: in-memory key handling, key masking, a strict
      Content-Security-Policy, untrusted output rendered as text, and a picker for Sonnet 5.5, Opus 5.5, and
      Haiku 5.5 (changing the model starts a new conversation).
- [x] **Timeline and inspector**: every API call grouped under the user message that triggered it, with the
      raw request and response. History that was already sent is dimmed so the new part stands out.
- [x] **Growth chart and cost panel**: each call's input split into what an earlier call already sent and
      what's new; headline totals; per-call and running cost from a dated `pricing.json`.
- [x] **Handoff card**: escalations shown in the conversation with exactly what the human reviewer receives.
- [x] **Comparison history**: finished conversations kept (in memory only) in a table, so models can be
      compared after switching.
- [x] **Bigger sample data and `list_orders`**: 10 customers, 25 orders, and a tool to list a customer's orders.
- [x] **Sample-data sheet**: an on-page reference of who and what exists, with scenarios to try.
- [x] **Pages deployment**: GitHub Actions build and publish on merge to `main`.

## Later
- [x] Theme picker: Auto, Light, Dark, Sepia, and High contrast.
- [x] Chat card and a "this is a simulation" note.
- [ ] Per-segment token counts from `count_tokens`: how much of each request is the system prompt and tool
      definitions, compared with the ~4-characters-per-token rule of thumb.
- [x] Prompt caching mode with real `cache_read` / `cache_creation` numbers.
- [x] Stop button for a running message.
- [ ] What-if comparisons, clearly labelled as estimates: prompt caching on or off, trimmed tool results,
      other models' prices.
- [x] Session export (JSON, never including the key or headers).
- [x] Replay mode: recorded conversations for visitors without a key, played through the same views.
- [ ] A note on message threads (beta): smaller uploads, same bill.
