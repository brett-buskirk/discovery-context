// The Content-Security-Policy for the built page. This page holds a live API key, so the policy is the
// backstop if anything ever slips past the "render untrusted text as text" rule.
//
// GitHub Pages can't set response headers, so this ships as a <meta> tag (see vite.config.ts). A meta
// CSP can't express frame-ancestors, report-uri, or sandbox; those would need real headers.
export const CSP_DIRECTIVES: Record<string, string> = {
  "default-src": "'none'",
  "script-src": "'self'",
  "style-src": "'self'",
  "img-src": "'self' data:",
  "font-src": "'self'",
  // The only place the page may send data: the Claude API.
  "connect-src": "https://api.anthropic.com",
  "base-uri": "'none'",
  "form-action": "'none'",
  // Chromium enforces this; other browsers ignore it. It makes string-to-HTML sinks (innerHTML and
  // friends) throw, which turns the source-level ban in test/no-html-sinks.test.ts into a runtime one.
  "require-trusted-types-for": "'script'",
};

export const CSP = Object.entries(CSP_DIRECTIVES)
  .map(([name, value]) => `${name} ${value}`)
  .join("; ");
