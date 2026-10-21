// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it, vi } from "vitest";

// Popovers pull lucide-solid, which needs a DOM; the node project only checks the registry wiring.
vi.mock(
  "../../src/components/admin/canvas/popovers/AuthorProfilePopover",
  () => ({ AuthorProfilePopover: () => null }),
);
vi.mock(
  "../../src/components/admin/canvas/popovers/CommunityProfilePopover",
  () => ({ CommunityProfilePopover: () => null }),
);
vi.mock(
  "../../src/components/admin/canvas/popovers/CommunitySidebarPopover",
  () => ({ CommunitySidebarPopover: () => null }),
);
vi.mock("../../src/components/admin/canvas/popovers/FooterPopover", () => ({
  FooterPopover: () => null,
}));
vi.mock("../../src/components/admin/canvas/popovers/HeaderPopover", () => ({
  HeaderPopover: () => null,
}));
vi.mock("../../src/components/admin/canvas/popovers/NavigationPopover", () => ({
  NavigationPopover: () => null,
}));
vi.mock("../../src/components/admin/canvas/popovers/PostsPopover", () => ({
  PostsPopover: () => null,
}));
import {
  ALL_PAGE_ELEMENT_IDS,
  COMMUNITY_CONTAINER_ELEMENT_IDS,
  COMMUNITY_PAGE_ELEMENT_IDS,
  LAYOUT_ELEMENT_IDS,
  USER_CONTAINER_ELEMENT_IDS,
  USER_PAGE_ELEMENT_IDS,
  migratePageLayoutToConfig,
  pageElementLabels,
  type LayoutElementId,
} from "../../src/components/admin/types/layout";
import { parse_settings_graceful } from "../../src/components/admin/types/settings-schema";
import {
  ELEMENT_REGISTRY,
  get_element_entry,
} from "../../src/components/admin/canvas/element-registry";

const BLOCK_IDS = [
  "communityDescription",
  "communityRules",
  "communityTeam",
  "communityLanguage",
] as const;

function layout_config(ids: LayoutElementId[]) {
  return {
    template: "sidebar-right",
    containers: {
      top: { elements: [{ id: "header", active: true }] },
      sidebarLeft: { elements: [] },
      sidebarRight: { elements: ids.map((id) => ({ id, active: true })) },
      bottom: { elements: [{ id: "footer", active: true }] },
    },
  };
}

describe("community blocks as layout elements", () => {
  it("parse keeps every LayoutElementId in a container", () => {
    for (const id of [...BLOCK_IDS, "communitySidebar"]) {
      expect(LAYOUT_ELEMENT_IDS).toContain(id);
    }
    const plain_ids = LAYOUT_ELEMENT_IDS.filter(
      (id) => id !== "communitySidebar",
    );
    const config = layout_config(plain_ids);
    const parsed = parse_settings_graceful({ pageLayoutConfig: config });
    expect(parsed.pageLayoutConfig).toEqual(config);
    expect(
      parse_settings_graceful({
        pageLayoutConfig: layout_config(["communitySidebar"]),
      }).pageLayoutConfig,
    ).toEqual(layout_config([...BLOCK_IDS]));
  });

  it("keeps pageLayoutConfig with the new block ids", () => {
    const config = layout_config([...BLOCK_IDS]);
    const parsed = parse_settings_graceful({ pageLayoutConfig: config });
    expect(parsed.pageLayoutConfig).toEqual(config);
  });

  it("still parses legacy communitySidebar configs, expanded into the blocks", () => {
    const config = layout_config(["communityProfile", "communitySidebar"]);
    const parsed = parse_settings_graceful({ pageLayoutConfig: config });
    expect(parsed.pageLayoutConfig).toEqual(
      layout_config(["communityProfile", ...BLOCK_IDS]),
    );
  });

  it("drops only the element with an unknown id, keeping the rest of the layout", () => {
    const config = layout_config(["communityRules"]);
    config.containers.sidebarRight.elements.push({
      id: "communityWidget" as LayoutElementId,
      active: true,
    });
    config.containers.sidebarRight.elements.push({
      id: "communityTeam",
      active: false,
    });
    const parsed = parse_settings_graceful({ pageLayoutConfig: config });
    expect(parsed.pageLayoutConfig).toEqual({
      ...layout_config(["communityRules"]),
      containers: {
        ...layout_config([]).containers,
        sidebarRight: {
          elements: [
            { id: "communityRules", active: true },
            { id: "communityTeam", active: false },
          ],
        },
      },
    });
  });

  it("registers a labelled popover for every block", () => {
    for (const id of BLOCK_IDS) {
      expect(Object.hasOwn(ELEMENT_REGISTRY, id)).toBe(true);
      expect(get_element_entry(id)?.label).toBe(pageElementLabels[id]);
      expect(get_element_entry(id)?.popover).toBe(
        ELEMENT_REGISTRY.communitySidebar.popover,
      );
    }
  });

  it("allows blocks only in community mode", () => {
    for (const id of BLOCK_IDS) {
      expect(ALL_PAGE_ELEMENT_IDS).toContain(id);
      expect(COMMUNITY_PAGE_ELEMENT_IDS.has(id)).toBe(true);
      expect(COMMUNITY_CONTAINER_ELEMENT_IDS).toContain(id);
      expect(USER_PAGE_ELEMENT_IDS.has(id)).toBe(false);
      expect(USER_CONTAINER_ELEMENT_IDS).not.toContain(id);
    }
  });

  it("migrates block ids from the legacy slot layout", () => {
    const config = migratePageLayoutToConfig({
      sections: [
        {
          id: "s1",
          slot: "sidebar-left",
          orientation: "vertical",
          elements: ["communityRules", "posts"],
          active: true,
        },
      ],
    });
    expect(config.template).toBe("sidebar-left");
    expect(config.containers.sidebarLeft.elements).toEqual([
      { id: "communityRules", active: true },
    ]);
  });
});
