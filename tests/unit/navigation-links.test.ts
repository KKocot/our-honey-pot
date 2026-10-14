// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  buildOwnerNavItems,
  createNavigationSettings,
  hasNavigationContent,
  renderNavigation,
  renderNavigationButton,
  renderNavigationButtons,
  renderNavigationItem,
  resolveCta,
  resolveOwnerLink,
  type NavigationTabConfig,
} from "../../src/shared/components/navigation";
import { createOwnerNavConfig } from "../../src/shared/components/navigation/utils";
import type { Cta, Link } from "../../src/components/admin/types/navigation";
import { get_hive_blog_url } from "../../src/lib/config";
import {
  expect_no_script_vectors,
  hrefs_of,
  parse_fragment,
} from "./helpers/html-assert";

const BREAKOUT = `"><img src=x onerror=alert(1)>'\`<script>alert(1)</script>`;

const TABS: NavigationTabConfig[] = [
  { id: "posts", label: "Posts", enabled: true, showCount: false },
  {
    id: "category-photo",
    label: "Photos",
    enabled: true,
    showCount: false,
    tag: "photography",
  },
];

function nav(links: Link[], cta?: Cta, extra: { activeTab?: string } = {}) {
  return renderNavigation(
    createNavigationSettings({
      navigationTabs: TABS,
      activeTab: extra.activeTab ?? "posts",
      links,
      cta,
    }),
  );
}

describe("owner nav links: resolve", () => {
  it("maps page to /p/<slug>, url stays absolute, tag reuses a matching tab", () => {
    expect(
      resolveOwnerLink({ label: "About", kind: "page", target: "about-me" }),
    ).toEqual({ label: "About", href: "/p/about-me", external: false });
    expect(
      resolveOwnerLink({
        label: "Docs",
        kind: "url",
        target: "https://example.com/docs",
      }),
    ).toEqual({
      label: "Docs",
      href: "https://example.com/docs",
      external: true,
    });
    expect(
      resolveOwnerLink(
        { label: "Photos", kind: "tag", target: "photography" },
        TABS,
      ),
    ).toEqual({
      label: "Photos",
      href: "/?tab=category-photo",
      external: false,
      tabId: "category-photo",
    });
  });

  it("links an unmatched tag to its Hive trending page", () => {
    expect(
      resolveOwnerLink(
        { label: "Travel", kind: "tag", target: "travel" },
        TABS,
      ),
    ).toEqual({
      label: "Travel",
      href: `${get_hive_blog_url()}/trending/travel`,
      external: true,
    });
  });

  it("keeps mailto/tel without target=_blank semantics", () => {
    expect(
      resolveOwnerLink({
        label: "Mail",
        kind: "url",
        target: "mailto:me@example.com",
      })?.external,
    ).toBe(false);
    expect(resolveCta({ label: "Call", url: "tel:+48123456789" })).toEqual({
      label: "Call",
      href: "tel:+48123456789",
      external: false,
    });
  });

  it("drops invalid links instead of failing the render", () => {
    const invalid: Link[] = [
      { label: "JS", kind: "url", target: "javascript:alert(1)" },
      { label: "Data", kind: "url", target: "data:text/html,x" },
      { label: "Http", kind: "url", target: "http://example.com" },
      { label: "Slug", kind: "page", target: "../admin" },
      { label: "Tag", kind: "tag", target: "Bad Tag" },
      { label: "  ", kind: "page", target: "about" },
      { label: "Kind", kind: "nope" as Link["kind"], target: "about" },
    ];
    for (const link of invalid) expect(resolveOwnerLink(link)).toBeNull();
    expect(resolveCta({ label: "Go", url: "javascript:alert(1)" })).toBeNull();
  });

  it("caps owner links at 6 and keeps order", () => {
    const links = Array.from({ length: 8 }, (_, i) => ({
      label: `L${i}`,
      kind: "page" as const,
      target: `page-${i}`,
    }));
    const { links: items } = buildOwnerNavItems({ tabs: [], links });
    expect(items.map((item) => item.label)).toEqual([
      "L0",
      "L1",
      "L2",
      "L3",
      "L4",
      "L5",
    ]);
  });

  it("shows the bar for owner content even when every tab is off", () => {
    const off = TABS.map((tab) => ({ ...tab, enabled: false }));
    expect(hasNavigationContent({ tabs: off })).toBe(false);
    expect(
      hasNavigationContent({
        tabs: off,
        cta: { label: "Hire me", url: "https://example.com" },
      }),
    ).toBe(true);
  });
});

describe("owner nav links: render", () => {
  it("keeps the legacy markup when there are no owner links", () => {
    const legacy = renderNavigation(
      createNavigationSettings({ navigationTabs: TABS }),
    );
    expect(nav([])).toBe(legacy);
    expect(legacy).not.toContain("data-nav-links");
  });

  it("renders links after the tabs and the CTA last", () => {
    const html = nav(
      [
        { label: "About", kind: "page", target: "about-me" },
        { label: "Shop", kind: "url", target: "https://shop.example.com" },
      ],
      { label: "Hire me", url: "https://example.com/hire" },
    );
    const root = parse_fragment(html);
    const anchors = Array.from(root.querySelectorAll("nav a"));
    const last = anchors[anchors.length - 1];
    expect(last.hasAttribute("data-nav-cta")).toBe(true);
    expect(last.getAttribute("href")).toBe("https://example.com/hire");

    const desktop = root.querySelector("[data-nav-links]");
    expect(desktop?.className).toContain("hidden");
    expect(desktop?.className).toContain("page-md:flex");
    expect(
      Array.from(desktop?.querySelectorAll("a") ?? []).map((a) =>
        a.getAttribute("href"),
      ),
    ).toEqual(["/p/about-me", "https://shop.example.com/"]);

    const tab_index = html.indexOf('data-tab="posts"');
    expect(tab_index).toBeGreaterThan(-1);
    expect(tab_index).toBeLessThan(html.indexOf("data-nav-links"));
  });

  it("opens external https links in a new tab with noopener noreferrer", () => {
    const html = nav(
      [
        { label: "Shop", kind: "url", target: "https://shop.example.com" },
        { label: "About", kind: "page", target: "about-me" },
        { label: "Mail", kind: "url", target: "mailto:me@example.com" },
      ],
      { label: "Hire", url: "https://example.com" },
    );
    const root = parse_fragment(html);
    for (const a of Array.from(root.querySelectorAll("a"))) {
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("https:")) {
        expect(a.getAttribute("target")).toBe("_blank");
        expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      } else {
        expect(a.hasAttribute("target")).toBe(false);
      }
    }
  });

  it("marks a tag link that maps to the active tab as current", () => {
    const html = nav(
      [{ label: "Photos", kind: "tag", target: "photography" }],
      undefined,
      { activeTab: "category-photo" },
    );
    const link = parse_fragment(html).querySelector(
      "[data-nav-links] a[data-nav-link]",
    );
    expect(link?.getAttribute("aria-current")).toBe("page");
    expect(link?.getAttribute("href")).toBe("/?tab=category-photo");
  });

  it("renders the same owner markup in the canvas button variant", () => {
    const settings = createNavigationSettings({
      navigationTabs: TABS,
      links: [{ label: "About", kind: "page", target: "about-me" }],
      cta: { label: "Hire", url: "https://example.com" },
    });
    const html = renderNavigationButtons(settings);
    expect(html).toContain("data-nav-links");
    expect(html).toContain("data-nav-cta");
    expect(hrefs_of(html)).toContain("/p/about-me");
  });
});

describe("owner nav links: mobile menu", () => {
  const html = nav(
    [
      { label: "About", kind: "page", target: "about-me" },
      { label: "Shop", kind: "url", target: "https://shop.example.com" },
    ],
    { label: "Hire me", url: "https://example.com/hire" },
  );
  const root = parse_fragment(html);

  it("puts links in a no-JS <details> menu hidden from page-md up", () => {
    const details = root.querySelector("details[data-nav-menu]");
    expect(details).not.toBeNull();
    expect(details?.className).toContain("page-md:hidden");
    const summary = details?.querySelector("summary");
    const menu_id = summary?.getAttribute("aria-controls");
    expect(menu_id).toBeTruthy();
    const menu = root.querySelector(`#${menu_id}`);
    expect(menu?.closest("details")).toBe(details);
    expect(menu?.querySelectorAll("a").length).toBe(2);
    expect(summary?.textContent).toContain("Open menu");
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(root.querySelectorAll("script").length).toBe(0);
  });

  it("keeps the CTA outside the menu so it stays visible next to the toggle", () => {
    const cta = root.querySelector("[data-nav-cta]");
    expect(cta?.closest("details")).toBeNull();
    expect(cta?.className).not.toContain("hidden");
    expect(cta?.parentElement).toBe(
      root.querySelector("details")?.parentElement,
    );
  });

  it("omits the menu toggle when there is only a CTA", () => {
    const only_cta = parse_fragment(
      nav([], { label: "Hire me", url: "https://example.com" }),
    );
    expect(only_cta.querySelector("details")).toBeNull();
    expect(only_cta.querySelector("[data-nav-cta]")).not.toBeNull();
  });

  it("uses a custom menu id and localizes the toggle label", () => {
    const pl = renderNavigation(
      createNavigationSettings({
        navigationTabs: TABS,
        links: [{ label: "O mnie", kind: "page", target: "o-mnie" }],
        menuId: "nav-menu-2",
        locale: "pl",
      }),
    );
    const fragment = parse_fragment(pl);
    expect(fragment.querySelector("#nav-menu-2")).not.toBeNull();
    expect(fragment.querySelector("summary")?.textContent).toContain(
      "Otwórz menu",
    );
  });
});

describe("owner nav links: XSS", () => {
  it("escapes labels, CTA and menu id", () => {
    const html = renderNavigation(
      createNavigationSettings({
        navigationTabs: TABS,
        links: [
          { label: BREAKOUT, kind: "page", target: "about-me" },
          {
            label: "Ok",
            kind: "url",
            target: `https://example.com/${BREAKOUT}`,
          },
        ],
        cta: { label: BREAKOUT, url: "https://example.com" },
        menuId: BREAKOUT,
      }),
    );
    expect_no_script_vectors(html);
    const root = parse_fragment(html);
    expect(root.querySelectorAll("img").length).toBe(0);
    expect(root.querySelector("[data-nav-cta]")?.textContent).toBe(
      Array.from(BREAKOUT).slice(0, 24).join(""),
    );
  });

  it("never emits javascript:/data: hrefs from owner config", () => {
    const html = nav(
      [
        { label: "A", kind: "url", target: "javascript:alert(1)" },
        { label: "B", kind: "url", target: " JaVaScRiPt:alert(1)" },
        { label: "C", kind: "page", target: "javascript:alert(1)" },
        { label: "D", kind: "tag", target: '"><script>' },
      ],
      { label: "E", url: "data:text/html,<script>alert(1)</script>" },
    );
    expect_no_script_vectors(html);
    expect(html).not.toContain("data-nav-links");
    expect(html).not.toContain("data-nav-cta");
  });

  it("tolerates malformed untrusted shapes", () => {
    const garbage = [
      null,
      42,
      { label: 1, kind: "url", target: "https://example.com" },
      { label: "x", kind: "url", target: 7 },
    ] as unknown as Link[];
    expect(buildOwnerNavItems({ tabs: [], links: garbage }).links).toEqual([]);
    expect(
      buildOwnerNavItems({
        tabs: [],
        links: "nope" as unknown as Link[],
        cta: "nope" as unknown as Cta,
      }),
    ).toEqual({ links: [], cta: null });
  });
});

describe("disabled tab tooltip placement", () => {
  const DISABLED = {
    id: "threads",
    label: "Threads",
    href: "/?tab=threads",
    disabled: true,
    tooltip: "Soon",
  };

  function tooltip_classes(html: string): string[] {
    const tooltip = parse_fragment(html).querySelector(
      "[data-tab='threads'] > span.absolute",
    );
    expect(tooltip).not.toBeNull();
    return Array.from(tooltip!.classList);
  }

  it("anchors by the tab place, not by :last-child, so owner links after the tabs do not shift it", () => {
    for (const render of [renderNavigationItem, renderNavigationButton]) {
      const last = tooltip_classes(render(DISABLED, false, "last"));
      expect(last).toContain("right-0");
      expect(last).not.toContain("left-1/2");
      expect(last.some((name) => name.includes(":last-child"))).toBe(false);

      const first = tooltip_classes(render(DISABLED, false, "first"));
      expect(first).toContain("left-0");
      expect(first).not.toContain("-translate-x-1/2");

      const middle = tooltip_classes(render(DISABLED, false, "middle"));
      expect(middle).toEqual(
        expect.arrayContaining(["left-1/2", "-translate-x-1/2"]),
      );
      expect(middle.some((name) => name.includes("-child"))).toBe(false);
    }
  });

  it("keeps the structural fallback when the place is unknown", () => {
    expect(tooltip_classes(renderNavigationItem(DISABLED, false))).toContain(
      "[:last-child>&]:right-0",
    );
  });
});

describe("owner nav links: derived from pages", () => {
  function page(slug: string, title: string, in_nav = true) {
    return { slug, title, in_nav };
  }

  function owner_link(index: number): Link {
    return {
      label: `Link ${index}`,
      kind: "url",
      target: `https://example.com/${index}`,
    };
  }

  it("appends pages with in_nav as /p/<slug> links after owner links", () => {
    const config = createOwnerNavConfig({
      nav: { links: [owner_link(1)] },
      pages: [page("about", "About me"), page("contact", "Contact", false)],
    });
    expect(config.links).toEqual([
      owner_link(1),
      { label: "About me", kind: "page", target: "about" },
    ]);
    const items = buildOwnerNavItems({ tabs: TABS, links: config.links });
    expect(items.links.map((item) => item.href)).toEqual([
      "https://example.com/1",
      "/p/about",
    ]);
  });

  it("caps the total at 6 and keeps owner links first", () => {
    const owner_links = [1, 2, 3, 4, 5].map(owner_link);
    const config = createOwnerNavConfig({
      nav: { links: owner_links },
      pages: [page("first", "First"), page("second", "Second")],
    });
    expect(config.links).toHaveLength(6);
    expect(config.links?.slice(0, 5)).toEqual(owner_links);
    expect(config.links?.[5]).toMatchObject({ target: "first" });
  });

  it("skips pages the owner already links to", () => {
    const config = createOwnerNavConfig({
      nav: { links: [{ label: "Bio", kind: "page", target: "about" }] },
      pages: [page("about", "About me")],
    });
    expect(config.links).toEqual([
      { label: "Bio", kind: "page", target: "about" },
    ]);
  });

  it("works without owner links and truncates long titles to the label limit", () => {
    const config = createOwnerNavConfig({
      pages: [page("privacy", "A very long privacy policy page title")],
    });
    expect(config.links).toEqual([
      { label: "A very long privacy poli", kind: "page", target: "privacy" },
    ]);
  });

  it("keeps the owner links untouched without pages", () => {
    const links = [owner_link(1)];
    expect(createOwnerNavConfig({ nav: { links } }).links).toBe(links);
    expect(createOwnerNavConfig({ nav: { links }, pages: [] }).links).toBe(
      links,
    );
  });

  it("renders derived links in the nav HTML", () => {
    const config = createOwnerNavConfig({ pages: [page("about", "About")] });
    expect(hrefs_of(nav(config.links ?? []))).toContain("/p/about");
  });
});
