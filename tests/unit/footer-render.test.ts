// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  createFooterData,
  footer_link_href,
  renderFooter,
  type FooterContent,
  type FooterOwnerData,
} from "../../src/shared/components/footer";
import type { Link } from "../../src/components/admin/types/navigation";
import { t } from "../../src/lib/i18n";
import {
  expect_no_script_vectors,
  parse_fragment,
} from "./helpers/html-assert";

function content(overrides: Partial<FooterContent> = {}): FooterContent {
  return {
    variant: "inline",
    columns: [],
    legal_links: [],
    show_social: false,
    ...overrides,
  };
}

function render(
  footer: Partial<FooterContent>,
  extra: Partial<FooterOwnerData> = {},
): HTMLElement {
  const html = renderFooter(undefined, undefined, {
    footer: content(footer),
    site_name: "Honey Blog",
    year: 2026,
    ...extra,
  });
  return parse_fragment(html);
}

function hrefs(root: HTMLElement, selector = "a"): string[] {
  return Array.from(root.querySelectorAll(selector)).map(
    (a) => a.getAttribute("href") ?? "",
  );
}

const url = (label: string, target: string): Link => ({
  label,
  kind: "url",
  target,
});

describe("renderFooter without owner data", () => {
  it("renders only the attribution row", () => {
    const root = parse_fragment(renderFooter());
    expect(root.textContent).toContain("Built by");
    expect(root.textContent).toContain("Powered by Hive Blockchain");
    expect(
      root.querySelector('[aria-label="Support on Ko-fi"]'),
    ).not.toBeNull();
    expect(root.querySelector("nav")).toBeNull();
  });
});

describe("renderFooter owner content", () => {
  it("keeps the attribution row under the owner content", () => {
    const root = render({ copyright: "Mine" });
    const text = root.textContent ?? "";
    expect(text.indexOf("Mine")).toBeLessThan(text.indexOf("Powered by"));
    expect(
      root.querySelector('[aria-label="Support on Ko-fi"]'),
    ).not.toBeNull();
  });

  it("legacy footer_text still replaces the Built by credit", () => {
    const html = renderFooter(
      createFooterData({ custom_text: "Hand made" }),
      undefined,
      { footer: content(), year: 2026 },
    );
    const text = parse_fragment(html).textContent ?? "";
    expect(text).toContain("Hand made");
    expect(text).not.toContain("Built by");
    expect(text).toContain("Powered by");
  });

  it("defaults the copyright to year + site name", () => {
    expect(render({}).textContent).toContain("© 2026 Honey Blog");
    expect(render({}, { site_name: "" }).textContent).toContain("© 2026");
  });

  it("renders custom copyright and company", () => {
    const text = render({
      copyright: "(c) Jan",
      company: "ACME, NIP 123",
    }).textContent;
    expect(text).toContain("(c) Jan");
    expect(text).toContain("ACME, NIP 123");
    expect(text).not.toContain("© 2026");
  });

  it("mast renders titled columns with max 3 columns and 4 links", () => {
    const links = Array.from({ length: 6 }, (_, i) =>
      url(`L${i}`, `https://example.org/${i}`),
    );
    const columns = Array.from({ length: 5 }, (_, i) => ({
      title: `Col ${i}`,
      links,
    }));
    const root = render({ variant: "mast", columns });
    const nav = root.querySelector('nav[aria-label="Footer"]');
    expect(nav?.querySelectorAll("h2")).toHaveLength(3);
    expect(nav?.querySelectorAll("a")).toHaveLength(12);
    expect(nav?.className).toContain("page-sm:grid-cols-3");
    expect(root.textContent).toContain("Honey Blog");
  });

  it("inline renders column links in one row without titles", () => {
    const root = render({
      variant: "inline",
      columns: [
        { title: "About", links: [url("One", "https://a.example")] },
        { title: "More", links: [url("Two", "https://b.example")] },
      ],
    });
    const nav = root.querySelector('nav[aria-label="Footer"]');
    expect(nav?.querySelectorAll("h2")).toHaveLength(0);
    expect(nav?.querySelectorAll("ul")).toHaveLength(1);
    expect(nav?.querySelectorAll("a")).toHaveLength(2);
  });

  it("puts privacy and legal links in the bottom row, never as a column", () => {
    const root = render({
      variant: "mast",
      privacy: { label: "Privacy", kind: "page", target: "privacy" },
      legal_links: [
        { label: "Terms", kind: "page", target: "terms" },
        { label: "Cookies", kind: "page", target: "cookies" },
        { label: "Extra", kind: "page", target: "extra" },
        { label: "Fourth", kind: "page", target: "fourth" },
      ],
    });
    const legal = root.querySelector('ul[aria-label="Legal"]');
    expect(hrefs(legal as HTMLElement)).toEqual([
      "/p/privacy",
      "/p/terms",
      "/p/cookies",
      "/p/extra",
    ]);
    expect(root.querySelector('nav[aria-label="Footer"]')).toBeNull();
  });

  it("renders social icons only when show_social is on", () => {
    const social_links = [
      { id: "1", platform: "x" as const, username: "honey" },
    ];
    expect(
      render({ show_social: false }, { social_links }).querySelector(
        'ul[aria-label="Social media"]',
      ),
    ).toBeNull();
    const list = render({ show_social: true }, { social_links }).querySelector(
      'ul[aria-label="Social media"]',
    );
    const link = list?.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://x.com/honey");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link?.getAttribute("aria-label")).toBeTruthy();
  });

  it("drops non-https social links", () => {
    const social_links = [
      {
        id: "1",
        platform: "custom" as const,
        username: "http://insecure.example",
      },
      {
        id: "2",
        platform: "x" as const,
        url: "http://x.com/honey",
        username: "",
      },
    ];
    const root = render({ show_social: true }, { social_links });
    expect(root.querySelector('ul[aria-label="Social media"]')).toBeNull();
  });

  it("uses only page-* container breakpoints", () => {
    const html = renderFooter(undefined, undefined, {
      footer: content({
        variant: "mast",
        columns: [{ title: "A", links: [url("A", "https://a.example")] }],
      }),
      site_name: "S",
      year: 2026,
    });
    expect(html).not.toMatch(/(?:^|\s|")(?:sm|md|lg|xl):/);
  });
});

describe("footer links", () => {
  it("maps link kinds to hrefs", () => {
    expect(footer_link_href(url("A", "https://example.org/x"))).toBe(
      "https://example.org/x",
    );
    expect(
      footer_link_href({ label: "T", kind: "tag", target: "photo" }),
    ).toMatch(/^https:\/\/[^/]+\/trending\/photo$/);
    expect(
      footer_link_href({ label: "T", kind: "tag", target: "photo" }, [
        {
          id: "pics",
          label: "Pics",
          enabled: true,
          showCount: false,
          tag: "photo",
        },
      ]),
    ).toBe("/?tab=pics");
    expect(
      footer_link_href({ label: "P", kind: "page", target: "about-me" }),
    ).toBe("/p/about-me");
    expect(footer_link_href(url("M", "mailto:jan@example.org"))).toBe(
      "mailto:jan@example.org",
    );
  });

  it("opens external https links in a new tab, internal ones in place", () => {
    const root = render({
      columns: [
        {
          title: "",
          links: [
            url("Ext", "https://example.org"),
            { label: "Page", kind: "page", target: "about" },
            url("Mail", "mailto:jan@example.org"),
          ],
        },
      ],
    });
    const [ext, page, mail] = Array.from(
      root.querySelectorAll('nav[aria-label="Footer"] a'),
    );
    expect(ext.getAttribute("target")).toBe("_blank");
    expect(ext.getAttribute("rel")).toBe("noopener noreferrer");
    expect(page.hasAttribute("target")).toBe(false);
    expect(mail.hasAttribute("target")).toBe(false);
  });

  it.each([
    ["javascript:alert(1)", "url"],
    ["JaVaScRiPt:alert(1)", "url"],
    ["data:text/html,<script>alert(1)</script>", "url"],
    ["http://insecure.example", "url"],
    ["//evil.example", "url"],
    ["javascript:alert(1)", "tag"],
    ["../admin", "page"],
    ["a", "page"],
  ] as const)("drops unsafe target %s (%s)", (target, kind) => {
    const root = render({
      columns: [{ title: "", links: [{ label: "Bad", kind, target }] }],
      privacy: { label: "Bad", kind, target },
      legal_links: [{ label: "Bad", kind, target }],
    });
    expect(root.textContent).not.toContain("Bad");
    expect_no_script_vectors(root.innerHTML);
  });

  it("escapes script markup in labels, titles, copyright and company", () => {
    const payload = '<script>alert(1)</script>"><img src=x onerror=alert(1)>';
    const html = renderFooter(undefined, undefined, {
      footer: content({
        variant: "mast",
        columns: [
          {
            title: payload,
            links: [{ label: payload, kind: "page", target: "about" }],
          },
        ],
        copyright: payload,
        company: payload,
      }),
      site_name: payload,
      year: 2026,
    });
    expect_no_script_vectors(html);
    const root = parse_fragment(html);
    expect(root.querySelectorAll("script, img[src=x]")).toHaveLength(0);
    expect(root.textContent).toContain("<script>alert(1)</script>");
  });

  it("escapes quotes inside validated hrefs", () => {
    const root = render({
      columns: [
        {
          title: "",
          links: [url("Q", 'https://example.org/?q="><script>')],
        },
      ],
    });
    expect(root.querySelectorAll("script")).toHaveLength(0);
    expect_no_script_vectors(root.innerHTML);
  });
});

describe("renderFooter locale", () => {
  it("keeps the English attribution by default", () => {
    expect(renderFooter(undefined, undefined, undefined, "en")).toBe(
      renderFooter(),
    );
  });

  it("translates only the attribution labels", () => {
    const en = parse_fragment(renderFooter());
    const pl = parse_fragment(
      renderFooter(undefined, undefined, undefined, "pl"),
    );
    const text = pl.textContent ?? "";
    expect(text).toContain(t("pl", "footer.built_by"));
    expect(text).toContain(
      t("pl", "footer.powered_by", { platform: "Hive Blockchain" }),
    );
    expect(text).toContain("BardDev");
    expect(
      pl.querySelector(`[aria-label="${t("pl", "footer.kofi_aria")}"]`),
    ).not.toBeNull();
    expect(pl.querySelector("img")?.getAttribute("alt")).toBe(
      t("pl", "footer.kofi_alt"),
    );
    expect(en.querySelector("img")?.getAttribute("alt")).toBe(
      "Buy Me a Coffee at ko-fi.com",
    );
    expect(pl.querySelector("img")?.getAttribute("src")).toBe(
      en.querySelector("img")?.getAttribute("src"),
    );
    expect(hrefs(pl)).toEqual(hrefs(en));
  });

  it("localizes the default copyright line", () => {
    const html = renderFooter(
      undefined,
      undefined,
      { footer: content({ variant: "mast" }), year: 2026 },
      "pl",
    );
    expect(parse_fragment(html).textContent).toContain("© 2026");
  });
});
