// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  PRESET_PALETTES,
  find_theme_preset,
  resolve_theme_colors,
  themePresets,
} from "../../src/components/admin/types/theme";
import * as palettes_module from "../../src/components/admin/presets/palettes";
import { BLOG_PRESETS } from "../../src/components/admin/presets";

const CLASSIC_IDS = [
  "light",
  "dark",
  "green",
  "pink",
  "ocean",
  "sunset",
  "forest",
  "lavender",
  "midnight",
  "coffee",
] as const;

describe("theme resolution (Layout + canvas share resolve_theme_colors)", () => {
  it("covers the 8 preset slugs and the 10 classic themes", () => {
    expect(PRESET_PALETTES).toHaveLength(8);
    expect(themePresets.map((p) => p.id)).toEqual([...CLASSIC_IDS]);
  });

  it.each(PRESET_PALETTES.map((p) => p.id))(
    "resolves preset palette %s instead of falling back to Light",
    (slug) => {
      const expected = PRESET_PALETTES.find((p) => p.id === slug)!.colors;
      expect(find_theme_preset(slug)?.id).toBe(slug);
      expect(resolve_theme_colors(slug)).toEqual(expected);
      expect(resolve_theme_colors(slug)).not.toEqual(themePresets[0].colors);
    },
  );

  it.each(CLASSIC_IDS)("resolves classic theme %s", (slug) => {
    const expected = themePresets.find((p) => p.id === slug)!.colors;
    expect(find_theme_preset(slug)?.id).toBe(slug);
    expect(resolve_theme_colors(slug)).toEqual(expected);
  });

  it.each(BLOG_PRESETS.map((p) => p.id))(
    "blog preset %s stores a siteTheme that is a known preset palette",
    (id) => {
      const preset = BLOG_PRESETS.find((p) => p.id === id)!;
      const palette = PRESET_PALETTES.find(
        (p) => p.id === preset.style.siteTheme,
      );
      expect(palette).toBeDefined();
      expect(find_theme_preset(preset.style.siteTheme)?.id).toBe(palette!.id);
      expect(resolve_theme_colors(preset.style.siteTheme)).toEqual(
        palette!.colors,
      );
    },
  );

  it.each(["nope", "", null, undefined])(
    "unknown slug %s falls back to the first classic palette",
    (slug) => {
      expect(find_theme_preset(slug)).toBeUndefined();
      expect(resolve_theme_colors(slug)).toEqual(themePresets[0].colors);
    },
  );

  it("presets/palettes re-exports the single source in types/theme", () => {
    expect(palettes_module.PRESET_PALETTES).toBe(PRESET_PALETTES);
    expect(palettes_module.find_theme_preset).toBe(find_theme_preset);
    expect(palettes_module.resolve_theme_colors).toBe(resolve_theme_colors);
  });

  it("returns a fresh copy, so callers cannot mutate the shared palette", () => {
    const colors = resolve_theme_colors("essay");
    colors.bg = "#000000";
    expect(resolve_theme_colors("essay").bg).toBe("#fffbea");
  });
});
