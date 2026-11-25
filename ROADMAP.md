# Roadmap

_What's planned for Context Discovery. Each item is one focused pull request. Check items off as they ship._

## v0.1: first public version
- [x] **Project plan**: `CLAUDE.md`, README, roadmap.
- [x] **Scaffold**: Vite + TypeScript (strict), Vitest, `@anthropic-ai/sdk` as a types-only dependency.
- [x] **Agent core**: browser port of the Northwind tools and fake backend, plus the agent loop over
      `fetch` (`stop_reason`-driven, with retries and error handling). Tested with a mocked `fetch`.
- [ ] **Key entry and CSP**: in-memory key handling, key masking, a strict Content-Security-Policy,
      untrusted output rendered as text. Gets its own security review.
- [ ] **Timeline and inspector**: every API call grouped under the user message that triggered it, with the
      raw request and response. History that was already sent is dimmed so the new part stands out.
- [ ] **Growth chart and cost panel**: input per call split into system and tools, resent history, and new
      content; output tokens; cumulative billed tokens and cost from a dated `pricing.json`.
- [ ] **Model picker**: Sonnet 5.5, Opus 5.5, Haiku 5.5. Changing the model starts a new session.
- [x] **CI**: GitHub Actions job running typecheck, tests, and build on every PR.
- [ ] **Pages deployment**: GitHub Actions build and publish.

## Later
- [ ] What-if comparisons, clearly labelled as estimates: prompt caching on or off, trimmed tool results,
      other models' prices.
- [ ] Prompt caching mode with real `cache_read` / `cache_creation` numbers.
- [ ] Per-segment token counts from `count_tokens`, compared with the ~4-characters-per-token rule of thumb.
- [ ] Session export (JSON, never including the key or headers).
- [ ] A short "what you'll see" walkthrough for visitors without a key.
- [ ] A note on message threads (beta): smaller uploads, same bill.
