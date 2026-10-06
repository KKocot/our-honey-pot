// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { beforeAll, describe, expect, it } from "vitest";
import { renderPostBody } from "../../src/lib/renderer";
import { render_comment_body } from "../../src/lib/comment_renderer";
import { SecurityChecker } from "../../src/lib/renderer/security/SecurityChecker";
import { elapsed_ms } from "./helpers/html-assert";

const LIMIT_MS = 200;

// Payloads from the S12/S13 audit repro (quadratic/cubic before the fix: 5-8 s).
const PAYLOADS: Array<[string, string]> = [
  ["single tag + 60k spaces (S13)", "<a" + " ".repeat(60_000)],
  ["4000 open tags (S13)", "<a ".repeat(4_000)],
  ["2000 details/pre (S12)", "<details></pre>".repeat(2_000)],
  ["4000 p/details (S12)", "<p><details>".repeat(4_000)],
  ["4000 p/center (S12)", "<p><center>".repeat(4_000)],
];

describe("ReDoS regression (< 200 ms)", () => {
  beforeAll(() => {
    renderPostBody("warm up **renderer**");
    render_comment_body("warm up **renderer**");
  });

  it.each(PAYLOADS)("SecurityChecker: %s", (_name, payload) => {
    const ms = elapsed_ms(() => {
      try {
        SecurityChecker.checkSecurity(payload, { allowScriptTag: false });
      } catch {
        // rejecting is fine, only the time matters
      }
    });
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it.each(PAYLOADS)("renderPostBody: %s", (_name, payload) => {
    expect(elapsed_ms(() => renderPostBody(payload))).toBeLessThan(LIMIT_MS);
  });

  it.each(PAYLOADS)("render_comment_body: %s", (_name, payload) => {
    expect(elapsed_ms(() => render_comment_body(payload))).toBeLessThan(
      LIMIT_MS,
    );
  });

  it("render_comment_body hides deeply nested markup", () => {
    expect(render_comment_body("<details>".repeat(500))).toContain(
      "content hidden",
    );
  });

  it("render_comment_body keeps moderately nested markup", () => {
    const html = render_comment_body(
      "<div>".repeat(20) + "kept" + "</div>".repeat(20),
    );
    expect(html).toContain("kept");
    expect(html).not.toContain("content hidden");
  });

  it("SecurityChecker still detects handlers after the linear rewrite", () => {
    expect(() =>
      SecurityChecker.checkSecurity('<img src=x onerror="alert(1)">', {
        allowScriptTag: false,
      }),
    ).toThrow();
    expect(() =>
      SecurityChecker.checkSecurity("<svg/onload=alert(1)>", {
        allowScriptTag: false,
      }),
    ).toThrow();
    expect(() =>
      SecurityChecker.checkSecurity("<p>online = fine</p>", {
        allowScriptTag: false,
      }),
    ).not.toThrow();
  });
});
