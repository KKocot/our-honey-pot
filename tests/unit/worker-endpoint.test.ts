// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { GET, HEAD, prerender } from "../../src/pages/auth/worker.js";

const require = createRequire(import.meta.url);
const package_worker = readFileSync(
  require.resolve("@hiveio/hb-auth/worker.js"),
  "utf8",
);

const context = {} as APIContext;

describe("/auth/worker.js endpoint", () => {
  it("is rendered on demand so the worker CSP header is sent", () => {
    expect(prerender).toBe(false);
  });

  it("serves the hb-auth worker as JavaScript with the worker CSP", async () => {
    const response = await GET(context);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/javascript",
    );
    expect(await response.text()).toBe(package_worker);

    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).not.toMatch(/'nonce-/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("HEAD returns the same headers without a body", async () => {
    const response = await HEAD(context);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "'unsafe-eval'",
    );
    expect(await response.text()).toBe("");
  });
});
