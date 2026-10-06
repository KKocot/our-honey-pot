// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import { renderPostBody } from "../../src/lib/renderer";
import {
  expect_no_script_vectors,
  navigation_origin,
  parse_fragment,
} from "./helpers/html-assert";

const BLOG_ORIGIN = "https://blog.example";
const IFRAME_SANDBOX_ALLOWED = new Set([
  "allow-scripts",
  "allow-same-origin",
  "allow-popups",
  "allow-presentation",
]);

function render(body: string): string {
  const html = renderPostBody(body);
  expect_no_script_vectors(html);
  return html;
}

function expect_offsite_links_marked_external(html: string): void {
  for (const a of Array.from(
    parse_fragment(html).querySelectorAll("a[href]"),
  )) {
    const href = a.getAttribute("href") ?? "";
    if (navigation_origin(href) === BLOG_ORIGIN) continue;
    expect(a.getAttribute("rel") ?? "", `off-site ${href} without rel`).toMatch(
      /noopener/,
    );
    expect(a.getAttribute("rel") ?? "").toMatch(/nofollow/);
    expect(a.getAttribute("target")).toBe("_blank");
  }
}

describe("renderPostBody — XSS payloads", () => {
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
    [
      "details onToggle",
      "<details open ontoggle=alert(1)><summary>x</summary></details>",
    ],
  ])("%s", (_name, payload) => {
    render(payload);
  });

  it("iframe from a foreign domain is not embedded", () => {
    const root = parse_fragment(
      render('<iframe src="https://evil.com/x"></iframe>'),
    );
    expect(root.querySelectorAll("iframe").length).toBe(0);
  });

  it("iframe from look-alike www-youtube.com is not embedded", () => {
    const root = parse_fragment(
      render(
        '<iframe src="https://www-youtube.com/embed/dQw4w9WgXcQ"></iframe>',
      ),
    );
    expect(root.querySelectorAll("iframe").length).toBe(0);
  });

  it("youtube iframe ignores user-provided sandbox/allow", () => {
    const root = parse_fragment(
      render(
        '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" sandbox="allow-scripts allow-same-origin allow-top-navigation allow-modals" allow="camera; microphone; geolocation"></iframe>',
      ),
    );
    const iframes = Array.from(root.querySelectorAll("iframe"));
    expect(iframes.length).toBe(1);
    const iframe = iframes[0];
    expect(new URL(iframe.getAttribute("src") ?? "").hostname).toBe(
      "www.youtube.com",
    );
    const tokens = (iframe.getAttribute("sandbox") ?? "")
      .split(/\s+/)
      .filter(Boolean);
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens)
      expect(IFRAME_SANDBOX_ALLOWED.has(token), token).toBe(true);
    expect(iframe.getAttribute("allow") ?? "").not.toMatch(
      /camera|microphone|geolocation/,
    );
  });

  it("literal `~~~ embed:` marker in post text does not produce an embed", () => {
    for (const body of [
      "hello\n\n~~~ embed:dQw4w9WgXcQ youtube ~~~\n\nend",
      "inline ~~~ embed:dQw4w9WgXcQ youtube ~~~ text",
      "~~~ embed:https://evil.com/x vimeo ~~~",
    ]) {
      expect(
        parse_fragment(render(body)).querySelectorAll("iframe").length,
      ).toBe(0);
    }
  });

  it.each([
    ["escaped img in spoiler", ">! &lt;img src=x onerror=alert(1)&gt;"],
    [
      "escaped img in titled spoiler",
      ">! [spoiler] &lt;img src=x onerror=alert(1)&gt;",
    ],
    ["raw img in spoiler", ">! <img src=x onerror=alert(1)>"],
    [
      "escaped img in spoiler title",
      ">! [&lt;img src=x onerror=alert(1)&gt;] text",
    ],
  ])("spoiler: %s", (_name, payload) => {
    const html = render(payload);
    const imgs = Array.from(parse_fragment(html).querySelectorAll("img"));
    for (const img of imgs) expect(img.hasAttribute("onerror")).toBe(false);
  });
});

describe("renderPostBody — open redirect", () => {
  it.each([
    ["protocol-relative (markdown)", "[x](//evil.com)"],
    ["protocol-relative (html)", '<a href="//evil.com">x</a>'],
    ["backslash path (html)", '<a href="/\\evil.com">x</a>'],
    ["backslash path (markdown)", "[x](/\\evil.com)"],
    [
      "hive frontend with double slash",
      '<a href="https://peakd.com//evil.com">x</a>',
    ],
    [
      "hive frontend with double slash (markdown)",
      "[x](https://peakd.com//evil.com/@alice/post)",
    ],
    [
      "hive frontend with backslash",
      '<a href="https://hive.blog/\\evil.com">x</a>',
    ],
  ])("%s never becomes an internal-looking off-site link", (_name, payload) => {
    expect_offsite_links_marked_external(render(payload));
  });

  it("known hive frontend post link is rewritten to an internal path", () => {
    const root = parse_fragment(
      render('<a href="https://peakd.com/@alice/my-post">x</a>'),
    );
    const href = root.querySelector("a")?.getAttribute("href");
    expect(href).toBe("/@alice/my-post");
    expect(navigation_origin(href ?? "")).toBe(BLOG_ORIGIN);
  });
});
