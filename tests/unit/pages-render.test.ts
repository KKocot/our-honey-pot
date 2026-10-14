// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  render_page_markdown,
  render_section_markdown,
} from "../../src/shared/components/sections";
import { parse_fragment } from "./helpers/html-assert";

const IMAGE = "https://images.hive.blog/DQm/a.jpg";

function root_of(source: string, locale?: "en" | "pl"): HTMLElement {
  const html = render_page_markdown(source, locale);
  const root = parse_fragment(html);
  const wrapper = root.firstElementChild as HTMLElement;
  expect(root.children).toHaveLength(1);
  expect(wrapper.className).toBe("page-prose");
  return wrapper;
}

function tags(root: Element): string[] {
  return Array.from(root.children).map((el) => el.tagName.toLowerCase());
}

describe("pages markdown: elements", () => {
  it("empty or whitespace input renders ''", () => {
    expect(render_page_markdown("")).toBe("");
    expect(render_page_markdown("  \n\t ")).toBe("");
    expect(render_page_markdown(null as unknown as string)).toBe("");
  });

  it("paragraphs, bold, italic and line breaks", () => {
    const root = root_of("Hello **bold** and *it*\nnext\n\nSecond");
    expect(tags(root)).toEqual(["p", "p"]);
    expect(root.querySelector("strong")!.textContent).toBe("bold");
    expect(root.querySelector("em")!.textContent).toBe("it");
    expect(root.querySelectorAll("br")).toHaveLength(1);
  });

  it("H2-H4 keep their level", () => {
    const root = root_of("## Two\n\n### Three\n\n#### Four");
    expect(tags(root)).toEqual(["h2", "h3", "h4"]);
    expect(root.querySelector("h3")!.textContent).toBe("Three");
  });

  it("H1 degrades to H2 (the page title is the only H1)", () => {
    const root = root_of("# Top\n\nText");
    expect(tags(root)).toEqual(["h2", "p"]);
    expect(root.querySelector("h1")).toBeNull();
  });

  it("H5 and H6 degrade to H4", () => {
    const root = root_of("##### Five\n\n###### Six");
    expect(tags(root)).toEqual(["h4", "h4"]);
    expect(root.querySelector("h5, h6")).toBeNull();
  });

  it("setext headings follow the same mapping", () => {
    const root = root_of("Big\n===\n\nSmall\n---");
    expect(tags(root)).toEqual(["h2", "h2"]);
  });

  it("headings keep inline formatting", () => {
    const root = root_of("## Hi **there**");
    expect(root.querySelector("h2 strong")!.textContent).toBe("there");
  });

  it("bullet and ordered lists with start", () => {
    const root = root_of("- a\n- b\n\n3. x\n4. y");
    expect(tags(root)).toEqual(["ul", "ol"]);
    expect(root.querySelectorAll("ul > li")).toHaveLength(2);
    expect(root.querySelector("ol")!.getAttribute("start")).toBe("3");
  });

  it("blockquote with nested paragraph and list", () => {
    const root = root_of("> Quote **b**\n>\n> - item");
    const quote = root.querySelector("blockquote")!;
    expect(quote.querySelector("p strong")!.textContent).toBe("b");
    expect(quote.querySelectorAll("li")).toHaveLength(1);
  });

  it("table: allowlisted structure inside a scroll wrapper", () => {
    const root = root_of("| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |");
    const wrap = root.querySelector(".page-prose-table")!;
    expect(wrap.getAttribute("tabindex")).toBe("0");
    const table = wrap.querySelector("table")!;
    expect(table.attributes).toHaveLength(0);
    expect(table.querySelectorAll("thead th")).toHaveLength(2);
    expect(table.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(table.querySelectorAll("tbody td")).toHaveLength(4);
    for (const cell of Array.from(table.querySelectorAll("th, td"))) {
      expect(cell.attributes).toHaveLength(0);
    }
  });

  it("table alignment becomes a fixed class, never a style attribute", () => {
    const root = root_of("| L | C | R |\n|:--|:-:|--:|\n| 1 | 2 | 3 |");
    const classes = Array.from(root.querySelectorAll("td")).map(
      (td) => td.className,
    );
    expect(classes).toEqual([
      "page-prose-align-start",
      "page-prose-align-center",
      "page-prose-align-end",
    ]);
    expect(root.querySelector("[style]")).toBeNull();
  });

  it("table cells keep inline formatting and links", () => {
    const root = root_of("| A |\n|---|\n| **b** [x](https://example.com) |");
    expect(root.querySelector("td strong")!.textContent).toBe("b");
    expect(root.querySelector("td a")!.getAttribute("href")).toBe(
      "https://example.com/",
    );
  });

  it("allowlisted image goes through the proxy with lazy loading", () => {
    const root = root_of(`![A *cat*](${IMAGE})`);
    const img = root.querySelector("img")!;
    expect(img.getAttribute("src")).toContain("/720x0/");
    expect(img.getAttribute("src")).toContain(IMAGE);
    expect(img.getAttribute("srcset")).toContain("/1440x0/");
    expect(img.getAttribute("alt")).toBe("A cat");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.className).toBe("page-prose-img");
    expect(img.hasAttribute("title")).toBe(false);
  });

  it("image outside the allowlist degrades to its alt text", () => {
    const root = root_of("![Logo of us](https://evil.example/a.jpg)");
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("a")).toBeNull();
    expect(root.textContent).toBe("Logo of us");
    expect(root.innerHTML).not.toContain("evil.example");
  });

  it("image without alt and outside the allowlist renders nothing", () => {
    expect(render_page_markdown("![](https://evil.example/a.jpg)")).toBe(
      '<div class="page-prose"><p></p></div>',
    );
  });

  it("image wrapped in a link keeps both", () => {
    const root = root_of(`[![Alt](${IMAGE})](https://example.com)`);
    expect(root.querySelector("a img")).not.toBeNull();
  });

  it("links: https opens in a new tab, mailto stays in place", () => {
    const root = root_of(
      "[site](https://example.com) and [mail](mailto:a@b.example)",
    );
    const [site, mail] = Array.from(root.querySelectorAll("a"));
    expect(site.getAttribute("target")).toBe("_blank");
    expect(site.getAttribute("rel")).toBe("noopener noreferrer");
    expect(site.className).toBe("section-link");
    expect(mail.getAttribute("href")).toBe("mailto:a@b.example");
    expect(mail.hasAttribute("target")).toBe(false);
  });

  it("raw HTML, code and rules are not markup", () => {
    const root = root_of("<b>x</b>\n\n    code\n\n***\n\n`tick`");
    expect(root.querySelector("b, pre, code, hr")).toBeNull();
    expect(root.textContent).toContain("<b>x</b>");
  });

  it("bare URLs are not auto-linked", () => {
    const root = root_of("see https://example.com and <https://example.com>");
    expect(root.querySelector("a")).toBeNull();
  });
});

describe("pages markdown: locale", () => {
  it("new-tab hint follows the locale", () => {
    const en = root_of("[x](https://example.com)", "en");
    const pl = root_of("[x](https://example.com)", "pl");
    expect(en.querySelector("a .sr-only")!.textContent).toContain(
      "opens in a new tab",
    );
    expect(pl.querySelector("a .sr-only")!.textContent).toContain(
      "otwiera się w nowej karcie",
    );
  });

  it("missing locale falls back to the default dictionary", () => {
    const root = root_of("[x](https://example.com)");
    expect(root.querySelector("a .sr-only")!.textContent).toContain(
      "opens in a new tab",
    );
  });
});

describe("pages markdown: text-media unaffected", () => {
  it("section markdown still ignores headings, quotes, tables and images", () => {
    const html = render_section_markdown(
      `## H\n\n> q\n\n| a |\n|---|\n| 1 |\n\n![i](${IMAGE})`,
    );
    const root = parse_fragment(html);
    expect(root.querySelector("h2, blockquote, table, img")).toBeNull();
    expect(root.querySelector(".page-prose")).toBeNull();
  });
});
