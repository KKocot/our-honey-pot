// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Presets and home section placement (ADR 6ad727f6): presets never carry placement, so applying one must keep the
// owner's placements as data; where a placed section renders after a template change is the render helper's job.

import { describe, expect, it } from "vitest";
import {
  apply_preset_parts,
  type PresetParts,
} from "../../src/components/admin/presets";
import type { PageLayoutConfig } from "../../src/components/admin/types/layout";
import {
  get_default_settings,
  type HomeSection,
  type HomeSectionType,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import { get_section_definition } from "../../src/shared/components/sections/registry";
import type { AnySectionDefinition } from "../../src/shared/components/sections/registry-types";

function section(
  id: string,
  type: HomeSectionType,
  content: Record<string, unknown>,
  placement?: HomeSection["placement"],
): HomeSection {
  const definition: AnySectionDefinition = get_section_definition(type);
  return {
    id,
    type,
    content,
    style: definition.defaults().style,
    ...(placement ? { placement } : {}),
  } as HomeSection;
}

const POSTS = section("posts001", "posts", {});
const SIDEBAR_QUOTE = section(
  "quot0001",
  "quote",
  { text: "Slow is smooth." },
  { container: "sidebarLeft", index: 1 },
);
const TOP_MEDIA = section(
  "media001",
  "text-media",
  { title: "Our apiary" },
  { container: "top", index: 0 },
);

function layout(template: PageLayoutConfig["template"]): PageLayoutConfig {
  return {
    template,
    containers: {
      top: { elements: [{ id: "header", active: true }] },
      sidebarLeft: { elements: [{ id: "authorProfile", active: true }] },
      sidebarRight: { elements: [] },
      bottom: { elements: [{ id: "footer", active: true }] },
    },
  };
}

function settings_with(sections: HomeSection[]): SettingsData {
  const settings = get_default_settings(false);
  settings.pageLayoutConfig = layout("sidebar-left");
  settings.home = { sections };
  return settings;
}

function parts(
  template: PageLayoutConfig["template"],
  home?: PresetParts["home"],
): PresetParts {
  return {
    name: "Test",
    layout: { pageLayoutConfig: layout(template) },
    style: {},
    ...(home ? { home } : {}),
  };
}

const placements_by_id = (sections: readonly HomeSection[]) =>
  Object.fromEntries(
    sections.map((entry) => [entry.id, entry.placement ?? null]),
  );

describe("preset apply keeps section placement", () => {
  it("append-missing keeps the placement of existing sections and adds new ones to main", () => {
    const current = settings_with([TOP_MEDIA, SIDEBAR_QUOTE, POSTS]);
    const result = apply_preset_parts(
      parts("sidebar-left", { sections: ["hero", "quote", "faq", "posts"] }),
      current,
      "layout",
      false,
      { sections_mode: "append-missing", random: () => 0.3 },
    );

    const sections = result.patch.home?.sections ?? [];
    expect(result.added_sections_count).toBe(2);
    expect(placements_by_id(sections)).toMatchObject({
      media001: { container: "top", index: 0 },
      quot0001: { container: "sidebarLeft", index: 1 },
      posts001: null,
    });
    const added = sections.filter(
      (entry) => !["media001", "quot0001", "posts001"].includes(entry.id),
    );
    expect(added.map((entry) => entry.type)).toEqual(["hero", "faq"]);
    expect(added.every((entry) => entry.placement === undefined)).toBe(true);
  });

  it("append-missing does not count a placed section as missing", () => {
    const current = settings_with([SIDEBAR_QUOTE, POSTS]);
    const result = apply_preset_parts(
      parts("sidebar-left", { sections: ["quote", "posts"] }),
      current,
      "full",
      false,
      { sections_mode: "append-missing" },
    );
    expect(result.added_sections_count).toBe(0);
    expect(result.patch.home).toBeUndefined();
  });

  it("replace never carries placement into the preset's sections", () => {
    const current = settings_with([SIDEBAR_QUOTE, POSTS]);
    const result = apply_preset_parts(
      parts("sidebar-left", { sections: ["quote", "posts"] }),
      current,
      "layout",
      false,
      { sections_mode: "replace", random: () => 0.7 },
    );
    const sections = result.patch.home?.sections ?? [];
    expect(sections.map((entry) => entry.type)).toEqual(["quote", "posts"]);
    expect(sections.every((entry) => entry.placement === undefined)).toBe(true);
  });

  it("a layout whose template hides the sidebar keeps the placement as data", () => {
    const current = settings_with([TOP_MEDIA, SIDEBAR_QUOTE, POSTS]);
    const result = apply_preset_parts(
      parts("no-sidebar", { sections: ["hero", "posts"] }),
      current,
      "layout",
      false,
      { sections_mode: "append-missing", random: () => 0.9 },
    );

    expect(result.patch.pageLayoutConfig?.template).toBe("no-sidebar");
    const quote = result.patch.home?.sections.find(
      (entry) => entry.id === "quot0001",
    );
    expect(quote?.placement).toEqual({ container: "sidebarLeft", index: 1 });
  });

  it("skip leaves home and its placements untouched", () => {
    const current = settings_with([SIDEBAR_QUOTE, POSTS]);
    const result = apply_preset_parts(
      parts("no-sidebar", { sections: ["hero", "posts"] }),
      current,
      "layout",
      false,
      { sections_mode: "skip" },
    );
    expect(result.patch.home).toBeUndefined();
    expect(current.home?.sections[0].placement).toEqual({
      container: "sidebarLeft",
      index: 1,
    });
  });
});
