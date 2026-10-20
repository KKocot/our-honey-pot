// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  apply_preset_parts,
  apply_user_preset,
  capture_user_preset,
  is_preset_home,
  parse_user_presets,
  preset_sections_need_confirmation,
  type PresetParts,
  type PresetSectionsMode,
} from "../../src/components/admin/presets";
import {
  HOME_MAX_SECTIONS,
  HOME_SECTION_ID_REGEX,
  get_default_settings,
  type HomeSection,
  type HomeSectionType,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import { add_home_section } from "../../src/components/admin/canvas/home-section-ops";
import { get_section_definition } from "../../src/shared/components/sections/registry";
import type { AnySectionDefinition } from "../../src/shared/components/sections/registry-types";

const MODES: PresetSectionsMode[] = ["append-missing", "replace", "skip"];

function section(
  id: string,
  type: HomeSectionType,
  content?: Record<string, unknown>,
): HomeSection {
  const definition: AnySectionDefinition = get_section_definition(type);
  const defaults = definition.defaults();
  return {
    id,
    type,
    content: content ?? defaults.content,
    style: defaults.style,
  } as HomeSection;
}

const POSTS = section("posts001", "posts", { title: "Wpisy" });
const OWN_HERO = section("hero0001", "hero", { headline: "Moja pasieka" });

function settings_with(sections: HomeSection[] | null): SettingsData {
  const settings = get_default_settings(false);
  if (sections) settings.home = { sections };
  else delete settings.home;
  return settings;
}

function parts(home?: PresetParts["home"]): PresetParts {
  return {
    name: "Test",
    layout: { postsLayout: "grid", gridColumns: 2 },
    style: { fontHeading: "fraunces" },
    ...(home ? { home } : {}),
  };
}

const WITH_SECTIONS = parts({ sections: ["hero", "posts", "cta-band"] });

function types_of(patch: Partial<SettingsData>): string[] {
  return (patch.home?.sections ?? []).map((s) => s.type);
}

function defaults_content(type: HomeSectionType): unknown {
  const definition: AnySectionDefinition = get_section_definition(type);
  return definition.defaults().content;
}

describe("preset without home (19a)", () => {
  it.each(MODES)(
    "%s: applies layout and style only, home untouched",
    (mode) => {
      const current = settings_with([OWN_HERO, POSTS]);
      const result = apply_preset_parts(parts(), current, "full", false, {
        sections_mode: mode,
      });
      expect(result.patch).not.toHaveProperty("home");
      expect(result.patch).toMatchObject({
        postsLayout: "grid",
        gridColumns: 2,
        fontHeading: "fraunces",
      });
      expect(result.added_sections_count).toBe(0);
      expect(result.removed_sections_count).toBe(0);
    },
  );

  it("matches the apply without options", () => {
    const current = settings_with(null);
    expect(apply_preset_parts(parts(), current, "full", false)).toEqual(
      apply_preset_parts(parts(), current, "full", false, {
        sections_mode: "replace",
      }),
    );
  });
});

describe("append-missing (19b)", () => {
  it("is the default and keeps the preset order around existing sections", () => {
    const { patch, added_sections_count } = apply_preset_parts(
      WITH_SECTIONS,
      settings_with([POSTS]),
      "full",
      false,
    );
    expect(types_of(patch)).toEqual(["hero", "posts", "cta-band"]);
    expect(added_sections_count).toBe(2);
    const [hero, posts, cta] = patch.home?.sections ?? [];
    expect(hero.content).toEqual(defaults_content("hero"));
    expect(cta.content).toEqual(defaults_content("cta-band"));
    expect(posts).toEqual(POSTS);
    for (const s of patch.home?.sections ?? []) {
      expect(s.id).toMatch(HOME_SECTION_ID_REGEX);
    }
    expect(new Set(patch.home?.sections.map((s) => s.id)).size).toBe(3);
  });

  it("adds only missing types and never touches the owner's content", () => {
    const current = settings_with([POSTS, OWN_HERO]);
    const snapshot = structuredClone(current);
    const { patch } = apply_preset_parts(WITH_SECTIONS, current, "full", false);
    expect(types_of(patch)).toEqual(["posts", "hero", "cta-band"]);
    expect(patch.home?.sections[1]).toEqual(OWN_HERO);
    expect(current).toEqual(snapshot);
  });

  it("works on a site without home (virtual posts section)", () => {
    const { patch } = apply_preset_parts(
      WITH_SECTIONS,
      settings_with(null),
      "full",
      false,
    );
    expect(types_of(patch)).toEqual(["hero", "posts", "cta-band"]);
  });

  it("merges preset content over the placeholder defaults", () => {
    const preset = parts({
      sections: [
        { type: "hero", content: { subheadline: "Miody z Beskidow" } },
        "posts",
      ],
    });
    const { patch } = apply_preset_parts(
      preset,
      settings_with([POSTS]),
      "full",
      false,
    );
    expect(patch.home?.sections[0].content).toEqual({
      ...(defaults_content("hero") as object),
      subheadline: "Miody z Beskidow",
    });
  });

  it("respects max_per_page of each type", () => {
    const preset = parts({
      sections: ["posts", "cta-band", "cta-band", "cta-band"],
    });
    const { patch } = apply_preset_parts(
      preset,
      settings_with([POSTS]),
      "full",
      false,
    );
    expect(types_of(patch)).toEqual(["posts", "cta-band", "cta-band"]);
  });

  it("respects HOME_MAX_SECTIONS", () => {
    const full_page = [
      POSTS,
      section("textmed1", "text-media", { title: "A" }),
      section("textmed2", "text-media", { title: "B" }),
      section("textmed3", "text-media", { title: "C" }),
      section("textmed4", "text-media", { title: "D" }),
      section("ctaband1", "cta-band", { title: "E" }),
      section("ctaband2", "cta-band", { title: "F" }),
    ];
    const preset = parts({ sections: ["hero", "posts", "text-media"] });
    const { patch, added_sections_count } = apply_preset_parts(
      preset,
      settings_with(full_page),
      "full",
      false,
    );
    expect(added_sections_count).toBe(1);
    expect(patch.home?.sections).toHaveLength(HOME_MAX_SECTIONS);
    expect(patch.home?.sections.slice(1)).toEqual(full_page);
  });

  it("leaves home out of the patch when nothing is missing", () => {
    const current = settings_with([
      OWN_HERO,
      POSTS,
      section("ctaband1", "cta-band", { title: "X" }),
    ]);
    const result = apply_preset_parts(WITH_SECTIONS, current, "full", false);
    expect(result.patch).not.toHaveProperty("home");
    expect(result.added_sections_count).toBe(0);
  });

  it("style only and skip never touch home; layout only does", () => {
    const current = settings_with([POSTS]);
    expect(
      apply_preset_parts(WITH_SECTIONS, current, "style", false).patch,
    ).not.toHaveProperty("home");
    expect(
      apply_preset_parts(WITH_SECTIONS, current, "full", false, {
        sections_mode: "skip",
      }).patch,
    ).not.toHaveProperty("home");
    expect(
      types_of(
        apply_preset_parts(WITH_SECTIONS, current, "layout", true).patch,
      ),
    ).toEqual(["hero", "posts", "cta-band"]);
  });
});

describe("replace (19c)", () => {
  const own_page = [
    OWN_HERO,
    POSTS,
    section("textmed1", "text-media", { title: "O mnie" }),
  ];

  it("replaces every section and keeps exactly one owner posts section", () => {
    const result = apply_preset_parts(
      WITH_SECTIONS,
      settings_with(own_page),
      "full",
      false,
      { sections_mode: "replace" },
    );
    expect(types_of(result.patch)).toEqual(["hero", "posts", "cta-band"]);
    const sections = result.patch.home?.sections ?? [];
    expect(sections[0].content).toEqual(defaults_content("hero"));
    expect(sections.filter((s) => s.type === "posts")).toEqual([POSTS]);
    expect(result.removed_sections_count).toBe(2);
    expect(result.added_sections_count).toBe(2);
  });

  it("puts posts last when the preset does not place it", () => {
    const { patch } = apply_preset_parts(
      parts({ sections: ["hero"] }),
      settings_with(own_page),
      "full",
      false,
      { sections_mode: "replace" },
    );
    expect(types_of(patch)).toEqual(["hero", "posts"]);
  });

  it("needs confirmation only when the owner has own content", () => {
    expect(
      preset_sections_need_confirmation(settings_with(own_page), WITH_SECTIONS),
    ).toBe(true);
    expect(
      preset_sections_need_confirmation(settings_with([POSTS]), WITH_SECTIONS),
    ).toBe(false);
    expect(
      preset_sections_need_confirmation(settings_with(null), WITH_SECTIONS),
    ).toBe(false);
    expect(
      preset_sections_need_confirmation(settings_with(own_page), parts()),
    ).toBe(false);
  });

  it("treats untouched placeholder sections as safe to replace", () => {
    const base = settings_with([POSTS]);
    const with_hero = { ...base, ...add_home_section(base, "hero") };
    const with_cta = {
      ...with_hero,
      ...add_home_section(with_hero, "cta-band"),
    };
    expect(preset_sections_need_confirmation(with_cta, WITH_SECTIONS)).toBe(
      false,
    );
    const edited = structuredClone(with_cta);
    const hero = edited.home?.sections.find((s) => s.type === "hero");
    if (hero?.type !== "hero") throw new Error("missing hero");
    hero.content.headline = "Moja pasieka";
    expect(preset_sections_need_confirmation(edited, WITH_SECTIONS)).toBe(true);
  });
});

describe("user presets in localStorage (19d)", () => {
  const legacy_entry = JSON.stringify({
    version: 1,
    presets: [
      {
        id: "user-old-1",
        name: "Stary",
        created_at: 1,
        layout: { postsLayout: "masonry", gridColumns: 3 },
        style: { fontHeading: "inter", radiusPx: 8 },
      },
    ],
  });

  it("an entry saved before home sections parses and applies as before", () => {
    const [preset] = parse_user_presets(legacy_entry);
    expect(preset).toMatchObject({ id: "user-old-1", name: "Stary" });
    const current = settings_with([OWN_HERO, POSTS]);
    const { patch, added_sections_count } = apply_user_preset(
      preset,
      current,
      "full",
      false,
    );
    expect(patch).toMatchObject({
      postsLayout: "masonry",
      gridColumns: 3,
      fontHeading: "inter",
      radiusPx: 8,
    });
    expect(patch).not.toHaveProperty("home");
    expect(added_sections_count).toBe(0);
  });

  it("never stores or applies home sections from a user preset", () => {
    const tampered = JSON.parse(legacy_entry);
    tampered.presets[0].home = { sections: ["hero", "posts"] };
    const [preset] = parse_user_presets(JSON.stringify(tampered));
    expect(preset).not.toHaveProperty("home");
    const captured = capture_user_preset(
      "Nowy",
      settings_with([OWN_HERO, POSTS]),
      1,
      "user-new-1",
    );
    expect(captured).not.toHaveProperty("home");
    expect(JSON.stringify(captured)).not.toContain("hero0001");
  });
});

describe("is_preset_home", () => {
  it("accepts types and {type, content, style} entries within the limits", () => {
    expect(is_preset_home({ sections: ["hero", "posts"] })).toBe(true);
    expect(
      is_preset_home({
        sections: [{ type: "hero", content: { headline: "X" }, style: {} }],
      }),
    ).toBe(true);
  });

  it.each([
    ["unknown type", { sections: ["nope"] }],
    ["too many of a type", { sections: ["hero", "hero"] }],
    ["extra key", { sections: ["hero"], pages: [] }],
    ["section with id", { sections: [{ type: "hero", id: "hero0001" }] }],
    ["content not an object", { sections: [{ type: "hero", content: "x" }] }],
    ["not a list", { sections: "hero" }],
  ])("rejects %s", (_name, value) => {
    expect(is_preset_home(value)).toBe(false);
  });
});
