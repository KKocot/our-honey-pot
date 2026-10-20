// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  NOW_PLACEHOLDER_ITEMS,
  now_definition,
} from "../../src/shared/components/sections/now/definition";
import {
  render_now,
  type NowSection,
} from "../../src/shared/components/sections/now/render";
import { unfilled_paths } from "../../src/shared/components/sections/registry-types";
import { create_section_context } from "../../src/shared/components/sections/utils";
import { t } from "../../src/lib/i18n";
import { section_content_issues } from "../../src/components/admin/canvas/home-section-ops";
import {
  expect_no_script_vectors,
  parse_fragment,
} from "./helpers/html-assert";

const ID = "now00001";

function now_section(
  content: Record<string, unknown>,
  style: Record<string, unknown> = {},
): NowSection {
  return { id: ID, type: "now", content, style } as unknown as NowSection;
}

function render(section: NowSection, locale = "en"): string {
  return render_now(section, create_section_context({}, locale));
}

const items = (...texts: string[]) => texts.map((text) => ({ text }));

describe("now definition", () => {
  it("accepts a filled section and applies style defaults", () => {
    const parsed = now_definition.schema.parse({
      id: ID,
      type: "now",
      content: { updated_at: "2026-10-20", items: items("Writing a book") },
      style: {},
    });
    expect(parsed.content.items).toEqual([{ text: "Writing a book" }]);
    expect(parsed.style.align).toBe("start");
    expect(parsed.style.width).toBe("content");
  });

  it("rejects more than 8 items", () => {
    const nine = items(...Array.from({ length: 9 }, (_, i) => `Item ${i}`));
    expect(
      now_definition.content_schema.safeParse({
        updated_at: "2026-10-20",
        items: nine,
      }).success,
    ).toBe(false);
    expect(
      now_definition.content_schema.safeParse({
        updated_at: "2026-10-20",
        items: nine.slice(0, 8),
      }).success,
    ).toBe(true);
  });

  it.each([
    "2026-02-30",
    "2026-13-01",
    "20-10-2026",
    "2026-10-20T10:00:00Z",
    "yesterday",
    "",
  ])("rejects invalid date %s", (updated_at) => {
    const result = now_definition.content_schema.safeParse({
      updated_at,
      items: items("Reading"),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an item over the character limit", () => {
    const long = "x".repeat(now_definition.text_limits.item_chars + 1);
    expect(
      now_definition.content_schema.safeParse({ items: items(long) }).success,
    ).toBe(false);
  });

  it("blocks Save of an untouched new section", () => {
    const fresh = now_definition.defaults();
    expect(fresh.content.items).toEqual(items(...NOW_PLACEHOLDER_ITEMS));
    expect(unfilled_paths(now_definition, fresh.content)).toEqual([
      "items.0.text",
      "items.1.text",
      "items.2.text",
      "items.3.text",
      "updated_at",
    ]);
  });

  it("still blocks Save when only the date is set and an example line stays", () => {
    const content = {
      updated_at: "2026-10-20",
      items: items("Learning Rust", NOW_PLACEHOLDER_ITEMS[1]),
    };
    expect(unfilled_paths(now_definition, content)).toEqual(["items.1.text"]);
    expect(section_content_issues(now_definition, content)).toEqual([
      "replace the placeholder text in item 2",
    ]);
    expect(now_definition.content_schema.safeParse(content).success).toBe(true);
    const own = { updated_at: "2026-10-20", items: items("Learning Rust") };
    expect(unfilled_paths(now_definition, own)).toEqual([]);
    expect(section_content_issues(now_definition, own)).toEqual([]);
  });

  it("tolerant reader keeps valid and example items and drops a broken date", () => {
    const raw: Record<string, unknown> = {
      updated_at: "not-a-date",
      items: [
        { text: "Reading" },
        { text: 42 },
        null,
        { text: NOW_PLACEHOLDER_ITEMS[0] },
        { text: "Hiking" },
      ],
    };
    now_definition.prepare_content?.(raw);
    expect(raw.items).toEqual(
      items("Reading", NOW_PLACEHOLDER_ITEMS[0], "Hiking"),
    );
    expect(raw).not.toHaveProperty("updated_at");
    expect(now_definition.content_schema.safeParse(raw).success).toBe(true);
  });

  it("never offers an image background", () => {
    expect(now_definition.style_options.bg).not.toContain("image");
    expect(now_definition.style_schema.parse({ bg: "image" }).bg).toBe("none");
  });
});

describe("render_now", () => {
  it("formats the date in English inside <time datetime>", () => {
    const root = parse_fragment(
      render(
        now_section({ updated_at: "2026-10-20", items: items("Reading") }),
        "en",
      ),
    );
    const time = root.querySelector(".section-now-updated time");
    expect(time?.getAttribute("datetime")).toBe("2026-10-20");
    expect(time?.textContent).toBe("October 20, 2026");
    expect(root.querySelector(".section-now-updated")?.textContent).toContain(
      t("en", "section.now.updated"),
    );
  });

  it("formats the date in Polish inside <time datetime>", () => {
    const root = parse_fragment(
      render(
        now_section({ updated_at: "2026-01-05", items: items("Czytam") }),
        "pl",
      ),
    );
    const time = root.querySelector(".section-now-updated time");
    expect(time?.getAttribute("datetime")).toBe("2026-01-05");
    expect(time?.textContent).toBe("5 stycznia 2026");
    expect(root.querySelector(".section-now-updated")?.textContent).toContain(
      "Zaktualizowano",
    );
  });

  it("names the section with a localized h2", () => {
    for (const [locale, title] of [
      ["en", "Now"],
      ["pl", "Teraz"],
    ] as const) {
      const root = parse_fragment(
        render(now_section({ items: items("Reading") }), locale),
      );
      const heading = root.querySelector(".section-now-head h2");
      expect(heading?.textContent).toBe(title);
      expect(heading?.textContent).toBe(t(locale, "section.now.title"));
      expect(heading?.id).toBe(`s-${ID}-title`);
      expect(
        root.querySelector("section")?.getAttribute("aria-labelledby"),
      ).toBe(`s-${ID}-title`);
    }
  });

  it("renders the list without the date line when the date is missing or invalid", () => {
    for (const updated_at of [undefined, "2026-02-30"]) {
      const root = parse_fragment(
        render(now_section({ updated_at, items: items("Reading") })),
      );
      expect(root.querySelector(".section-now-updated")).toBeNull();
      expect(root.querySelectorAll(".section-now-item")).toHaveLength(1);
    }
  });

  it("escapes item text", () => {
    const html = render(
      now_section({
        items: items(
          '<img src=x onerror="alert(1)">',
          "<script>alert(1)</script> & co",
        ),
      }),
    );
    expect_no_script_vectors(html);
    const root = parse_fragment(html);
    expect(root.querySelector("img")).toBeNull();
    const texts = Array.from(
      root.querySelectorAll(".section-now-item"),
      (li) => li.textContent,
    );
    expect(texts).toEqual([
      '<img src=x onerror="alert(1)">',
      "<script>alert(1)</script> & co",
    ]);
  });

  it("returns '' for empty data", () => {
    expect(render(now_section({ items: [] }))).toBe("");
    expect(
      render(now_section({ updated_at: "2026-10-20", items: items("  ", "") })),
    ).toBe("");
    expect(render(now_section({ updated_at: "2026-10-20" }))).toBe("");
  });

  it("caps the list at 8 items and skips blank ones", () => {
    const many = items(
      "",
      ...Array.from({ length: 10 }, (_, i) => `Item ${i}`),
    );
    const root = parse_fragment(render(now_section({ items: many })));
    expect(root.querySelectorAll(".section-now-item")).toHaveLength(8);
    expect(root.querySelector(".section-now-item")?.textContent).toBe("Item 0");
  });

  it("uses the shell, list semantics and a clamped align class", () => {
    const html = render(
      now_section({ items: items("Reading") }, { align: "center" }),
    );
    const section = parse_fragment(html).querySelector("section");
    expect(section?.getAttribute("data-section-type")).toBe("now");
    expect(section?.id).toBe(`s-${ID}`);
    expect(section?.classList.contains("section-align-center")).toBe(true);
    expect(
      section?.querySelector("ul.section-now-list")?.getAttribute("role"),
    ).toBe("list");

    const fallback = parse_fragment(
      render(now_section({ items: items("Reading") }, { align: "evil" })),
    );
    expect(
      fallback
        .querySelector("section")
        ?.classList.contains("section-align-start"),
    ).toBe(true);
  });
});
