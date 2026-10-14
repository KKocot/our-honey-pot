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
  SECTION_STYLE_DEFAULTS,
  STYLE_TOKEN_RANGES,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import {
  create_posts_section,
  CtaSchema,
  FooterSchema,
  HomeSchema,
  HomeSectionSchema,
  LinkSchema,
  NavSchema,
  PagesSchema,
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

describe("home sections and pages", () => {
  const IMAGE = "https://images.hive.blog/DQm/photo.jpg";
  const posts = (id = "posts001") => ({ id, type: "posts" });
  const hero = (id = "hero0001", content: Record<string, unknown> = {}) => ({
    id,
    type: "hero",
    content: { headline: "Hello", ...content },
  });
  const text_media = (id: string, content?: Record<string, unknown>) => ({
    id,
    type: "text-media",
    content: content ?? { title: "About", body_md: "Some text" },
  });
  const cta_band = (id = "ctaband1") => ({
    id,
    type: "cta-band",
    content: {
      title: "Newsletter",
      button: { label: "Join", url: "https://newsletter.example.com/" },
    },
  });
  const page = (slug: string, body_md = "Hi") => ({
    slug,
    title: `Page ${slug}`,
    body_md,
  });
  const privacy = { label: "Privacy", kind: "url", target: "https://e.com/" };

  function save_with(overrides: Record<string, unknown>) {
    return validate_settings_for_save({
      ...get_default_settings(false),
      ...overrides,
    } as SettingsData);
  }

  function read(raw: Record<string, unknown>) {
    return parse_settings_graceful(raw) as Partial<SettingsData>;
  }

  it("stay out of defaults and schema defaults", () => {
    expect("home" in get_default_settings(false)).toBe(false);
    expect("pages" in get_default_settings(true)).toBe(false);
    const parsed = settings_schema.parse({});
    expect("home" in parsed).toBe(false);
    expect("pages" in parsed).toBe(false);
  });

  it("fill style defaults and clamp out-of-enum style values", () => {
    const parsed = HomeSchema.parse({
      sections: [
        posts(),
        {
          ...hero(),
          style: { variant: "parallax", bg: "#ff0000", height: "lg" },
        },
      ],
    });
    expect(parsed.sections[0].style).toEqual(SECTION_STYLE_DEFAULTS.common);
    expect(parsed.sections[1].style).toMatchObject({
      variant: "split",
      bg: "none",
      height: "lg",
      align: "start",
    });
  });

  it("strictly enforce section counts", () => {
    const text_sections = (count: number) =>
      Array.from({ length: count }, (_, i) => text_media(`textmed${i}`));
    const accepts = (sections: unknown[]) =>
      HomeSchema.safeParse({ sections }).success;
    expect(accepts([posts(), ...text_sections(4)])).toBe(true);
    expect(accepts([posts(), ...text_sections(5)])).toBe(false);
    expect(accepts([posts(), hero("hero0001"), hero("hero0002")])).toBe(false);
    expect(accepts([hero()])).toBe(false);
    expect(accepts([posts(), posts("posts002")])).toBe(false);
    expect(
      accepts([
        posts(),
        cta_band("ctaband1"),
        cta_band("ctaband2"),
        cta_band("ctaband3"),
      ]),
    ).toBe(false);
    expect(
      accepts([
        posts(),
        hero(),
        ...text_sections(4),
        cta_band("ctaband1"),
        cta_band("ctaband2"),
      ]),
    ).toBe(true);
    expect(
      accepts([
        posts(),
        hero(),
        ...text_sections(4),
        cta_band("ctaband1"),
        cta_band("ctaband2"),
        text_media("textmed9"),
      ]),
    ).toBe(false);
  });

  it.each(["page-sec-1", "POSTS001", "posts01", "posts-01", "header"])(
    "reject section id %s",
    (id) => {
      expect(HomeSchema.safeParse({ sections: [posts(id)] }).success).toBe(
        false,
      );
    },
  );

  it("reject duplicate section ids", () => {
    expect(
      HomeSchema.safeParse({ sections: [posts(), text_media("posts001")] })
        .success,
    ).toBe(false);
  });

  it("count text in code points and markdown in UTF-8 bytes", () => {
    const accepts_headline = (headline: string) =>
      HomeSectionSchema.safeParse(hero("hero0001", { headline })).success;
    expect(accepts_headline("ż".repeat(90))).toBe(true);
    expect(accepts_headline("a".repeat(91))).toBe(false);
    expect(accepts_headline("   ")).toBe(false);
    const accepts_body = (body_md: string) =>
      HomeSectionSchema.safeParse(text_media("textmed1", { body_md })).success;
    expect(accepts_body("a".repeat(1200))).toBe(true);
    expect(accepts_body("ą".repeat(600))).toBe(true);
    expect(accepts_body("ą".repeat(601))).toBe(false);
  });

  it.each(["javascript:alert(1)", "http://e.com/", "data:text/html,x"])(
    "reject CTA url %s",
    (url) => {
      expect(
        HomeSectionSchema.safeParse(
          hero("hero0001", { cta: [{ label: "Go", url }] }),
        ).success,
      ).toBe(false);
    },
  );

  it("allow only https for the cta-band button", () => {
    const band_with = (url: string) => ({
      ...cta_band(),
      content: { title: "N", button: { label: "Join", url } },
    });
    expect(
      HomeSectionSchema.safeParse(band_with("https://x.com/")).success,
    ).toBe(true);
    expect(
      HomeSectionSchema.safeParse(band_with("mailto:me@example.com")).success,
    ).toBe(false);
  });

  it("validate images as ImageRef and force decorative backgrounds", () => {
    const parsed = HomeSectionSchema.parse({
      ...posts(),
      style: { bg: "image", bg_image: { url: IMAGE, alt: "" } },
    });
    expect(parsed.style.bg_image).toEqual({
      url: IMAGE,
      alt: "",
      decorative: true,
    });
    expect(
      HomeSectionSchema.safeParse(
        hero("hero0001", { image: { url: IMAGE, alt: "" } }),
      ).success,
    ).toBe(false);
    expect(
      HomeSectionSchema.safeParse(
        hero("hero0001", {
          image: { url: "https://evil.example.com/a.png", alt: "x" },
        }),
      ).success,
    ).toBe(false);
  });

  it("read tolerantly: invalid sections drop, invalid optional fields drop", () => {
    const parsed = read({
      home: {
        sections: [
          hero("hero0001", { headline: "" }),
          hero("hero0002", {
            headline: "Ok",
            subheadline: 5,
            cta: [
              { label: "Bad", url: "javascript:alert(1)" },
              { label: "Ok", url: "https://e.com/" },
            ],
          }),
          posts(),
          posts("posts002"),
          text_media("posts001"),
          { id: "unknown1", type: "gallery", content: {} },
          text_media("textmed1", {
            title: "About",
            image: { url: "javascript:alert(1)", alt: "x" },
          }),
        ],
      },
    });
    const sections = parsed.home?.sections ?? [];
    expect(sections.map((section) => section.id)).toEqual([
      "hero0002",
      "posts001",
      "textmed1",
    ]);
    const [hero_section, , text_section] = sections;
    if (hero_section.type !== "hero") throw new Error("expected hero");
    expect(hero_section.content.subheadline).toBeUndefined();
    expect(hero_section.content.cta).toEqual([
      { label: "Ok", url: "https://e.com/" },
    ]);
    if (text_section.type !== "text-media") {
      throw new Error("expected text-media");
    }
    expect(text_section.content).toEqual({ title: "About" });
  });

  it.each(["constructor", "__proto__", "toString"])(
    "read drops a section typed as prototype key %s without throwing",
    (type) => {
      const parsed = read({
        home: { sections: [{ id: "weird001", type, content: {} }] },
      });
      expect(parsed.home?.sections.map((section) => section.type)).toEqual([
        "posts",
      ]);
    },
  );

  it("read inserts a missing posts section and keeps the total at 8", () => {
    const parsed = read({
      home: {
        sections: [
          hero(),
          ...Array.from({ length: 4 }, (_, i) => text_media(`textmed${i}`)),
          cta_band("ctaband1"),
          cta_band("ctaband2"),
          text_media("textmed9"),
        ],
      },
    });
    const sections = parsed.home?.sections ?? [];
    expect(sections).toHaveLength(8);
    expect(sections.filter((section) => section.type === "posts")).toEqual([
      create_posts_section("posts001"),
    ]);
    expect(sections.at(-1)?.id).toBe("posts001");
  });

  it("read picks a free posts id when posts001 is taken", () => {
    const parsed = read({ home: { sections: [text_media("posts001")] } });
    expect(parsed.home?.sections.map((section) => section.id)).toEqual([
      "posts001",
      "posts002",
    ]);
  });

  it("read drops home whose sections are not a list", () => {
    expect("home" in read({ home: { sections: "x" } })).toBe(false);
  });

  it("validate pages strictly: slug, reserved names, uniqueness, count", () => {
    expect(PagesSchema.safeParse([page("about-me")]).success).toBe(true);
    for (const slug of [
      "p",
      "admin",
      "api",
      "auth",
      "new",
      "dev-mode",
      "rss",
      "About",
      "a--b",
      "x.y",
      "@me",
    ]) {
      expect(PagesSchema.safeParse([page(slug)]).success, slug).toBe(false);
    }
    expect(PagesSchema.safeParse([page("about"), page("about")]).success).toBe(
      false,
    );
    const seven = Array.from({ length: 7 }, (_, i) => page(`page-${i}`));
    expect(PagesSchema.safeParse(seven.slice(0, 6)).success).toBe(true);
    expect(PagesSchema.safeParse(seven).success).toBe(false);
  });

  it("enforce per-page and total markdown budget in UTF-8 bytes", () => {
    expect(PagesSchema.safeParse([page("one", "a".repeat(6144))]).success).toBe(
      true,
    );
    expect(PagesSchema.safeParse([page("one", "ą".repeat(3073))]).success).toBe(
      false,
    );
    const pages_of = (chars: number) =>
      ["one", "two", "three"].map((slug) => page(slug, "ł".repeat(chars)));
    // 3 x 2389 x 2 B = 14334 B fits; 3 x 2390 x 2 B = 14340 B does not
    expect(PagesSchema.safeParse(pages_of(2389)).success).toBe(true);
    const over_budget = PagesSchema.safeParse(pages_of(2390));
    expect(over_budget.success).toBe(false);
    if (!over_budget.success) {
      expect(over_budget.error.issues[0].message).toMatch(/14336 bytes/);
    }
  });

  it("read pages tolerantly within count and budget", () => {
    const parsed = read({
      pages: [
        page("one", "ł".repeat(3072)),
        page("admin"),
        page("one"),
        { slug: "bad-title", title: "" },
        page("two", "ł".repeat(3072)),
        page("three", "ł".repeat(1100)),
        page("four", "x"),
      ],
    });
    expect(parsed.pages?.map((entry) => entry.slug)).toEqual([
      "one",
      "two",
      "four",
    ]);
    expect(parsed.pages?.[2]).toMatchObject({
      in_nav: false,
      in_footer: "none",
      footer_column: 0,
    });
  });

  describe("read only a bounded window of hostile arrays", () => {
    const HOSTILE_LENGTH = 10_000;
    const invalid_entries = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ id: `bad${i}`, type: 42 }));

    it("home sections past the scan window are never read", () => {
      const parsed = read({
        home: {
          sections: [
            hero(),
            ...invalid_entries(HOSTILE_LENGTH),
            text_media("textmed1"),
          ],
        },
      });
      expect(parsed.home?.sections.map((section) => section.id)).toEqual([
        "hero0001",
        "posts001",
      ]);
    });

    it("home sections after a few invalid entries are still kept", () => {
      const parsed = read({
        home: {
          sections: [...invalid_entries(10), posts(), text_media("textmed1")],
        },
      });
      expect(parsed.home?.sections.map((section) => section.id)).toEqual([
        "posts001",
        "textmed1",
      ]);
    });

    it("pages past the scan window are never read", () => {
      const parsed = read({
        pages: [page("one"), ...invalid_entries(HOSTILE_LENGTH), page("two")],
      });
      expect(parsed.pages?.map((entry) => entry.slug)).toEqual(["one"]);
    });

    it("pages after a few invalid entries are still kept", () => {
      const parsed = read({ pages: [...invalid_entries(10), page("one")] });
      expect(parsed.pages?.map((entry) => entry.slug)).toEqual(["one"]);
    });

    it("hero cta past the scan window is never read", () => {
      const ok_cta = { label: "Ok", url: "https://e.com/" };
      const read_cta = (cta: unknown[]) => {
        const [hero_section] =
          read({ home: { sections: [hero("hero0001", { cta })] } }).home
            ?.sections ?? [];
        if (hero_section?.type !== "hero") throw new Error("expected hero");
        return hero_section.content.cta;
      };
      expect(read_cta([...invalid_entries(HOSTILE_LENGTH), ok_cta])).toEqual(
        [],
      );
      expect(read_cta([...invalid_entries(3), ok_cta])).toEqual([ok_cta]);
    });
  });

  it("save blocks a cta-band without footer.privacy", () => {
    const home = { sections: [posts(), cta_band()] };
    const blocked = save_with({ home });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.errors[0]).toMatch(/^footer\.privacy: .*cta-band/);
    }
    const allowed = save_with({
      home,
      footer: { ...get_default_settings(false).footer, privacy },
    });
    expect(allowed.ok).toBe(true);
  });

  it("save reports the failing section path", () => {
    const result = save_with({
      home: { sections: [posts(), hero("hero0001", { headline: "" })] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(
        /^home\.sections\.1\.content\.headline:/,
      );
    }
  });

  it("save blocks over-budget pages", () => {
    const pages = ["one", "two", "three"].map((slug) =>
      page(slug, "ł".repeat(2390)),
    );
    const result = save_with({ pages });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^pages: /);
  });

  it("save rejects page links to pages that do not exist", () => {
    const nav = { links: [{ label: "About", kind: "page", target: "about" }] };
    const missing = save_with({ nav });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.errors[0]).toBe(
        'nav.links.0.target: Page "about" does not exist',
      );
    }
    expect(save_with({ nav, pages: [page("about")] }).ok).toBe(true);
  });

  describe("save counts page links against menu and footer limits", () => {
    const url_links = (count: number, prefix: string) =>
      Array.from({ length: count }, (_, i) => ({
        label: `${prefix} ${i}`,
        kind: "url",
        target: `https://e.com/${prefix}${i}`,
      }));
    const page_link = (slug: string) => ({
      label: slug,
      kind: "page",
      target: slug,
    });
    const placed = (slug: string, placement: Record<string, unknown>) => ({
      ...page(slug),
      ...placement,
    });
    const footer_with = (overrides: Record<string, unknown>) => ({
      ...get_default_settings(false).footer,
      ...overrides,
    });
    const errors_of = (overrides: Record<string, unknown>) => {
      const result = save_with(overrides);
      return result.ok ? [] : result.errors;
    };

    it("accepts menu links and in_nav pages within the limit", () => {
      const nav = { links: url_links(4, "nav") };
      const pages = [
        placed("one", { in_nav: true }),
        placed("two", { in_nav: true }),
      ];
      expect(errors_of({ nav, pages })).toEqual([]);
    });

    it("blocks a menu pushed over the limit by in_nav pages", () => {
      const nav = { links: url_links(5, "nav") };
      const pages = [
        placed("one", { in_nav: true }),
        placed("two", { in_nav: true }),
      ];
      expect(errors_of({ nav, pages })).toEqual([
        "nav.links: Menu has 7 links (max 6) including pages shown in menu",
      ]);
    });

    it("does not count an in_nav page already linked in the menu twice", () => {
      const nav = { links: [...url_links(5, "nav"), page_link("one")] };
      const pages = [placed("one", { in_nav: true })];
      expect(errors_of({ nav, pages })).toEqual([]);
    });

    it("blocks a footer column pushed over the limit by its pages", () => {
      const footer = footer_with({
        columns: [
          { title: "A", links: [] },
          { title: "B", links: url_links(3, "col") },
        ],
      });
      const in_column = (slug: string, footer_column: number) =>
        placed(slug, { in_footer: "column", footer_column });
      expect(
        errors_of({
          footer,
          pages: [in_column("one", 1), in_column("two", 0)],
        }),
      ).toEqual([]);
      expect(
        errors_of({
          footer,
          pages: [in_column("one", 1), in_column("two", 1)],
        }),
      ).toEqual([
        "footer.columns.1.links: Footer column 2 has 5 links (max 4) including pages placed in it",
      ]);
    });

    it("counts pages in a column the owner has not created yet", () => {
      const pages = ["one", "two", "three", "four", "five"].map((slug) =>
        placed(slug, { in_footer: "column", footer_column: 2 }),
      );
      expect(errors_of({ pages })).toEqual([
        "footer.columns.2.links: Footer column 3 has 5 links (max 4) including pages placed in it",
      ]);
    });

    it("blocks a legal row pushed over the limit by legal pages", () => {
      const footer = footer_with({ legal_links: url_links(2, "legal") });
      const legal = (slug: string) => placed(slug, { in_footer: "legal" });
      expect(errors_of({ footer, pages: [legal("terms")] })).toEqual([]);
      expect(
        errors_of({ footer, pages: [legal("terms"), legal("cookies")] }),
      ).toEqual([
        "footer.legal_links: Footer bottom row has 4 links (max 3) including pages shown there",
      ]);
    });

    it("does not count a legal page already linked anywhere in the footer", () => {
      const footer = footer_with({
        legal_links: [...url_links(2, "legal"), page_link("terms")],
        privacy: page_link("privacy"),
      });
      const pages = [
        placed("terms", { in_footer: "legal" }),
        placed("privacy", { in_footer: "legal" }),
      ];
      expect(errors_of({ footer, pages })).toEqual([]);
    });
  });

  it("save keeps configs without home and pages unchanged", () => {
    const result = save_with({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect("home" in result.settings).toBe(false);
      expect("pages" in result.settings).toBe(false);
    }
  });

  it("sanitize_global_fields removes an invalid home instead of storing undefined", () => {
    const settings = {
      ...get_default_settings(false),
      home: "broken",
    } as unknown as SettingsData;
    sanitize_global_fields(settings, get_default_settings(false));
    expect("home" in settings).toBe(false);
  });

  it("create_posts_section returns fresh objects", () => {
    const first = create_posts_section();
    first.style.bg = "accent";
    expect(create_posts_section().style.bg).toBe("none");
    expect(SECTION_STYLE_DEFAULTS.common.bg).toBe("none");
  });
});
