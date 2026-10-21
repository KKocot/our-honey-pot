// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { getViteConfig } from "astro/config";
import { createServer, type ViteDevServer } from "vite";
import {
  pageLayoutConfigToLegacy,
  type ContainerName,
  type LayoutTemplate,
  type PageLayoutConfig,
} from "../../src/components/admin/types/layout";
import type { HomeSection } from "../../src/components/admin/types/settings";
import type {
  PageSlotPosition,
  SiteSettings,
} from "../../src/components/home/types";
import {
  home_section_containers,
  split_home_sections,
} from "../../src/shared/components/sections/render";
import { get_element_wrapper_class } from "../../src/shared/components/page-layout";

type AstroComponent = Parameters<AstroContainer["renderToString"]>[0];

const XSS_BODY = [
  "Hello <script>alert(1)</script>",
  "[click](javascript:alert(2))",
  '<img src="x" onerror="alert(3)">',
  '<a href="javascript:alert(4)" onclick="alert(5)">raw</a>',
].join("\n\n");

let server: ViteDevServer;
let container: AstroContainer;
let SlotRenderer: AstroComponent;
let HomeSections: AstroComponent;

// The vitest config has no Astro plugin, so the components go through Astro's own Vite pipeline.
beforeAll(async () => {
  const config = await getViteConfig(
    {
      logLevel: "silent",
      appType: "custom",
      server: { middlewareMode: true, hmr: false, ws: false },
      optimizeDeps: { noDiscovery: true, include: [] },
    },
    { logLevel: "silent" },
  )({ command: "serve", mode: "test" });
  server = await createServer({ ...config, configFile: false });
  SlotRenderer = (
    await server.ssrLoadModule("/src/components/home/blog/SlotRenderer.astro")
  ).default;
  HomeSections = (
    await server.ssrLoadModule("/src/components/home/blog/HomeSections.astro")
  ).default;
  container = await AstroContainer.create();
}, 120_000);

afterAll(async () => {
  await server?.close();
});

function layout(
  template: LayoutTemplate,
  elements: Partial<Record<ContainerName, string[]>> = {},
): PageLayoutConfig {
  const of = (name: ContainerName) => ({
    elements: (elements[name] ?? []).map((id) => ({
      id: id as PageLayoutConfig["containers"]["top"]["elements"][number]["id"],
      active: true,
    })),
  });
  return {
    template,
    containers: {
      top: of("top"),
      sidebarLeft: of("sidebarLeft"),
      sidebarRight: of("sidebarRight"),
      bottom: of("bottom"),
    },
  };
}

function section(
  id: string,
  type: string,
  content: Record<string, unknown>,
  placement?: { container: ContainerName; index: number },
): HomeSection {
  return {
    id,
    type,
    content,
    style: {},
    ...(placement ? { placement } : {}),
  } as unknown as HomeSection;
}

function page_settings(
  config: PageLayoutConfig,
  sections: HomeSection[],
): SiteSettings {
  return {
    pageLayoutConfig: config,
    home: { sections },
  } as SiteSettings;
}

async function render_slot(
  settings: SiteSettings,
  context: Exclude<PageSlotPosition, "main">,
): Promise<string> {
  const config = settings.pageLayoutConfig as PageLayoutConfig;
  const legacy = pageLayoutConfigToLegacy(
    config,
    home_section_containers(settings),
  );
  return container.renderToString(SlotRenderer, {
    props: {
      sections: legacy.sections.filter((s) => s.slot === context),
      context,
      siteName: "Bee Site",
      siteDescription: "About bees",
      showHeader: true,
      hiveUsername: "hive-123456",
      settings,
      communityData: null,
      communityFailed: false,
      blogLogicPosts: [],
      hiveComments: [],
      activeTab: "",
      showCommentsTab: false,
      showAuthorProfile: false,
      authorProfileBaseProps: {
        username: "hive-123456",
        account: null,
        profile: null,
        globalProperties: null,
        accountManabars: null,
      },
      isCategory: false,
      activeCategoryTag: null,
      totalFetchedBeforeFilter: 0,
      showCategoryLimitWarning: false,
      isFirstPage: true,
      hasMorePosts: false,
      nextPostsPageUrl: null,
      hasMoreComments: false,
      nextCommentsPageUrl: null,
    },
  });
}

function expect_neutralized(html: string): void {
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toMatch(/<[^>]+\son[a-z]+\s*=/i);
  expect(html).not.toMatch(/(href|src)\s*=\s*["']?\s*javascript:/i);
}

function count_h1(html: string): number {
  return (html.match(/<h1[\s>]/gi) ?? []).length;
}

describe("SlotRenderer: home sections in layout containers", () => {
  it("neutralizes script, javascript: and onerror payloads in a sidebar section", async () => {
    const settings = page_settings(layout("sidebar-left"), [
      section(
        "side0001",
        "text-media",
        { title: "<script>alert(0)</script>", body_md: XSS_BODY },
        { container: "sidebarLeft", index: 0 },
      ),
    ]);
    const html = await render_slot(settings, "sidebar-left");
    expect(html).toContain('<section id="s-side0001"');
    expect(html).toContain("Hello");
    expect_neutralized(html);
  });

  it("neutralizes the same payloads in a top section", async () => {
    const settings = page_settings(layout("no-sidebar", { top: ["header"] }), [
      section(
        "top00001",
        "text-media",
        { title: "Top <img src=x onerror=alert(1)>", body_md: XSS_BODY },
        { container: "top", index: 1 },
      ),
    ]);
    const html = await render_slot(settings, "top");
    expect(html).toContain('<section id="s-top00001"');
    expect_neutralized(html);
  });

  it("renders a sidebar holding only a section, inside the element wrapper", async () => {
    const settings = page_settings(layout("sidebar-right"), [
      section(
        "only0001",
        "quote",
        { text: "Slow is smooth." },
        { container: "sidebarRight", index: 0 },
      ),
    ]);
    const html = await render_slot(settings, "sidebar-right");
    expect(html).toContain("Slow is smooth.");
    const wrapper = `<div class="${get_element_wrapper_class("vertical", "sidebar-right")}"`;
    const wrapper_at = html.indexOf(wrapper);
    expect(wrapper_at).toBeGreaterThan(-1);
    expect(html.indexOf('<section id="s-only0001"')).toBeGreaterThan(
      wrapper_at,
    );
  });

  it("renders nothing for a sidebar without elements or sections", async () => {
    const settings = page_settings(layout("sidebar-left"), []);
    const html = await render_slot(settings, "sidebar-left");
    expect(html.trim()).toBe("");
  });

  it("keeps placement.index order against the slot elements", async () => {
    const settings = page_settings(
      layout("no-sidebar", { bottom: ["footer"] }),
      [
        section(
          "bott0001",
          "quote",
          { text: "Before the footer." },
          { container: "bottom", index: 0 },
        ),
      ],
    );
    const html = await render_slot(settings, "bottom");
    const quote_at = html.indexOf("Before the footer.");
    const footer_at = html.indexOf("<footer");
    expect(quote_at).toBeGreaterThan(-1);
    expect(footer_at).toBeGreaterThan(quote_at);
  });

  it("a hero in the top container is the only H1 next to the header", async () => {
    const settings = page_settings(layout("no-sidebar", { top: ["header"] }), [
      section(
        "hero0001",
        "hero",
        { headline: "Welcome bees" },
        { container: "top", index: 1 },
      ),
    ]);
    const html = await render_slot(settings, "top");
    expect(html).toContain("Welcome bees");
    expect(html).toContain("Bee Site");
    expect(count_h1(html)).toBe(1);
    expect(html).toMatch(/<h1[^>]*>Welcome bees<\/h1>/);
  });

  it("without a hero the header keeps the site name H1", async () => {
    const settings = page_settings(layout("no-sidebar", { top: ["header"] }), [
      section(
        "quot0001",
        "quote",
        { text: "No hero here." },
        { container: "top", index: 1 },
      ),
    ]);
    const html = await render_slot(settings, "top");
    expect(count_h1(html)).toBe(1);
    expect(html).not.toMatch(/<h1[^>]*>[^<]*No hero/);
  });
});

describe("HomeSections: main stack only", () => {
  it("leaves out a section placed in a container, even when passed in", async () => {
    const sections = [
      section("main0001", "quote", { text: "Main quote." }),
      section(
        "side0002",
        "quote",
        { text: "Sidebar quote." },
        { container: "sidebarLeft", index: 0 },
      ),
    ];
    const settings = page_settings(layout("sidebar-left"), sections);
    const split = split_home_sections(settings.home, {
      sidebars: true,
      settings,
    });
    expect(split.before.map((s) => s.id)).toEqual(["main0001"]);

    const html = await container.renderToString(HomeSections, {
      props: { sections, settings, position: "before" },
    });
    expect(html).toContain("Main quote.");
    expect(html).not.toContain("Sidebar quote.");

    const slot = await render_slot(settings, "sidebar-left");
    expect(slot).toContain("Sidebar quote.");
    expect(slot).not.toContain("Main quote.");
  });
});
