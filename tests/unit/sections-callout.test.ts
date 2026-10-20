// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import { get_default_settings } from "../../src/components/admin/types/settings";
import { callout_definition } from "../../src/shared/components/sections/callout/definition";
import {
  render_callout,
  type CalloutSection,
} from "../../src/shared/components/sections/callout/render";
import { unfilled_paths } from "../../src/shared/components/sections/registry-types";
import { create_section_context } from "../../src/shared/components/sections/utils";
import {
  expect_no_script_vectors,
  parse_fragment,
} from "./helpers/html-assert";

const ctx = create_section_context(get_default_settings(true), "en");

function parse(raw: Record<string, unknown>): CalloutSection {
  return callout_definition.schema.parse({
    id: "call0001",
    type: "callout",
    style: {},
    ...raw,
  });
}

/** Bypasses the schema, like a hostile config reaching the renderer. */
function raw_section(
  content: Record<string, unknown>,
  style: Record<string, unknown> = {},
): CalloutSection {
  return {
    id: "call0001",
    type: "callout",
    content,
    style,
  } as unknown as CalloutSection;
}

function dom(section: CalloutSection): HTMLElement {
  return parse_fragment(render_callout(section, ctx));
}

describe("callout definition", () => {
  it("offers only the backgrounds its schema keeps, never an image", () => {
    expect(callout_definition.style_options.bg).not.toContain("image");
    for (const bg of callout_definition.style_options.bg) {
      expect(callout_definition.style_schema.parse({ bg }).bg).toBe(bg);
    }
  });

  it("falls back to the info tone for an unknown or missing tone", () => {
    expect(parse({ content: { title: "Hi", tone: "neon" } }).content.tone).toBe(
      "info",
    );
    expect(parse({ content: { title: "Hi" } }).content.tone).toBe("info");
    expect(parse({ content: { title: "Hi", tone: "warn" } }).content.tone).toBe(
      "warn",
    );
  });

  it("enforces title and body limits", () => {
    expect(
      callout_definition.schema.safeParse({
        id: "call0001",
        type: "callout",
        content: { title: "" },
      }).success,
    ).toBe(false);
    const long_title = "x".repeat(
      callout_definition.text_limits.title_chars + 1,
    );
    expect(
      callout_definition.schema.safeParse({
        id: "call0001",
        type: "callout",
        content: { title: long_title },
      }).success,
    ).toBe(false);
    const long_body = "x".repeat(callout_definition.text_limits.body_chars + 1);
    expect(
      callout_definition.schema.safeParse({
        id: "call0001",
        type: "callout",
        content: { title: "Hi", body: long_body },
      }).success,
    ).toBe(false);
  });

  it("rejects a javascript: CTA url in the schema", () => {
    const parsed = callout_definition.schema.safeParse({
      id: "call0001",
      type: "callout",
      content: {
        title: "Hi",
        cta: { label: "Go", url: "javascript:alert(1)" },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("drops an image background to none", () => {
    expect(
      parse({ content: { title: "Hi" }, style: { bg: "image" } }).style.bg,
    ).toBe("none");
    expect(
      parse({ content: { title: "Hi" }, style: { bg: "card" } }).style.bg,
    ).toBe("card");
  });

  it("keeps an untouched new section unsaveable and a filled one saveable", () => {
    const fresh = callout_definition.defaults().content;
    expect(unfilled_paths(callout_definition, fresh)).toEqual(
      expect.arrayContaining(["title", "body"]),
    );
    expect(
      unfilled_paths(callout_definition, {
        ...fresh,
        title: "New series",
        body: "Starts Monday.",
      }),
    ).toEqual([]);
  });

  it("offers align but never image controls", () => {
    expect(
      callout_definition.style_controls(callout_definition.defaults().style),
    ).toEqual(
      expect.arrayContaining(["background", "width", "spacing", "align"]),
    );
    expect(callout_definition.style_controls({ bg: "card" })).not.toContain(
      "bg_image",
    );
    expect(callout_definition.max_per_page).toBe(2);
  });
});

describe("render_callout", () => {
  it("returns '' without a title", () => {
    expect(
      render_callout(raw_section({ title: "   ", body: "Body" }), ctx),
    ).toBe("");
    expect(render_callout(raw_section({}), ctx)).toBe("");
  });

  it("renders the tone class, labelled heading, body and link", () => {
    const root = dom(
      parse({
        content: {
          tone: "warn",
          title: "Break in posting",
          body: "Back in May.",
          cta: { label: "Details", url: "https://example.com/news" },
        },
      }),
    );
    const section = root.querySelector("section")!;
    expect(section.classList).toContain("section-callout-warn");
    expect(section.getAttribute("aria-labelledby")).toBe("s-call0001-title");
    expect(root.querySelector("#s-call0001-title")!.textContent).toBe(
      "Warning: Break in posting",
    );
    expect(root.querySelector("#s-call0001-title .sr-only")!.textContent).toBe(
      "Warning: ",
    );
    expect(root.querySelector(".section-callout-text p")!.textContent).toBe(
      "Back in May.",
    );
    const link = root.querySelector<HTMLAnchorElement>(
      "a.section-callout-cta",
    )!;
    expect(link.getAttribute("href")).toBe("https://example.com/news");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(
      root
        .querySelector("svg.section-callout-icon")!
        .getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("uses a different icon per tone", () => {
    const icons = ["info", "accent", "warn"].map(
      (tone) =>
        dom(parse({ content: { tone, title: "Hi" } })).querySelector("svg")!
          .innerHTML,
    );
    expect(new Set(icons).size).toBe(3);
  });

  it("falls back to info for an unknown tone that bypassed the schema", () => {
    const section = dom(
      raw_section({ tone: 'x" onclick="alert(1)', title: "Hi" }),
    ).querySelector("section")!;
    expect(section.classList).toContain("section-callout-info");
  });

  it("drops a javascript: CTA but keeps the callout", () => {
    const html = render_callout(
      raw_section({
        title: "Hi",
        cta: { label: "Go", url: "javascript:alert(1)" },
      }),
      ctx,
    );
    expect(html).toContain("Hi");
    expect(parse_fragment(html).querySelector("a")).toBeNull();
    expect_no_script_vectors(html);
  });

  it("escapes title and body", () => {
    const payload = '<img src=x onerror="alert(1)">';
    const html = render_callout(
      raw_section({ title: payload, body: payload }),
      ctx,
    );
    const root = parse_fragment(html);
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("h2")!.textContent).toBe(`Info: ${payload}`);
    expect(root.querySelector(".section-callout-text p")!.textContent).toBe(
      payload,
    );
    expect_no_script_vectors(html);
  });

  it("omits body and actions when they are empty", () => {
    const root = dom(parse({ content: { title: "Only title" } }));
    expect(root.querySelector(".section-callout-text p")).toBeNull();
    expect(root.querySelector(".section-actions")).toBeNull();
  });

  it("applies the align class from style with a fallback", () => {
    expect(
      dom(
        parse({ content: { title: "Hi" }, style: { align: "center" } }),
      ).querySelector("section")!.classList,
    ).toContain("section-align-center");
    expect(
      dom(raw_section({ title: "Hi" }, { align: "bogus" })).querySelector(
        "section",
      )!.classList,
    ).toContain("section-align-start");
  });
});
