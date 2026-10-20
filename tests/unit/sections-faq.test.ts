// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import { get_default_settings } from "../../src/components/admin/types/settings";
import {
  FAQ_TEXT_LIMITS,
  faq_definition,
  type FaqSection,
} from "../../src/shared/components/sections/faq/definition";
import { render_faq } from "../../src/shared/components/sections/faq/render";
import { unfilled_paths } from "../../src/shared/components/sections/registry-types";
import { section_content_issues } from "../../src/components/admin/canvas/home-section-ops";
import { create_section_context } from "../../src/shared/components/sections/utils";
import {
  expect_no_script_vectors,
  parse_fragment,
} from "./helpers/html-assert";

const ctx = create_section_context(get_default_settings(true), "en");

function base(
  content: Record<string, unknown>,
  style: Record<string, unknown> = {},
) {
  return { id: "faq00001", type: "faq", content, style };
}

function parse(
  content: Record<string, unknown>,
  style: Record<string, unknown> = {},
): FaqSection {
  return faq_definition.schema.parse(base(content, style));
}

/** Bypasses the schema, like a hostile config reaching the renderer. */
function raw_section(
  content: Record<string, unknown>,
  style: Record<string, unknown> = {},
): FaqSection {
  return base(content, style) as unknown as FaqSection;
}

function items(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    q: `Question ${i + 1}?`,
    a: `Answer ${i + 1}.`,
  }));
}

describe("faq definition", () => {
  it("accepts up to 10 items and rejects 11", () => {
    expect(FAQ_TEXT_LIMITS.items).toBe(10);
    expect(
      faq_definition.schema.safeParse(base({ items: items(10) })).success,
    ).toBe(true);
    expect(
      faq_definition.schema.safeParse(base({ items: items(11) })).success,
    ).toBe(false);
  });

  it("enforces question length, answer bytes and the total answer budget", () => {
    const long_q = "x".repeat(FAQ_TEXT_LIMITS.q_chars + 1);
    expect(
      faq_definition.schema.safeParse(base({ items: [{ q: long_q, a: "A" }] }))
        .success,
    ).toBe(false);
    const long_a = "x".repeat(FAQ_TEXT_LIMITS.a_bytes + 1);
    expect(
      faq_definition.schema.safeParse(base({ items: [{ q: "Q?", a: long_a }] }))
        .success,
    ).toBe(false);
    const big = Array.from({ length: 6 }, (_, i) => ({
      q: `Q${i}?`,
      a: "y".repeat(FAQ_TEXT_LIMITS.a_bytes),
    }));
    expect(faq_definition.schema.safeParse(base({ items: big })).success).toBe(
      false,
    );
    expect(
      faq_definition.schema.safeParse(base({ items: [{ q: "Q?", a: "  " }] }))
        .success,
    ).toBe(false);
  });

  it("keeps an untouched new section unsaveable through its placeholders, not its schema", () => {
    const fresh = faq_definition.defaults();
    expect(
      faq_definition.schema.safeParse({ id: "faq00001", type: "faq", ...fresh })
        .success,
    ).toBe(true);
    expect(unfilled_paths(faq_definition, fresh.content)).toEqual([
      "items.0.a",
      "items.1.a",
      "items.2.a",
    ]);
    const one_left = fresh.content.items.map((item, i) =>
      i === 0 ? item : { q: `Mine ${i}?`, a: "Mine." },
    );
    expect(section_content_issues(faq_definition, { items: one_left })).toEqual(
      ["replace the placeholder answer in item 1"],
    );
    const own_answers = fresh.content.items.map((item) => ({
      q: item.q,
      a: "Mine.",
    }));
    expect(
      section_content_issues(faq_definition, { items: own_answers }),
    ).toEqual([]);
    expect(section_content_issues(faq_definition, { items: items(3) })).toEqual(
      [],
    );
  });

  it("still blocks an example answer moved to another position", () => {
    const [example] = faq_definition.defaults().content.items;
    expect(
      unfilled_paths(faq_definition, {
        items: [
          { q: "Mine?", a: "Mine." },
          { q: "Mine too?", a: example.a },
        ],
      }),
    ).toEqual(["items.1.a"]);
  });

  it("tolerant read keeps example items, so the section shows up as unfilled", () => {
    const content: Record<string, unknown> = {
      items: faq_definition.defaults().content.items,
    };
    faq_definition.prepare_content!(content);
    expect(content.items).toHaveLength(3);
    expect(faq_definition.schema.safeParse(base(content)).success).toBe(true);
  });

  it("tolerant read keeps valid items within limits and drops a non-boolean open_first", () => {
    const content: Record<string, unknown> = {
      items: [...items(12), { q: "", a: "x" }, "junk"],
      open_first: "yes",
    };
    faq_definition.prepare_content!(content);
    expect((content.items as unknown[]).length).toBe(10);
    expect(content.open_first).toBeUndefined();
  });

  it("offers align, never an image background, one per page", () => {
    expect(
      faq_definition.style_controls(faq_definition.defaults().style),
    ).toEqual(
      expect.arrayContaining(["background", "width", "spacing", "align"]),
    );
    expect(parse({ items: items(1) }, { bg: "image" }).style.bg).toBe("none");
    expect(faq_definition.style_options.bg).not.toContain("image");
    expect(faq_definition.max_per_page).toBe(1);
  });
});

describe("render_faq", () => {
  it("returns '' without valid items", () => {
    expect(render_faq(raw_section({}), ctx)).toBe("");
    expect(render_faq(raw_section({ items: [] }), ctx)).toBe("");
    expect(
      render_faq(
        raw_section({ items: [{ q: "  ", a: "A" }, { q: "Q?", a: "" }, null] }),
        ctx,
      ),
    ).toBe("");
  });

  it("renders native details with summary, markdown answer and no heading", () => {
    const html = render_faq(
      parse({
        items: [
          {
            q: "How often?",
            a: "**Weekly**, see [plan](https://example.com/p).",
          },
        ],
      }),
      ctx,
    );
    const root = parse_fragment(html);
    const details = root.querySelectorAll("details.section-faq-item");
    expect(details).toHaveLength(1);
    expect(details[0].hasAttribute("open")).toBe(false);
    expect(root.querySelector("summary.section-faq-q")!.textContent).toBe(
      "How often?",
    );
    expect(root.querySelector(".section-faq-a strong")!.textContent).toBe(
      "Weekly",
    );
    expect(root.querySelector(".section-faq-a a")!.getAttribute("href")).toBe(
      "https://example.com/p",
    );
    expect(
      root
        .querySelector("svg.section-faq-chevron")!
        .getAttribute("aria-hidden"),
    ).toBe("true");
    expect(root.querySelector("h2")).toBeNull();
    expect(root.querySelector("details[name]")).toBeNull();
  });

  it("opens only the first rendered item when open_first is set", () => {
    const root = parse_fragment(
      render_faq(
        raw_section({
          items: [{ q: "", a: "skip" }, ...items(2)],
          open_first: true,
        }),
        ctx,
      ),
    );
    const open = Array.from(root.querySelectorAll("details")).map((d) =>
      d.hasAttribute("open"),
    );
    expect(open).toEqual([true, false]);
  });

  it("renders at most 10 items from a hostile config", () => {
    const root = parse_fragment(
      render_faq(raw_section({ items: items(15) }), ctx),
    );
    expect(root.querySelectorAll("details")).toHaveLength(10);
  });

  it("blocks XSS in questions and answers", () => {
    const payload = '<img src=x onerror="alert(1)"><script>alert(1)</script>';
    const html = render_faq(
      raw_section({
        items: [
          { q: payload, a: payload },
          {
            q: "Link?",
            a: "[x](javascript:alert(1)) <iframe src=https://evil.example></iframe>",
          },
        ],
      }),
      ctx,
    );
    const root = parse_fragment(html);
    expect(root.querySelector("img, script, iframe")).toBeNull();
    expect(root.querySelector("summary span")!.textContent).toBe(payload);
    expect(root.querySelector("a")).toBeNull();
    expect(html).not.toContain("<script");
    expect_no_script_vectors(html);
  });

  it("has no inline script or event handlers in a full render", () => {
    const html = render_faq(
      parse(
        { items: items(10), open_first: true },
        { bg: "primary", align: "center" },
      ),
      ctx,
    );
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/ on[a-z]+=/);
    expect(html).not.toContain("<iframe");
  });

  it("applies the align class with a fallback", () => {
    const section = (style: Record<string, unknown>) =>
      parse_fragment(
        render_faq(raw_section({ items: items(1) }, style), ctx),
      ).querySelector("section")!;
    expect(section({ align: "center" }).classList).toContain(
      "section-align-center",
    );
    expect(section({ align: 'x" onclick="a' }).classList).toContain(
      "section-align-start",
    );
    expect(section({}).classList).toContain("section-faq");
  });
});
