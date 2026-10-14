// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it, vi } from "vitest";

// lucide-solid runs client-only code at import; the icons are irrelevant for this pure logic.
vi.mock(
  "lucide-solid",
  () =>
    new Proxy(
      {},
      {
        get: (_target, key) => (key === "then" ? undefined : () => null),
        has: () => true,
      },
    ),
);
import {
  auto_slug,
  budget_status,
  create_page,
  format_kib,
  largest_page_index,
  move_page,
  page_body_bytes,
  page_footer_slot,
  page_link_count,
  page_link_save_errors,
  page_nav_slot,
  page_save_errors,
  pages_body_bytes,
  retarget_page_links,
  slug_after_retitle,
  slug_issue,
  slugify_title,
  utf8_bytes,
} from "../../src/components/admin/settings/PagesSettings/page-model";
import { save_status_text } from "../../src/components/admin/panels/AdminPanel/EditorTopBar";
import {
  PAGES_LIMITS,
  type FooterSettings,
  type PageDef,
} from "../../src/components/admin/types/settings";
import type { Link } from "../../src/components/admin/types/navigation";

function page(overrides: Partial<PageDef> = {}): PageDef {
  return { ...create_page(), slug: "about", title: "About", ...overrides };
}

describe("slugify_title", () => {
  it("transliterates Polish letters", () => {
    expect(slugify_title("Zażółć gęślą jaźń")).toBe("zazolc-gesla-jazn");
    expect(slugify_title("ŁÓDŹ Ćma Ńą Śl")).toBe("lodz-cma-na-sl");
  });

  it("strips other diacritics and collapses separators", () => {
    expect(slugify_title("  Café -- crème & Co.  ")).toBe("cafe-creme-co");
    expect(slugify_title("O mnie!!!")).toBe("o-mnie");
    expect(slugify_title("!!!")).toBe("");
  });

  it("caps the slug at 40 characters without a trailing hyphen", () => {
    const slug = slugify_title(`${"a".repeat(39)} bcd`);
    expect(slug).toBe("a".repeat(39));
    expect(slugify_title("x".repeat(60))).toHaveLength(40);
  });
});

describe("slug_issue (live validation)", () => {
  it("accepts a valid unique slug", () => {
    expect(slug_issue("o-mnie", ["kontakt"])).toBeNull();
  });

  it("reports empty, length, format, reserved and duplicate slugs", () => {
    expect(slug_issue("", [])).toBe("Add a slug.");
    expect(slug_issue("a", [])).toBe("Slug must be 2-40 characters.");
    expect(slug_issue("a".repeat(41), [])).toBe(
      "Slug must be 2-40 characters.",
    );
    expect(slug_issue("O-mnie", [])).toMatch(/a-z, 0-9/);
    expect(slug_issue("a--b", [])).toMatch(/single hyphens/);
    expect(slug_issue("admin", [])).toBe("Slug is reserved.");
    expect(slug_issue("rss", [])).toBe("Slug is reserved.");
    expect(slug_issue("o-mnie", ["o-mnie"])).toBe(
      "Another page already uses this slug.",
    );
  });
});

describe("auto_slug", () => {
  it("makes the slug unique and avoids reserved slugs", () => {
    expect(auto_slug("O mnie", [])).toBe("o-mnie");
    expect(auto_slug("O mnie", ["o-mnie"])).toBe("o-mnie-2");
    expect(auto_slug("O mnie", ["o-mnie", "o-mnie-2"])).toBe("o-mnie-3");
    expect(auto_slug("Admin", [])).toBe("admin-2");
    expect(auto_slug("?", [])).toBe("");
  });

  it("keeps a suffixed slug within 40 characters", () => {
    const base = "a".repeat(40);
    const slug = auto_slug(base, [base]);
    expect(slug).toHaveLength(40);
    expect(slug.endsWith("-2")).toBe(true);
  });
});

describe("slug_after_retitle", () => {
  it("follows the title while the slug is generated", () => {
    expect(slug_after_retitle({ title: "", slug: "" }, "Kontakt", [])).toBe(
      "kontakt",
    );
    expect(
      slug_after_retitle(
        { title: "Kontakt", slug: "kontakt" },
        "Kontakt z nami",
        [],
      ),
    ).toBe("kontakt-z-nami");
  });

  it("keeps a slug edited by hand", () => {
    expect(
      slug_after_retitle(
        { title: "Kontakt", slug: "napisz" },
        "Kontakt z nami",
        [],
      ),
    ).toBe("napisz");
  });
});

describe("byte counters", () => {
  it("counts UTF-8 bytes, not characters", () => {
    expect(utf8_bytes("abc")).toBe(3);
    expect(utf8_bytes("żółć")).toBe(8);
    expect(page_body_bytes({ body_md: "ą" })).toBe(2);
    expect(
      pages_body_bytes([{ body_md: "ab" }, { body_md: "ę" }, { body_md: "" }]),
    ).toBe(4);
  });

  it("formats KiB with one decimal, none when whole", () => {
    expect(format_kib(9318)).toBe("9.1");
    expect(format_kib(14336)).toBe("14");
    expect(format_kib(0)).toBe("0");
  });

  it("reports aggregate thresholds with text, not only colour", () => {
    const max = PAGES_LIMITS.total_body_bytes;
    expect(budget_status(9318, max)).toEqual({
      tone: "normal",
      label: "9.1 / 14 KiB",
      message: "",
    });
    const warn = budget_status(Math.ceil(max * 0.9), max);
    expect(warn.tone).toBe("warn");
    expect(warn.message).toBe("Close to the limit.");
    expect(budget_status(max, max)).toMatchObject({
      tone: "limit",
      message: "Limit reached.",
    });
    expect(budget_status(max + 10, max)).toMatchObject({
      tone: "limit",
      message: "Over the limit by 10 B. Shorten the text to save.",
    });
  });
});

describe("move_page", () => {
  it("moves a page and ignores out-of-range moves", () => {
    expect(move_page(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(move_page(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    expect(move_page(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });
});

describe("page_save_errors", () => {
  it("is empty without pages or with valid pages", () => {
    expect(page_save_errors({})).toEqual([]);
    expect(page_save_errors({ pages: [] })).toEqual([]);
    expect(
      page_save_errors({
        pages: [
          page(),
          page({ slug: "kontakt", title: "Kontakt", body_md: "## Hi" }),
        ],
      }),
    ).toEqual([]);
  });

  it("blocks a new empty page until it has a title and a slug", () => {
    const errors = page_save_errors({ pages: [page(), create_page()] });
    expect(errors).toHaveLength(1);
    expect(errors[0].page_index).toBe(1);
    expect(errors[0].message).toContain("Untitled page (page 2)");
    expect(errors[0].message).toContain("Title: add a title");
    expect(errors[0].message).toContain("Slug: Slug must be 2-40 characters");
  });

  it("reports reserved and duplicate slugs on the page that has them", () => {
    const errors = page_save_errors({
      pages: [
        page(),
        page({ title: "Again" }),
        page({ slug: "admin", title: "Panel" }),
      ],
    });
    expect(errors).toEqual([
      {
        page_index: 1,
        message: '"Again" (page 2): Slug: another page already uses this slug',
      },
      { page_index: 2, message: '"Panel" (page 3): Slug: Slug is reserved' },
    ]);
  });

  it("reports per-page and aggregate byte budgets", () => {
    const big = "ż".repeat(3000);
    const errors = page_save_errors({
      pages: [
        page({ slug: "a1", body_md: "x".repeat(PAGES_LIMITS.body_bytes + 1) }),
        page({ slug: "a2", body_md: big }),
        page({ slug: "a3", body_md: big }),
      ],
    });
    expect(errors[0]).toMatchObject({ page_index: 0 });
    expect(errors[0].message).toContain(
      "Content: Markdown must be at most 6144 bytes",
    );
    const aggregate = errors.at(-1);
    expect(aggregate?.message).toMatch(
      /^Pages: content is 17.7 KiB, limit is 14 KiB$/,
    );
    expect(aggregate?.page_index).toBe(0);
  });

  it("reports too many pages", () => {
    const pages = Array.from(
      { length: PAGES_LIMITS.max_pages + 1 },
      (_, index) => page({ slug: `page-${index}`, title: `Page ${index}` }),
    );
    const errors = page_save_errors({ pages });
    expect(errors).toEqual([
      {
        page_index: PAGES_LIMITS.max_pages,
        message: "Pages: at most 6 pages, delete 1",
      },
    ]);
  });

  it("points the budget error at the largest page", () => {
    expect(
      largest_page_index([
        page({ body_md: "a" }),
        page({ body_md: "żż" }),
        page({ body_md: "abc" }),
      ]),
    ).toBe(1);
  });
});

describe("save_status_text with page issues", () => {
  const base = {
    status: "dirty" as const,
    unsaved_count: 1,
    blocked_message: null,
    loading: false,
    authenticated: true,
    is_owner: true,
  };

  it("names page issues and combines them with section issues", () => {
    expect(save_status_text({ ...base, page_error_count: 1 })).toBe(
      "Can't save: 1 page issue to fix",
    );
    expect(save_status_text({ ...base, page_error_count: 2 })).toBe(
      "Can't save: 2 page issues to fix",
    );
    expect(
      save_status_text({
        ...base,
        section_error_count: 1,
        page_error_count: 2,
      }),
    ).toBe("Can't save: 3 issues to fix");
  });
});

function page_link(target: string, label = "About"): Link {
  return { label, kind: "page", target };
}

function footer(overrides: Partial<FooterSettings> = {}): FooterSettings {
  return { variant: "inline", columns: [], legal_links: [], show_social: false, ...overrides };
}

describe("page links in nav and footer", () => {
  const linked = {
    nav: { links: [page_link("about"), { label: "Blog", kind: "url" as const, target: "https://example.com" }] },
    footer: footer({
      columns: [{ title: "More", links: [page_link("about"), page_link("contact", "Contact")] }],
      legal_links: [page_link("about")],
      privacy: page_link("about", "Privacy"),
    }),
  };

  it("counts owner links to a slug", () => {
    expect(page_link_count(linked, "about")).toBe(4);
    expect(page_link_count(linked, "contact")).toBe(1);
    expect(page_link_count(linked, "")).toBe(0);
  });

  it("retargets every link of a renamed page", () => {
    const patch = retarget_page_links(linked, "about", "about-me");
    expect(patch?.nav.links.map((link) => link.target)).toEqual(["about-me", "https://example.com"]);
    expect(patch?.footer.columns[0].links.map((link) => link.target)).toEqual(["about-me", "contact"]);
    expect(patch?.footer.legal_links[0].target).toBe("about-me");
    expect(patch?.footer.privacy?.target).toBe("about-me");
  });

  it("removes the links of a deleted page, privacy included", () => {
    const patch = retarget_page_links(linked, "about", null);
    expect(patch?.nav.links).toHaveLength(1);
    expect(patch?.footer.columns[0].links.map((link) => link.target)).toEqual(["contact"]);
    expect(patch?.footer.legal_links).toEqual([]);
    expect(patch?.footer.privacy).toBeUndefined();
    expect("privacy" in (patch?.footer ?? {})).toBe(false);
  });

  it("returns null when nothing links to the slug", () => {
    expect(retarget_page_links(linked, "missing", "other")).toBeNull();
  });

  it("lists dangling and empty page links as Save blockers", () => {
    expect(page_link_save_errors({ ...linked, pages: [page(), page({ slug: "contact", title: "Contact" })] })).toEqual([]);
    expect(
      page_link_save_errors({
        nav: { links: [page_link("gone", "Old"), page_link("", " ")] },
        footer: footer({ privacy: page_link("gone", "Privacy") }),
        pages: [page()],
      }),
    ).toEqual([
      { area: "navigation", message: 'Menu link "Old": page "gone" not found' },
      { area: "navigation", message: "Menu link: choose a page" },
      { area: "footer", message: 'Privacy policy link: page "gone" not found' },
    ]);
  });
});

describe("menu and footer slots", () => {
  it("reports a full menu that hides an in_nav page", () => {
    const links = Array.from({ length: 6 }, (_, index) => ({
      label: `L${index}`,
      kind: "url" as const,
      target: `https://example.com/${index}`,
    }));
    const pages = [page({ in_nav: true })];
    expect(page_nav_slot({ nav: { links }, pages }, "about")).toEqual({ used: 6, max: 6, shown: false });
    expect(page_nav_slot({ nav: { links: links.slice(0, 2) }, pages }, "about")).toEqual({
      used: 3,
      max: 6,
      shown: true,
    });
  });

  it("reports the column or bottom row the page is placed in", () => {
    const full_column = { title: "", links: Array.from({ length: 4 }, (_, index) => page_link(`p-${index}`)) };
    const in_column = page({ in_footer: "column", footer_column: 0 });
    expect(page_footer_slot({ footer: footer({ columns: [full_column] }), pages: [in_column] }, in_column)).toEqual({
      used: 4,
      max: 4,
      shown: false,
    });
    const in_legal = page({ in_footer: "legal" });
    expect(page_footer_slot({ footer: footer(), pages: [in_legal] }, in_legal)).toEqual({
      used: 1,
      max: 3,
      shown: true,
    });
    expect(page_footer_slot({ footer: footer(), pages: [page()] }, page())).toBeNull();
  });
});
