// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it, vi } from "vitest";

// lucide-solid runs client-only code at import; the icons are irrelevant for this logic.
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
  CHOOSE_PAGE_LABEL,
  NO_PAGES_LABEL,
  PAGE_NOT_FOUND,
  is_missing_page,
  page_link_options,
  target_for_kind,
} from "../../src/components/admin/canvas/popovers/PageLinkSelect";

const PAGES = [
  { slug: "about", title: "About me" },
  { slug: "contact", title: "Contact" },
];

describe("page_link_options", () => {
  it("lists pages with title as label and slug as value", () => {
    const options = page_link_options("about", PAGES);
    expect(options).toEqual([
      { value: "about", label: "About me", disabled: false },
      { value: "contact", label: "Contact", disabled: false },
    ]);
  });

  it("adds a disabled placeholder when no page is chosen yet", () => {
    const options = page_link_options("", PAGES);
    expect(options[0]).toEqual({
      value: "",
      label: CHOOSE_PAGE_LABEL,
      disabled: true,
    });
    expect(options).toHaveLength(3);
  });

  it("shows a single disabled 'No pages yet' option without pages", () => {
    expect(page_link_options("", [])).toEqual([
      { value: "", label: NO_PAGES_LABEL, disabled: true },
    ]);
    expect(page_link_options("", undefined)).toEqual([
      { value: "", label: NO_PAGES_LABEL, disabled: true },
    ]);
  });

  it("keeps a missing slug visible as a disabled option", () => {
    const options = page_link_options("old-page", PAGES);
    expect(options[0]).toEqual({
      value: "old-page",
      label: `old-page (${PAGE_NOT_FOUND.toLowerCase()})`,
      disabled: true,
    });
    expect(options.slice(1).map((option) => option.value)).toEqual([
      "about",
      "contact",
    ]);
  });

  it("keeps a missing slug visible when there are no pages at all", () => {
    expect(page_link_options("gone", [])).toEqual([
      { value: "gone", label: "gone (page not found)", disabled: true },
    ]);
  });
});

describe("is_missing_page", () => {
  it("flags slugs outside pages", () => {
    expect(is_missing_page("old-page", PAGES)).toBe(true);
    expect(is_missing_page("gone", undefined)).toBe(true);
  });

  it("accepts existing slugs and the empty draft", () => {
    expect(is_missing_page("contact", PAGES)).toBe(false);
    expect(is_missing_page("", PAGES)).toBe(false);
    expect(is_missing_page("", [])).toBe(false);
  });
});

describe("target_for_kind", () => {
  it("leaves the target empty instead of picking a page when switching to page", () => {
    expect(target_for_kind("page", "https://example.com", PAGES)).toBe("");
  });

  it("keeps an existing slug when switching to page", () => {
    expect(target_for_kind("page", "contact", PAGES)).toBe("contact");
  });

  it("clears the target when switching to page without pages", () => {
    expect(target_for_kind("page", "photography", [])).toBe("");
    expect(target_for_kind("page", "photography", undefined)).toBe("");
  });

  it("leaves non-page targets untouched", () => {
    expect(target_for_kind("url", "about", PAGES)).toBe("about");
    expect(target_for_kind("tag", "photography", PAGES)).toBe("photography");
  });
});
