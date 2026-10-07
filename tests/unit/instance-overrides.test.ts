// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  defaultSettings,
  get_default_settings,
  instance_key,
  INSTANCE_OVERRIDE_KEYS_BY_ELEMENT,
  INSTANCE_OVERRIDE_RANGES,
  MAX_INSTANCE_OVERRIDES,
  strip_community_fields,
  strip_user_fields,
  type InstanceOverrides,
  type PageLayout,
  type SettingsData,
} from "../../src/components/admin/types/index";
import {
  MAIN_SECTION_ID,
  pageLayoutConfigToLegacy,
} from "../../src/components/admin/types/layout";
import {
  parse_settings_graceful,
  sanitize_instance_overrides,
} from "../../src/components/admin/types/settings-schema";
import {
  GLOBAL_ONLY_SIZE_RANGES,
  move_instance_override,
  page_layout_for_instances,
  prune_instance_overrides,
  prune_settings_instance_overrides,
  resolve_instance_settings,
  resolve_main_posts_settings,
} from "../../src/lib/instance-overrides";

function settings_with_overrides(overrides: InstanceOverrides): SettingsData {
  return { ...get_default_settings(false), instanceOverrides: overrides };
}

const layout: PageLayout = {
  sections: [
    {
      id: "page-sec-main",
      slot: "main",
      orientation: "vertical",
      elements: ["navigation", "posts"],
      active: true,
    },
    {
      id: "page-sec-sidebar-left",
      slot: "sidebar-left",
      orientation: "vertical",
      elements: ["authorProfile"],
      active: true,
    },
  ],
};

describe("resolve_instance_settings", () => {
  it("applies the instance overrides on top of global values", () => {
    const settings = settings_with_overrides({
      "page-sec-main:posts": { gridColumns: 3, titleSizePx: 30 },
    });
    const resolved = resolve_instance_settings(
      settings,
      "page-sec-main",
      "posts",
    );
    expect(resolved.gridColumns).toBe(3);
    expect(resolved.titleSizePx).toBe(30);
    expect(resolved.cardGapPx).toBe(settings.cardGapPx);
    expect(Object.keys(resolved).sort()).toEqual(Object.keys(settings).sort());
  });

  it("falls back to global values without an override for that instance", () => {
    const settings = settings_with_overrides({
      "page-sec-other:posts": { gridColumns: 3 },
    });
    expect(
      resolve_instance_settings(settings, "page-sec-main", "posts"),
    ).toEqual(settings);
    const no_field = { ...get_default_settings(false) };
    delete no_field.instanceOverrides;
    expect(
      resolve_instance_settings(no_field, "page-sec-main", "posts"),
    ).toEqual(no_field);
  });

  it("ignores keys outside the element whitelist and invalid values", () => {
    const settings = settings_with_overrides({
      "page-sec-main:posts": {
        authorAvatarSizePx: 100,
        gridColumns: 99,
        cardGapPx: "10px; background:url(x)" as unknown as number,
        titleSizePx: Number.NaN,
      },
    });
    const resolved = resolve_instance_settings(
      settings,
      "page-sec-main",
      "posts",
    );
    expect(resolved.authorAvatarSizePx).toBe(settings.authorAvatarSizePx);
    expect(resolved.gridColumns).toBe(settings.gridColumns);
    expect(resolved.cardGapPx).toBe(settings.cardGapPx);
    expect(resolved.titleSizePx).toBe(settings.titleSizePx);
  });

  it("does not mutate the input and returns a new object", () => {
    const settings = settings_with_overrides({
      "page-sec-main:posts": { gridColumns: 3 },
    });
    const before = structuredClone(settings);
    const resolved = resolve_instance_settings(
      settings,
      "page-sec-main",
      "posts",
    );
    expect(resolved).not.toBe(settings);
    expect(settings).toEqual(before);
    expect(defaultSettings.instanceOverrides).toEqual({});
  });
});

describe("instanceOverrides schema", () => {
  it("keeps whitelisted in-range integers", () => {
    const parsed = parse_settings_graceful({
      instanceOverrides: {
        "page-sec-main:posts": { gridColumns: 4, cardGapPx: 0 },
        "page-sec-sidebar-left:authorProfile": { authorAvatarSizePx: 128 },
        "page-sec-sidebar-left:communityProfile": {
          community_title_size_px: 20,
        },
      },
    });
    expect(parsed.instanceOverrides).toEqual({
      "page-sec-main:posts": { gridColumns: 4, cardGapPx: 0 },
      "page-sec-sidebar-left:authorProfile": { authorAvatarSizePx: 128 },
      "page-sec-sidebar-left:communityProfile": { community_title_size_px: 20 },
    });
  });

  it.each([
    ["string", "12"],
    ["css injection", "12px;color:red"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["fraction", 12.5],
    ["below min", INSTANCE_OVERRIDE_RANGES.titleSizePx.min - 1],
    ["above max", INSTANCE_OVERRIDE_RANGES.titleSizePx.max + 1],
    ["null", null],
  ])("rejects %s values per entry", (_label, bad_value) => {
    const sanitized = sanitize_instance_overrides({
      "page-sec-main:posts": { titleSizePx: bad_value, maxTags: 3 },
    });
    expect(sanitized).toEqual({ "page-sec-main:posts": { maxTags: 3 } });
  });

  it("drops keys outside the element whitelist, unknown elements and bad map keys", () => {
    const sanitized = sanitize_instance_overrides({
      "page-sec-main:posts": { siteName: 1, authorAvatarSizePx: 64 },
      "page-sec-top:header": { titleSizePx: 20 },
      "no-colon": { gridColumns: 2 },
      "page sec:posts": { gridColumns: 2 },
      "page-sec-main:posts:extra": { gridColumns: 2 },
      "page-sec-main:__proto__": { gridColumns: 2 },
      "page-sec-main:constructor": { gridColumns: 2 },
      "page-sec-x:posts": "not an object",
      "page-sec-y:posts": [1, 2],
      "page-sec-ok:posts": { gridColumns: 2 },
    });
    expect(sanitized).toEqual({ "page-sec-ok:posts": { gridColumns: 2 } });
  });

  it("drops authorReputationSizePx, which the author profile does not render", () => {
    expect("authorReputationSizePx" in INSTANCE_OVERRIDE_RANGES).toBe(false);
    const sanitized = sanitize_instance_overrides({
      "page-sec-sidebar-left:authorProfile": {
        authorReputationSizePx: 12,
        authorAvatarSizePx: 64,
      },
    });
    expect(sanitized).toEqual({
      "page-sec-sidebar-left:authorProfile": { authorAvatarSizePx: 64 },
    });
  });

  it("caps the number of entries", () => {
    const raw: Record<string, unknown> = {};
    for (let i = 0; i < MAX_INSTANCE_OVERRIDES + 10; i += 1) {
      raw[`sec-${i}:posts`] = { maxTags: 2 };
    }
    expect(Object.keys(sanitize_instance_overrides(raw))).toHaveLength(
      MAX_INSTANCE_OVERRIDES,
    );
  });

  it("drops the whole field only when it is not an object, keeping the rest of the config", () => {
    const parsed = parse_settings_graceful({
      siteName: "Blog",
      instanceOverrides: ["page-sec-main:posts"],
    });
    expect(parsed.siteName).toBe("Blog");
    expect("instanceOverrides" in parsed).toBe(false);
  });

  it("whitelists only numeric settings", () => {
    const numeric_defaults = get_default_settings(true);
    for (const keys of Object.values(INSTANCE_OVERRIDE_KEYS_BY_ELEMENT)) {
      for (const key of keys) {
        expect(typeof { ...defaultSettings, ...numeric_defaults }[key]).toBe(
          "number",
        );
      }
    }
    expect(Object.isFrozen(INSTANCE_OVERRIDE_KEYS_BY_ELEMENT)).toBe(true);
    expect(Object.isFrozen(INSTANCE_OVERRIDE_RANGES.gridColumns)).toBe(true);
  });
});

describe("prune_instance_overrides", () => {
  it("removes orphaned keys and empty entries without mutating the input", () => {
    const overrides: InstanceOverrides = {
      "page-sec-main:posts": { gridColumns: 3 },
      "page-sec-sidebar-left:authorProfile": {},
      "page-sec-gone:posts": { gridColumns: 2 },
      "page-sec-main:authorProfile": { authorAvatarSizePx: 40 },
    };
    const before = structuredClone(overrides);
    expect(prune_instance_overrides(overrides, layout)).toEqual({
      "page-sec-main:posts": { gridColumns: 3 },
    });
    expect(overrides).toEqual(before);
  });

  it("keeps overrides of inactive elements and hidden sidebars", () => {
    const settings: SettingsData = {
      ...get_default_settings(false),
      pageLayoutConfig: {
        template: "no-sidebar",
        containers: {
          top: { elements: [{ id: "header", active: false }] },
          sidebarLeft: { elements: [{ id: "authorProfile", active: false }] },
          sidebarRight: { elements: [] },
          bottom: { elements: [] },
        },
      },
      instanceOverrides: {
        "page-sec-sidebar-left:authorProfile": { authorAvatarSizePx: 40 },
        "page-sec-main:posts": { maxTags: 2 },
        "page-sec-bottom:authorProfile": { authorAvatarSizePx: 50 },
      },
    };
    expect(
      prune_settings_instance_overrides(settings).instanceOverrides,
    ).toEqual({
      "page-sec-sidebar-left:authorProfile": { authorAvatarSizePx: 40 },
      "page-sec-main:posts": { maxTags: 2 },
    });
    expect(settings.instanceOverrides).toHaveProperty(
      "page-sec-bottom:authorProfile",
    );
  });

  it("leaves settings untouched without a page layout config", () => {
    const partial = {
      instanceOverrides: { "page-sec-gone:posts": { maxTags: 2 } },
    };
    expect(prune_settings_instance_overrides(partial)).toBe(partial);
  });

  it("builds instance ids matching the rendered home page sections", () => {
    const instances = page_layout_for_instances(
      get_default_settings(false).pageLayoutConfig,
    );
    const keys = instances.sections.flatMap((section) =>
      section.elements.map((element) => instance_key(section.id, element)),
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        "page-sec-top:header",
        "page-sec-sidebar-left:authorProfile",
        "page-sec-main:posts",
        "page-sec-bottom:footer",
      ]),
    );
  });
});

describe("move_instance_override", () => {
  it("moves the entry to the target section without mutating the input", () => {
    const overrides: InstanceOverrides = {
      "page-sec-sidebar-left:authorProfile": { authorAvatarSizePx: 40 },
      "page-sec-main:posts": { maxTags: 2 },
    };
    const before = structuredClone(overrides);
    const moved = move_instance_override(
      overrides,
      "authorProfile",
      "page-sec-sidebar-left",
      "page-sec-sidebar-right",
    );
    expect(moved).toEqual({
      "page-sec-sidebar-right:authorProfile": { authorAvatarSizePx: 40 },
      "page-sec-main:posts": { maxTags: 2 },
    });
    expect(overrides).toEqual(before);
    expect(moved["page-sec-main:posts"]).not.toBe(
      overrides["page-sec-main:posts"],
    );
  });

  it("returns an equal copy when there is nothing to move", () => {
    const overrides: InstanceOverrides = {
      "page-sec-main:posts": { maxTags: 2 },
    };
    expect(
      move_instance_override(
        overrides,
        "header",
        "page-sec-top",
        "page-sec-bottom",
      ),
    ).toEqual(overrides);
    expect(
      move_instance_override(
        overrides,
        "posts",
        "page-sec-main",
        "page-sec-main",
      ),
    ).toEqual(overrides);
  });
});

describe("mode stripping", () => {
  const overrides: InstanceOverrides = {
    "page-sec-main:posts": { maxTags: 2, commentPaddingPx: 10 },
    "page-sec-sidebar-left:communityProfile": { community_title_size_px: 20 },
    "page-sec-sidebar-left:authorProfile": { authorAvatarSizePx: 40 },
  };

  it("removes community override keys in user mode", () => {
    expect(
      strip_community_fields({ instanceOverrides: overrides })
        .instanceOverrides,
    ).toEqual({
      "page-sec-main:posts": { maxTags: 2, commentPaddingPx: 10 },
      "page-sec-sidebar-left:authorProfile": { authorAvatarSizePx: 40 },
    });
  });

  it("removes user-only override keys in community mode", () => {
    expect(
      strip_user_fields({ instanceOverrides: overrides }).instanceOverrides,
    ).toEqual({
      "page-sec-main:posts": { maxTags: 2 },
      "page-sec-sidebar-left:communityProfile": { community_title_size_px: 20 },
    });
  });
});

describe("main posts instance", () => {
  it("uses the section id built by pageLayoutConfigToLegacy", () => {
    const main = pageLayoutConfigToLegacy({
      template: "no-sidebar",
      containers: {
        top: { elements: [] },
        sidebarLeft: { elements: [] },
        sidebarRight: { elements: [] },
        bottom: { elements: [] },
      },
    }).sections.find((section) => section.slot === "main");
    expect(main?.id).toBe(MAIN_SECTION_ID);
    expect(main?.elements).toContain("posts");
  });

  it("resolves postsPerPage from the main posts override", () => {
    const settings = settings_with_overrides({
      [instance_key(MAIN_SECTION_ID, "posts")]: { postsPerPage: 7 },
    });
    expect(resolve_main_posts_settings(settings).postsPerPage).toBe(7);
  });
});

describe("global-only size ranges", () => {
  it("are never overridable per instance", () => {
    for (const key of Object.keys(GLOBAL_ONLY_SIZE_RANGES)) {
      expect(Object.hasOwn(INSTANCE_OVERRIDE_RANGES, key)).toBe(false);
    }
  });

  it("contain the default value of each setting", () => {
    for (const [key, range] of Object.entries(GLOBAL_ONLY_SIZE_RANGES)) {
      const value = defaultSettings[key as keyof typeof GLOBAL_ONLY_SIZE_RANGES];
      expect(range.min).toBeLessThanOrEqual(range.max);
      expect(value).toBeGreaterThanOrEqual(range.min);
      expect(value).toBeLessThanOrEqual(range.max);
    }
  });

  it("ignores a global-only key placed in an instance override", () => {
    const settings = settings_with_overrides({
      [instance_key(MAIN_SECTION_ID, "authorProfile")]: {
        authorReputationSizePx: 16,
      } as unknown as InstanceOverrides[string],
    });
    expect(
      resolve_instance_settings(settings, MAIN_SECTION_ID, "authorProfile")
        .authorReputationSizePx,
    ).toBe(settings.authorReputationSizePx);
  });
});
