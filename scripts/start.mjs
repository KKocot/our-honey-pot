// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Astro imports the middleware lazily on the first request; loading it first runs the
// HIVE_USERNAME check (src/lib/runtime-config.ts) before the server listens, so a bad env exits at startup.
await import("../dist/server/virtual_astro_middleware.mjs");
await import("../dist/server/entry.mjs");
