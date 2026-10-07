// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it, vi } from "vitest";

vi.mock("@hiveio/workerbee/blog-logic", () => ({
  DataProvider: vi.fn(),
  getWax: vi.fn(),
  withRetry: vi.fn(),
  formatJoinDate: vi.fn(),
  calculateEffectiveHP: vi.fn(),
}));
vi.mock("../../src/lib/config-pipeline", () => ({
  load_config_with_status: vi.fn(),
}));
vi.mock("../../src/components/admin/hive-broadcast", () => ({
  config_error_message: vi.fn(),
}));
vi.mock("../../src/lib/queries", () => ({
  ensure_endpoints_configured: vi.fn(),
  fetch_community: vi.fn(),
  fetch_community_posts: vi.fn(),
}));
vi.mock("../../src/lib/config", () => ({
  get_hive_username: () => "",
  LAYOUT_CONSTANTS: {},
  COMMENT_CONSTANTS: {},
}));
vi.mock("../../src/components/admin/store", () => ({
  setHasUnsavedChanges: vi.fn(),
}));

import {
  CONTAINER_SECTION_IDS,
  add_card_element,
  add_card_section,
  add_element,
  is_container_element_allowed,
  move_card_node,
  move_element,
  move_section,
  remove_card_node,
  remove_element,
  template_after_move,
  template_hiding,
  template_showing,
  toggle_card_orientation,
  toggle_element_active,
  update_card_section_at_path,
  with_instance_override,
  without_instance_override,
  type PageLayoutState,
} from "../../src/components/admin/canvas/layout-ops";
import {
  INSTANCE_OVERRIDE_RANGES,
  MAX_INSTANCE_OVERRIDES,
  instance_key,
  type InstanceOverrides,
} from "../../src/components/admin/types/settings";
import type { CardLayout } from "../../src/components/admin/types/layout";
import { setHasUnsavedChanges } from "../../src/components/admin/store";
import {
  apply_layout_op,
  clear_instance_override,
  set_global_size,
  set_instance_override,
  settings,
  updateSettingsImmediate,
} from "../../src/components/admin/queries";

const TOP = CONTAINER_SECTION_IDS.top;
const LEFT = CONTAINER_SECTION_IDS.sidebarLeft;
const RIGHT = CONTAINER_SECTION_IDS.sidebarRight;

function make_state(): PageLayoutState {
  return {
    pageLayoutConfig: {
      template: "both-sidebars",
      containers: {
        top: { elements: [{ id: "header", active: true }] },
        sidebarLeft: {
          elements: [
            { id: "authorProfile", active: true },
            { id: "communityProfile", active: true },
          ],
        },
        sidebarRight: { elements: [{ id: "communitySidebar", active: false }] },
        bottom: { elements: [{ id: "footer", active: true }] },
      },
    },
    instanceOverrides: {
      [instance_key(LEFT, "authorProfile")]: { authorAvatarSizePx: 64 },
      [instance_key(LEFT, "communityProfile")]: {
        community_title_size_px: 20,
      },
    },
  };
}

function ids(
  state: PageLayoutState,
  container: "top" | "sidebarLeft" | "sidebarRight" | "bottom",
): string[] {
  return state.pageLayoutConfig.containers[container].elements.map(
    (element) => element.id,
  );
}

function frozen_copy<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze_deep = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    Object.freeze(node);
    for (const child of Object.values(node)) freeze_deep(child);
  };
  freeze_deep(copy);
  return copy;
}

describe("page layout ops", () => {
  it("reorders an element within its container and keeps its overrides", () => {
    const next = move_element(
      make_state(),
      { container: "sidebarLeft", index: 0 },
      { container: "sidebarLeft", index: 1 },
    );
    expect(next && ids(next, "sidebarLeft")).toEqual([
      "communityProfile",
      "authorProfile",
    ]);
    expect(next?.instanceOverrides).toEqual(make_state().instanceOverrides);
  });

  it("moves an element to another container together with its override key", () => {
    const next = move_element(
      make_state(),
      { container: "sidebarLeft", index: 0 },
      { container: "sidebarRight", index: 0 },
    );
    expect(next && ids(next, "sidebarLeft")).toEqual(["communityProfile"]);
    expect(next && ids(next, "sidebarRight")).toEqual([
      "authorProfile",
      "communitySidebar",
    ]);
    expect(
      next?.instanceOverrides[instance_key(RIGHT, "authorProfile")],
    ).toEqual({ authorAvatarSizePx: 64 });
    expect(next?.instanceOverrides).not.toHaveProperty(
      instance_key(LEFT, "authorProfile"),
    );
  });

  it("rejects a move that would duplicate an element in the target container", () => {
    const state = make_state();
    state.pageLayoutConfig.containers.top.elements.push({
      id: "authorProfile",
      active: true,
    });
    expect(
      move_element(
        state,
        { container: "sidebarLeft", index: 0 },
        { container: "top", index: 0 },
      ),
    ).toBeNull();
    expect(
      move_element(
        state,
        { container: "sidebarLeft", index: 9 },
        { container: "top", index: 0 },
      ),
    ).toBeNull();
  });

  it("moves a whole section to another slot with all override keys", () => {
    const next = move_section(make_state(), "sidebarLeft", "top");
    expect(next && ids(next, "sidebarLeft")).toEqual([]);
    expect(next && ids(next, "top")).toEqual([
      "header",
      "authorProfile",
      "communityProfile",
    ]);
    expect(next?.instanceOverrides).toEqual({
      [instance_key(TOP, "authorProfile")]: { authorAvatarSizePx: 64 },
      [instance_key(TOP, "communityProfile")]: { community_title_size_px: 20 },
    });
    expect(move_section(make_state(), "sidebarLeft", "sidebarLeft")).toBeNull();
    expect(
      move_section(
        make_state(),
        "sidebarLeft",
        "sidebarRight",
        0,
      )?.pageLayoutConfig.containers.sidebarRight.elements.map((e) => e.id),
    ).toEqual(["authorProfile", "communityProfile", "communitySidebar"]);
  });

  it("toggles active without dropping overrides", () => {
    const next = toggle_element_active(make_state(), {
      container: "sidebarLeft",
      index: 0,
    });
    expect(
      next?.pageLayoutConfig.containers.sidebarLeft.elements[0].active,
    ).toBe(false);
    expect(next?.instanceOverrides).toEqual(make_state().instanceOverrides);
    expect(
      toggle_element_active(make_state(), { container: "top", index: 5 }),
    ).toBeNull();
  });

  it("adds an allowed element and rejects disallowed or duplicated ones", () => {
    const next = add_element(
      make_state(),
      "bottom",
      "communitySidebar",
      true,
      0,
    );
    expect(next && ids(next, "bottom")).toEqual(["communitySidebar", "footer"]);

    expect(
      add_element(make_state(), "bottom", "authorProfile", true),
    ).toBeNull();
    expect(
      add_element(make_state(), "bottom", "communityProfile", false),
    ).toBeNull();
    expect(add_element(make_state(), "bottom", "posts", true)).toBeNull();
    expect(add_element(make_state(), "bottom", "unknown", true)).toBeNull();
    expect(add_element(make_state(), "top", "header", true)).toBeNull();
  });

  it("checks allowed container elements per mode", () => {
    expect(is_container_element_allowed("authorProfile", false)).toBe(true);
    expect(is_container_element_allowed("authorProfile", true)).toBe(false);
    expect(is_container_element_allowed("communitySidebar", true)).toBe(true);
    expect(is_container_element_allowed("navigation", false)).toBe(false);
  });

  it("removes an element together with its overrides", () => {
    const next = remove_element(make_state(), {
      container: "sidebarLeft",
      index: 0,
    });
    expect(next && ids(next, "sidebarLeft")).toEqual(["communityProfile"]);
    expect(next?.instanceOverrides).toEqual({
      [instance_key(LEFT, "communityProfile")]: { community_title_size_px: 20 },
    });
    expect(
      remove_element(make_state(), { container: "top", index: 3 }),
    ).toBeNull();
  });

  it("never mutates the input state", () => {
    const state = frozen_copy(make_state());
    const snapshot = structuredClone(state);
    move_element(
      state,
      { container: "sidebarLeft", index: 0 },
      { container: "sidebarRight", index: 0 },
    );
    move_element(
      state,
      { container: "sidebarLeft", index: 0 },
      { container: "sidebarLeft", index: 1 },
    );
    move_section(state, "sidebarLeft", "bottom");
    toggle_element_active(state, { container: "top", index: 0 });
    add_element(state, "bottom", "communitySidebar", true);
    remove_element(state, { container: "sidebarLeft", index: 0 });
    expect(state).toEqual(snapshot);
  });

  it("returns a copy that does not share nested objects with the input", () => {
    const state = make_state();
    const next = toggle_element_active(state, { container: "top", index: 0 });
    expect(next?.pageLayoutConfig.containers.sidebarLeft).not.toBe(
      state.pageLayoutConfig.containers.sidebarLeft,
    );
    expect(
      next?.instanceOverrides[instance_key(LEFT, "authorProfile")],
    ).not.toBe(state.instanceOverrides[instance_key(LEFT, "authorProfile")]);
  });
});

describe("template sync after a move", () => {
  it("shows a hidden target sidebar and leaves visible ones alone", () => {
    expect(template_showing("no-sidebar", "sidebarLeft")).toBe("sidebar-left");
    expect(template_showing("sidebar-right", "sidebarLeft")).toBe(
      "both-sidebars",
    );
    expect(template_showing("sidebar-left", "sidebarRight")).toBe(
      "both-sidebars",
    );
    expect(template_showing("sidebar-left", "sidebarLeft")).toBe(
      "sidebar-left",
    );
    expect(template_showing("no-sidebar", "top")).toBe("no-sidebar");
  });

  it("hides a sidebar, keeping the other one", () => {
    expect(template_hiding("both-sidebars", "sidebarLeft")).toBe(
      "sidebar-right",
    );
    expect(template_hiding("both-sidebars", "sidebarRight")).toBe(
      "sidebar-left",
    );
    expect(template_hiding("sidebar-left", "sidebarLeft")).toBe("no-sidebar");
    expect(template_hiding("sidebar-right", "sidebarLeft")).toBe(
      "sidebar-right",
    );
    expect(template_hiding("both-sidebars", "bottom")).toBe("both-sidebars");
  });

  it("turns off the source sidebar once its last element leaves", () => {
    const state = make_state();
    state.pageLayoutConfig.template = "sidebar-left";
    state.pageLayoutConfig.containers.sidebarLeft.elements = [
      { id: "authorProfile", active: true },
    ];
    const next = move_element(
      state,
      { container: "sidebarLeft", index: 0 },
      { container: "top", index: 1 },
    );
    expect(next && template_after_move(next, "sidebarLeft", "top")).toBe(
      "no-sidebar",
    );
  });

  it("swaps sidebars when the last element moves to the hidden one", () => {
    const state = make_state();
    state.pageLayoutConfig.template = "sidebar-left";
    state.pageLayoutConfig.containers.sidebarLeft.elements = [
      { id: "authorProfile", active: true },
    ];
    const next = move_element(
      state,
      { container: "sidebarLeft", index: 0 },
      { container: "sidebarRight", index: 0 },
    );
    expect(
      next && template_after_move(next, "sidebarLeft", "sidebarRight"),
    ).toBe("sidebar-right");
  });

  it("keeps the source sidebar while a rendered element remains", () => {
    const next = move_element(
      make_state(),
      { container: "sidebarLeft", index: 0 },
      { container: "top", index: 1 },
    );
    expect(next && template_after_move(next, "sidebarLeft", "top")).toBe(
      "both-sidebars",
    );
  });

  it("hides the source sidebar when only unrendered elements remain", () => {
    const next = move_element(
      make_state(),
      { container: "sidebarLeft", index: 1 },
      { container: "top", index: 1 },
    );
    const community_only = (element: { id: string; active: boolean }) =>
      element.active && element.id !== "authorProfile";
    expect(
      next && template_after_move(next, "sidebarLeft", "top", community_only),
    ).toBe("sidebar-right");
  });

  it("hides the source sidebar after moving the whole section", () => {
    const next = move_section(make_state(), "sidebarLeft", "bottom");
    expect(next && template_after_move(next, "sidebarLeft", "bottom")).toBe(
      "sidebar-right",
    );
  });

  it("never hides on a move within the same container", () => {
    const state = make_state();
    expect(template_after_move(state, "sidebarRight", "sidebarRight")).toBe(
      "both-sidebars",
    );
  });
});

describe("instance override helpers", () => {
  const key = instance_key(LEFT, "authorProfile");

  it("sets an in-range whitelisted value", () => {
    const next = with_instance_override(
      {},
      LEFT,
      "authorProfile",
      "authorAvatarSizePx",
      80,
    );
    expect(next).toEqual({ [key]: { authorAvatarSizePx: 80 } });
  });

  it("rejects out-of-range values and keys outside the element whitelist", () => {
    const range = INSTANCE_OVERRIDE_RANGES.authorAvatarSizePx;
    expect(
      with_instance_override(
        {},
        LEFT,
        "authorProfile",
        "authorAvatarSizePx",
        range.max + 1,
      ),
    ).toBeNull();
    expect(
      with_instance_override(
        {},
        LEFT,
        "authorProfile",
        "authorAvatarSizePx",
        50.5,
      ),
    ).toBeNull();
    expect(
      with_instance_override({}, LEFT, "authorProfile", "gridColumns", 2),
    ).toBeNull();
    expect(
      with_instance_override({}, LEFT, "header", "gridColumns", 2),
    ).toBeNull();
  });

  it("rejects a new entry when the map is full", () => {
    const full: InstanceOverrides = {};
    for (let i = 0; i < MAX_INSTANCE_OVERRIDES; i++)
      full[`sec-${i}:posts`] = { gridColumns: 2 };
    expect(
      with_instance_override(
        full,
        LEFT,
        "authorProfile",
        "authorAvatarSizePx",
        80,
      ),
    ).toBeNull();
    expect(
      with_instance_override(full, "sec-0", "posts", "gridColumns", 3)?.[
        "sec-0:posts"
      ],
    ).toEqual({
      gridColumns: 3,
    });
  });

  it("clears one key or the whole entry without mutating the input", () => {
    const overrides = frozen_copy<InstanceOverrides>({
      [key]: { authorAvatarSizePx: 80, authorMetaSizePx: 12 },
    });
    expect(
      without_instance_override(
        overrides,
        LEFT,
        "authorProfile",
        "authorAvatarSizePx",
      ),
    ).toEqual({
      [key]: { authorMetaSizePx: 12 },
    });
    expect(without_instance_override(overrides, LEFT, "authorProfile")).toEqual(
      {},
    );
    expect(
      without_instance_override(
        { [key]: { authorMetaSizePx: 12 } },
        LEFT,
        "authorProfile",
        "authorMetaSizePx",
      ),
    ).toEqual({});
  });
});

describe("card layout ops", () => {
  function make_layout(): CardLayout {
    return {
      sections: [
        {
          id: "s0",
          orientation: "horizontal",
          children: [
            { type: "element", id: "thumbnail" },
            {
              type: "section",
              section: {
                id: "s0-1",
                orientation: "vertical",
                children: [
                  { type: "element", id: "title" },
                  { type: "element", id: "summary" },
                ],
              },
            },
          ],
        },
        {
          id: "s1",
          orientation: "horizontal",
          children: [{ type: "element", id: "meta" }],
        },
      ],
    };
  }
  const ALLOWED = ["thumbnail", "avatar", "title", "summary", "meta", "tags"];

  it("updates a nested section by path", () => {
    const sections = update_card_section_at_path(
      make_layout().sections,
      [0, 1],
      (section) => ({
        ...section,
        id: "renamed",
      }),
    );
    const nested = sections[0].children[1];
    expect(nested.type === "section" && nested.section.id).toBe("renamed");
  });

  it("toggles orientation of a nested section", () => {
    const next = toggle_card_orientation(make_layout(), [0, 1]);
    const nested = next?.sections[0].children[1];
    expect(nested?.type === "section" && nested.section.orientation).toBe(
      "horizontal",
    );
    expect(toggle_card_orientation(make_layout(), [0, 0])).toBeNull();
  });

  it("adds sections and elements, rejecting used or disallowed elements", () => {
    expect(
      add_card_section(make_layout(), [], "s2")?.sections.map((s) => s.id),
    ).toEqual(["s0", "s1", "s2"]);
    const nested = add_card_section(make_layout(), [1], "s1-1")?.sections[1]
      .children[1];
    expect(nested).toEqual({
      type: "section",
      section: { id: "s1-1", orientation: "horizontal", children: [] },
    });

    expect(
      add_card_element(make_layout(), [1], "tags", ALLOWED)?.sections[1]
        .children,
    ).toEqual([
      { type: "element", id: "meta" },
      { type: "element", id: "tags" },
    ]);
    expect(add_card_element(make_layout(), [1], "title", ALLOWED)).toBeNull();
    expect(add_card_element(make_layout(), [1], "bogus", ALLOWED)).toBeNull();
  });

  it("removes nested and top-level nodes", () => {
    const nested = remove_card_node(make_layout(), [0, 1, 0])?.sections[0]
      .children[1];
    expect(nested?.type === "section" && nested.section.children).toEqual([
      { type: "element", id: "summary" },
    ]);
    expect(
      remove_card_node(make_layout(), [1])?.sections.map((s) => s.id),
    ).toEqual(["s0"]);
    expect(remove_card_node(make_layout(), [0, 7])).toBeNull();
  });

  it("moves an element out of a nested section to another top-level section", () => {
    const next = move_card_node(make_layout(), [0, 1, 1], [1], 0);
    expect(next?.sections[1].children).toEqual([
      { type: "element", id: "summary" },
      { type: "element", id: "meta" },
    ]);
  });

  it("moves a nested section to top level and a top-level section into a nested level", () => {
    const lifted = move_card_node(make_layout(), [0, 1], [], 0);
    expect(lifted?.sections.map((s) => s.id)).toEqual(["s0-1", "s0", "s1"]);

    const sunk = move_card_node(make_layout(), [1], [0, 1], 2);
    const nested = sunk?.sections[0].children[1];
    expect(sunk?.sections).toHaveLength(1);
    expect(nested?.type === "section" && nested.section.children[2]).toEqual({
      type: "section",
      section: {
        id: "s1",
        orientation: "horizontal",
        children: [{ type: "element", id: "meta" }],
      },
    });
  });

  it("adjusts the target path when an earlier sibling is removed", () => {
    const next = move_card_node(make_layout(), [0], [1], 0);
    expect(next?.sections.map((s) => s.id)).toEqual(["s1"]);
    expect(next?.sections[0].children[0]).toMatchObject({
      type: "section",
      section: { id: "s0" },
    });
  });

  it("rejects an element at top level and a section dropped into itself", () => {
    expect(move_card_node(make_layout(), [0, 0], [], 0)).toBeNull();
    expect(move_card_node(make_layout(), [0], [0, 1], 0)).toBeNull();
    expect(move_card_node(make_layout(), [0, 1], [0, 1], 0)).toBeNull();
    expect(move_card_node(make_layout(), [0, 9], [1], 0)).toBeNull();
  });

  it("never mutates the input layout", () => {
    const layout = frozen_copy(make_layout());
    const snapshot = structuredClone(layout);
    toggle_card_orientation(layout, [0, 1]);
    add_card_section(layout, [0], "x");
    add_card_element(layout, [0, 1], "tags", ALLOWED);
    remove_card_node(layout, [0, 1, 0]);
    move_card_node(layout, [0, 1, 1], [1], 0);
    move_card_node(layout, [1], [0, 1], 0);
    expect(layout).toEqual(snapshot);
  });
});

describe("settings store actions", () => {
  const dirty = vi.mocked(setHasUnsavedChanges);

  function reset_store(): void {
    updateSettingsImmediate({ ...make_state(), authorAvatarSizePx: 64 });
    dirty.mockClear();
  }

  it("sets and clears instance overrides with range validation", () => {
    reset_store();
    expect(
      set_instance_override(TOP, "authorProfile", "authorAvatarSizePx", 90),
    ).toBe(true);
    expect(
      settings.instanceOverrides?.[instance_key(TOP, "authorProfile")],
    ).toEqual({ authorAvatarSizePx: 90 });
    expect(dirty).toHaveBeenLastCalledWith(true);

    dirty.mockClear();
    expect(
      set_instance_override(TOP, "authorProfile", "authorAvatarSizePx", 9999),
    ).toBe(false);
    expect(dirty).not.toHaveBeenCalled();

    clear_instance_override(TOP, "authorProfile", "authorAvatarSizePx");
    expect(settings.instanceOverrides).not.toHaveProperty(
      instance_key(TOP, "authorProfile"),
    );
    clear_instance_override(LEFT, "communityProfile");
    expect(settings.instanceOverrides).not.toHaveProperty(
      instance_key(LEFT, "communityProfile"),
    );
    expect(dirty).toHaveBeenLastCalledWith(true);
  });

  it("sets a global size after validation (debounced)", () => {
    vi.useFakeTimers();
    try {
      reset_store();
      expect(set_global_size("authorAvatarSizePx", 1)).toBe(false);
      expect(set_global_size("authorAvatarSizePx", 100)).toBe(true);
      vi.runAllTimers();
      expect(settings.authorAvatarSizePx).toBe(100);
      expect(dirty).toHaveBeenLastCalledWith(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies a layout op and ignores rejected ones", () => {
    reset_store();
    expect(apply_layout_op(() => null)).toBe(false);
    expect(dirty).not.toHaveBeenCalled();

    const applied = apply_layout_op((current) =>
      move_element(
        {
          pageLayoutConfig: current.pageLayoutConfig,
          instanceOverrides: current.instanceOverrides ?? {},
        },
        { container: "sidebarLeft", index: 0 },
        { container: "bottom", index: 0 },
      ),
    );
    expect(applied).toBe(true);
    expect(
      settings.pageLayoutConfig.containers.bottom.elements.map((e) => e.id),
    ).toEqual(["authorProfile", "footer"]);
    expect(
      settings.instanceOverrides?.[
        instance_key(CONTAINER_SECTION_IDS.bottom, "authorProfile")
      ],
    ).toEqual({
      authorAvatarSizePx: 64,
    });
    expect(dirty).toHaveBeenLastCalledWith(true);
  });
});
