// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  HOME_SECTION_PLACEHOLDERS,
  add_home_section,
  can_add_section,
  duplicate_home_section,
  generate_section_id,
  home_section_popover_key,
  home_sections_of,
  move_home_section,
  move_home_section_down,
  move_home_section_up,
  remove_home_section,
  swap_home_sections,
  toggle_home_section_hidden,
  update_home_section,
  type RandomSource,
} from "../../src/components/admin/canvas/home-section-ops";
import {
  HOME_MAX_SECTIONS,
  HOME_SECTION_ID_REGEX,
  POSTS_SECTION_FALLBACK_ID,
  SECTION_STYLE_DEFAULTS,
  type HomeSection,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import {
  HomeSectionSchema,
  create_posts_section,
} from "../../src/components/admin/types/settings-schema";

function sequence_random(ids: string[]): RandomSource {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const values = ids.flatMap((id) =>
    Array.from(id).map(
      (char) => (alphabet.indexOf(char) + 0.5) / alphabet.length,
    ),
  );
  let position = 0;
  return () => values[position++ % values.length];
}

function hero(id = "hero0001"): HomeSection {
  return {
    id,
    type: "hero",
    content: { headline: "Hello" },
    style: { ...SECTION_STYLE_DEFAULTS.common, ...SECTION_STYLE_DEFAULTS.hero },
  };
}

function text_media(id: string): HomeSection {
  return {
    id,
    type: "text-media",
    content: { title: "About" },
    style: {
      ...SECTION_STYLE_DEFAULTS.common,
      ...SECTION_STYLE_DEFAULTS["text-media"],
    },
  };
}

function settings_with(sections: HomeSection[]): Pick<SettingsData, "home"> {
  return { home: { sections } };
}

function ids_of(patch: Partial<SettingsData> | null): string[] {
  return patch?.home?.sections.map((section) => section.id) ?? [];
}

const POSTS = create_posts_section("posts001");

describe("home_sections_of", () => {
  it("returns the virtual posts section when home is absent", () => {
    expect(home_sections_of({})).toEqual([create_posts_section()]);
    expect(home_sections_of({})[0].id).toBe(POSTS_SECTION_FALLBACK_ID);
  });
});

describe("generate_section_id", () => {
  it("returns an id matching the section regex", () => {
    const id = generate_section_id(new Set());
    expect(id).toMatch(HOME_SECTION_ID_REGEX);
    expect(id.startsWith("page-sec-")).toBe(false);
  });

  it("skips ids already taken", () => {
    const random = sequence_random(["aaaaaaaa", "bbbbbbbb"]);
    expect(generate_section_id(new Set(["aaaaaaaa"]), random)).toBe("bbbbbbbb");
  });

  it("terminates with a constant random source", () => {
    const taken = new Set(["aaaaaaaa", "sec00000"]);
    const id = generate_section_id(taken, () => 0);
    expect(id).toBe("sec00001");
    expect(id).toMatch(HOME_SECTION_ID_REGEX);
  });

  it("clamps out-of-range random values to the alphabet", () => {
    expect(generate_section_id(new Set(), () => 1)).toBe("99999999");
    expect(generate_section_id(new Set(), () => Number.NaN)).toMatch(
      HOME_SECTION_ID_REGEX,
    );
  });
});

describe("home_section_popover_key", () => {
  it("cannot collide with section_id[:element] keys", () => {
    expect(home_section_popover_key("abcd1234")).toBe("home-section:abcd1234");
    expect(home_section_popover_key("abcd1234")).not.toMatch(/^page-sec-/);
  });
});

describe("can_add_section", () => {
  it("reports count and limit per type", () => {
    const settings = settings_with([hero(), POSTS]);
    expect(can_add_section(settings, "hero")).toEqual({
      allowed: false,
      count: 1,
      max: 1,
    });
    expect(can_add_section(settings, "text-media")).toEqual({
      allowed: true,
      count: 0,
      max: 4,
    });
  });

  it("never allows a second posts section", () => {
    expect(can_add_section({}, "posts")).toEqual({
      allowed: false,
      count: 1,
      max: 1,
    });
  });

  it("blocks every type at the total section limit", () => {
    const sections = [
      hero(),
      POSTS,
      text_media("tm000001"),
      text_media("tm000002"),
      text_media("tm000003"),
      text_media("tm000004"),
      { ...text_media("cta00001"), type: "cta-band" } as HomeSection,
      { ...text_media("cta00002"), type: "cta-band" } as HomeSection,
    ];
    expect(sections).toHaveLength(HOME_MAX_SECTIONS);
    expect(can_add_section(settings_with(sections), "cta-band").allowed).toBe(
      false,
    );
  });
});

describe("add_home_section", () => {
  const random = sequence_random(["newsec01"]);

  it("works on the virtual posts section when home is absent", () => {
    const patch = add_home_section({}, "hero", { index: 0, random });
    expect(ids_of(patch)).toEqual(["newsec01", POSTS_SECTION_FALLBACK_ID]);
  });

  it("appends by default and inserts at a clamped index", () => {
    const settings = settings_with([POSTS]);
    expect(
      ids_of(add_home_section(settings, "text-media", { random })),
    ).toEqual(["posts001", "newsec01"]);
    expect(
      ids_of(add_home_section(settings, "text-media", { index: 99, random })),
    ).toEqual(["posts001", "newsec01"]);
    expect(
      ids_of(add_home_section(settings, "text-media", { index: -3, random })),
    ).toEqual(["newsec01", "posts001"]);
  });

  it("fills placeholder content and default style", () => {
    const sections = add_home_section({}, "hero", { random })?.home?.sections;
    const added = sections?.find((section) => section.type === "hero");
    expect(added?.content).toEqual({
      headline: HOME_SECTION_PLACEHOLDERS.hero_headline,
    });
    expect(added?.style).toEqual({
      ...SECTION_STYLE_DEFAULTS.common,
      ...SECTION_STYLE_DEFAULTS.hero,
    });
    expect(HomeSectionSchema.safeParse(added).success).toBe(true);
  });

  it("adds a cta-band that stays unsaveable until the button URL is set", () => {
    const sections = add_home_section({}, "cta-band", { random })?.home
      ?.sections;
    const added = sections?.find((section) => section.type === "cta-band");
    expect(added?.content).toMatchObject({
      title: HOME_SECTION_PLACEHOLDERS.cta_band_title,
      button: { label: HOME_SECTION_PLACEHOLDERS.cta_band_button, url: "" },
    });
    expect(HomeSectionSchema.safeParse(added).success).toBe(false);
  });

  it("rejects a type at its limit", () => {
    expect(add_home_section(settings_with([hero(), POSTS]), "hero")).toBeNull();
  });

  it("does not mutate the input", () => {
    const sections = [POSTS];
    const settings = settings_with(sections);
    add_home_section(settings, "hero", { random });
    expect(settings.home?.sections).toBe(sections);
    expect(sections).toHaveLength(1);
  });
});

describe("remove_home_section", () => {
  it("removes a section", () => {
    const settings = settings_with([hero(), POSTS]);
    expect(ids_of(remove_home_section(settings, "hero0001"))).toEqual([
      "posts001",
    ]);
  });

  it("rejects posts and unknown ids", () => {
    const settings = settings_with([hero(), POSTS]);
    expect(remove_home_section(settings, "posts001")).toBeNull();
    expect(remove_home_section(settings, "missing1")).toBeNull();
    expect(remove_home_section({}, POSTS_SECTION_FALLBACK_ID)).toBeNull();
  });
});

describe("move operations", () => {
  const settings = settings_with([hero(), POSTS, text_media("tm000001")]);

  it("moves by index", () => {
    expect(ids_of(move_home_section(settings, 0, 2))).toEqual([
      "posts001",
      "tm000001",
      "hero0001",
    ]);
    expect(ids_of(move_home_section(settings, 2, 0))).toEqual([
      "tm000001",
      "hero0001",
      "posts001",
    ]);
  });

  it("rejects invalid and no-op moves", () => {
    expect(move_home_section(settings, 5, 0)).toBeNull();
    expect(move_home_section(settings, -1, 0)).toBeNull();
    expect(move_home_section(settings, 1, 1)).toBeNull();
    expect(move_home_section(settings, 2, 9)).toBeNull();
  });

  it("moves up and down", () => {
    expect(ids_of(move_home_section_up(settings, "posts001"))).toEqual([
      "posts001",
      "hero0001",
      "tm000001",
    ]);
    expect(ids_of(move_home_section_down(settings, "posts001"))).toEqual([
      "hero0001",
      "tm000001",
      "posts001",
    ]);
  });

  it("rejects moves past the ends and unknown ids", () => {
    expect(move_home_section_up(settings, "hero0001")).toBeNull();
    expect(move_home_section_down(settings, "tm000001")).toBeNull();
    expect(move_home_section_up(settings, "missing1")).toBeNull();
    expect(move_home_section_down(settings, "missing1")).toBeNull();
    expect(move_home_section_up({}, POSTS_SECTION_FALLBACK_ID)).toBeNull();
  });

  it("swaps two sections", () => {
    expect(
      ids_of(swap_home_sections(settings, "hero0001", "tm000001")),
    ).toEqual(["tm000001", "posts001", "hero0001"]);
    expect(swap_home_sections(settings, "hero0001", "hero0001")).toBeNull();
    expect(swap_home_sections(settings, "hero0001", "missing1")).toBeNull();
  });
});

describe("duplicate_home_section", () => {
  const random = sequence_random(["copy0001"]);

  it("inserts a deep copy with a new id after the original", () => {
    const original = text_media("tm000001");
    const settings = settings_with([original, POSTS]);
    const sections = duplicate_home_section(settings, "tm000001", random)?.home
      ?.sections;
    expect(sections?.map((section) => section.id)).toEqual([
      "tm000001",
      "copy0001",
      "posts001",
    ]);
    expect(sections?.[1].content).toEqual(original.content);
    expect(sections?.[1].content).not.toBe(original.content);
  });

  it("rejects posts, types at their limit and unknown ids", () => {
    const settings = settings_with([hero(), POSTS]);
    expect(duplicate_home_section(settings, "posts001")).toBeNull();
    expect(duplicate_home_section(settings, "hero0001")).toBeNull();
    expect(duplicate_home_section(settings, "missing1")).toBeNull();
  });

  it("rejects at the type limit for text-media", () => {
    const settings = settings_with([
      POSTS,
      text_media("tm000001"),
      text_media("tm000002"),
      text_media("tm000003"),
      text_media("tm000004"),
    ]);
    expect(duplicate_home_section(settings, "tm000001")).toBeNull();
  });
});

describe("toggle_home_section_hidden", () => {
  it("hides and shows without storing hidden: false", () => {
    const settings = settings_with([hero(), POSTS]);
    const hidden = toggle_home_section_hidden(settings, "hero0001");
    expect(hidden?.home?.sections[0].hidden).toBe(true);
    const shown = toggle_home_section_hidden(
      { home: hidden?.home },
      "hero0001",
    );
    expect(shown?.home?.sections[0]).not.toHaveProperty("hidden");
  });

  it("works on the virtual posts section and rejects unknown ids", () => {
    expect(
      toggle_home_section_hidden({}, POSTS_SECTION_FALLBACK_ID)?.home
        ?.sections[0].hidden,
    ).toBe(true);
    expect(toggle_home_section_hidden({}, "missing1")).toBeNull();
  });
});

describe("update_home_section", () => {
  it("merges content and style shallowly", () => {
    const settings = settings_with([hero(), POSTS]);
    const patch = update_home_section(settings, "hero0001", "hero", {
      content: { subheadline: "Sub" },
      style: { variant: "overlay" },
    });
    const updated = patch?.home?.sections[0];
    expect(updated?.content).toEqual({ headline: "Hello", subheadline: "Sub" });
    expect(updated?.style).toMatchObject({
      variant: "overlay",
      width: "content",
    });
    expect(settings.home?.sections[0].content).toEqual({ headline: "Hello" });
  });

  it("clears an optional field with undefined", () => {
    const settings = settings_with([
      { ...hero(), content: { headline: "Hello", subheadline: "Sub" } } as HomeSection,
      POSTS,
    ]);
    const patch = update_home_section(settings, "hero0001", "hero", {
      content: { subheadline: undefined },
    });
    expect(patch?.home?.sections[0].content).not.toHaveProperty("subheadline");
  });

  it("rejects a type mismatch and unknown ids", () => {
    const settings = settings_with([hero(), POSTS]);
    expect(
      update_home_section(settings, "hero0001", "text-media", {
        content: { title: "x" },
      }),
    ).toBeNull();
    expect(
      update_home_section(settings, "missing1", "hero", {
        content: { headline: "x" },
      }),
    ).toBeNull();
  });

  it("updates the virtual posts section when home is absent", () => {
    const patch = update_home_section({}, POSTS_SECTION_FALLBACK_ID, "posts", {
      content: { title: "Latest" },
    });
    expect(patch?.home?.sections).toEqual([
      { ...create_posts_section(), content: { title: "Latest" } },
    ]);
  });
});
