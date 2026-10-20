// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import { get_default_settings } from "../../src/components/admin/types/settings";
import { quote_definition } from "../../src/shared/components/sections/quote/definition";
import {
  render_quote,
  type QuoteSection,
} from "../../src/shared/components/sections/quote/render";
import { unfilled_paths } from "../../src/shared/components/sections/registry-types";
import { create_section_context } from "../../src/shared/components/sections/utils";
import {
  expect_no_script_vectors,
  parse_fragment,
} from "./helpers/html-assert";

const ctx = create_section_context(get_default_settings(true), "en");

function safe_parse(content: Record<string, unknown>, style: unknown = {}) {
  return quote_definition.schema.safeParse({
    id: "quot0001",
    type: "quote",
    content,
    style,
  });
}

function parse(
  content: Record<string, unknown>,
  style: unknown = {},
): QuoteSection {
  const parsed = safe_parse(content, style);
  if (!parsed.success) throw parsed.error;
  return parsed.data;
}

/** Bypasses the schema, like a hostile config reaching the renderer. */
function raw_section(
  content: Record<string, unknown>,
  style: Record<string, unknown> = {},
): QuoteSection {
  return {
    id: "quot0001",
    type: "quote",
    content,
    style,
  } as unknown as QuoteSection;
}

function dom(section: QuoteSection): HTMLElement {
  return parse_fragment(render_quote(section, ctx));
}

describe("quote definition", () => {
  it("accepts 400 characters of text and rejects 401 or empty text", () => {
    expect(quote_definition.text_limits.text_chars).toBe(400);
    expect(safe_parse({ text: "ż".repeat(400) }).success).toBe(true);
    expect(safe_parse({ text: "x".repeat(401) }).success).toBe(false);
    expect(safe_parse({ text: "   " }).success).toBe(false);
  });

  it("limits the attribution length", () => {
    const max = quote_definition.text_limits.cite_chars;
    expect(safe_parse({ text: "Hi", cite: "x".repeat(max) }).success).toBe(
      true,
    );
    expect(safe_parse({ text: "Hi", cite: "x".repeat(max + 1) }).success).toBe(
      false,
    );
  });

  it("accepts only an https source_url", () => {
    expect(
      safe_parse({ text: "Hi", source_url: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(
      safe_parse({ text: "Hi", source_url: "mailto:a@example.com" }).success,
    ).toBe(false);
    expect(
      parse({ text: "Hi", source_url: "https://example.com/book" }).content
        .source_url,
    ).toBe("https://example.com/book");
  });

  it("falls back to the rule variant for an unknown variant", () => {
    expect(parse({ text: "Hi" }, { variant: "neon" }).style.variant).toBe(
      "rule",
    );
    expect(parse({ text: "Hi" }, { variant: "centered" }).style.variant).toBe(
      "centered",
    );
  });

  it("keeps an untouched new section unsaveable and a filled one saveable", () => {
    const fresh = quote_definition.defaults().content;
    expect(unfilled_paths(quote_definition, fresh)).toEqual(
      expect.arrayContaining(["text", "cite"]),
    );
    expect(
      unfilled_paths(quote_definition, { ...fresh, text: "Write daily." }),
    ).toEqual(["cite"]);
    expect(
      unfilled_paths(quote_definition, {
        text: "Write daily.",
        cite: "Anna Nowak",
      }),
    ).toEqual([]);
    expect(unfilled_paths(quote_definition, { text: "Write daily." })).toEqual(
      [],
    );
  });

  it("offers the variant layout and image backgrounds", () => {
    expect(quote_definition.has_layout).toBe(true);
    expect(quote_definition.layout_key).toBe("variant");
    expect(quote_definition.layout_options.map((o) => o.value)).toEqual([
      "rule",
      "centered",
    ]);
    expect(quote_definition.style_controls({ bg: "image" })).toEqual(
      expect.arrayContaining(["layout", "background", "bg_image", "overlay"]),
    );
    expect(quote_definition.max_per_page).toBe(2);
  });
});

describe("render_quote", () => {
  it("returns '' when the text is empty", () => {
    expect(render_quote(raw_section({ text: "   ", cite: "Anna" }), ctx)).toBe(
      "",
    );
    expect(render_quote(raw_section({}), ctx)).toBe("");
  });

  it("renders figure > blockquote + figcaption > cite", () => {
    const root = dom(
      parse({
        text: "Write every day.",
        cite: "Anna Nowak, Notes",
        source_url: "https://example.com/notes",
      }),
    );
    const figure = root.querySelector("section figure.section-quote-figure")!;
    const blockquote = figure.querySelector(":scope > blockquote")!;
    expect(blockquote.querySelector("p")!.textContent).toBe("Write every day.");
    expect(blockquote.getAttribute("cite")).toBe("https://example.com/notes");
    const cite = figure.querySelector(":scope > figcaption cite")!;
    expect(cite.textContent).toBe("Anna Nowak, Notes");
    const link = cite.closest("a")!;
    expect(link.getAttribute("href")).toBe("https://example.com/notes");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("omits the figcaption without cite and source", () => {
    const root = dom(parse({ text: "Only text" }));
    expect(root.querySelector("blockquote")).not.toBeNull();
    expect(root.querySelector("figcaption")).toBeNull();
    expect(root.querySelector("blockquote")!.hasAttribute("cite")).toBe(false);
  });

  it("renders a plain cite without a link", () => {
    const root = dom(parse({ text: "Hi", cite: "Anna" }));
    expect(root.querySelector("figcaption cite")!.textContent).toBe("Anna");
    expect(root.querySelector("a")).toBeNull();
  });

  it("labels a bare source link with its host", () => {
    const root = dom(
      parse({ text: "Hi", source_url: "https://example.com/a/b" }),
    );
    const link = root.querySelector("figcaption a")!;
    expect(link.querySelector("cite")!.textContent).toBe("example.com");
  });

  it("drops a javascript: source_url that bypassed the schema", () => {
    const html = render_quote(
      raw_section({
        text: "Hi",
        cite: "Anna",
        source_url: "javascript:alert(1)",
      }),
      ctx,
    );
    const root = parse_fragment(html);
    expect(root.querySelector("a")).toBeNull();
    expect(root.querySelector("blockquote")!.hasAttribute("cite")).toBe(false);
    expect(root.querySelector("figcaption cite")!.textContent).toBe("Anna");
    expect_no_script_vectors(html);
  });

  it("escapes text and attribution", () => {
    const payload = '<img src=x onerror="alert(1)">';
    const html = render_quote(
      raw_section({ text: payload, cite: payload }),
      ctx,
    );
    const root = parse_fragment(html);
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("blockquote p")!.textContent).toBe(payload);
    expect(root.querySelector("cite")!.textContent).toBe(payload);
    expect_no_script_vectors(html);
  });

  it("applies the variant class with a fallback", () => {
    expect(
      dom(parse({ text: "Hi" }, { variant: "centered" })).querySelector(
        "section",
      )!.classList,
    ).toContain("section-quote-centered");
    expect(
      dom(
        raw_section({ text: "Hi" }, { variant: 'x" onclick="alert(1)' }),
      ).querySelector("section")!.classList,
    ).toContain("section-quote-rule");
  });
});
