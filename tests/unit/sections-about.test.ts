// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  ABOUT_TEXT_LIMITS,
  about_definition,
  type AboutSection,
} from "../../src/shared/components/sections/about/definition";
import { render_about } from "../../src/shared/components/sections/about/render";
import { unfilled_paths } from "../../src/shared/components/sections/registry-types";
import { create_section_context } from "../../src/shared/components/sections/utils";
import { get_default_settings } from "../../src/components/admin/types/settings";
import { section_content_issues } from "../../src/components/admin/canvas/home-section-ops";
import {
  expect_no_script_vectors,
  parse_fragment,
} from "./helpers/html-assert";

const IMAGE = "https://images.hive.blog/DQm/portrait.jpg";

function parse(raw: Record<string, unknown>): AboutSection {
  return about_definition.schema.parse({
    id: "about001",
    type: "about",
    style: {},
    ...raw,
  });
}

function render(section: AboutSection, locale = "en"): string {
  return render_about(
    section,
    create_section_context(get_default_settings(true), locale),
  );
}

const filled = {
  heading: "Hi, I am Anna",
  body_md: "I write about **Hive** and [open source](https://example.com).",
  avatar: { url: IMAGE, alt: "Portrait of Anna" },
  facts: [
    { label: "Based in", value: "Kraków" },
    { label: "Writing since", value: "2017" },
  ],
};

describe("about definition", () => {
  const content = about_definition.content_schema;

  it("requires a heading", () => {
    expect(content.safeParse({ body_md: "Bio" }).success).toBe(false);
    expect(content.safeParse({ heading: "   " }).success).toBe(false);
    expect(content.safeParse({ heading: "About" }).success).toBe(true);
  });

  it("limits the heading length", () => {
    const max = ABOUT_TEXT_LIMITS.heading_chars;
    expect(content.safeParse({ heading: "a".repeat(max) }).success).toBe(true);
    expect(content.safeParse({ heading: "a".repeat(max + 1) }).success).toBe(
      false,
    );
  });

  it("limits the body to 1500 UTF-8 bytes", () => {
    expect(ABOUT_TEXT_LIMITS.body_bytes).toBe(1500);
    expect(
      content.safeParse({ heading: "A", body_md: "a".repeat(1500) }).success,
    ).toBe(true);
    expect(
      content.safeParse({ heading: "A", body_md: "a".repeat(1501) }).success,
    ).toBe(false);
    expect(
      content.safeParse({ heading: "A", body_md: "ą".repeat(751) }).success,
    ).toBe(false);
  });

  it("allows at most 6 facts", () => {
    const facts = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ label: `L${i}`, value: `V${i}` }));
    expect(content.safeParse({ heading: "A", facts: facts(6) }).success).toBe(
      true,
    );
    expect(content.safeParse({ heading: "A", facts: facts(7) }).success).toBe(
      false,
    );
  });

  it("rejects a fact with an empty label or value", () => {
    expect(
      content.safeParse({ heading: "A", facts: [{ label: "", value: "x" }] })
        .success,
    ).toBe(false);
    expect(
      content.safeParse({ heading: "A", facts: [{ label: "x", value: " " }] })
        .success,
    ).toBe(false);
  });

  it("drops invalid facts in prepare_content and keeps at most 6", () => {
    const raw: Record<string, unknown> = {
      facts: [
        { label: "", value: "x" },
        ...Array.from({ length: 8 }, (_, i) => ({
          label: `L${i}`,
          value: "v",
        })),
      ],
    };
    about_definition.prepare_content?.(raw);
    expect(raw.facts).toHaveLength(6);
    expect((raw.facts as Array<{ label: string }>)[0].label).toBe("L0");
  });

  it("falls back to style defaults for unknown enum values", () => {
    const style = about_definition.style_schema.parse({
      layout: "grid",
      align: "right",
      image_shape: "rect",
    });
    expect(style).toMatchObject({
      layout: "side",
      align: "start",
      image_shape: "circle",
    });
  });

  it("allows one section per page and offers the layout, align and shape controls", () => {
    expect(about_definition.max_per_page).toBe(1);
    expect(about_definition.layout_key).toBe("layout");
    expect(about_definition.style_controls({ bg: "none" })).toEqual(
      expect.arrayContaining(["layout", "background", "align", "image_shape"]),
    );
  });

  it("a new section keeps its placeholders unfilled, so Save is blocked", () => {
    const { content: fresh, style } = about_definition.defaults();
    expect(
      about_definition.schema.safeParse({
        id: "about001",
        type: "about",
        content: fresh,
        style,
      }).success,
    ).toBe(true);
    expect(fresh.facts?.map((fact) => fact.label)).toEqual([
      "Based in",
      "Writing since",
      "Topics",
    ]);
    expect(fresh.heading).toBe("About me");
    expect(unfilled_paths(about_definition, fresh)).toEqual([
      "body_md",
      "facts.0.value",
      "facts.1.value",
      "facts.2.value",
    ]);
    expect(
      unfilled_paths(about_definition, {
        ...fresh,
        body_md: "My bio",
        facts: [
          { label: "Based in", value: "Kraków" },
          { label: "Topics", value: "Hive" },
        ],
      }),
    ).toEqual([]);
  });

  it("names an example fact value left in the list by its item position", () => {
    const { content: fresh } = about_definition.defaults();
    const issues = section_content_issues(about_definition, {
      ...fresh,
      heading: "Hi",
      body_md: "My bio",
      facts: [{ label: "Based in", value: "Kraków" }, fresh.facts![1]],
    });
    expect(issues).toEqual(["replace the placeholder value in item 2"]);
  });

  it("never offers an image background or the square image shape", () => {
    expect(about_definition.style_options).toEqual({
      bg: ["none", "bg", "bg-secondary", "card", "primary", "accent"],
      image_shape: ["circle", "rounded"],
    });
    expect(about_definition.style_schema.parse({ bg: "image" }).bg).toBe(
      "none",
    );
  });
});

describe("render_about", () => {
  it("renders heading, markdown body, avatar and facts", () => {
    const html = render(parse({ content: filled }));
    const root = parse_fragment(html);
    const section = root.querySelector("section")!;
    expect(section.classList).toContain("section-about");
    expect(section.classList).toContain("section-about-side");
    expect(section.getAttribute("aria-labelledby")).toBe("s-about001-title");
    expect(root.querySelector("h2#s-about001-title")?.textContent).toBe(
      "Hi, I am Anna",
    );
    expect(root.querySelector(".section-md strong")?.textContent).toBe("Hive");
    const avatar = root.querySelector("img.section-about-avatar")!;
    expect(avatar.getAttribute("alt")).toBe("Portrait of Anna");
    expect(avatar.classList).toContain("section-shape-circle");
    const facts = Array.from(
      root.querySelectorAll("dl.section-about-facts .section-about-fact"),
    );
    expect(
      facts.map((f) => [
        f.querySelector("dt")?.textContent,
        f.querySelector("dd")?.textContent,
      ]),
    ).toEqual([
      ["Based in", "Kraków"],
      ["Writing since", "2017"],
    ]);
  });

  it("names the facts list in the page locale", () => {
    expect(
      parse_fragment(render(parse({ content: filled }), "pl")).querySelector(
        "h3.sr-only",
      )?.textContent,
    ).toBe("Fakty");
  });

  it("returns '' when heading and body are empty, even with avatar and facts", () => {
    const section = parse({ content: filled });
    const emptied = {
      ...section,
      content: { ...section.content, heading: "", body_md: "  " },
    };
    expect(render(emptied)).toBe("");
    expect(
      render({ ...section, content: undefined } as unknown as AboutSection),
    ).toBe("");
  });

  it("renders the heading with facts when the body is missing", () => {
    const root = parse_fragment(
      render(parse({ content: { heading: "About", facts: filled.facts } })),
    );
    expect(root.querySelector("h2")?.textContent).toBe("About");
    expect(root.querySelector(".section-md")).toBeNull();
    expect(root.querySelectorAll(".section-about-fact")).toHaveLength(2);
  });

  it("omits the media wrapper and facts list when there is no avatar or valid fact", () => {
    const section = parse({ content: { heading: "About", body_md: "Bio" } });
    const raw_facts = {
      ...section,
      content: { ...section.content, facts: [{ label: "x", value: "" }, null] },
    };
    const root = parse_fragment(render(raw_facts as unknown as AboutSection));
    expect(root.querySelector(".section-about-media")).toBeNull();
    expect(root.querySelector("dl")).toBeNull();
    expect(root.querySelector("h3")).toBeNull();
  });

  it("skips an avatar from an untrusted host", () => {
    expect(
      about_definition.content_schema.safeParse({
        ...filled,
        avatar: { url: "https://evil.example/a.jpg", alt: "x" },
      }).success,
    ).toBe(false);
    const section = parse({ content: filled });
    const raw = {
      ...section,
      content: {
        ...section.content,
        avatar: { url: "https://evil.example/a.jpg", alt: "x" },
      },
    };
    const root = parse_fragment(render(raw as unknown as AboutSection));
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector(".section-about-media")).toBeNull();
    expect(root.querySelector("h2")?.textContent).toBe(filled.heading);
  });

  it("forces stacked layout when centered and applies the rounded shape", () => {
    const html = render(
      parse({
        content: filled,
        style: { layout: "side", align: "center", image_shape: "rounded" },
      }),
    );
    const section = parse_fragment(html).querySelector("section")!;
    expect(section.classList).toContain("section-about-stacked");
    expect(section.classList).toContain("section-align-center");
    expect(parse_fragment(html).querySelector("img")?.classList).toContain(
      "section-shape-rounded",
    );
  });

  it("clamps raw style values from an unparsed config", () => {
    const section = parse({ content: filled });
    const hostile = {
      ...section,
      style: { layout: '"><script>', align: "x", image_shape: "x" },
    };
    const html = render(hostile as unknown as AboutSection);
    expect(parse_fragment(html).querySelector("section")?.classList).toContain(
      "section-about-side",
    );
    expect(html).not.toContain("<script>");
  });

  it("blocks XSS payloads in the markdown body and escapes all text", () => {
    const xss = {
      heading: '<img src=x onerror="alert(1)">',
      body_md:
        '<script>alert(1)</script>\n\n[click](javascript:alert(1)) <a href="x" onclick="alert(1)">a</a>\n\n<img src=x onerror=alert(1)>',
      facts: [
        { label: "<b onmouseover=alert(1)>", value: '"><svg onload=alert(1)>' },
      ],
    };
    const html = render(parse({ content: xss }));
    expect_no_script_vectors(html);
    const root = parse_fragment(html);
    expect(root.querySelectorAll("a, img, svg, b, script")).toHaveLength(0);
    expect(root.querySelector(".section-md")?.textContent).toContain(
      "<script>alert(1)</script>",
    );
    expect(root.querySelector("h2")?.textContent).toBe(xss.heading);
    expect(root.querySelector("dd")?.textContent).toBe(xss.facts[0].value);
  });
});
