import { defineConfig, type Plugin } from "vitest/config";
import { CSP } from "./src/security/csp.ts";

// Adds the CSP <meta> tag to the built page only. The dev server injects inline scripts for hot reload,
// which a strict policy would block. `npm run preview` serves the build, CSP included, for testing.
function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: () => [
        { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
      ],
    },
  };
}

export default defineConfig({
  // GitHub Pages serves this project at https://<user>.github.io/discovery-context/
  base: "/discovery-context/",
  plugins: [contentSecurityPolicy()],
  build: {
    target: "es2022",
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
});
