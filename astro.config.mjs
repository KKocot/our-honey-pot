// @ts-check
import { defineConfig, envField } from "astro/config";
import node from "@astrojs/node";
import vercel from "@astrojs/vercel";

import tailwindcss from "@tailwindcss/vite";

import solidJs from "@astrojs/solid-js";

const is_vercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

const adapter = is_vercel
  ? vercel({
      webAnalytics: { enabled: false },
    })
  : node({
      mode: "standalone",
    });

// Per-blog settings are read at runtime: one image serves N blogs (ADR 6ac4a46763221e857a3b96ff).
// access "public" would be inlined at build time, so every field is a server secret; the client gets them via Layout.astro.
const runtime_string = (/** @type {{ url?: boolean }} */ options = {}) =>
  envField.string({
    context: "server",
    access: "secret",
    optional: true,
    ...options,
  });

// https://astro.build/config
export default defineConfig({
  output: "server",

  adapter,

  env: {
    schema: {
      HIVE_USERNAME: runtime_string(),
      PUBLIC_SITE_URL: runtime_string({ url: true }),
      PUBLIC_HIVE_API_ENDPOINT: runtime_string({ url: true }),
      PUBLIC_HIVE_CHAIN_ID: runtime_string(),
      PUBLIC_HIVE_IMAGES_ENDPOINT: runtime_string({ url: true }),
      PUBLIC_BEEYARD_URL: runtime_string({ url: true }),
      PUBLIC_HIVE_BLOG_URL: runtime_string({ url: true }),
      PUBLIC_HIVE_SIGNER_URL: runtime_string({ url: true }),
    },
  },

  server: {
    host: "0.0.0.0",
    port: 4327,
  },

  vite: {
    plugins: [tailwindcss()],
    build: {
      // Inlined hoisted scripts would not get the CSP nonce (src/middleware.ts trusts only /_astro/*.js bundles)
      assetsInlineLimit: (file_path) =>
        file_path.endsWith(".js") ? false : undefined,
    },
    optimizeDeps: {
      include: ["@hiveio/beekeeper"],
    },
  },

  integrations: [solidJs()],
});
