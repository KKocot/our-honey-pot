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
  CtaSchema,
  FooterSchema,
  LinkSchema,
  NavSchema,
  parse_settings_graceful,
  sanitize_global_fields,
  SeoSchema,
  settings_schema,
  validate_settings_for_save,
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

describe("global field limits", () => {
  const url_link = (label: string, target = "https://example.com/") => ({
    label,
    kind: "url",
    target,
  });

  it("validates Link kinds and label length in code points", () => {
    expect(LinkSchema.safeParse(url_link("a".repeat(24))).success).toBe(true);
    expect(LinkSchema.safeParse(url_link("ą".repeat(24))).success).toBe(true);
    expect(LinkSchema.safeParse(url_link("a".repeat(25))).success).toBe(false);
    expect(LinkSchema.safeParse(url_link("   ")).success).toBe(false);
    expect(
      LinkSchema.safeParse({ label: "T", kind: "tag", target: "hive-dev" })
        .success,
    ).toBe(true);
    expect(
      LinkSchema.safeParse({ label: "T", kind: "tag", target: "Hive Dev" })
        .success,
    ).toBe(false);
    expect(
      LinkSchema.safeParse({ label: "P", kind: "page", target: "about-me" })
        .success,
    ).toBe(true);
    expect(
      LinkSchema.safeParse({ label: "P", kind: "page", target: "a" }).success,
    ).toBe(false);
    expect(
      LinkSchema.safeParse({ label: "P", kind: "other", target: "x" }).success,
    ).toBe(false);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "http://example.com/",
    `https://example.com/${"a".repeat(240)}`,
  ])("rejects link target %s", (target) => {
    expect(LinkSchema.safeParse(url_link("x", target)).success).toBe(false);
  });

  it("allows mailto: and tel: in links and CTA", () => {
    expect(
      LinkSchema.safeParse(url_link("Mail", "mailto:me@example.com")).success,
    ).toBe(true);
    expect(
      CtaSchema.safeParse({ label: "Call", url: "tel:+48 123 456 789" })
        .success,
    ).toBe(true);
  });

  it("enforces nav and footer limits strictly", () => {
    const links = (n: number) =>
      Array.from({ length: n }, (_, i) => url_link(`L${i}`));
    expect(NavSchema.safeParse({ links: links(6) }).success).toBe(true);
    expect(NavSchema.safeParse({ links: links(7) }).success).toBe(false);
    const column = (n: number) => ({ title: "Col", links: links(n) });
    expect(
      FooterSchema.safeParse({ columns: [column(4), column(4), column(4)] })
        .success,
    ).toBe(true);
    expect(FooterSchema.safeParse({ columns: [column(5)] }).success).toBe(
      false,
    );
    expect(
      FooterSchema.safeParse({
        columns: [column(1), column(1), column(1), column(1)],
      }).success,
    ).toBe(false);
    expect(FooterSchema.safeParse({ legal_links: links(4) }).success).toBe(
      false,
    );
    expect(
      FooterSchema.safeParse({
        columns: [{ title: "t".repeat(25), links: [] }],
      }).success,
    ).toBe(false);
    expect(FooterSchema.safeParse({ copyright: "c".repeat(120) }).success).toBe(
      true,
    );
    expect(FooterSchema.safeParse({ copyright: "c".repeat(121) }).success).toBe(
      false,
    );
    expect(FooterSchema.safeParse({ company: "c".repeat(161) }).success).toBe(
      false,
    );
    expect(SeoSchema.safeParse({ description: "d".repeat(161) }).success).toBe(
      false,
    );
  });

  it("truncates and filters over-limit lists on read instead of dropping the field", () => {
    const parsed = parse_settings_graceful({
      nav: {
        links: [
          ...Array.from({ length: 8 }, (_, i) => url_link(`L${i}`)),
          url_link("bad", "javascript:x"),
        ],
      },
      footer: {
        columns: Array.from({ length: 4 }, () => ({
          title: "t".repeat(30),
          links: Array.from({ length: 6 }, (_, i) => url_link(`F${i}`)),
        })),
        copyright: "c".repeat(200),
        show_social: "yes",
      },
    }) as Pick<SettingsData, "nav" | "footer">;
    expect(parsed.nav.links).toHaveLength(6);
    expect(parsed.footer.columns).toHaveLength(3);
    expect(parsed.footer.columns[0].title).toBe("");
    expect(parsed.footer.columns[0].links).toHaveLength(4);
    expect(parsed.footer.copyright).toBeUndefined();
    expect(parsed.footer.show_social).toBe(false);
  });

  it("validate_settings_for_save reports the failing path", () => {
    const result = validate_settings_for_save({
      ...get_default_settings(false),
      locale: "de" as SettingsData["locale"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^locale/);
  });

  it("sanitize_global_fields replaces values that bypassed the schema", () => {
    const defaults = get_default_settings(false);
    const settings = {
      ...get_default_settings(false),
      brand: "x",
      nav: null,
    } as unknown as SettingsData;
    sanitize_global_fields(settings, defaults);
    expect(settings.brand).toEqual(defaults.brand);
    expect(settings.nav).toEqual(defaults.nav);
    expect(settings.nav).not.toBe(defaults.nav);
  });
});
