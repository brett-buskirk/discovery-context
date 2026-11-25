# Context Discovery

See what an AI agent actually sends and receives, one API call at a time.

**Try it: https://brett-buskirk.github.io/discovery-context/**

Context Discovery is part of the **AI Discovery** series: small, public tools that show what is going on
underneath AI interactions. This one runs a small support agent against the Claude API in your browser
and shows every request and response as it happens.

## What you'll see

- **Every API call, not just every message you send.** When the agent uses a tool, one message from you
  turns into several API calls. The timeline groups them under the message that caused them.
- **The exact request and response bodies.** Open any call to see the headers (your key is never shown),
  the system prompt, the tool definitions, every message in the history, and the blocks that come back,
  including the empty thinking blocks that are still billed.
- **How the context grows.** The model has no memory between requests, so every call resends the whole
  conversation. Each message in a request is marked `resent` or `new`, and a chart shows how much of each
  call's input was sent before.
- **Tokens and cost.** Per call and running totals, from the API's own `usage` numbers, priced at list
  prices with the date and source shown. The "Paid for the context" figure shows how many times over you've
  paid for the conversation by resending it.
- **What a human reviewer receives.** When the agent escalates, a card shows the exact handoff fields.
- **Model comparisons.** Switch between Claude Sonnet 5.5, Opus 5.5, and Haiku 5.5. Each conversation's
  numbers stay in a comparison table until you reload the page.

## How it works

You paste your own Anthropic API key. The page calls the Claude API straight from your browser, with no
server in between. The key is never stored: it stays in page memory and is gone when you close or reload
the tab. The page loads no third-party code, and its Content-Security-Policy only allows connections to
`api.anthropic.com`.

Use a dedicated key in a workspace with a low spend limit. A short conversation costs a few cents on
Sonnet or Opus, and a fraction of a cent on Haiku.

The demo agent is a customer support agent for Northwind Outfitters, a fictional outdoor gear store. It can
look up customers, look up and list orders, issue refunds, and escalate to a human. All of its data is made
up and runs in your browser. The page's **Sample data and scenarios to try** panel lists every customer and
order, with ready-made messages that exercise each path: refunds over the limit, shared names, cancelled
orders, and more.

## Background

This grew out of a hand-written agent loop in
[ccaf-study](https://github.com/brett-buskirk/ccaf-study) (Build 01). Logging that loop made one thing
obvious: the full conversation goes out again on every request, and the bill grows with it.

## Running it locally

You need Node 22.12 or newer.

```sh
npm install
npm run dev      # local dev server (no CSP, so the dev server can hot-reload)
npm test         # tests (they never call the real API)
npm run build    # typecheck and build to dist/
npm run preview  # serve the build, with its Content-Security-Policy
```

Merges to `main` deploy to GitHub Pages automatically. See [ROADMAP.md](ROADMAP.md) for what's next and
[CONTRIBUTING.md](CONTRIBUTING.md) for how changes land.

## Disclaimer

This is an unofficial educational project. It is not affiliated with or endorsed by Anthropic. Prices are
list prices as of the date shown on the page; your actual bill can differ.

## License

[MIT](LICENSE)
