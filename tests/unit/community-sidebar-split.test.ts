// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  COMMUNITY_BLOCK_ELEMENT_IDS,
  expand_community_sidebar,
  migratePageLayoutToConfig,
  type ContainerElement,
  type PageLayoutConfig,
} from "../../src/components/admin/types/layout";
import { parse_settings_graceful } from "../../src/components/admin/types/settings-schema";
import {
  defaultCommunitySettings,
  get_default_settings,
} from "../../src/components/admin/types/settings";
import {
  adapt_layout_for_community,
  adapt_layout_for_mode,
  designPatterns,
} from "../../src/components/admin/types/templates";
import { BLOG_PRESETS } from "../../src/components/admin/presets/catalog";
import { apply_blog_preset } from "../../src/components/admin/presets/apply";

const BLOCKS = [...COMMUNITY_BLOCK_ELEMENT_IDS];

function config(
  sidebar_right: ContainerElement[],
  bottom: ContainerElement[] = [{ id: "footer", active: true }],
): PageLayoutConfig {
  return {
    template: "sidebar-right",
    containers: {
      top: { elements: [{ id: "header", active: true }] },
      sidebarLeft: { elements: [] },
      sidebarRight: { elements: sidebar_right },
      bottom: { elements: bottom },
    },
  };
}

const ids = (elements: ContainerElement[]) => elements.map((e) => e.id);

function all_ids(layout: PageLayoutConfig | undefined): string[] {
  if (!layout) return [];
  return Object.values(layout.containers).flatMap((c) => ids(c.elements));
}

function read(layout: PageLayoutConfig): PageLayoutConfig {
  const parsed = parse_settings_graceful({ pageLayoutConfig: layout });
  return parsed.pageLayoutConfig as PageLayoutConfig;
}

describe("legacy communitySidebar migrated on read", () => {
  it("replaces communitySidebar in place with the four blocks, active kept", () => {
    const stored = config([
      { id: "communityProfile", active: true },
      { id: "communitySidebar", active: false },
    ]);
    const layout = read(stored);
    expect(layout.containers.sidebarRight.elements).toEqual([
      { id: "communityProfile", active: true },
      ...BLOCKS.map((id) => ({ id, active: false })),
    ]);
    expect(all_ids(layout)).not.toContain("communitySidebar");
    expect(ids(stored.containers.sidebarRight.elements)).toEqual([
      "communityProfile",
      "communitySidebar",
    ]);
  });

  it("keeps a block already in the layout where it is, without a duplicate", () => {
    const layout = read(
      config(
        [
          { id: "communitySidebar", active: true },
          { id: "communityProfile", active: true },
        ],
        [
          { id: "communityRules", active: false },
          { id: "footer", active: true },
        ],
      ),
    );
    expect(ids(layout.containers.sidebarRight.elements)).toEqual([
      "communityDescription",
      "communityTeam",
      "communityLanguage",
      "communityProfile",
    ]);
    expect(layout.containers.bottom.elements).toEqual([
      { id: "communityRules", active: false },
      { id: "footer", active: true },
    ]);
  });

  it("expands only the first of two communitySidebar entries", () => {
    const layout = expand_community_sidebar({
      ...config([{ id: "communitySidebar", active: true }]),
      containers: {
        ...config([{ id: "communitySidebar", active: true }]).containers,
        sidebarLeft: { elements: [{ id: "communitySidebar", active: true }] },
      },
    });
    expect(ids(layout.containers.sidebarLeft.elements)).toEqual(BLOCKS);
    expect(layout.containers.sidebarRight.elements).toEqual([]);
  });

  it("leaves a layout without community elements unchanged", () => {
    const stored = config([{ id: "authorProfile", active: true }]);
    expect(read(stored)).toEqual(stored);
  });

  it("expands communitySidebar from the legacy slot layout", () => {
    const layout = migratePageLayoutToConfig({
      sections: [
        {
          id: "s1",
          slot: "sidebar-left",
          orientation: "vertical",
          elements: ["communityProfile", "communitySidebar", "posts"],
          active: true,
        },
      ],
    });
    expect(ids(layout.containers.sidebarLeft.elements)).toEqual([
      "communityProfile",
      ...BLOCKS,
    ]);
  });
});

describe("community layouts start with the single blocks", () => {
  it("default community layout holds the four blocks", () => {
    const layout = get_default_settings(true).pageLayoutConfig;
    expect(ids(layout.containers.sidebarLeft.elements)).toEqual([
      "communityProfile",
      ...BLOCKS,
    ]);
    expect(all_ids(layout)).not.toContain("communitySidebar");
    expect(
      defaultCommunitySettings.pageLayout.sections.flatMap((s) => s.elements),
    ).not.toContain("communitySidebar");
  });

  it("adapt_layout_for_community puts the blocks in place of authorProfile", () => {
    const adapted = adapt_layout_for_community({
      pageLayoutConfig: config([{ id: "authorProfile", active: true }]),
      pageLayout: {
        sections: [
          {
            id: "page-sec-2",
            slot: "sidebar-right",
            orientation: "vertical",
            elements: ["authorProfile"],
            active: true,
          },
        ],
      },
    });
    expect(
      ids(adapted.pageLayoutConfig!.containers.sidebarRight.elements),
    ).toEqual(["communityProfile", ...BLOCKS]);
    expect(adapted.pageLayout!.sections[0].elements).toEqual([
      "communityProfile",
      ...BLOCKS,
    ]);
  });

  it("adapt_layout_for_mode expands a legacy communitySidebar of a saved preset", () => {
    const adapted = adapt_layout_for_mode(
      {
        pageLayoutConfig: config([
          { id: "communityProfile", active: true },
          { id: "communitySidebar", active: true },
        ]),
      },
      true,
    );
    expect(
      ids(adapted.pageLayoutConfig!.containers.sidebarRight.elements),
    ).toEqual(["communityProfile", ...BLOCKS]);
  });

  it("no design pattern or preset yields communitySidebar in community mode", () => {
    for (const pattern of designPatterns) {
      const adapted = adapt_layout_for_mode(pattern.settings, true);
      expect(all_ids(adapted.pageLayoutConfig)).not.toContain(
        "communitySidebar",
      );
      expect(
        (adapted.pageLayout?.sections ?? []).flatMap((s) => s.elements),
      ).not.toContain("communitySidebar");
    }
    for (const preset of BLOG_PRESETS) {
      const { patch } = apply_blog_preset(
        preset,
        get_default_settings(true),
        "layout",
        true,
      );
      expect(all_ids(patch.pageLayoutConfig)).not.toContain("communitySidebar");
    }
  });
});
