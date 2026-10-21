// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { beforeAll, describe, expect, it } from "vitest";
import {
  render_section_html,
  render_section_markdown,
  type HomeSection,
  type SectionRenderSettings,
} from "../../src/shared/components/sections";
import { get_default_settings } from "../../src/components/admin/types/settings";
import {
  elapsed_ms,
  expect_no_script_vectors,
  hrefs_of,
  parse_fragment,
} from "./helpers/html-assert";

// Config on chain and the canvas editing state bypass the schema, so the renderer gets raw objects.
function raw_section(value: Record<string, unknown>): HomeSection {
  return value as unknown as HomeSection;
}

const BREAKOUT = `"><img src=x onerror=alert(1)>'\`<script>alert(1)</script>`;
const ATTR_BREAKOUT = `x" onmouseover="alert(1)" data-x="`;
const IMAGE = "https://images.hive.blog/DQm/a.jpg";
const UNSAFE_URLS = [
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  " javascript:alert(1)",
  "java\tscript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
  "vbscript:msgbox(1)",
  "http://insecure.example",
  "//evil.example",
  "https://user:pass@evil.example",
];

function settings(
  overrides: Partial<SectionRenderSettings> = {},
): SectionRenderSettings {
  const defaults = get_default_settings(true);
  return {
    ...defaults,
    footer: {
      ...defaults.footer,
      privacy: { label: BREAKOUT, kind: "page", target: "privacy" },
    },
    ...overrides,
  };
}

function all_sections(
  text: string,
  url: string,
  image_url: string,
): HomeSection[] {
  const image = { url: image_url, alt: text };
  return [
    raw_section({
      id: "hero0001",
      type: "hero",
      content: {
        headline: text,
        subheadline: text,
        cta: [
          { label: text, url },
          { label: text, url },
        ],
        image,
      },
      style: { variant: "split", bg: "image", bg_image: image },
    }),
    raw_section({
      id: "hero0002",
      type: "hero",
      content: { headline: text, image },
      style: { variant: "overlay" },
    }),
    raw_section({
      id: "about001",
      type: "text-media",
      content: {
        title: text,
        body_md: `${text}\n\n[${text}](${url})`,
        image,
        cta: { label: text, url },
      },
      style: { bg: "image", bg_image: image },
    }),
    raw_section({
      id: "newsl001",
      type: "cta-band",
      content: {
        title: text,
        body: text,
        button: { label: text, url },
        consent_text: text,
        consent_mode: "checkbox",
      },
      style: {},
    }),
  ];
}

function render_all(sections: HomeSection[], s = settings()): string {
  return sections.map((section) => render_section_html(section, s)).join("");
}

describe("sections: XSS in every text field", () => {
  for (const payload of [BREAKOUT, ATTR_BREAKOUT]) {
    it(`escapes ${payload.slice(0, 12)}...`, () => {
      const html = render_all(
        all_sections(payload, "https://example.com", IMAGE),
      );
      expect_no_script_vectors(html);
      const root = parse_fragment(html);
      expect(
        root.querySelectorAll("script, iframe, form, object, embed"),
      ).toHaveLength(0);
      expect(root.textContent).toContain(payload.slice(0, 10));
      for (const el of Array.from(root.querySelectorAll("*"))) {
        expect(el.hasAttribute("onmouseover")).toBe(false);
        expect(el.hasAttribute("onerror")).toBe(false);
      }
    });
  }

  it("privacy link label comes from i18n, never from config", () => {
    const html = render_all(all_sections("x", "https://example.com", IMAGE));
    expect(html).not.toContain("onerror=alert");
  });

  it("an invalid section id or enum value never reaches attributes", () => {
    const html = render_section_html(
      raw_section({
        id: ATTR_BREAKOUT,
        type: "hero",
        content: { headline: "Hi" },
        style: {
          bg: ATTR_BREAKOUT,
          spacing: ATTR_BREAKOUT,
          width: ATTR_BREAKOUT,
          variant: ATTR_BREAKOUT,
          align: ATTR_BREAKOUT,
          height: ATTR_BREAKOUT,
          overlay: ATTR_BREAKOUT,
        },
      }),
      settings(),
    );
    expect_no_script_vectors(html);
    const section = parse_fragment(html).querySelector("section")!;
    expect(section.hasAttribute("id")).toBe(false);
    expect(section.hasAttribute("aria-labelledby")).toBe(false);
    expect(section.className).toBe(
      "home-section section-hero section-space-md section-bg-none section-tone-default section-hero-text-centric section-align-center section-height-auto",
    );
  });

  it("unknown section type and non-object input render ''", () => {
    expect(
      render_section_html(raw_section({ id: "abcdefgh", type: "<script>" })),
    ).toBe("");
    expect(render_section_html(null as unknown as HomeSection)).toBe("");
  });
});

describe("sections: unsafe URLs in links and images", () => {
  it.each(UNSAFE_URLS)("drops link %s", (url) => {
    const html = render_all(all_sections("Label", url, IMAGE));
    expect_no_script_vectors(html);
    const allowed = hrefs_of(html).filter((href) => href !== "/p/privacy");
    expect(allowed).toEqual([]);
  });

  it.each([
    ...UNSAFE_URLS,
    "https://evil.example/a.jpg",
    "https://images.hive.blog:8443/a.jpg",
  ])("drops image %s", (image_url) => {
    const html = render_all(
      all_sections("Label", "https://example.com", image_url),
    );
    expect_no_script_vectors(html);
    expect(parse_fragment(html).querySelectorAll("img")).toHaveLength(0);
  });

  it("cta-band button accepts https only (no mailto:/tel:)", () => {
    const html = render_section_html(
      raw_section({
        id: "newsl001",
        type: "cta-band",
        content: {
          title: "T",
          button: { label: "Go", url: "mailto:a@b.example" },
        },
        style: {},
      }),
      settings(),
    );
    expect(hrefs_of(html)).toEqual([]);
  });

  it("privacy link with an unsafe url target is dropped", () => {
    const html = render_section_html(
      raw_section({
        id: "newsl001",
        type: "cta-band",
        content: {
          title: "T",
          button: { label: "Go", url: "https://ok.example" },
        },
        style: {},
      }),
      settings({
        footer: {
          ...get_default_settings(true).footer,
          privacy: { label: "P", kind: "url", target: "javascript:alert(1)" },
        },
      }),
    );
    expect(hrefs_of(html)).toEqual(["https://ok.example/"]);
  });

  it("image src goes through the proxy and stays inside the attribute", () => {
    const html = render_all(
      all_sections("x", "https://example.com", `${IMAGE}?a="b'c(d)`),
    );
    for (const img of Array.from(
      parse_fragment(html).querySelectorAll("img"),
    )) {
      expect(img.getAttribute("src")).toMatch(
        /^https:\/\/images\.hive\.blog\/\d+x0\/https:\/\/images\.hive\.blog\//,
      );
      expect(img.getAttribute("src")).not.toMatch(/["'()]/);
    }
  });
});

describe("sections: markdown body", () => {
  const HTML_PAYLOADS = [
    "<script>alert(1)</script>",
    '<img src=x onerror="alert(1)">',
    '<iframe src="https://evil.example"></iframe>',
    '<a href="javascript:alert(1)">x</a>',
    "<form action=https://evil.example><input></form>",
    "<svg onload=alert(1)>",
    "<style>body{display:none}</style>",
  ];

  it.each(HTML_PAYLOADS)("raw HTML is escaped: %s", (payload) => {
    const html = render_section_markdown(`before ${payload} after`);
    expect_no_script_vectors(html);
    const root = parse_fragment(html);
    expect(
      root.querySelectorAll("script, img, iframe, form, input, svg, style, a"),
    ).toHaveLength(0);
    expect(root.textContent).toContain(payload);
  });

  it("headings, images, code, quotes, tables and autolinks are not rendered as markup", () => {
    const md = [
      "# Heading",
      "## Sub",
      "![alt](https://images.hive.blog/a.jpg)",
      "> quote",
      "```\ncode\n```",
      "`inline`",
      "| a | b |\n|---|---|\n| 1 | 2 |",
      "<https://example.com>",
      "https://example.com",
      "---",
      "[ref]\n\n[ref]: https://example.com",
    ].join("\n\n");
    const root = parse_fragment(render_section_markdown(md));
    expect(
      root.querySelectorAll(
        "h1, h2, h3, img, blockquote, pre, code, table, hr",
      ),
    ).toHaveLength(0);
    // `![alt](url)` degrades to "!" + a plain https link; autolinks and reference links stay text
    expect(hrefs_of(root.innerHTML)).toEqual([
      "https://images.hive.blog/a.jpg",
    ]);
    expect(Array.from(root.children).every((el) => el.tagName === "P")).toBe(
      true,
    );
  });

  it.each(UNSAFE_URLS)("markdown link %s renders as text", (url) => {
    const html = render_section_markdown(`[click](${url})`);
    expect_no_script_vectors(html);
    expect(hrefs_of(html)).toEqual([]);
  });

  it("only the allowlisted tags survive", () => {
    const html = render_section_markdown(
      "**b** *i* [l](https://example.com)\n\n- a\n- b\n\n1. c",
    );
    const tags = new Set(
      Array.from(parse_fragment(html).querySelectorAll("*"), (el) =>
        el.tagName.toLowerCase(),
      ),
    );
    for (const tag of tags) {
      expect([
        "p",
        "strong",
        "em",
        "a",
        "span",
        "ul",
        "ol",
        "li",
        "br",
      ]).toContain(tag);
    }
  });

  it("entities do not decode into markup", () => {
    const html = render_section_markdown(
      "&lt;script&gt;alert(1)&lt;/script&gt; &#60;img onerror=x&#62;",
    );
    expect_no_script_vectors(html);
    expect(parse_fragment(html).querySelectorAll("script, img")).toHaveLength(
      0,
    );
  });
});

// Same bound as redos.test.ts: linear passes take ms, quadratic paths take seconds.
const LIMIT_MS = 1_500;
const RUNS = 3;

function best_ms(fn: () => unknown): number {
  let best = Infinity;
  for (let i = 0; i < RUNS; i++) best = Math.min(best, elapsed_ms(fn));
  return best;
}

const REDOS_PAYLOADS: Array<[string, string]> = [
  ["60k asterisks", "*".repeat(60_000)],
  ["30k underscores pairs", "_a".repeat(30_000)],
  ["20k open brackets", "[".repeat(20_000)],
  ["10k unclosed links", "[a](".repeat(10_000)],
  ["10k nested emphasis", "**a *b ".repeat(10_000)],
  [
    "deep nested list",
    Array.from({ length: 2_000 }, (_, i) => `${" ".repeat(i * 2)}- x`).join(
      "\n",
    ),
  ],
  ["60k blank lines", "\n".repeat(60_000)],
  ["4000 open tags", "<a ".repeat(4_000)],
  ["entity spam", "&#".repeat(30_000)],
];

describe("sections: ReDoS (best of 3 < 1500 ms)", () => {
  beforeAll(() => {
    render_section_markdown("warm **up**");
  });

  it.each(REDOS_PAYLOADS)("render_section_markdown: %s", (_name, payload) => {
    expect(best_ms(() => render_section_markdown(payload))).toBeLessThan(
      LIMIT_MS,
    );
  });

  it.each(REDOS_PAYLOADS)(
    "render_section_html (text-media body): %s",
    (_name, payload) => {
      const section = raw_section({
        id: "about001",
        type: "text-media",
        content: { title: payload, body_md: payload },
        style: {},
      });
      expect(
        best_ms(() => render_section_html(section, settings())),
      ).toBeLessThan(LIMIT_MS);
    },
  );
});
