// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";

import {
  adapt_layout_for_community,
  adapt_layout_for_mode,
  adapt_layout_for_user,
  designPatterns,
} from "../../src/components/admin/types/templates";
import { DEVELOPER_BLOG_BASE } from "../../src/components/admin/presets/layouts";
import type { SettingsData } from "../../src/components/admin/types/settings";
import {
  COMMUNITY_BLOCK_ELEMENT_IDS,
  type PageLayoutConfig,
} from "../../src/components/admin/types/layout";

const BLOCKS: string[] = [...COMMUNITY_BLOCK_ELEMENT_IDS];

function layout_element_ids(config: PageLayoutConfig | undefined): string[] {
  if (!config) return [];
  return Object.values(config.containers).flatMap((c) =>
    c.elements.map((e) => e.id),
  );
}

function legacy_element_ids(settings: Partial<SettingsData>): string[] {
  return (settings.pageLayout?.sections ?? []).flatMap((s) => s.elements);
}

describe("adapt_layout_for_community", () => {
  it.each(designPatterns.map((p) => [p.name, p.settings] as const))(
    "%s uses community profile elements instead of authorProfile",
    (_name, settings) => {
      const adapted = adapt_layout_for_community(settings);
      const ids = layout_element_ids(adapted.pageLayoutConfig);
      expect(ids).toContain("communityProfile");
      expect(ids).toEqual(expect.arrayContaining(BLOCKS));
      expect(ids).not.toContain("communitySidebar");
      expect(ids).not.toContain("authorProfile");

      const legacy = legacy_element_ids(adapted);
      expect(legacy).not.toContain("authorProfile");
      expect(legacy).toContain("communityProfile");
    },
  );

  it("places community elements where authorProfile was", () => {
    const adapted = adapt_layout_for_community(DEVELOPER_BLOG_BASE);
    expect(adapted.pageLayoutConfig?.template).toBe("sidebar-left");
    expect(
      adapted.pageLayoutConfig?.containers.sidebarLeft.elements.map(
        (e) => e.id,
      ),
    ).toEqual(["communityProfile", ...BLOCKS]);
  });

  it("appends the community block to the top container of full-width layouts", () => {
    const adapted = adapt_layout_for_community({
      pageLayoutConfig: {
        template: "no-sidebar",
        containers: {
          top: { elements: [{ id: "header", active: true }] },
          sidebarLeft: { elements: [] },
          sidebarRight: { elements: [] },
          bottom: { elements: [] },
        },
      },
    });
    expect(
      adapted.pageLayoutConfig?.containers.top.elements.map((e) => e.id),
    ).toEqual(["header", "communityProfile", ...BLOCKS]);
  });

  it("does not mutate the source layout", () => {
    const before = JSON.stringify(DEVELOPER_BLOG_BASE);
    adapt_layout_for_community(DEVELOPER_BLOG_BASE);
    expect(JSON.stringify(DEVELOPER_BLOG_BASE)).toBe(before);
  });

  it("replaces authorProfile with the profile and only the blocks missing from the layout", () => {
    const adapted = adapt_layout_for_community({
      pageLayoutConfig: {
        template: "sidebar-left",
        containers: {
          top: { elements: [{ id: "header", active: true }] },
          sidebarLeft: { elements: [{ id: "authorProfile", active: true }] },
          sidebarRight: { elements: [] },
          bottom: { elements: [{ id: "communityRules", active: true }] },
        },
      },
      pageLayout: {
        sections: [
          {
            id: "s-left",
            slot: "sidebar-left",
            orientation: "vertical",
            elements: ["authorProfile", "communityTeam"],
            active: true,
          },
        ],
      },
    });
    const ids = layout_element_ids(adapted.pageLayoutConfig);
    expect(ids).toEqual([
      "header",
      "communityProfile",
      "communityDescription",
      "communityTeam",
      "communityLanguage",
      "communityRules",
    ]);
    expect(legacy_element_ids(adapted)).toEqual([
      "communityProfile",
      "communityDescription",
      "communityRules",
      "communityLanguage",
      "communityTeam",
    ]);
  });

  it("expands a legacy communitySidebar in place and never duplicates a block", () => {
    const adapted = adapt_layout_for_community({
      pageLayoutConfig: {
        template: "sidebar-left",
        containers: {
          top: { elements: [{ id: "communitySidebar", active: true }] },
          sidebarLeft: { elements: [{ id: "authorProfile", active: true }] },
          sidebarRight: { elements: [] },
          bottom: { elements: [] },
        },
      },
    });
    const ids = layout_element_ids(adapted.pageLayoutConfig);
    expect(ids).toEqual([...BLOCKS, "communityProfile"]);
  });
});

describe("adapt_layout_for_user", () => {
  const COMMUNITY_LAYOUT: Partial<SettingsData> = {
    pageLayoutConfig: {
      template: "both-sidebars",
      containers: {
        top: {
          elements: [
            { id: "header", active: true },
            { id: "communityDescription", active: true },
          ],
        },
        sidebarLeft: {
          elements: [
            { id: "communityProfile", active: true },
            { id: "communityRules", active: true },
          ],
        },
        sidebarRight: {
          elements: [
            { id: "authorProfile", active: true },
            { id: "communityTeam", active: false },
          ],
        },
        bottom: {
          elements: [
            { id: "communityLanguage", active: true },
            { id: "communitySidebar", active: true },
            { id: "footer", active: true },
          ],
        },
      },
    },
    pageLayout: {
      sections: [
        {
          id: "s-top",
          slot: "top",
          orientation: "horizontal",
          elements: ["header", "communityRules"],
          active: true,
        },
        {
          id: "s-left",
          slot: "sidebar-left",
          orientation: "vertical",
          elements: ["communitySidebar", "communityTeam"],
          active: true,
        },
      ],
    },
  };

  it("drops community blocks, profile and sidebar from a user blog", () => {
    const adapted = adapt_layout_for_user(COMMUNITY_LAYOUT);
    expect(layout_element_ids(adapted.pageLayoutConfig)).toEqual([
      "header",
      "authorProfile",
      "footer",
    ]);
    expect(legacy_element_ids(adapted)).toEqual(["header"]);
    expect(adapted.pageLayout?.sections.map((s) => s.id)).toEqual(["s-top"]);
  });

  it("switches off a sidebar emptied by the cleanup", () => {
    expect(
      adapt_layout_for_user(COMMUNITY_LAYOUT).pageLayoutConfig?.template,
    ).toBe("sidebar-right");
  });

  it("routes by mode and leaves the source untouched", () => {
    const before = JSON.stringify(COMMUNITY_LAYOUT);
    expect(
      layout_element_ids(
        adapt_layout_for_mode(COMMUNITY_LAYOUT, false).pageLayoutConfig,
      ),
    ).not.toContain("communityRules");
    expect(
      layout_element_ids(
        adapt_layout_for_mode(DEVELOPER_BLOG_BASE, true).pageLayoutConfig,
      ),
    ).toContain("communityProfile");
    expect(JSON.stringify(COMMUNITY_LAYOUT)).toBe(before);
  });
});
