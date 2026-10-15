// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createHeaderData,
  renderHeader,
  renderHeaderBottom,
  renderHeaderCompact,
  renderSiteHeader,
  resolveHeaderVariant,
} from "../../src/shared/components/header";
import {
  createSiteHeaderData,
  resolveSiteDescription,
  resolveSiteName,
  type SiteIdentityContext,
} from "../../src/shared/components/header/utils";
import { renderSiteTopbar } from "../../src/shared/components/navigation/render";
import { home_hero_shown } from "../../src/shared/components/sections";
import { resolve_instance_settings } from "../../src/lib/instance-overrides";
import {
  MAIN_SECTION_ID,
  type PageSlotPosition,
} from "../../src/components/admin/types/layout";
import {
  SECTION_STYLE_DEFAULTS,
  get_default_settings,
  type HomeSection,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import { parse_fragment } from "./helpers/html-assert";

const SLOTS: PageSlotPosition[] = [
  "top",
  "sidebar-left",
  "main",
  "sidebar-right",
  "bottom",
];

const COMMUNITY: SiteIdentityContext = {
  community_title: "Hive Bees",
  community_about: "A community about bees",
};

const HERO: HomeSection = {
  id: "hero0001",
  type: "hero",
  content: { headline: "Welcome to the hive" },
  style: { ...SECTION_STYLE_DEFAULTS.common, ...SECTION_STYLE_DEFAULTS.hero },
} as HomeSection;

function community_settings(extra: Partial<SettingsData> = {}): SettingsData {
  return {
    ...get_default_settings(true),
    hiveUsername: "hive-123456",
    ...extra,
  };
}

// SlotRenderer.astro: index.astro resolves name/description first, then the slot picks the variant.
function ssr_header(
  settings: SettingsData,
  slot: PageSlotPosition,
  context: SiteIdentityContext,
): string {
  const data = {
    ...createSiteHeaderData({
      siteName: resolveSiteName(settings, context),
      siteDescription: resolveSiteDescription(settings, context),
      brand: settings.brand,
      locale: settings.locale,
    }),
    site_name_heading: !home_hero_shown(settings),
  };
  return renderSiteHeader(data, slot);
}

// ElementRenderer.tsx renderHeader: resolves the identity itself from the instance settings.
function canvas_header(
  settings: SettingsData,
  slot: PageSlotPosition,
  context: SiteIdentityContext,
): string {
  const data = {
    ...createSiteHeaderData(settings, context),
    site_name_heading: !home_hero_shown(settings),
  };
  return renderSiteHeader(data, slot);
}

// index.astro (Layout top bar) and EditorCanvas.tsx (SiteTopbar) read the same instance settings.
function main_nav_settings(settings: SettingsData): SettingsData {
  return resolve_instance_settings(settings, MAIN_SECTION_ID, "navigation");
}

describe("header variant per slot", () => {
  it("maps sidebars to compact, bottom to bottom and the rest to the card", () => {
    expect(resolveHeaderVariant("top")).toBe("card");
    expect(resolveHeaderVariant("main")).toBe("card");
    expect(resolveHeaderVariant(undefined)).toBe("card");
    expect(resolveHeaderVariant("sidebar-left")).toBe("compact");
    expect(resolveHeaderVariant("sidebar-right")).toBe("compact");
    expect(resolveHeaderVariant("bottom")).toBe("bottom");
  });

  it("renders the variant's markup", () => {
    const data = createHeaderData("Honey", "Bees");
    const expected: Record<PageSlotPosition, string> = {
      top: renderHeader(data),
      main: renderHeader(data),
      "sidebar-left": renderHeaderCompact(data),
      "sidebar-right": renderHeaderCompact(data),
      bottom: renderHeaderBottom(data),
    };
    for (const slot of SLOTS) {
      expect(renderSiteHeader(data, slot)).toBe(expected[slot]);
    }
  });
});

describe("header parity: SSR and canvas", () => {
  const cases: [string, SettingsData, SiteIdentityContext][] = [
    ["community defaults", community_settings(), COMMUNITY],
    [
      "custom name with brand",
      community_settings({
        siteName: "Honey Blog",
        siteDescription: "Posts from Hive",
        brand: {
          mode: "logo+text",
          size: "lg",
          logo: {
            url: "https://images.hive.blog/logo.png",
            alt: "",
            w: 200,
            h: 50,
          },
        },
      }),
      COMMUNITY,
    ],
    [
      "home hero owns the H1",
      community_settings({
        home: { sections: [HERO] },
      } as Partial<SettingsData>),
      COMMUNITY,
    ],
  ];

  it.each(cases)(
    "renders identical HTML in every slot (%s)",
    (_name, settings, context) => {
      for (const slot of SLOTS) {
        expect(canvas_header(settings, slot, context)).toBe(
          ssr_header(settings, slot, context),
        );
      }
    },
  );

  it("drops the H1 in every variant when the hero is shown", () => {
    const settings = community_settings({
      home: { sections: [HERO] },
    } as Partial<SettingsData>);
    for (const slot of SLOTS) {
      const root = parse_fragment(ssr_header(settings, slot, COMMUNITY));
      expect(root.querySelector("h1")).toBeNull();
      expect(root.querySelector("p")?.textContent).toBe("Hive Bees");
    }
  });
});

describe("site top bar in community mode", () => {
  const with_nav = community_settings({
    nav: {
      links: [{ label: "About", kind: "page", target: "about" }],
      cta: { label: "Join", url: "https://example.com/join" },
    },
    pages: [
      { slug: "rules", title: "Rules", in_nav: true, body_md: "x" },
      { slug: "draft", title: "Draft", in_nav: false, body_md: "x" },
    ],
  } as Partial<SettingsData>);

  const topbar = (
    settings: SettingsData,
    active_page?: string,
    site_name = "HiveDevs",
  ) =>
    parse_fragment(
      renderSiteTopbar({
        site_name,
        nav: main_nav_settings(settings),
        active_page,
      }),
    );

  it("shows the site name and the owner and in_nav page links without the posts tabs", () => {
    const root = topbar(with_nav);
    const brand = root.querySelector<HTMLAnchorElement>("[data-site-brand]");
    expect(brand?.textContent).toBe("HiveDevs");
    expect(brand?.getAttribute("href")).toBe("/");
    const hrefs = Array.from(
      root.querySelectorAll<HTMLAnchorElement>("[data-nav-links] a"),
    ).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/p/about", "/p/rules"]);
    expect(root.querySelector("[data-nav-cta]")).not.toBeNull();
    expect(root.querySelector("[data-tab]")).toBeNull();
    expect(root.querySelector("button")).toBeNull();
    expect(root.querySelector("nav")?.getAttribute("aria-label")).toBe(
      "Site navigation",
    );
    expect(root.querySelector("[aria-current]")).toBeNull();
  });

  it("keeps the in_nav pages in a mobile menu with an open/close toggle", () => {
    const root = topbar(with_nav);
    const menu = root.querySelector("details[data-nav-menu]");
    expect(menu).not.toBeNull();
    const summary = menu?.querySelector("summary");
    expect(summary?.getAttribute("aria-controls")).toBe("site-nav-menu");
    expect(summary?.textContent).toContain("Open menu");
    expect(summary?.textContent).toContain("Close menu");
    const menu_hrefs = Array.from(
      root.querySelectorAll<HTMLAnchorElement>("#site-nav-menu a"),
    ).map((a) => a.getAttribute("href"));
    expect(menu_hrefs).toEqual(["/p/about", "/p/rules"]);
  });

  it("names the landmark in the blog locale", () => {
    const root = topbar({ ...with_nav, locale: "pl" });
    expect(root.querySelector("nav")?.getAttribute("aria-label")).toBe(
      "Nawigacja strony",
    );
  });

  it("marks the link of the current static page", () => {
    const root = topbar(with_nav, "rules");
    const current = Array.from(
      root.querySelectorAll<HTMLAnchorElement>(
        "[data-nav-links] a[aria-current='page']",
      ),
    ).map((a) => a.getAttribute("href"));
    expect(current).toEqual(["/p/rules"]);
  });

  it("shows only the site name without owner links, a CTA or nav settings", () => {
    for (const root of [
      topbar(community_settings()),
      parse_fragment(renderSiteTopbar({ site_name: "HiveDevs" })),
    ]) {
      expect(root.querySelector("nav")).toBeNull();
      expect(root.querySelector("[data-site-brand]")?.textContent).toBe(
        "HiveDevs",
      );
    }
  });

  it("escapes the site name", () => {
    const root = topbar(with_nav, undefined, '<img src=x onerror="x">');
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("[data-site-brand]")?.textContent).toBe(
      '<img src=x onerror="x">',
    );
  });

  it("links a tag to Hive, since community mode has no category tabs", () => {
    const settings = community_settings({
      navigationTabs: [
        {
          id: "category-bees",
          label: "Bees",
          enabled: true,
          showCount: false,
          tag: "bees",
        },
      ],
      nav: { links: [{ label: "Bees", kind: "tag", target: "bees" }] },
    } as Partial<SettingsData>);
    const link =
      topbar(settings).querySelector<HTMLAnchorElement>("[data-nav-links] a");
    expect(link?.getAttribute("href")).toMatch(/\/trending\/bees$/);
    expect(link?.hasAttribute("data-tab")).toBe(false);
  });
});

describe("SSR and canvas share the header and top bar renderers", () => {
  const read = (path: string) =>
    readFileSync(resolve(process.cwd(), path), "utf8");

  it("SlotRenderer.astro picks the header variant from shared helpers", () => {
    const source = read("src/components/home/blog/SlotRenderer.astro");
    expect(source).toContain("renderSiteHeader(headerData, context)");
    expect(source).not.toContain("renderSiteTopbar");
    expect(source).not.toMatch(/!communityData && !communityFailed/);
  });

  it("the canvas renders the header per slot and the site top bar", () => {
    const element = read("src/shared/components/solid/ElementRenderer.tsx");
    expect(element).toContain("renderSiteHeader(data, slot)");
    expect(element).toContain(
      "renderSiteTopbar({ site_name: props.siteName, nav: props.nav })",
    );
    expect(element).toContain("SITE_TOPBAR_CLASS");
    expect(element).toContain("SITE_TOPBAR_ROW_CLASS");
    const canvas = read("src/components/admin/canvas/EditorCanvas.tsx");
    expect(element).toContain("usePageSlot()");
    expect(canvas).toContain(
      "<PageSlotContext.Provider value={zone_props.spec.slot}>",
    );
    expect(canvas).toContain(
      "<SiteTopbar siteName={site_name()} nav={topbar_nav()} />",
    );
    expect(canvas).toContain("resolve_settings(MAIN_SECTION_ID, 'navigation')");
    expect(canvas).not.toContain("renderSiteTopbar");
    const layout = read("src/layouts/Layout.astro");
    expect(layout).toContain("renderSiteTopbar({");
    expect(layout).toContain("SITE_TOPBAR_CLASS");
    expect(layout).toContain("SITE_TOPBAR_ROW_CLASS");
    const index = read("src/pages/index.astro");
    expect(index).toMatch(
      /resolve_instance_settings\(\s*settings as SettingsData,\s*MAIN_SECTION_ID,\s*"navigation",?\s*\)/,
    );
    expect(index).toMatch(
      /<Layout[^>]*siteName=\{siteName\}[^>]*nav=\{topbarNav\}/,
    );
  });

  it("the static page passes the site name, nav and active page to the top bar", () => {
    const page = read("src/pages/p/[slug].astro");
    expect(page).toContain("siteName={site_name}");
    expect(page).toContain("nav={topbar_nav}");
    expect(page).toContain("activePage={page?.slug}");
  });
});
