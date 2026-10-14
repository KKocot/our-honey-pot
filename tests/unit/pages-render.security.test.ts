// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import { render_page_markdown } from "../../src/shared/components/sections";
import { PAGES_LIMITS } from "../../src/components/admin/types/settings";
import {
  elapsed_ms,
  expect_no_script_vectors,
  hrefs_of,
  parse_fragment,
} from "./helpers/html-assert";

const BREAKOUT = `"><img src=x onerror=alert(1)>'\`<script>alert(1)</script>`;
const ATTR_BREAKOUT = `x" onmouseover="alert(1)" data-x="`;
const IMAGE = "https://images.hive.blog/DQm/a.jpg";
const MAX_CHARS = PAGES_LIMITS.body_bytes * 4;
const UNSAFE_URLS = [
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "java\tscript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
  "vbscript:msgbox(1)",
  "http://insecure.example",
  "//evil.example",
  "https://user:pass@evil.example",
];

function expect_inert(html: string): HTMLElement {
  expect_no_script_vectors(html);
  const root = parse_fragment(html);
  expect(
    root.querySelectorAll("script, iframe, form, object, embed, style, svg"),
  ).toHaveLength(0);
  for (const el of Array.from(root.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name.startsWith("on")).toBe(false);
    }
    if (el.tagName !== "IMG") expect(el.hasAttribute("style")).toBe(false);
  }
  return root;
}

describe("pages markdown: XSS in every element", () => {
  for (const payload of [BREAKOUT, ATTR_BREAKOUT]) {
    const label = payload.slice(0, 12);

    it(`escapes headings ${label}...`, () => {
      const root = expect_inert(
        render_page_markdown(
          `# ${payload}\n\n## ${payload}\n\n##### ${payload}`,
        ),
      );
      expect(root.querySelectorAll("h2, h4")).toHaveLength(3);
      expect(root.textContent).toContain(payload.slice(0, 10));
    });

    it(`escapes tables ${label}...`, () => {
      const cell = payload.replaceAll("|", "\\|");
      const root = expect_inert(
        render_page_markdown(`| ${cell} |\n|---|\n| ${cell} |`),
      );
      expect(root.querySelectorAll("th, td")).toHaveLength(2);
    });

    it(`escapes image alt and drops title ${label}...`, () => {
      const alt = payload.replaceAll("]", "\\]");
      const title = payload.replaceAll('"', '\\"');
      const root = expect_inert(
        render_page_markdown(`![${alt}](${IMAGE} "${title}")`),
      );
      const img = root.querySelector("img")!;
      expect(img.hasAttribute("title")).toBe(false);
      expect(img.getAttributeNames().sort()).toEqual(
        [
          "alt",
          "class",
          "decoding",
          "height",
          "loading",
          "src",
          "srcset",
          "style",
          "width",
        ].sort(),
      );
    });

    it(`escapes link labels, quotes and lists ${label}...`, () => {
      const text = payload.replaceAll("]", "\\]");
      expect_inert(
        render_page_markdown(
          `> ${payload}\n\n- [${text}](https://example.com "${ATTR_BREAKOUT}")\n1. ${payload}`,
        ),
      );
    });
  }
});

describe("pages markdown: unsafe URLs", () => {
  it.each(UNSAFE_URLS)("drops link %s", (url) => {
    const html = render_page_markdown(`[Label](<${url}>) and [b](${url})`);
    expect_inert(html);
    expect(hrefs_of(html)).toEqual([]);
  });

  it.each([
    ...UNSAFE_URLS,
    "https://evil.example/a.jpg",
    "https://images.hive.blog:8443/a.jpg",
    "https://images.hive.blog.evil.example/a.jpg",
  ])("drops image %s and keeps only its alt text", (url) => {
    const html = render_page_markdown(`![Alt text](<${url}>)`);
    const root = expect_inert(html);
    expect(root.querySelector("img, a")).toBeNull();
    // markdown-it's own validateLink leaves script schemes as literal text; others reach safe_image_url
    expect(root.textContent).toMatch(/^(?:Alt text|!\[Alt text\]\(<.*>\))$/s);
  });

  it("image src cannot break out of the attribute", () => {
    const html = render_page_markdown(
      `![x](<https://images.hive.blog/a.jpg?q="onerror=alert(1)>)`,
    );
    const root = expect_inert(html);
    const src = root.querySelector("img")!.getAttribute("src")!;
    expect(src).not.toContain('"');
  });
});

describe("pages markdown: no raw HTML or embeds", () => {
  it.each([
    "<script>alert(1)</script>",
    '<img src=x onerror="alert(1)">',
    '<iframe src="https://evil.example"></iframe>',
    "<svg onload=alert(1)>",
    '<a href="javascript:alert(1)">x</a>',
    "<style>body{display:none}</style>",
    "<!-- comment --><b>bold</b>",
  ])("renders %s as text", (source) => {
    const root = expect_inert(render_page_markdown(source));
    expect(root.querySelector("a, img, b")).toBeNull();
  });

  it("reference-style links and bare URLs are not links", () => {
    const html = render_page_markdown(
      "[x][ref]\n\n[ref]: javascript:alert(1)\n\nhttps://example.com",
    );
    expect_inert(html);
    expect(hrefs_of(html)).toEqual([]);
  });
});

describe("pages markdown: resource limits", () => {
  it("deep blockquote nesting is capped", () => {
    const html = render_page_markdown(`${"> ".repeat(500)}deep`);
    const root = expect_inert(html);
    expect(root.querySelectorAll("blockquote").length).toBeLessThanOrEqual(12);
  });

  it("deep list nesting is capped", () => {
    const source = Array.from(
      { length: 200 },
      (_, i) => `${"  ".repeat(i)}- level ${i}`,
    ).join("\n");
    const root = expect_inert(render_page_markdown(source));
    expect(root.querySelectorAll("ul").length).toBeLessThanOrEqual(12);
  });

  it("input beyond the char limit is cut", () => {
    const html = render_page_markdown(`${"a".repeat(MAX_CHARS)}TAIL`);
    expect(html).not.toContain("TAIL");
  });

  const HOSTILE: Record<string, string> = {
    emphasis: "*a_".repeat(MAX_CHARS / 3),
    brackets: "[".repeat(MAX_CHARS),
    images: "![".repeat(MAX_CHARS / 2),
    links: "[a](".repeat(MAX_CHARS / 4),
    table_pipes: `| a |\n|---|\n${"|".repeat(MAX_CHARS - 20)}`,
    table_rows: `${"| a | b |\n".repeat(2)}|---|---|\n${"|x|y|\n".repeat((MAX_CHARS - 40) / 6)}`,
    table_columns: `${"|a".repeat(MAX_CHARS / 8)}\n${"|-".repeat(MAX_CHARS / 8)}\n`,
    headings: "#".repeat(MAX_CHARS),
    quotes: ">".repeat(MAX_CHARS),
    entities: "&#x".repeat(MAX_CHARS / 3),
    escapes: "\\".repeat(MAX_CHARS),
    setext: "a\n=\n".repeat(MAX_CHARS / 4),
  };

  it.each(Object.keys(HOSTILE))(
    "hostile %s input renders under 1500 ms",
    (key) => {
      const source = HOSTILE[key];
      expect(source.length).toBeLessThanOrEqual(MAX_CHARS + 20);
      let html = "";
      const ms = elapsed_ms(() => {
        html = render_page_markdown(source);
      });
      expect(ms).toBeLessThan(1500);
      expect_no_script_vectors(html);
    },
  );

  it("oversized input is clipped before parsing", () => {
    const ms = elapsed_ms(() =>
      render_page_markdown("*a_".repeat(MAX_CHARS * 4)),
    );
    expect(ms).toBeLessThan(1500);
  });
});
