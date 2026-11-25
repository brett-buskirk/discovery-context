# Context Discovery

See what an AI agent actually sends and receives, one API call at a time.

Context Discovery is part of the **AI Discovery** series: small, public tools that show what is going on
underneath AI interactions. This one runs a small support agent against the Claude API in your browser
and shows every request and response as it happens:

- **Every API call, not just every message you send.** When the agent uses a tool, one message from you
  can turn into several API calls.
- **The exact request and response bodies**: the system prompt, the tool definitions, the full message
  history, and the blocks that come back.
- **How the context grows.** The model has no memory between requests, so every call resends the whole
  conversation. You'll see how much of each request is old history and how much is new.
- **Tokens and cost**, per call and running total, taken from the API's own `usage` numbers. Anything
  estimated is labelled as an estimate.

> **Status:** planning. Nothing is built yet. See [ROADMAP.md](ROADMAP.md).

## How it works

You paste your own Anthropic API key. The page calls the Claude API straight from your browser. There is
no server in between, and the key is never stored. It lives in page memory and disappears when you close
the tab. Use a dedicated key in a workspace with a low spend limit. A full session costs a few cents.

The demo agent is a customer support agent for Northwind Outfitters, a fictional outdoor gear store. It
can look up customers and orders, issue refunds, and escalate to a human. All of its data is made up and
runs in your browser.

## Background

This grew out of a hand-written agent loop in
[ccaf-study](https://github.com/brett-buskirk/ccaf-study) (Build 01). Logging that loop made one thing
obvious: the full conversation goes out again on every request, and the bill grows with it.

## Running it locally

You need Node 22.12 or newer.

```sh
npm install
npm run dev      # local dev server
npm test         # tests (they never call the real API)
npm run build    # typecheck and build to dist/
```

## Disclaimer

This is an unofficial educational project. It is not affiliated with or endorsed by Anthropic.

## License

[MIT](LICENSE)
