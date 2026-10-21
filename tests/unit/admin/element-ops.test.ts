// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  add_element_op,
  addable_elements,
  remove_element_op,
  show_block_op,
} from "../../../src/components/admin/canvas/element-ops";
import type { PageLayoutConfig } from "../../../src/components/admin/types/layout";
import {
  defaultSettings,
  type SettingsData,
} from "../../../src/components/admin/types/settings";

function make_settings(overrides: Partial<SettingsData> = {}): SettingsData {
  const pageLayoutConfig: PageLayoutConfig = {
    template: "sidebar-right",
    containers: {
      top: { elements: [{ id: "header", active: true }] },
      sidebarLeft: { elements: [] },
      sidebarRight: {
        elements: [
          { id: "communityProfile", active: true },
          { id: "communityRules", active: true },
        ],
      },
      bottom: { elements: [{ id: "footer", active: true }] },
    },
  };
  return {
    ...defaultSettings,
    pageLayoutConfig,
    instanceOverrides: {
      "page-sec-sidebar-right:communityRules": { cardGapPx: 8 },
      "page-sec-top:header": { cardGapPx: 4 },
    },
    ...overrides,
  };
}

const snapshot = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("remove_element_op", () => {
  it("removes the element and its instance overrides without mutating the input", () => {
    const settings = make_settings();
    const before = snapshot(settings);

    const patch = remove_element_op("sidebarRight", "communityRules")(settings);

    expect(
      patch?.pageLayoutConfig?.containers.sidebarRight.elements.map(
        (element) => element.id,
      ),
    ).toEqual(["communityProfile"]);
    expect(patch?.instanceOverrides).toEqual({
      "page-sec-top:header": { cardGapPx: 4 },
    });
    expect(snapshot(settings)).toEqual(before);
  });

  it("returns null for an element missing from the container", () => {
    expect(
      remove_element_op("top", "communityRules")(make_settings()),
    ).toBeNull();
  });

  it("returns null without a page layout", () => {
    expect(
      remove_element_op(
        "top",
        "header",
      )(make_settings({ pageLayoutConfig: undefined })),
    ).toBeNull();
  });
});

describe("addable_elements", () => {
  it("skips communitySidebar and every element placed anywhere in the layout", () => {
    const ids = addable_elements(make_settings(), "sidebarLeft", true).map(
      (element) => element.id,
    );

    expect(ids).not.toContain("communitySidebar");
    expect(ids).toEqual([
      "communityDescription",
      "communityTeam",
      "communityLanguage",
    ]);
  });

  it("does not offer header, communityProfile or footer used in another slot", () => {
    for (const container of ["sidebarLeft", "bottom", "top"] as const) {
      const ids = addable_elements(make_settings(), container, true).map(
        (element) => element.id,
      );
      expect(ids).not.toContain("header");
      expect(ids).not.toContain("communityProfile");
      expect(ids).not.toContain("footer");
    }
  });

  it("offers an element again once it leaves the layout", () => {
    const settings = make_settings();
    settings.pageLayoutConfig!.containers.top.elements = [];
    expect(
      addable_elements(settings, "bottom", true).map((element) => element.id),
    ).toContain("header");
  });

  it("returns labels and leaves out elements of the other mode", () => {
    const elements = addable_elements(make_settings(), "top", false);

    expect(elements).toEqual([
      { id: "authorProfile", label: "Author Profile" },
    ]);
  });

  it("returns nothing without a page layout", () => {
    expect(
      addable_elements(
        make_settings({ pageLayoutConfig: undefined }),
        "top",
        true,
      ),
    ).toEqual([]);
  });
});

describe("add_element_op", () => {
  it("appends an active element without mutating the input", () => {
    const settings = make_settings();
    const before = snapshot(settings);

    const patch = add_element_op(
      "sidebarLeft",
      "communityTeam",
      true,
    )(settings);

    expect(patch?.pageLayoutConfig?.containers.sidebarLeft.elements).toEqual([
      { id: "communityTeam", active: true },
    ]);
    expect(patch).not.toHaveProperty("community_show_leadership");
    expect(snapshot(settings)).toEqual(before);
  });

  it("turns the flag of a hidden block on in the same patch", () => {
    const patch = add_element_op(
      "sidebarLeft",
      "communityDescription",
      true,
    )(make_settings({ community_show_description: false }));

    expect(patch?.pageLayoutConfig?.containers.sidebarLeft.elements).toEqual([
      { id: "communityDescription", active: true },
    ]);
    expect(patch?.community_show_description).toBe(true);
  });

  it("returns null for communitySidebar, a block already in the layout and an element of the other mode", () => {
    const settings = make_settings();
    expect(
      add_element_op("sidebarLeft", "communitySidebar", true)(settings),
    ).toBeNull();
    expect(
      add_element_op("sidebarLeft", "communityRules", true)(settings),
    ).toBeNull();
    expect(
      add_element_op("sidebarLeft", "authorProfile", true)(settings),
    ).toBeNull();
    expect(add_element_op("top", "header", true)(settings)).toBeNull();
  });

  it("returns null for an element already used in another slot", () => {
    const settings = make_settings();
    expect(add_element_op("bottom", "header", true)(settings)).toBeNull();
    expect(add_element_op("top", "footer", true)(settings)).toBeNull();
    expect(
      add_element_op("sidebarLeft", "communityProfile", true)(settings),
    ).toBeNull();
  });
});

describe("show_block_op", () => {
  it("sets the block flag to true", () => {
    expect(
      show_block_op("communityTeam")(
        make_settings({ community_show_leadership: false }),
      ),
    ).toEqual({
      community_show_leadership: true,
    });
  });

  it("returns null for a block already shown and for a non-block element", () => {
    expect(show_block_op("communityTeam")(make_settings())).toBeNull();
    expect(
      show_block_op("header")(
        make_settings({ community_show_leadership: false }),
      ),
    ).toBeNull();
  });
});
