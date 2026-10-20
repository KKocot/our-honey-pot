import { fileURLToPath } from "node:url";
import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

// vite-plugin-solid forces browser conditions, which breaks .ts suites that import
// .tsx modules under node (delegateEvents needs window) — so it runs only for .tsx.
export default defineConfig({
  resolve: {
    alias: {
      "astro:env/server": fileURLToPath(
        new URL("./tests/unit/helpers/astro-env-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        plugins: [solid()],
        test: {
          name: "dom",
          include: ["tests/unit/**/*.test.tsx"],
          environment: "jsdom",
        },
      },
    ],
  },
});
