# Contributing

- **No direct commits to `main`.** Branch → pull request → green checks → review → merge.
- **Every pull request runs:**
  - **CI**: typecheck, tests, build, and a check that no SDK code ends up in the bundle.
  - **AgentGate**: blocks secrets and dangerous patterns. Edits to CI workflows show as a scope warning,
    which is expected.
- **Tests ship with the change.** Run `npm test` before opening a pull request. Tests use a scripted fake of
  the Claude API (`test/support/mock-api.ts`) and never call the real one.
- **Keep the security guards.** `test/no-runtime-deps.test.ts`, `test/no-html-sinks.test.ts`, and
  `test/build.test.ts` protect a page that holds a live API key. Don't weaken or skip them. Changes to key
  handling or the Content-Security-Policy go in their own pull request.
- **Never commit secrets.** `.env` files are gitignored. API keys don't belong anywhere in this repo,
  including tests and fixtures.
- **Prices** live in `src/pricing/pricing.json`. Check them against Anthropic's pricing page and update
  `asOf` in the same change.
- Merges to `main` deploy to GitHub Pages.
