// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  add_section_to_container,
  move_section_placement,
} from "../../src/components/admin/canvas/container-section-ops";
import { addable_sections } from "../../src/components/admin/canvas/element-ops";
import type {
  LayoutTemplate,
  PageLayoutConfig,
} from "../../src/components/admin/types/layout";
import {
  HOME_MAX_SECTIONS,
  defaultSettings,
  type HomeSection,
  type SettingsData,
} from "../../src/components/admin/types/settings";

const POSTS: HomeSection = {
  id: "feed0001",
  type: "posts",
  content: {},
  style: { width: "content", spacing: "md", bg: "none", overlay: "dark-50" },
} as HomeSection;

function quote(id: string, placement?: HomeSection["placement"]): HomeSection {
  return {
    id,
    type: "quote",
    content: { text: "Slow is smooth." },
    style: { width: "content", spacing: "md", bg: "none", overlay: "dark-50" },
    ...(placement ? { placement } : {}),
  } as HomeSection;
}

function make_settings(
  template: LayoutTemplate = "sidebar-right",
  sections: HomeSection[] = [POSTS],
): SettingsData {
  const pageLayoutConfig: PageLayoutConfig = {
    template,
    containers: {
      top: { elements: [{ id: "header", active: true }] },
      sidebarLeft: { elements: [] },
      sidebarRight: {
        elements: [
          { id: "authorProfile", active: true },
          { id: "communityDescription", active: true },
        ],
      },
      bottom: { elements: [{ id: "footer", active: true }] },
    },
  };
  return { ...defaultSettings, pageLayoutConfig, home: { sections } };
}

function without_layout(): SettingsData {
  return {
    ...make_settings(),
    pageLayoutConfig: { template: "sidebar-right" } as PageLayoutConfig,
  };
}

const snapshot = (value: unknown) => JSON.parse(JSON.stringify(value));
const fixed_random = () => 0.5;

describe("add_section_to_container", () => {
  it("adds one section first in the container in a single home patch", () => {
    const settings = make_settings();
    const before = snapshot(settings);

    const patch = add_section_to_container(settings, "sidebarRight", "quote");

    expect(patch).not.toBeNull();
    expect(Object.keys(patch!)).toEqual(["home"]);
    const sections = patch!.home!.sections;
    expect(sections).toHaveLength(2);
    const added = sections[1];
    expect(added.type).toBe("quote");
    expect(added.id).toMatch(/^[a-z0-9]{8}$/);
    expect(added.placement).toEqual({ container: "sidebarRight", index: 0 });
    expect(added.content).toEqual({
      text: expect.any(String),
      cite: expect.any(String),
    });
    expect(snapshot(settings)).toEqual(before);
  });

  it("puts the section before the elements of any target container", () => {
    expect(
      add_section_to_container(make_settings(), "top", "hero")?.home
        ?.sections[1].placement,
    ).toEqual({ container: "top", index: 0 });
    expect(
      add_section_to_container(make_settings(), "sidebarLeft", "faq")?.home
        ?.sections[1].placement,
    ).toEqual({ container: "sidebarLeft", index: 0 });
  });

  it("puts a second section into the same container before the first one", () => {
    const first = add_section_to_container(
      make_settings(),
      "bottom",
      "quote",
      fixed_random,
    )!;
    const first_id = first.home!.sections[1].id;
    const settings = make_settings("sidebar-right", first.home!.sections);
    const second = add_section_to_container(settings, "bottom", "quote")!;
    const ids = second.home!.sections.map((section) => section.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[2]).toBe(first_id);
    expect(second.home!.sections.slice(1).map((s) => s.placement)).toEqual([
      { container: "bottom", index: 0 },
      { container: "bottom", index: 0 },
    ]);
  });

  it("goes before every section of its container and leaves other sections in order", () => {
    const settings = make_settings("sidebar-right", [
      quote("main0001"),
      quote("top00001", { container: "top", index: 0 }),
      POSTS,
      quote("side0001", { container: "sidebarRight", index: 2 }),
      quote("side0002", { container: "sidebarRight", index: 0 }),
    ]);

    const patch = add_section_to_container(settings, "sidebarRight", "faq")!;

    const ids = patch.home!.sections.map((section) => section.id);
    const added = patch.home!.sections[3];
    expect(added.type).toBe("faq");
    expect(added.placement).toEqual({ container: "sidebarRight", index: 0 });
    expect(ids).toEqual([
      "main0001",
      "top00001",
      "feed0001",
      added.id,
      "side0001",
      "side0002",
    ]);
  });

  it("shows a sidebar hidden by the template in the same patch", () => {
    const settings = make_settings("sidebar-right");
    const before = snapshot(settings);

    const patch = add_section_to_container(settings, "sidebarLeft", "about")!;

    expect(Object.keys(patch).sort()).toEqual(["home", "pageLayoutConfig"]);
    expect(patch.pageLayoutConfig?.template).toBe("both-sidebars");
    expect(patch.pageLayoutConfig?.containers).toEqual(
      settings.pageLayoutConfig?.containers,
    );
    expect(patch.home?.sections[1].placement).toEqual({
      container: "sidebarLeft",
      index: 0,
    });
    expect(snapshot(settings)).toEqual(before);
  });

  it("turns no-sidebar into the single sidebar it needs", () => {
    const patch = add_section_to_container(
      make_settings("no-sidebar"),
      "sidebarRight",
      "links",
    );
    expect(patch?.pageLayoutConfig?.template).toBe("sidebar-right");
  });

  it.each(["hero", "cta-band"] as const)("rejects %s in a sidebar", (type) => {
    expect(
      add_section_to_container(make_settings(), "sidebarLeft", type),
    ).toBeNull();
    expect(
      add_section_to_container(make_settings(), "sidebarRight", type),
    ).toBeNull();
  });

  it("rejects posts, a type at its max_per_page and a full page", () => {
    expect(
      add_section_to_container(
        make_settings(),
        "top",
        "posts" as unknown as "quote",
      ),
    ).toBeNull();

    const two_quotes = make_settings("sidebar-right", [
      quote("quot0001", { container: "top", index: 0 }),
      quote("quot0002"),
      POSTS,
    ]);
    expect(add_section_to_container(two_quotes, "bottom", "quote")).toBeNull();

    const full = make_settings("sidebar-right", [
      ...(Array.from({ length: HOME_MAX_SECTIONS - 1 }, (_, i) => ({
        ...quote(`full000${i}`),
        type: "text-media",
        content: { title: `Title ${i}` },
      })) as HomeSection[]),
      POSTS,
    ]);
    expect(add_section_to_container(full, "bottom", "faq")).toBeNull();
  });

  it("rejects a page without a layout", () => {
    expect(
      add_section_to_container(without_layout(), "top", "quote"),
    ).toBeNull();
  });
});

describe("move_section_placement", () => {
  const placed = () =>
    make_settings("sidebar-right", [
      quote("quot0001", { container: "sidebarRight", index: 0 }),
      POSTS,
    ]);

  it("moves a section to another container, clamping the index to its element count", () => {
    const patch = move_section_placement(placed(), "quot0001", {
      container: "bottom",
      index: 9,
    });
    expect(Object.keys(patch!)).toEqual(["home"]);
    expect(patch!.home!.sections[0].placement).toEqual({
      container: "bottom",
      index: 1,
    });
  });

  it("drops the placement when moved to main", () => {
    const patch = move_section_placement(placed(), "quot0001", {
      container: "main",
      index: 0,
    });
    expect(patch!.home!.sections[0]).not.toHaveProperty("placement");
  });

  it("shows a hidden target sidebar in the same patch", () => {
    const patch = move_section_placement(placed(), "quot0001", {
      container: "sidebarLeft",
      index: 0,
    });
    expect(patch?.pageLayoutConfig?.template).toBe("both-sidebars");
  });

  it("rejects unknown ids, disallowed containers and no-op moves", () => {
    expect(
      move_section_placement(placed(), "missing0", {
        container: "top",
        index: 0,
      }),
    ).toBeNull();
    expect(
      move_section_placement(placed(), "feed0001", {
        container: "top",
        index: 0,
      }),
    ).toBeNull();
    expect(
      move_section_placement(placed(), "quot0001", {
        container: "sidebarRight",
        index: 0,
      }),
    ).toBeNull();
    const hero = make_settings("sidebar-right", [
      {
        ...quote("hero0001"),
        type: "hero",
        content: { headline: "Hi" },
      } as HomeSection,
      POSTS,
    ]);
    expect(
      move_section_placement(hero, "hero0001", {
        container: "sidebarLeft",
        index: 0,
      }),
    ).toBeNull();
  });
});

describe("move_section_placement tie-break", () => {
  const tied = () =>
    make_settings("sidebar-right", [
      quote("quot0001", { container: "sidebarRight", index: 1 }),
      quote("quot0002", { container: "sidebarRight", index: 1 }),
      POSTS,
    ]);
  const ids = (patch: ReturnType<typeof move_section_placement>) =>
    patch!.home!.sections.map((section) => section.id);

  it("swaps two sections with the same index through `before`", () => {
    const settings = tied();
    const before = snapshot(settings);

    const patch = move_section_placement(settings, "quot0002", {
      container: "sidebarRight",
      index: 1,
      before: "quot0001",
    });

    expect(patch).not.toBeNull();
    expect(ids(patch)).toEqual(["quot0002", "quot0001", "feed0001"]);
    expect(patch!.home!.sections.map((section) => section.placement)).toEqual([
      { container: "sidebarRight", index: 1 },
      { container: "sidebarRight", index: 1 },
      undefined,
    ]);
    expect(snapshot(settings)).toEqual(before);
  });

  it("puts the section behind the anchor through `after`", () => {
    const patch = move_section_placement(tied(), "quot0001", {
      container: "sidebarRight",
      index: 1,
      after: "quot0002",
    });
    expect(ids(patch)).toEqual(["quot0002", "quot0001", "feed0001"]);
  });

  it("orders a section moved in from another slot next to its anchor", () => {
    const settings = make_settings("sidebar-right", [
      quote("quot0001", { container: "sidebarRight", index: 1 }),
      quote("quot0002", { container: "sidebarRight", index: 0 }),
      POSTS,
    ]);
    const patch = move_section_placement(settings, "quot0002", {
      container: "sidebarRight",
      index: 1,
      after: "quot0001",
    });
    expect(ids(patch)).toEqual(["quot0001", "quot0002", "feed0001"]);
    expect(patch!.home!.sections[1].placement).toEqual({
      container: "sidebarRight",
      index: 1,
    });
  });

  it("rejects a tie that changes nothing and ignores an unknown anchor", () => {
    expect(
      move_section_placement(tied(), "quot0001", {
        container: "sidebarRight",
        index: 1,
        before: "quot0002",
      }),
    ).toBeNull();
    expect(
      move_section_placement(tied(), "quot0001", {
        container: "sidebarRight",
        index: 1,
        before: "missing0",
      }),
    ).toBeNull();
  });
});

describe("addable_sections", () => {
  const types = (
    settings: SettingsData,
    container: Parameters<typeof addable_sections>[1],
  ) => addable_sections(settings, container).map((section) => section.type);

  it("offers sidebar types without hero, cta-band and posts", () => {
    const sidebar = types(make_settings(), "sidebarLeft");
    expect(sidebar).toEqual([
      "text-media",
      "about",
      "links",
      "callout",
      "now",
      "quote",
      "faq",
    ]);
    expect(types(make_settings(), "sidebarRight")).toEqual(sidebar);
  });

  it("offers every type but posts in top and bottom", () => {
    for (const container of ["top", "bottom"] as const) {
      const offered = types(make_settings(), container);
      expect(offered).toContain("hero");
      expect(offered).toContain("cta-band");
      expect(offered).not.toContain("posts");
    }
  });

  it("carries the registry labels", () => {
    expect(addable_sections(make_settings(), "top")[0]).toEqual({
      type: "hero",
      label: "Hero",
    });
  });

  it("applies max_per_page across main and containers", () => {
    const settings = make_settings("sidebar-right", [
      quote("quot0001"),
      quote("quot0002", { container: "bottom", index: 1 }),
      POSTS,
    ]);
    expect(types(settings, "top")).not.toContain("quote");
    expect(types(settings, "sidebarLeft")).not.toContain("quote");
    expect(types(settings, "sidebarLeft")).toContain("about");
  });

  it("is empty once the shared pool of 8 sections is used up", () => {
    const sections = [
      ...Array.from({ length: HOME_MAX_SECTIONS - 1 }, (_, i) =>
        quote(
          `pool000${i}`,
          i % 2 === 0 ? { container: "top", index: 0 } : undefined,
        ),
      ),
      POSTS,
    ];
    const settings = make_settings("sidebar-right", sections);
    expect(HOME_MAX_SECTIONS).toBe(8);
    for (const container of [
      "top",
      "sidebarLeft",
      "sidebarRight",
      "bottom",
    ] as const) {
      expect(addable_sections(settings, container)).toEqual([]);
    }
  });

  it("is empty without a layout", () => {
    expect(addable_sections(without_layout(), "top")).toEqual([]);
  });
});
