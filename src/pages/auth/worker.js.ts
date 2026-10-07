// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { APIRoute } from "astro";
// The package exports "./worker.js" only under the "require" condition, which Vite's ESM resolver skips
import worker_source from "../../../node_modules/@hiveio/hb-auth/dist/worker.js?raw";

// Static files bypass src/middleware.ts, and a worker enforces the CSP of its own script response (ADR 6abbaacd63221e857a3b1812)
export const prerender = false;

const WORKER_CSP = [
  "default-src 'none'",
  // Emscripten embind glue in the hb-auth/beekeeper WASM build generates invokers with `new Function`
  "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'",
  "connect-src 'self' https:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

const WORKER_HEADERS = {
  "Content-Type": "application/javascript; charset=utf-8",
  "Content-Security-Policy": WORKER_CSP,
  "X-Content-Type-Options": "nosniff",
  // The worker references a content-hashed WASM file; a stale cached worker would point at a removed hash after an hb-auth upgrade
  "Cache-Control": "no-cache",
};

export const GET: APIRoute = () =>
  new Response(worker_source, { status: 200, headers: WORKER_HEADERS });

export const HEAD: APIRoute = () =>
  new Response(null, { status: 200, headers: WORKER_HEADERS });
