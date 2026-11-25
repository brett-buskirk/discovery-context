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
- CI workflow: typecheck, tests, build, and a check that no SDK code ships in the bundle.
