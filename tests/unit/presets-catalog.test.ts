// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  BLOG_PRESETS,
  apply_blog_preset,
  get_blog_preset,
  is_preset_home,
  type BlogPreset,
  type PresetSectionSpec,
} from "../../src/components/admin/presets";
import {
  HOME_MAX_SECTIONS,
  get_default_settings,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import { validate_settings_for_save } from "../../src/components/admin/types/settings-schema";
import {
  COMMUNITY_BLOCK_ELEMENT_IDS,
  type PageLayoutConfig,
} from "../../src/components/admin/types/layout";
import { home_save_errors } from "../../src/components/admin/canvas/home-sections/model";
import { get_section_definition } from "../../src/shared/components/sections/registry";

const CATALOG_IDS = [
  "minimal-writer",
  "editorial-magazine",
  "newsletter-classic",
  "dev-garden",
  "photo-journal",
  "community-hub",
  "link-in-bio",
];

const EXPECTED_SECTIONS: Record<string, string[]> = {
  "minimal-writer": ["about", "now", "posts", "links"],
  "editorial-magazine": ["hero", "callout", "posts", "quote"],
  "newsletter-classic": ["hero", "posts", "quote", "about", "faq"],
  "dev-garden": ["about", "callout", "posts", "now", "links"],
  "photo-journal": ["hero", "text-media", "posts", "quote", "about"],
  "community-hub": ["callout", "posts"],
  "link-in-bio": ["about", "links", "now", "posts"],
};

const BLOCK_IDS: ReadonlySet<string> = new Set(COMMUNITY_BLOCK_ELEMENT_IDS);

const mode_cases = BLOG_PRESETS.flatMap((p) =>
  [false, true].map((is_community) => [p.id, is_community] as const),
);

function preset(id: string): BlogPreset {
  const found = get_blog_preset(id);
  if (!found) throw new Error(`missing preset ${id}`);
  return found;
}

function spec_type(spec: PresetSectionSpec): string {
  return typeof spec === "string" ? spec : spec.type;
}

function section_types(p: BlogPreset): string[] {
  return (p.home?.sections ?? []).map(spec_type);
}

function replaced(id: string, is_community: boolean): SettingsData {
  const current = get_default_settings(is_community);
  const { patch } = apply_blog_preset(
    preset(id),
    current,
    "full",
    is_community,
    {
      sections_mode: "replace",
    },
  );
  return { ...current, ...patch };
}

/** Save errors a new section causes on purpose: content left empty from the definition's `must_fill`. */
function is_must_fill_error(settings: SettingsData, error: string): boolean {
  const match = /^home\.sections\.(\d+)\.content\.([\w.]+):/.exec(error);
  if (!match) return false;
  const section = settings.home?.sections[Number(match[1])];
  const definition = get_section_definition(section?.type);
  return definition?.must_fill.includes(match[2]) ?? false;
}

function containers_holding(
  config: PageLayoutConfig | undefined,
  ids: ReadonlySet<string>,
): string[] {
  if (!config) return [];
  return Object.entries(config.containers)
    .filter(([, container]) => container.elements.some((e) => ids.has(e.id)))
    .map(([name]) => name);
}

describe("preset catalog", () => {
  it("has exactly the 7 presets, with unique names and palettes", () => {
    expect(BLOG_PRESETS.map((p) => p.id)).toEqual(CATALOG_IDS);
    expect(new Set(BLOG_PRESETS.map((p) => p.name)).size).toBe(7);
    expect(new Set(BLOG_PRESETS.map((p) => p.style.siteTheme)).size).toBe(7);
  });

  it("gives every preset its own home section sequence from the brief", () => {
    const sequences = BLOG_PRESETS.map((p) => section_types(p).join(">"));
    expect(new Set(sequences).size).toBe(BLOG_PRESETS.length);
    for (const p of BLOG_PRESETS)
      expect(section_types(p), p.id).toEqual(EXPECTED_SECTIONS[p.id]);
  });

  it("names and taglines are English admin copy", () => {
    for (const p of BLOG_PRESETS) {
      expect(p.name).toMatch(/^[A-Za-z][A-Za-z -]+$/);
      expect(p.tagline).toMatch(/^[\x20-\x7e]+$/);
    }
  });
});

describe("preset home sections within limits (23b)", () => {
  it.each(CATALOG_IDS)(
    "%s stays within HOME_MAX_SECTIONS and max_per_page",
    (id) => {
      const home = preset(id).home;
      expect(is_preset_home(home)).toBe(true);
      const types = section_types(preset(id));
      expect(types.length).toBeLessThanOrEqual(HOME_MAX_SECTIONS);
      expect(types.filter((type) => type === "posts")).toHaveLength(1);
      for (const type of new Set(types)) {
        const max = get_section_definition(type)?.max_per_page ?? 0;
        expect(
          types.filter((t) => t === type).length,
          type,
        ).toBeLessThanOrEqual(max);
      }
    },
  );

  it.each(mode_cases)(
    "%s (community=%s): replace keeps every preset section",
    (id, is_community) => {
      const settings = replaced(id, is_community);
      expect(settings.home?.sections.map((s) => s.type)).toEqual(
        EXPECTED_SECTIONS[id],
      );
    },
  );
});

describe("preset applied on the default config (23a, 23c)", () => {
  it.each(mode_cases)(
    "%s (community=%s): validate_settings_for_save fails only on must-fill placeholders",
    (id, is_community) => {
      const settings = replaced(id, is_community);
      const result = validate_settings_for_save(settings);
      const errors = result.ok ? [] : result.errors;
      expect(
        errors.filter((error) => !is_must_fill_error(settings, error)),
      ).toEqual([]);
    },
  );

  it.each(mode_cases)(
    "%s (community=%s): every new section is to be filled in and blocks Save",
    (id, is_community) => {
      const settings = replaced(id, is_community);
      const errors = home_save_errors(settings);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      const non_posts = (settings.home?.sections ?? []).filter(
        (s) => s.type !== "posts",
      );
      expect(errors.map((e) => e.section_id).sort()).toEqual(
        non_posts.map((s) => s.id).sort(),
      );
    },
  );

  it("filling in the placeholders makes the preset savable", () => {
    const settings = replaced("community-hub", false);
    const sections = settings.home?.sections ?? [];
    const callout = sections.find((s) => s.type === "callout");
    if (!callout || callout.type !== "callout")
      throw new Error("missing callout");
    callout.content = {
      tone: "accent",
      title: "New tagging rules",
      body: "Read them before posting.",
    };
    expect(home_save_errors(settings)).toEqual([]);
    expect(validate_settings_for_save(settings).ok).toBe(true);
  });
});

describe("community blocks (23d)", () => {
  it("Community Hub spreads the single blocks over several containers in community mode", () => {
    const { patch } = apply_blog_preset(
      preset("community-hub"),
      get_default_settings(true),
      "full",
      true,
    );
    const config = patch.pageLayoutConfig;
    const holding = containers_holding(config, BLOCK_IDS);
    expect(holding.length).toBeGreaterThanOrEqual(2);
    const placed = Object.values(config?.containers ?? {}).flatMap((c) =>
      c.elements.map((e) => e.id),
    );
    for (const block of COMMUNITY_BLOCK_ELEMENT_IDS)
      expect(placed).toContain(block);
    expect(placed).not.toContain("communitySidebar");
  });

  it.each(CATALOG_IDS)("%s on a user blog places no community blocks", (id) => {
    const { patch } = apply_blog_preset(
      preset(id),
      get_default_settings(false),
      "full",
      false,
    );
    expect(containers_holding(patch.pageLayoutConfig, BLOCK_IDS)).toEqual([]);
    expect(
      containers_holding(
        patch.pageLayoutConfig,
        new Set(["communitySidebar", "communityProfile"]),
      ),
    ).toEqual([]);
    const legacy = (patch.pageLayout?.sections ?? []).flatMap(
      (s) => s.elements,
    );
    for (const block of COMMUNITY_BLOCK_ELEMENT_IDS)
      expect(legacy).not.toContain(block);
  });

  it.each(CATALOG_IDS.filter((id) => id !== "community-hub"))(
    "%s in community mode places all four single blocks, no combined sidebar",
    (id) => {
      const { patch } = apply_blog_preset(
        preset(id),
        get_default_settings(true),
        "full",
        true,
      );
      const placed = Object.values(
        patch.pageLayoutConfig?.containers ?? {},
      ).flatMap((c) => c.elements.map((e) => e.id));
      for (const block of COMMUNITY_BLOCK_ELEMENT_IDS)
        expect(placed.filter((placed_id) => placed_id === block)).toHaveLength(
          1,
        );
      expect(placed).not.toContain("communitySidebar");
    },
  );
});
