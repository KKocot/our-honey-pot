// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canvas_section_html } from "../../src/components/admin/canvas/home-sections/model";
import {
  SECTION_STYLE_DEFAULTS,
  get_default_settings,
  type HomeSection,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import type { LayoutTemplate } from "../../src/components/admin/types/layout";
import {
  home_lead_section_ids,
  render_section_html,
  split_home_sections,
} from "../../src/shared/components/sections";
import { parse_fragment } from "./helpers/html-assert";

const common = SECTION_STYLE_DEFAULTS.common;

const HERO: HomeSection = {
  id: "hero0001",
  type: "hero",
  hidden: false,
  content: { headline: "Welcome to the hive" },
  style: { ...common, ...SECTION_STYLE_DEFAULTS.hero, width: "full" },
} as HomeSection;

const POSTS: HomeSection = {
  id: "posts001",
  type: "posts",
  content: {},
  style: { ...common },
};

function settings_for(template: LayoutTemplate): SettingsData {
  const defaults = get_default_settings(true);
  return {
    ...defaults,
    pageLayoutConfig: { ...defaults.pageLayoutConfig, template },
    home: { sections: [HERO, POSTS] },
  } as SettingsData;
}

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("width:full hero above the sidebars: SSR and canvas", () => {
  it("index.astro and the canvas split the same lead", () => {
    const settings = settings_for("sidebar-left");
    const ssr = split_home_sections(settings.home, { sidebars: true });
    expect(ssr.lead.map((s) => s.id)).toEqual(home_lead_section_ids(settings));
  });

  it("canvas HTML equals the public HTML and bleeds full width", () => {
    const settings = settings_for("both-sidebars");
    const canvas = canvas_section_html(HERO, settings, true);
    expect(canvas).toBe(
      render_section_html(HERO, settings, undefined, { priority: true }),
    );
    expect(
      parse_fragment(canvas).querySelector("section")?.classList,
    ).toContain("section-full");
  });

  it("the canvas renders a lead stack above the grid and the rest in the main slot", () => {
    const canvas = read("src/components/admin/canvas/EditorCanvas.tsx");
    const lead = canvas.indexOf('part="lead"');
    const grid = canvas.indexOf("'sidebar-layout editor-sidebar-layout'");
    expect(lead).toBeGreaterThan(-1);
    expect(lead).toBeLessThan(grid);
    expect(canvas).toContain('part="body"');
  });

  it("main content precedes the sidebars in the DOM on both, so narrow screens show it first", () => {
    const canvas = read("src/components/admin/canvas/EditorCanvas.tsx");
    const canvas_main = canvas.indexOf("<SlotZone spec={SLOT_SPECS.main} />");
    expect(canvas_main).toBeLessThan(
      canvas.indexOf(
        "<SlotZone spec={SLOT_SPECS['sidebar-left']} in_sidebar />",
      ),
    );
    const index = read("src/pages/index.astro");
    const index_main = index.indexOf('<div class="main-content">');
    expect(index_main).toBeGreaterThan(-1);
    expect(index_main).toBeLessThan(
      index.indexOf('<aside class="sidebar-left"'),
    );
    expect(index.indexOf("sections={home_sections.lead}")).toBeLessThan(
      index.indexOf('<div class="sidebar-layout">'),
    );
    const css = read("src/styles/global.css");
    expect(css).not.toMatch(/\.sidebar-layout \.[a-z-]+ \{[^}]*order:/);
  });

  it("the main landmark holds the lead hero and the grid; the canvas mirrors it with a div", () => {
    const index = read("src/pages/index.astro");
    const main_open = index.indexOf("<main>");
    const main_close = index.indexOf("</main>");
    expect(main_open).toBeGreaterThan(-1);
    expect(main_open).toBeLessThan(
      index.indexOf("sections={home_sections.lead}"),
    );
    expect(main_close).toBeGreaterThan(
      index.indexOf('<aside class="sidebar-right"'),
    );
    expect(index.match(/<main[\s>]/g)).toHaveLength(1);
    const canvas = read("src/components/admin/canvas/EditorCanvas.tsx");
    const wrapper = canvas.indexOf('<div data-canvas-main="">');
    expect(wrapper).toBeGreaterThan(-1);
    expect(wrapper).toBeLessThan(canvas.indexOf('part="lead"'));
    expect(canvas).not.toContain("<main");
  });

  it("index.astro takes the lead template from the settings, like render_section_html", () => {
    const index = read("src/pages/index.astro");
    expect(index).toContain("sidebars: template_has_sidebars(settings)");
  });

  it("a hidden section neither ends nor joins the lead", () => {
    const hidden: HomeSection = {
      ...HERO,
      id: "about001",
      type: "text-media",
      hidden: true,
      content: { title: "About" },
      style: { ...common, ...SECTION_STYLE_DEFAULTS["text-media"] },
    } as HomeSection;
    const settings = {
      ...settings_for("sidebar-left"),
      home: { sections: [hidden, HERO, POSTS] },
    } as SettingsData;
    const split = split_home_sections(settings.home, { sidebars: true });
    expect(split.lead.map((s) => s.id)).toEqual(["hero0001"]);
    expect(split.before.map((s) => s.id)).toEqual(["about001"]);
    expect(home_lead_section_ids(settings)).toEqual(["hero0001"]);
    const hidden_full = { ...HERO, hidden: true } as HomeSection;
    expect(
      split_home_sections(
        { sections: [hidden_full, POSTS] },
        { sidebars: true },
      ).lead,
    ).toEqual([]);
  });
});

describe("top bar name and nav on every public page", () => {
  it("the post page fetches the community title whenever siteName is unset", () => {
    const post = read("src/pages/[...slug].astro");
    expect(post).toContain('if (!hive_username || s.siteName) return "";');
    expect(post).toContain("siteName={footer_site_name}");
  });

  it("the new post page passes the site name and nav", () => {
    const page = read("src/pages/new.astro");
    expect(page).toContain("siteName={site_name}");
    expect(page).toContain("nav={topbar_nav}");
    expect(page).toContain(
      'resolve_instance_settings(settings, MAIN_SECTION_ID, "navigation")',
    );
  });

  it("the top bar is the banner landmark on the public pages", () => {
    const layout = read("src/layouts/Layout.astro");
    expect(layout).toMatch(/<header class=\{`\$\{SITE_TOPBAR_CLASS\} sticky/);
  });
});
