// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  all_sidebar_blocks_disabled,
  has_visible_sidebar_blocks,
  sidebar_block_flags,
  type SidebarBlockFlags,
} from "../../src/components/community/sidebar-blocks";
import {
  COMMUNITY_SETTINGS_KEYS,
  defaultCommunitySettings,
  strip_community_fields,
} from "../../src/components/admin/types/settings";
import { settings_schema } from "../../src/components/admin/types/settings-schema";
import type { HiveCommunity } from "../../src/lib/types/community";

const FULL = {
  description: "About us",
  flag_text: "Be nice\nNo spam",
  team: [["alice", "owner", ""]],
  lang: "pl",
} as unknown as HiveCommunity;

const EMPTY = {
  description: "",
  flag_text: "",
  team: [],
  lang: "",
} as unknown as HiveCommunity;

const ALL_ON: SidebarBlockFlags = {
  show_description: true,
  show_rules: true,
  show_leadership: true,
  show_language: true,
};

const ALL_OFF: SidebarBlockFlags = {
  show_description: false,
  show_rules: false,
  show_leadership: false,
  show_language: false,
};

describe("community_show_language setting", () => {
  it("defaults to visible in community settings", () => {
    expect(defaultCommunitySettings.community_show_language).toBe(true);
  });

  it("is a community-only key stripped in user mode", () => {
    expect(COMMUNITY_SETTINGS_KEYS).toContain("community_show_language");
    const stripped = strip_community_fields({
      ...defaultCommunitySettings,
      community_show_language: false,
    });
    expect("community_show_language" in stripped).toBe(false);
  });

  it("schema keeps a boolean and rejects other types", () => {
    expect(
      settings_schema.parse({ community_show_language: false })
        .community_show_language,
    ).toBe(false);
    expect(
      settings_schema.safeParse({ community_show_language: "no" }).success,
    ).toBe(false);
  });
});

describe("sidebar_block_flags", () => {
  it("treats missing settings as visible", () => {
    expect(sidebar_block_flags({})).toEqual(ALL_ON);
  });

  it("maps each toggle to its flag", () => {
    expect(
      sidebar_block_flags({
        community_show_description: false,
        community_show_rules: false,
        community_show_leadership: false,
        community_show_language: false,
      }),
    ).toEqual(ALL_OFF);
    expect(
      sidebar_block_flags({ community_show_language: false }).show_language,
    ).toBe(false);
  });
});

describe("has_visible_sidebar_blocks", () => {
  it("is false when every block is hidden", () => {
    expect(all_sidebar_blocks_disabled(ALL_OFF)).toBe(true);
    expect(has_visible_sidebar_blocks(FULL, ALL_OFF)).toBe(false);
  });

  it("is false when enabled blocks have no data", () => {
    expect(all_sidebar_blocks_disabled(ALL_ON)).toBe(false);
    expect(has_visible_sidebar_blocks(EMPTY, ALL_ON)).toBe(false);
  });

  it.each([
    ["show_description", { ...EMPTY, description: "About" }],
    ["show_rules", { ...EMPTY, flag_text: "Rule" }],
    ["show_leadership", { ...EMPTY, team: [["bob", "mod", ""]] }],
    ["show_language", { ...EMPTY, lang: "en" }],
  ] as const)("%s alone keeps the sidebar visible", (flag, community) => {
    const flags = { ...ALL_OFF, [flag]: true };
    expect(
      has_visible_sidebar_blocks(community as unknown as HiveCommunity, flags),
    ).toBe(true);
  });

  it("ignores team members without a leadership role and blank rules", () => {
    const community = {
      ...EMPTY,
      flag_text: "  \n ",
      team: [["carol", "member", ""]],
    } as unknown as HiveCommunity;
    expect(has_visible_sidebar_blocks(community, ALL_ON)).toBe(false);
  });
});
