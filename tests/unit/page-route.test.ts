// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  resolve_static_page,
  resolve_static_page_chrome,
} from "../../src/lib/ssr/resolve-static-page";
import type { PageDef } from "../../src/components/admin/types/settings";
import type { PageLayoutSection } from "../../src/components/admin/types/layout";

function page(slug: string, title = "Title"): PageDef {
  return {
    slug,
    title,
    body_md: "Body",
    in_nav: false,
    in_footer: "none",
    footer_column: 0,
  };
}

const settings = { pages: [page("about", "About"), page("privacy-policy")] };

describe("resolve_static_page", () => {
  it("returns 200 with the page for a known slug", () => {
    const result = resolve_static_page(settings, "about");
    expect(result.status).toBe(200);
    expect(result.status === 200 && result.page.title).toBe("About");
    expect(resolve_static_page(settings, "privacy-policy").status).toBe(200);
  });

  it("returns 404 for an unknown slug", () => {
    expect(resolve_static_page(settings, "contact")).toEqual({ status: 404 });
  });

  it("returns 404 when the blog has no pages", () => {
    expect(resolve_static_page({}, "about")).toEqual({ status: 404 });
    expect(resolve_static_page({ pages: null }, "about")).toEqual({
      status: 404,
    });
  });

  it.each([
    undefined,
    "",
    "a",
    "About",
    "about/team",
    "-about",
    "about--us",
    "../admin",
    "@alice",
    "about.html",
    "x".repeat(41),
  ])("returns 404 for the malformed slug %j", (slug) => {
    const with_bad = { pages: [...settings.pages, page(slug ?? "")] };
    expect(resolve_static_page(with_bad, slug)).toEqual({ status: 404 });
  });

  it.each(["admin", "api", "rss", "login", "feed"])(
    "returns 404 for the reserved slug %s even if a page claims it",
    (slug) => {
      expect(resolve_static_page({ pages: [page(slug)] }, slug)).toEqual({
        status: 404,
      });
    },
  );
});

describe("resolve_static_page_chrome", () => {
  function section(
    slot: PageLayoutSection["slot"],
    elements: string[],
    active = true,
  ): PageLayoutSection {
    return {
      id: `${slot}-1`,
      slot,
      orientation: "horizontal",
      elements,
      active,
    };
  }

  it("shows the header from the top slot and the footer from the bottom slot", () => {
    expect(
      resolve_static_page_chrome([
        section("top", ["header", "navigation"]),
        section("main", ["posts"]),
        section("bottom", ["footer"]),
      ]),
    ).toEqual({ header: true, footer: true });
  });

  it("hides chrome that is inactive, missing or only in a sidebar", () => {
    expect(
      resolve_static_page_chrome([
        section("top", ["header"], false),
        section("sidebar-left", ["header", "footer"]),
      ]),
    ).toEqual({ header: false, footer: false });
  });
});
