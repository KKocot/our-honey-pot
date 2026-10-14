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
  it("has the 8 presets of the brief in order", () => {
    expect(BLOG_PRESETS.map((p) => p.id)).toEqual(PRESET_IDS);
  });

  it("puts Hive Commons first in community mode and last in user mode", () => {
    expect(list_blog_presets(true)[0].id).toBe("hive-commons");
    expect(list_blog_presets(false).at(-1)?.id).toBe("hive-commons");
    expect(list_blog_presets(true)).toHaveLength(8);
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
    expect(style.siteTheme).toBe(id);
    expect(style.presetId).toBe(id);
    expect(style.customColors).toBeNull();
    expect(style.cardBorderRadiusPx).toBe(style.radiusPx);
  });

  it("matches the layout table of the brief", () => {
    const essay = preset("essay").layout;
    expect(essay.pageLayoutConfig?.template).toBe("no-sidebar");
    expect(container_ids(essay.pageLayoutConfig, "top")).toContain(
      "authorProfile",
    );
    expect(essay.showThumbnail).toBe(false);

    const terminal = preset("terminal").layout;
    expect(terminal.pageLayoutConfig?.template).toBe("sidebar-right");
    expect(terminal.thumbnailSizePx).toBe(96);
    expect(terminal.cardLayout).toBe("horizontal");

    expect(preset("gallery").layout).toMatchObject({
      postsLayout: "masonry",
      gridColumns: 3,
      showSummary: false,
    });
    expect(preset("front-page").layout).toMatchObject({
      postsLayout: "grid",
      gridColumns: 3,
    });
    expect(preset("notebook").layout.cardLayout).toBe("vertical");
    expect(preset("notebook").layout.pageLayoutConfig?.template).toBe(
      "sidebar-left",
    );
    expect(preset("poster").layout).toMatchObject({
      postsLayout: "grid",
      gridColumns: 2,
    });
    expect(preset("poster").style.cardHoverEffect).toBe("lift");
    expect(preset("kitchen-table").layout).toMatchObject({
      postsLayout: "grid",
      gridColumns: 2,
      cardLayout: "vertical",
    });
    expect(preset("kitchen-table").layout.pageLayoutConfig?.template).toBe(
      "sidebar-right",
    );
  });

  it("matches the font and shape table of the brief", () => {
    const rows = BLOG_PRESETS.map((p) => [
      p.id,
      p.style.fontHeading,
      p.style.fontBody,
      p.style.radiusPx,
      p.style.density,
    ]);
    expect(rows).toEqual([
      ["essay", "source-serif", "source-serif", 2, "spacious"],
      ["terminal", "jetbrains-mono", "inter", 4, "compact"],
      ["gallery", "space-grotesk", "inter", 12, "comfortable"],
      ["front-page", "fraunces", "inter", 2, "compact"],
      ["notebook", "fraunces", "atkinson", 20, "spacious"],
      ["poster", "space-grotesk", "inter", 0, "comfortable"],
      ["kitchen-table", "fraunces", "inter", 12, "comfortable"],
      ["hive-commons", "inter", "inter", 8, "comfortable"],
    ]);
  });

  it("is frozen, so no tenant can mutate the shared catalog", () => {
    expect(Object.isFrozen(preset("essay").layout.pageLayoutConfig)).toBe(true);
    expect(Object.isFrozen(PRESET_PALETTES[0].colors)).toBe(true);
  });
});

describe("preset palettes", () => {
  it("has one palette per preset with ids distinct from classic themes", () => {
    expect(PRESET_PALETTES.map((p) => p.id)).toEqual(PRESET_IDS);
    const ids = all_theme_presets().map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(PRESET_IDS.length + themePresets.length);
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
        preset("essay"),
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
      preset("essay"),
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
      apply_blog_preset(preset("poster"), current, "full", false)
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
      expect(ids).toContain("communitySidebar");
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

  it("Hive Commons in community mode: profile on top, sidebar on the right", () => {
    const { patch } = apply_blog_preset(
      preset("hive-commons"),
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
      "communitySidebar",
    ]);
  });

  it("returns labels for the history step and toast", () => {
    const current = get_default_settings(false);
    expect(
      apply_blog_preset(preset("essay"), current, "full", false).undo_label,
    ).toBe('Apply "Essay"');
    expect(
      apply_blog_preset(preset("essay"), current, "layout", false).undo_label,
    ).toBe('Apply "Essay" layout');
    expect(
      apply_blog_preset(preset("essay"), current, "style", false).undo_label,
    ).toBe('Apply "Essay" style');
  });

  it("returns copies: mutating the patch or current never reaches the catalog", () => {
    const current = get_default_settings(false);
    const { patch } = apply_blog_preset(
      preset("notebook"),
      current,
      "full",
      false,
    );
    patch.pageLayoutConfig?.containers.top.elements.push({
      id: "footer",
      active: true,
    });
    current.pageLayoutConfig.containers.top.elements.length = 0;
    expect(
      container_ids(preset("notebook").layout.pageLayoutConfig, "top"),
    ).toEqual(["header"]);
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
        expect(patch).not.toHaveProperty(key);
        expect(merged[key]).toEqual(snapshot[key]);
      }
      expect(current).toEqual(snapshot);
    },
  );

  it("catalog presets carry no content keys in any part", () => {
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
    }
  });

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
