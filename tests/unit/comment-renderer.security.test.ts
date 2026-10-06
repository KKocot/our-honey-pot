// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import { render_comment_body } from "../../src/lib/comment_renderer";
import {
  expect_no_script_vectors,
  navigation_origin,
  parse_fragment,
} from "./helpers/html-assert";

const BLOG_ORIGIN = "https://blog.example";

function render(body: string): string {
  const html = render_comment_body(body);
  expect_no_script_vectors(html);
  return html;
}

describe("render_comment_body — XSS payloads", () => {
  it.each([
    ["img onerror", '<img src="x" onerror="alert(1)">'],
    ["img onerror unquoted", "<img src=x onerror=alert(1)>"],
    ["svg onload", '<svg onload="alert(1)"><circle r="1"/></svg>'],
    ["svg nested script", "<svg><script>alert(1)</script></svg>"],
    ["javascript: href (html)", '<a href="javascript:alert(1)">x</a>'],
    [
      "javascript: href (entity-encoded)",
      '<a href="jav&#x61;script:alert(1)">x</a>',
    ],
    ["javascript: href (markdown)", "[x](javascript:alert(1))"],
    [
      "data: href",
      '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    ],
    ["data: img src", '<img src="data:image/svg+xml,<svg onload=alert(1)>">'],
    ["script tag", "<script>alert(1)</script>"],
    ["style tag", "<style>body{background:url(javascript:alert(1))}</style>"],
    [
      "bare image link with quote breakout",
      'https://evil.com/a.png"onerror="alert(1)',
    ],
  ])("%s", (_name, payload) => {
    render(payload);
  });

  it.each([
    ["foreign domain", '<iframe src="https://evil.com/x"></iframe>'],
    [
      "look-alike www-youtube.com",
      '<iframe src="https://www-youtube.com/embed/abc"></iframe>',
    ],
    [
      "youtube with user sandbox/allow",
      '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" sandbox="allow-scripts allow-same-origin allow-top-navigation" allow="camera"></iframe>',
    ],
  ])("iframe (%s) is stripped from comments", (_name, payload) => {
    expect(
      parse_fragment(render(payload)).querySelectorAll("iframe").length,
    ).toBe(0);
  });

  it("literal `~~~ embed:` marker does not produce an embed", () => {
    const html = render("hello\n\n~~~ embed:dQw4w9WgXcQ youtube ~~~\n\nend");
    expect(parse_fragment(html).querySelectorAll("iframe").length).toBe(0);
  });

  it.each([
    [">! &lt;img src=x onerror=alert(1)&gt;"],
    [">! [spoiler] &lt;img src=x onerror=alert(1)&gt;"],
    [">! <img src=x onerror=alert(1)>"],
  ])("spoiler payload %s", (payload) => {
    render(payload);
  });
});

describe("render_comment_body — open redirect", () => {
  it.each([
    ["protocol-relative (markdown)", "[x](//evil.com)"],
    ["protocol-relative (html)", '<a href="//evil.com">x</a>'],
    ["backslash path (html)", '<a href="/\\evil.com">x</a>'],
    ["backslash path (markdown)", "[x](/\\evil.com)"],
    [
      "hive frontend with double slash",
      '<a href="https://peakd.com//evil.com">x</a>',
    ],
  ])("%s", (_name, payload) => {
    for (const a of Array.from(
      parse_fragment(render(payload)).querySelectorAll("a[href]"),
    )) {
      const href = a.getAttribute("href") ?? "";
      if (navigation_origin(href) === BLOG_ORIGIN) continue;
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel") ?? "").toMatch(/noopener/);
      expect(a.classList.contains("link-external")).toBe(true);
    }
  });

  it("look-alike origin sharing the HIVE_BLOG_URL prefix is external (S15)", () => {
    const root = parse_fragment(
      render('<a href="https://beeyard.bard-dev.com.evil.com/x">x</a>'),
    );
    const a = root.querySelector("a");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.classList.contains("link-external")).toBe(true);
  });
});

describe("render_comment_body — image proxy", () => {
  it("proxies hosts that only share the images endpoint prefix", () => {
    const html = render('<img src="https://images.hive.blog.evil.tld/x.png">');
    const src = parse_fragment(html).querySelector("img")?.getAttribute("src");
    expect(src).toMatch(/^https:\/\/images\.hive\.blog\/\d+x\d+\//);
  });

  it("keeps images already on the images endpoint", () => {
    const html = render('<img src="https://images.hive.blog/u/alice/avatar">');
    expect(parse_fragment(html).querySelector("img")?.getAttribute("src")).toBe(
      "https://images.hive.blog/u/alice/avatar",
    );
  });
});
