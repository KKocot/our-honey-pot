// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  BLOG_PRESETS,
  PRESET_LAYOUT_KEYS,
  PRESET_PALETTES,
  PRESET_STYLE_KEYS,
  all_theme_presets,
  apply_blog_preset,
  get_blog_preset,
  is_preset_home,
  list_blog_presets,
  resolve_theme_colors,
  type BlogPreset,
  type PresetApplyScope,
} from "../../src/components/admin/presets";
import { contrast_ratio } from "../../src/components/admin/palette";
import {
  COMMUNITY_SETTINGS_KEYS,
  GLOBAL_FIELD_KEYS,
  USER_ONLY_SETTINGS_KEYS,
  get_default_settings,
  strip_irrelevant_fields,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import { settings_schema } from "../../src/components/admin/types/settings-schema";
import { themePresets } from "../../src/components/admin/types/theme";
import type { PageLayoutConfig } from "../../src/components/admin/types/layout";

const PRESET_IDS = [
  "minimal-writer",
  "editorial-magazine",
  "newsletter-classic",
  "dev-garden",
  "photo-journal",
  "community-hub",
  "link-in-bio",
];

const PALETTE_IDS = [
  "essay",
  "terminal",
  "gallery",
  "front-page",
  "notebook",
  "poster",
  "kitchen-table",
  "hive-commons",
];

function preset(id: string): BlogPreset {
  const found = get_blog_preset(id);
  if (!found) throw new Error(`missing preset ${id}`);
  return found;
}

function container_ids(
  config: PageLayoutConfig | undefined,
  name: keyof PageLayoutConfig["containers"],
): string[] {
  return config?.containers[name].elements.map((e) => e.id) ?? [];
}

function all_container_ids(config: PageLayoutConfig | undefined): string[] {
  if (!config) return [];
  return Object.values(config.containers).flatMap((c) =>
    c.elements.map((e) => e.id),
  );
}

function with_overrides(is_community: boolean): SettingsData {
  return {
    ...get_default_settings(is_community),
    instanceOverrides: {
      "page-sec-main:posts": { gridColumns: 3 },
      "page-sec-top:posts": { titleSizePx: 30 },
      "page-sec-sidebar-left:communityProfile": {
        community_avatar_size_px: 64,
      },
    },
  };
}

const cases = BLOG_PRESETS.flatMap((p) =>
  [true, false].map((is_community) => [p.id, is_community] as const),
);

describe("blog preset catalog", () => {
  it("has the 7 presets of the brief in order", () => {
    expect(BLOG_PRESETS.map((p) => p.id)).toEqual(PRESET_IDS);
  });

  it("puts Community Hub first in community mode and last in user mode", () => {
    expect(list_blog_presets(true)[0].id).toBe("community-hub");
    expect(list_blog_presets(false).at(-1)?.id).toBe("community-hub");
    expect(list_blog_presets(true)).toHaveLength(7);
  });

  it.each(PRESET_IDS)("%s passes settings_schema unchanged", (id) => {
    const { layout, style } = preset(id);
    const raw = { ...layout, ...style };
    const result = settings_schema.safeParse(raw);
    expect(result.success).toBe(true);
    for (const key of PRESET_STYLE_KEYS) {
      expect(result.data?.[key], key).toEqual(raw[key]);
    }
    expect(result.data?.pageLayoutConfig).toEqual(layout.pageLayoutConfig);
  });

  it.each(PRESET_IDS)("%s defines every layout and style key", (id) => {
    const { layout, style } = preset(id);
    expect(Object.keys(layout).sort()).toEqual([...PRESET_LAYOUT_KEYS].sort());
    expect(Object.keys(style).sort()).toEqual([...PRESET_STYLE_KEYS].sort());
    expect(PALETTE_IDS).toContain(style.siteTheme);
    expect(style.presetId).toBe(id);
    expect(style.customColors).toBeNull();
    expect(style.cardBorderRadiusPx).toBe(style.radiusPx);
  });

  it("matches the layout table of the brief", () => {
    const rows = BLOG_PRESETS.map((p) => [
      p.id,
      p.layout.pageLayoutConfig?.template,
      p.layout.postsLayout,
      p.layout.gridColumns,
      p.layout.showThumbnail,
    ]);
    expect(rows).toEqual([
      ["minimal-writer", "no-sidebar", "list", 1, false],
      ["editorial-magazine", "sidebar-right", "grid", 2, true],
      ["newsletter-classic", "no-sidebar", "list", 1, false],
      ["dev-garden", "no-sidebar", "list", 1, false],
      ["photo-journal", "no-sidebar", "grid", 2, true],
      ["community-hub", "sidebar-right", "list", 1, true],
      ["link-in-bio", "no-sidebar", "list", 1, false],
    ]);
    expect(preset("photo-journal").layout.thumbnailSizePx).toBe(360);
    expect(preset("link-in-bio").layout.showSummary).toBe(false);
    expect(
      container_ids(
        preset("editorial-magazine").layout.pageLayoutConfig,
        "sidebarRight",
      ),
    ).toEqual(["authorProfile"]);
  });

  it("matches the palette, font and shape table of the brief", () => {
    const rows = BLOG_PRESETS.map((p) => [
      p.id,
      p.style.siteTheme,
      p.style.fontHeading,
      p.style.fontBody,
      p.style.radiusPx,
      p.style.density,
    ]);
    expect(rows).toEqual([
      ["minimal-writer", "essay", "inter", "inter", 4, "spacious"],
      ["editorial-magazine", "front-page", "fraunces", "inter", 0, "compact"],
      [
        "newsletter-classic",
        "notebook",
        "fraunces",
        "source-serif",
        6,
        "comfortable",
      ],
      ["dev-garden", "terminal", "jetbrains-mono", "inter", 8, "comfortable"],
      ["photo-journal", "gallery", "space-grotesk", "inter", 4, "spacious"],
      ["community-hub", "hive-commons", "inter", "inter", 8, "comfortable"],
      ["link-in-bio", "poster", "space-grotesk", "inter", 16, "compact"],
    ]);
  });

  it("is frozen, so no tenant can mutate the shared catalog", () => {
    expect(
      Object.isFrozen(preset("minimal-writer").layout.pageLayoutConfig),
    ).toBe(true);
    expect(Object.isFrozen(preset("minimal-writer").home?.sections)).toBe(true);
    expect(Object.isFrozen(PRESET_PALETTES[0].colors)).toBe(true);
  });
});

describe("preset palettes", () => {
  it("has one palette per preset with ids distinct from classic themes", () => {
    expect(PRESET_PALETTES.map((p) => p.id)).toEqual(PALETTE_IDS);
    const ids = all_theme_presets().map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(PALETTE_IDS.length + themePresets.length);
  });

  it.each(PRESET_PALETTES.map((p) => [p.id, p.colors] as const))(
    "%s text pairs pass WCAG AA",
    (_id, colors) => {
      for (const token of [
        "text",
        "textMuted",
        "primary",
        "accent",
        "warning",
      ] as const) {
        expect(
          contrast_ratio(colors[token], colors.bgCard),
          token,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast_ratio(colors.primaryText, colors.primary),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("resolves preset and classic ids, falling back to the first classic palette", () => {
    expect(resolve_theme_colors("terminal").primary).toBe("#e1ff51");
    expect(resolve_theme_colors("dark")).toEqual(themePresets[1].colors);
    expect(resolve_theme_colors("nope")).toEqual(themePresets[0].colors);
    expect(resolve_theme_colors(null)).toEqual(themePresets[0].colors);
  });

  it("returns a copy of the colors", () => {
    const colors = resolve_theme_colors("essay");
    colors.bg = "#000000";
    expect(resolve_theme_colors("essay").bg).toBe("#fffbea");
  });
});

describe("apply_blog_preset", () => {
  const layout_keys = new Set<string>([
    ...PRESET_LAYOUT_KEYS,
    "instanceOverrides",
    "home",
  ]);
  const style_keys = new Set<string>(PRESET_STYLE_KEYS);

  it.each(cases)(
    "%s (community=%s): scopes write disjoint key sets",
    (id, is_community) => {
      const current = get_default_settings(is_community);
      const full = Object.keys(
        apply_blog_preset(preset(id), current, "full", is_community).patch,
      );
      const layout = Object.keys(
        apply_blog_preset(preset(id), current, "layout", is_community).patch,
      );
      const style = Object.keys(
        apply_blog_preset(preset(id), current, "style", is_community).patch,
      );

      expect(layout.every((k) => layout_keys.has(k))).toBe(true);
      expect(style.every((k) => style_keys.has(k))).toBe(true);
      expect(layout.some((k) => style_keys.has(k))).toBe(false);
      expect(full.sort()).toEqual([...layout, ...style].sort());
      expect(layout).not.toContain("siteTheme");
      expect(layout).not.toContain("customColors");
      expect(layout).not.toContain("fontHeading");
      expect(style).not.toContain("pageLayoutConfig");
      expect(style).not.toContain("instanceOverrides");
    },
  );

  it.each(cases)(
    "%s (community=%s): full patch passes settings_schema",
    (id, is_community) => {
      const { patch } = apply_blog_preset(
        preset(id),
        get_default_settings(is_community),
        "full",
        is_community,
      );
      expect(settings_schema.safeParse(patch).success).toBe(true);
    },
  );

  it.each<PresetApplyScope>(["full", "layout"])(
    "%s clears every instanceOverride and reports how many",
    (scope) => {
      const result = apply_blog_preset(
        preset("minimal-writer"),
        with_overrides(true),
        scope,
        true,
      );
      expect(result.patch.instanceOverrides).toEqual({});
      expect(result.reset_overrides_count).toBe(3);
    },
  );

  it("style only leaves instanceOverrides alone", () => {
    const result = apply_blog_preset(
      preset("minimal-writer"),
      with_overrides(false),
      "style",
      false,
    );
    expect(result.patch).not.toHaveProperty("instanceOverrides");
    expect(result.reset_overrides_count).toBe(0);
  });

  it("reports 0 when there were no overrides", () => {
    const current = get_default_settings(false);
    delete current.instanceOverrides;
    expect(
      apply_blog_preset(preset("link-in-bio"), current, "full", false)
        .reset_overrides_count,
    ).toBe(0);
  });

  it.each(PRESET_IDS)(
    "%s in community mode uses community elements only",
    (id) => {
      const { patch } = apply_blog_preset(
        preset(id),
        get_default_settings(true),
        "full",
        true,
      );
      const ids = all_container_ids(patch.pageLayoutConfig);
      expect(ids).toContain("communityProfile");
      expect(ids).toContain("communityRules");
      expect(ids).not.toContain("communitySidebar");
      expect(ids).not.toContain("authorProfile");
      const legacy = (patch.pageLayout?.sections ?? []).flatMap(
        (s) => s.elements,
      );
      expect(legacy).not.toContain("authorProfile");
      for (const key of USER_ONLY_SETTINGS_KEYS) {
        expect(patch).not.toHaveProperty(key);
      }
    },
  );

  it.each(PRESET_IDS)(
    "%s in user mode has no community elements or keys",
    (id) => {
      const { patch } = apply_blog_preset(
        preset(id),
        get_default_settings(false),
        "full",
        false,
      );
      const ids = all_container_ids(patch.pageLayoutConfig);
      expect(ids).not.toContain("communityProfile");
      expect(ids).not.toContain("communitySidebar");
      for (const key of COMMUNITY_SETTINGS_KEYS) {
        expect(patch).not.toHaveProperty(key);
      }
    },
  );

  it("Community Hub in community mode: profile on top, blocks beside and below the posts", () => {
    const { patch } = apply_blog_preset(
      preset("community-hub"),
      get_default_settings(true),
      "full",
      true,
    );
    expect(patch.pageLayoutConfig?.template).toBe("sidebar-right");
    expect(container_ids(patch.pageLayoutConfig, "top")).toEqual([
      "header",
      "communityProfile",
    ]);
    expect(container_ids(patch.pageLayoutConfig, "sidebarRight")).toEqual([
      "communityDescription",
      "communityRules",
      "communityLanguage",
    ]);
    expect(container_ids(patch.pageLayoutConfig, "bottom")).toEqual([
      "communityTeam",
      "footer",
    ]);
  });

  it("returns labels for the history step and toast", () => {
    const current = get_default_settings(false);
    const writer = preset("minimal-writer");
    expect(apply_blog_preset(writer, current, "full", false).undo_label).toBe(
      'Apply "Minimal Writer"',
    );
    expect(apply_blog_preset(writer, current, "layout", false).undo_label).toBe(
      'Apply "Minimal Writer" layout',
    );
    expect(apply_blog_preset(writer, current, "style", false).undo_label).toBe(
      'Apply "Minimal Writer" style',
    );
  });

  it("returns copies: mutating the patch or current never reaches the catalog", () => {
    const current = get_default_settings(false);
    const { patch } = apply_blog_preset(
      preset("minimal-writer"),
      current,
      "full",
      false,
      { sections_mode: "replace" },
    );
    patch.pageLayoutConfig?.containers.top.elements.push({
      id: "footer",
      active: true,
    });
    patch.home?.sections.pop();
    current.pageLayoutConfig.containers.top.elements.length = 0;
    expect(
      container_ids(preset("minimal-writer").layout.pageLayoutConfig, "top"),
    ).toEqual(["header"]);
    expect(preset("minimal-writer").home?.sections).toHaveLength(4);
  });
});

function with_site_content(is_community: boolean): SettingsData {
  const section_style = {
    width: "content",
    spacing: "md",
    bg: "none",
    overlay: "dark-50",
  } as const;
  return {
    ...get_default_settings(is_community),
    brand: { mode: "logo+text", size: "lg" },
    seo: { description: "Blog o pszczolach", favicon: "https://e.com/f.png" },
    locale: "pl",
    topbar: { show_login: false, show_node_switcher: false },
    nav: {
      links: [
        { label: "O mnie", kind: "page", target: "o-mnie" },
        { label: "Miody", kind: "tag", target: "honey" },
      ],
      cta: { label: "Kontakt", url: "https://e.com/kontakt" },
    },
    footer: {
      variant: "mast",
      columns: [
        {
          title: "Blog",
          links: [{ label: "Kontakt", kind: "page", target: "kontakt" }],
        },
      ],
      copyright: "(c) 2026 Pasieka",
      privacy: { label: "Prywatnosc", kind: "page", target: "o-mnie" },
      legal_links: [
        { label: "Regulamin", kind: "url", target: "https://e.com/r" },
      ],
      show_social: true,
    },
    home: {
      sections: [
        {
          id: "hero0001",
          type: "hero",
          content: { headline: "Witaj w pasiece" },
          style: { ...section_style, bg: "primary" },
        },
        { id: "posts001", type: "posts", content: {}, style: section_style },
        {
          id: "ctaband1",
          type: "cta-band",
          content: {
            title: "Newsletter",
            button: { label: "Zapisz sie", url: "https://e.com/news" },
          },
          style: { ...section_style, bg: "accent" },
        },
      ],
    } as SettingsData["home"],
    pages: [
      { slug: "o-mnie", title: "O mnie", body_md: "Pszczelarz od 1999." },
      { slug: "kontakt", title: "Kontakt", body_md: "Napisz do mnie." },
    ] as SettingsData["pages"],
  };
}

const PRESET_TOP_LEVEL_KEYS = new Set([
  "id",
  "name",
  "tagline",
  "layout",
  "community_layout",
  "style",
  "home",
]);

describe("preset apply keeps site content", () => {
  const scopes: PresetApplyScope[] = ["full", "layout", "style"];
  const content_cases = cases.flatMap(([id, is_community]) =>
    scopes.map((scope) => [id, is_community, scope] as const),
  );

  it.each(content_cases)(
    "%s (community=%s, %s): patch has no content keys and the merge keeps them intact",
    (id, is_community, scope) => {
      const current = with_site_content(is_community);
      const snapshot = structuredClone(current);
      const { patch } = apply_blog_preset(
        preset(id),
        current,
        scope,
        is_community,
      );
      const merged: SettingsData = { ...current, ...patch };

      for (const key of GLOBAL_FIELD_KEYS) {
        if (key === "home") continue;
        expect(patch).not.toHaveProperty(key);
        expect(merged[key]).toEqual(snapshot[key]);
      }
      if (scope === "style") expect(patch).not.toHaveProperty("home");
      for (const section of snapshot.home?.sections ?? []) {
        expect(merged.home?.sections).toContainEqual(section);
      }
      expect(current).toEqual(snapshot);
    },
  );

  it("catalog presets: pages never, home only as preset sections", () => {
    for (const blog_preset of BLOG_PRESETS) {
      const parts = [
        blog_preset.layout,
        blog_preset.style,
        blog_preset.community_layout ?? {},
      ];
      for (const part of parts) {
        for (const key of GLOBAL_FIELD_KEYS)
          expect(part).not.toHaveProperty(key);
      }
      const extra = Object.keys(blog_preset).filter(
        (key) => !PRESET_TOP_LEVEL_KEYS.has(key),
      );
      expect(extra, blog_preset.id).toEqual([]);
      expect(blog_preset).not.toHaveProperty("pages");
      const home: unknown = (blog_preset as { home?: unknown }).home;
      if (home !== undefined)
        expect(is_preset_home(home), blog_preset.id).toBe(true);
    }
  });

  it.each(cases)(
    "%s (community=%s): pages are never in the patch, home only as sections",
    (id, is_community) => {
      const current = with_site_content(is_community);
      for (const mode of ["append-missing", "replace", "skip"] as const) {
        const { patch } = apply_blog_preset(
          preset(id),
          current,
          "full",
          is_community,
          { sections_mode: mode },
        );
        expect(patch).not.toHaveProperty("pages");
        if (patch.home !== undefined) {
          expect(Object.keys(patch.home)).toEqual(["sections"]);
          expect(
            patch.home.sections.filter((s) => s.type === "posts"),
          ).toHaveLength(1);
        }
      }
    },
  );

  it.each([true, false])(
    "strip_irrelevant_fields (community=%s) keeps every content key",
    (is_community) => {
      const settings = with_site_content(is_community);
      const stripped = strip_irrelevant_fields(settings, is_community);
      for (const key of GLOBAL_FIELD_KEYS) {
        expect(stripped[key]).toEqual(settings[key]);
      }
    },
  );
});
