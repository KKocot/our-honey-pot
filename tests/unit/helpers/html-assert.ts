// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { expect } from "vitest";

const UNSAFE_URL = /^\s*(?:javascript|data|vbscript):/i;
const URL_ATTRS = ["href", "src", "action", "formaction", "xlink:href"];

export function parse_fragment(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(
    `<!doctype html><body>${html}</body>`,
    "text/html",
  );
  return doc.body;
}

/** Fails when the HTML contains script-capable markup; `allowed_handlers` whitelists static inline handlers emitted by our own templates. */
export function expect_no_script_vectors(
  html: string,
  allowed_handlers: Record<string, string> = {},
): void {
  const root = parse_fragment(html);
  expect(
    root.querySelectorAll("script, object, embed, base, meta").length,
  ).toBe(0);

  for (const el of Array.from(root.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        expect(
          allowed_handlers[name],
          `unexpected ${name}="${attr.value}" on <${el.tagName}>`,
        ).toBe(attr.value);
      }
      if (URL_ATTRS.includes(name)) {
        expect(attr.value, `unsafe ${name} on <${el.tagName}>`).not.toMatch(
          UNSAFE_URL,
        );
      }
      if (name === "style") {
        expect(attr.value).not.toMatch(/expression\s*\(|url\(\s*["']?\s*javascript:/i);
      }
    }
  }
}

export function hrefs_of(html: string): string[] {
  return Array.from(parse_fragment(html).querySelectorAll("a"))
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => href !== null);
}

/** Origin a browser would navigate to from a page on https://blog.example. */
export function navigation_origin(href: string): string {
  return new URL(href, "https://blog.example/some/page").origin;
}

export function elapsed_ms(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}
