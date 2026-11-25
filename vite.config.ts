import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages serves this project at https://<user>.github.io/discovery-context/
  base: "/discovery-context/",
  build: {
    target: "es2022",
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
});
