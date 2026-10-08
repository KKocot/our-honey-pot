// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  clamp_style_token,
  defaultSettings,
  FONT_IDS,
  get_default_settings,
  HEADING_SCALES,
  sanitize_style_tokens,
  STYLE_TOKEN_RANGES,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import {
  parse_settings_graceful,
  settings_schema,
} from "../../src/components/admin/types/settings-schema";
import { resolve_theme_colors } from "../../src/components/admin/types/theme";

const STYLE_DEFAULTS = {
  fontHeading: "system",
  fontBody: "system",
  radiusPx: 8,
  density: "comfortable",
  contentWidthPx: 1280,
  baseFontSizePx: 16,
  headingScale: 1.25,
  presetId: null,
};

describe("style token defaults", () => {
  it.each([true, false])(
    "are set in both modes (community=%s)",
    (is_community) => {
      expect(get_default_settings(is_community)).toMatchObject(STYLE_DEFAULTS);
    },
  );

  it("are applied by the schema to an empty config", () => {
    expect(settings_schema.parse({})).toMatchObject(STYLE_DEFAULTS);
  });

  it("lie inside their own ranges", () => {
    for (const key of Object.keys(STYLE_TOKEN_RANGES) as Array<
      keyof typeof STYLE_TOKEN_RANGES
    >) {
      expect(clamp_style_token(key, defaultSettings[key])).toBe(
        defaultSettings[key],
      );
    }
  });
});

describe("style token validation", () => {
  it("keeps valid values", () => {
    const valid = {
      fontHeading: "fraunces",
      fontBody: "atkinson",
      radiusPx: 24,
      density: "spacious",
      contentWidthPx: 960,
      baseFontSizePx: 19,
      headingScale: 1.333,
      presetId: "warm-editorial-2",
    };
    expect(parse_settings_graceful(valid)).toEqual(valid);
  });

  it("accepts every font id and heading scale", () => {
    for (const id of FONT_IDS) {
      expect(parse_settings_graceful({ fontBody: id }).fontBody).toBe(id);
    }
    for (const scale of HEADING_SCALES) {
      expect(
        parse_settings_graceful({ headingScale: scale }).headingScale,
      ).toBe(scale);
    }
  });

  it.each([
    ["radiusPx", -10, 0],
    ["radiusPx", 99, 24],
    ["radiusPx", 7, 8],
    ["contentWidthPx", 100, 960],
    ["contentWidthPx", 5000, 1440],
    ["contentWidthPx", 1295, 1280],
    ["baseFontSizePx", 12, 15],
    ["baseFontSizePx", 16.6, 17],
  ] as const)("clamps %s=%s to %s", (key, raw, expected) => {
    expect(parse_settings_graceful({ [key]: raw })[key]).toBe(expected);
  });

  it.each([
    ["radiusPx", "8px"],
    ["radiusPx", Number.POSITIVE_INFINITY],
    ["contentWidthPx", Number.NaN],
    ["baseFontSizePx", null],
    ["fontHeading", "comic-sans"],
    ["fontBody", "inter; background:url(x)"],
    ["density", "cozy"],
    ["headingScale", 1.5],
    ["headingScale", "1.25"],
    ["presetId", "../../etc"],
    ["presetId", "Has Spaces"],
    ["presetId", "a".repeat(65)],
    ["presetId", 42],
  ] as const)("drops %s=%s so the default applies", (key, raw) => {
    expect(key in parse_settings_graceful({ [key]: raw })).toBe(false);
  });

  it("keeps an explicit null presetId", () => {
    expect(parse_settings_graceful({ presetId: null }).presetId).toBeNull();
  });
});

describe("sanitize_style_tokens", () => {
  it("repairs values that bypassed the schema", () => {
    const defaults = get_default_settings(false);
    const settings = {
      ...get_default_settings(false),
      fontHeading: "bogus",
      fontBody: "inter",
      radiusPx: 1000,
      density: "huge",
      contentWidthPx: "wide",
      baseFontSizePx: 18,
      headingScale: 2,
      presetId: "<script>",
    } as unknown as SettingsData;
    sanitize_style_tokens(settings, defaults);
    expect(settings).toMatchObject({
      fontHeading: "system",
      fontBody: "inter",
      radiusPx: 24,
      density: "comfortable",
      contentWidthPx: 1280,
      baseFontSizePx: 18,
      headingScale: 1.25,
      presetId: null,
    });
  });
});

describe("config shape", () => {
  it("does not carry user presets", () => {
    expect("userPresets" in defaultSettings).toBe(false);
    expect("userPresets" in settings_schema.shape).toBe(false);
  });

  it("drops unknown top-level keys, including prototype names", () => {
    const raw = JSON.parse(
      '{"siteName":"Blog","evilKey":{"a":1},"constructor":1,"__proto__":{"polluted":true}}',
    ) as Record<string, unknown>;
    const parsed = parse_settings_graceful(raw);
    expect(parsed).toEqual({ siteName: "Blog" });
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("strips unknown keys in a full parse", () => {
    expect("evilKey" in settings_schema.parse({ evilKey: 1 })).toBe(false);
  });
});

describe("structured layout validation", () => {
  it("keeps valid default layouts unchanged", () => {
    const defaults = get_default_settings(false);
    const raw = {
      postCardLayout: defaults.postCardLayout,
      commentCardLayout: defaults.commentCardLayout,
      authorProfileLayout2: defaults.authorProfileLayout2,
      pageLayout: defaults.pageLayout,
      layoutSections: defaults.layoutSections,
      navigationTabs: defaults.navigationTabs,
    };
    expect(parse_settings_graceful(structuredClone(raw))).toEqual(raw);
  });

  it.each([
    [
      "postCardLayout",
      { sections: [{ id: "s", orientation: "diagonal", children: [] }] },
    ],
    ["commentCardLayout", { sections: "nope" }],
    [
      "pageLayout",
      {
        sections: [
          {
            id: "s",
            slot: "nowhere",
            orientation: "vertical",
            elements: [],
            active: true,
          },
        ],
      },
    ],
    [
      "layoutSections",
      Array.from({ length: 65 }, (_, index) => ({
        id: `s${index}`,
        position: "main",
        enabled: true,
      })),
    ],
    [
      "navigationTabs",
      [{ id: "x".repeat(65), label: "Tab", enabled: true, showCount: true }],
    ],
    ["pageLayout", null],
  ])("drops a malformed %s without failing other fields", (key, raw) => {
    const parsed = parse_settings_graceful({ [key]: raw, siteName: "Blog" });
    expect(key in parsed).toBe(false);
    expect(parsed.siteName).toBe("Blog");
  });

  it("migrates the legacy elements: string[] card format", () => {
    const parsed = parse_settings_graceful({
      postCardLayout: {
        sections: [{ id: "s", orientation: "vertical", elements: ["title"] }],
      },
    });
    expect(parsed.postCardLayout).toEqual({
      sections: [
        {
          id: "s",
          orientation: "vertical",
          children: [{ type: "element", id: "title" }],
        },
      ],
    });
  });
});

describe("customColors validation", () => {
  const palette = { ...resolve_theme_colors("light") };

  it("accepts a complete hex palette and null", () => {
    expect(parse_settings_graceful({ customColors: palette })).toEqual({
      customColors: palette,
    });
    expect(parse_settings_graceful({ customColors: null })).toEqual({
      customColors: null,
    });
  });

  it.each([
    ["a non-hex value", { ...palette, bg: "red;} body{display:none" }],
    ["a CSS function", { ...palette, primary: "url(https://evil.example/x)" }],
    ["an incomplete palette", { bg: "#ffffff" }],
    ["a string", "#ffffff"],
    ["an array", [palette.bg]],
  ])("drops customColors with %s", (_label, customColors) => {
    expect(parse_settings_graceful({ customColors, siteName: "Blog" })).toEqual(
      { siteName: "Blog" },
    );
  });

  it("ignores inherited palette keys", () => {
    const inherited = Object.create(palette) as Record<string, unknown>;
    expect(parse_settings_graceful({ customColors: inherited })).toEqual({});
  });

  it("sanitize_style_tokens resets an invalid palette that bypassed the schema", () => {
    const settings = {
      ...get_default_settings(false),
      customColors: { ...palette, text: "expression(alert(1))" },
    } as unknown as SettingsData;
    sanitize_style_tokens(settings, get_default_settings(false));
    expect(settings.customColors).toBeNull();
  });

  it("sanitize_style_tokens keeps a valid palette", () => {
    const settings = {
      ...get_default_settings(false),
      customColors: palette,
    } as SettingsData;
    sanitize_style_tokens(settings, get_default_settings(false));
    expect(settings.customColors).toEqual(palette);
  });
});
