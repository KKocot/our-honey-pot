// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  links_definition,
  type LinksSection,
} from "../../src/shared/components/sections/links/definition";
import { render_links } from "../../src/shared/components/sections/links/render";
import { unfilled_paths } from "../../src/shared/components/sections/registry-types";
import { section_content_issues } from "../../src/components/admin/canvas/home-section-ops";
import { create_section_context } from "../../src/shared/components/sections/utils";
import { t } from "../../src/lib/i18n";
import {
  expect_no_script_vectors,
  hrefs_of,
  parse_fragment,
} from "./helpers/html-assert";

const ID = "links001";

function raw_section(
  content: Record<string, unknown>,
  style: Record<string, unknown> = {},
): Record<string, unknown> {
  return { id: ID, type: "links", content, style };
}

function parse(raw: Record<string, unknown>): LinksSection {
  return links_definition.schema.parse(raw);
}

function render(section: unknown, locale = "en"): string {
  return render_links(
    section as LinksSection,
    create_section_context({}, locale),
  );
}

function items(count: number, extra: Record<string, unknown> = {}) {
  return Array.from({ length: count }, (_, index) => ({
    label: `Link ${index + 1}`,
    url: `https://example.com/${index + 1}`,
    ...extra,
  }));
}

describe("links definition", () => {
  it("accepts 12 items and rejects the 13th", () => {
    expect(
      links_definition.schema.safeParse(raw_section({ items: items(12) }))
        .success,
    ).toBe(true);
    const parsed = links_definition.schema.safeParse(
      raw_section({ items: items(13) }),
    );
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toContain(
      "content.items",
    );
  });

  it("rejects more than two highlighted items on save", () => {
    const three = items(3, { highlight: true });
    expect(
      links_definition.schema.safeParse(raw_section({ items: three })).success,
    ).toBe(false);
    expect(
      links_definition.schema.safeParse(
        raw_section({ items: three.slice(0, 2) }),
      ).success,
    ).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://example.com",
    "vbscript:msgbox(1)",
    "//evil.example",
  ])("rejects the item URL %s", (url) => {
    expect(
      links_definition.schema.safeParse(
        raw_section({ items: [{ label: "Bad", url }] }),
      ).success,
    ).toBe(false);
  });

  it("accepts mailto: and tel: targets", () => {
    const section = parse(
      raw_section({
        items: [
          { label: "Mail", url: "mailto:me@example.com" },
          { label: "Call", url: "tel:+48123456789" },
        ],
      }),
    );
    expect(section.content.items).toHaveLength(2);
  });

  it("falls back to list/center for unknown style values", () => {
    const section = parse(
      raw_section({ items: items(1) }, { layout: "carousel", align: "end" }),
    );
    expect(section.style.layout).toBe("list");
    expect(section.style.align).toBe("center");
  });

  it("starts a new section with example links that block Save until replaced", () => {
    const { content } = links_definition.defaults();
    expect(content).not.toHaveProperty("heading");
    expect(content.items.map((item) => item.label)).toEqual([
      "Your newsletter",
      "Your social profile",
      "Your portfolio",
      "A link readers need",
    ]);
    expect(unfilled_paths(links_definition, content)).toEqual([
      "items.0.label",
      "items.1.label",
      "items.2.label",
      "items.3.label",
      "items.0.url",
      "items.1.url",
      "items.2.url",
      "items.3.url",
    ]);
    expect(
      links_definition.schema.safeParse({
        id: ID,
        type: "links",
        ...links_definition.defaults(),
      }).success,
    ).toBe(true);
    expect(unfilled_paths(links_definition, { items: items(3) })).toEqual([]);
  });

  it("names the field and position of an example link left in the list", () => {
    const [newsletter] = links_definition.defaults().content.items;
    const content = {
      items: [
        { label: "Blog", url: "https://blog.example" },
        { ...newsletter, url: "https://news.example" },
      ],
    };
    expect(section_content_issues(links_definition, content)).toEqual([
      "replace the placeholder label in item 2",
    ]);
    expect(
      section_content_issues(links_definition, {
        items: [{ label: "", url: "https://example.com" }],
      }),
    ).toEqual([
      "add a label to item 1",
      "replace the placeholder URL in item 1",
    ]);
  });

  it("offers the align control only for the list layout", () => {
    expect(links_definition.style_controls({})).toEqual([
      "layout",
      "background",
      "width",
      "spacing",
      "align",
    ]);
    expect(
      links_definition.style_controls({ layout: "grid", bg: "image" }),
    ).toEqual([
      "layout",
      "background",
      "bg_image",
      "overlay",
      "width",
      "spacing",
    ]);
  });

  it("drops invalid items and extra highlights in the tolerant reader", () => {
    const content: Record<string, unknown> = {
      items: [
        { label: "A", url: "https://a.example", highlight: true },
        { label: "Bad", url: "javascript:alert(1)" },
        { label: "B", url: "https://b.example", highlight: true },
        { label: "C", url: "https://c.example", highlight: true },
        ...items(20),
      ],
    };
    links_definition.prepare_content?.(content);
    const prepared = content.items as Array<Record<string, unknown>>;
    expect(prepared).toHaveLength(12);
    expect(prepared.map((item) => item.label).slice(0, 3)).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(prepared.filter((item) => item.highlight === true)).toHaveLength(2);
    expect(
      links_definition.schema.safeParse(raw_section(content)).success,
    ).toBe(true);
  });
});

describe("render_links", () => {
  it("renders '' without valid items", () => {
    expect(render(parse(raw_section({ items: [] })))).toBe("");
    expect(render({ id: ID, type: "links", content: {}, style: {} })).toBe("");
    expect(
      render({
        id: ID,
        type: "links",
        content: { items: [{ label: "", url: "https://example.com" }] },
        style: {},
      }),
    ).toBe("");
  });

  it("never emits unsafe hrefs from untrusted content", () => {
    const html = render({
      id: ID,
      type: "links",
      content: {
        items: [
          { label: "JS", url: "javascript:alert(1)" },
          { label: "Data", url: "data:text/html,<script>alert(1)</script>" },
          { label: "Spaced", url: "  JavaScript:alert(1)" },
          { label: "Plain http", url: "http://example.com" },
          { label: "Ok", url: "https://example.com/ok" },
        ],
      },
      style: {},
    });
    expect(hrefs_of(html)).toEqual(["https://example.com/ok"]);
    expect_no_script_vectors(html);
    expect(html).not.toContain("JS<");
  });

  it("opens https links in a new tab with rel noopener noreferrer and a hint", () => {
    const html = render(
      parse(
        raw_section({
          items: [
            { label: "Site", url: "https://example.com" },
            { label: "Mail", url: "mailto:me@example.com" },
          ],
        }),
      ),
    );
    const [external, mail] = Array.from(
      parse_fragment(html).querySelectorAll("a"),
    );
    expect(external.getAttribute("target")).toBe("_blank");
    expect(external.getAttribute("rel")).toBe("noopener noreferrer");
    expect(external.querySelector(".sr-only")?.textContent).toContain(
      t("en", "section.opens_new_tab"),
    );
    expect(mail.hasAttribute("target")).toBe(false);
    expect(mail.querySelector(".sr-only")).toBeNull();
  });

  it("names the list, escapes text and marks at most two highlights", () => {
    const html = render({
      id: ID,
      type: "links",
      content: {
        items: [
          {
            label: "<img src=x onerror=alert(1)>",
            url: "https://a.example",
            highlight: true,
          },
          { label: "B", url: "https://b.example", highlight: true },
          { label: "C", url: "https://c.example", highlight: true },
        ],
      },
      style: {},
    });
    const root = parse_fragment(html);
    const list = root.querySelector("ul.section-links-list")!;
    expect(list.getAttribute("role")).toBe("list");
    expect(list.getAttribute("aria-label")).toBe(
      t("en", "section.links.label"),
    );
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelectorAll(".section-links-item-highlight")).toHaveLength(
      2,
    );
    expect(root.querySelectorAll("svg[aria-hidden='true']")).toHaveLength(3);
    expect_no_script_vectors(html);
  });

  it("renders no heading and no aria-labelledby, even from a stray stored heading", () => {
    const root = parse_fragment(
      render({
        id: ID,
        type: "links",
        content: { heading: "Find me", items: items(2) },
        style: {},
      }),
    );
    expect(root.querySelector("h2")).toBeNull();
    expect(root.querySelector("section")?.hasAttribute("aria-labelledby")).toBe(
      false,
    );
  });

  it("applies layout and align classes, clamping unknown values", () => {
    const grid = parse_fragment(
      render(
        parse(
          raw_section({ items: items(3) }, { layout: "grid", align: "start" }),
        ),
      ),
    ).querySelector("section")!;
    expect(grid.classList.contains("section-links-layout-grid")).toBe(true);
    expect(grid.classList.contains("section-align-start")).toBe(true);

    const hostile = parse_fragment(
      render({
        id: ID,
        type: "links",
        content: { items: items(1) },
        style: { layout: '"><script>', align: "x" },
      }),
    ).querySelector("section")!;
    expect(hostile.classList.contains("section-links-layout-list")).toBe(true);
    expect(hostile.classList.contains("section-align-center")).toBe(true);
    expect(hostile.getAttribute("data-section-type")).toBe("links");
  });

  it("renders a new section from the defaults", () => {
    const section = parse({
      id: ID,
      type: "links",
      ...links_definition.defaults(),
    });
    const root = parse_fragment(render(section));
    expect(root.querySelectorAll("a.section-links-item")).toHaveLength(4);
  });
});
