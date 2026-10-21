// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it, vi } from "vitest";

// Popovers pull lucide-solid, which throws under the node environment; only their identity matters here.
vi.mock(
  "../../../src/components/admin/canvas/popovers/AuthorProfilePopover",
  () => ({
    AuthorProfilePopover: () => null,
  }),
);
vi.mock(
  "../../../src/components/admin/canvas/popovers/CommunityProfilePopover",
  () => ({
    CommunityProfilePopover: () => null,
  }),
);
vi.mock(
  "../../../src/components/admin/canvas/popovers/CommunitySidebarPopover",
  () => ({
    CommunitySidebarPopover: () => null,
  }),
);
vi.mock("../../../src/components/admin/canvas/popovers/FooterPopover", () => ({
  FooterPopover: () => null,
}));
vi.mock("../../../src/components/admin/canvas/popovers/HeaderPopover", () => ({
  HeaderPopover: () => null,
}));
vi.mock(
  "../../../src/components/admin/canvas/popovers/NavigationPopover",
  () => ({
    NavigationPopover: () => null,
  }),
);
vi.mock("../../../src/components/admin/canvas/popovers/PostsPopover", () => ({
  PostsPopover: () => null,
}));

import {
  element_has_settings,
  get_element_entry,
} from "../../../src/components/admin/canvas/element-registry";

const COMMUNITY_BLOCKS = [
  "communityDescription",
  "communityRules",
  "communityTeam",
  "communityLanguage",
];
const WITH_SETTINGS = [
  "header",
  "navigation",
  "authorProfile",
  "communityProfile",
  "posts",
  "footer",
  "communitySidebar",
];

describe("element_has_settings", () => {
  it.each(COMMUNITY_BLOCKS)("hides the gear for %s", (id) => {
    expect(element_has_settings(id)).toBe(false);
  });

  it.each(WITH_SETTINGS)("keeps the gear for %s", (id) => {
    expect(element_has_settings(id)).toBe(true);
  });

  it("is false for unknown and missing ids", () => {
    expect(element_has_settings("unknown")).toBe(false);
    expect(element_has_settings("toString")).toBe(false);
    expect(element_has_settings(null)).toBe(false);
  });
});

describe("get_element_entry", () => {
  it.each(COMMUNITY_BLOCKS)(
    "still resolves a popover for %s (keyboard path)",
    (id) => {
      const entry = get_element_entry(id);
      expect(entry).not.toBeNull();
      expect(entry?.popover).toBeTypeOf("function");
    },
  );
});
