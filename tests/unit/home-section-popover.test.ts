// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { beforeEach, describe, expect, it, vi } from "vitest";

// lucide-solid runs client-only code at import; the icons are irrelevant for this logic.
vi.mock(
  "lucide-solid",
  () =>
    new Proxy(
      {},
      {
        get: (_target, key) => (key === "then" ? undefined : () => null),
        has: () => true,
      },
    ),
);

vi.mock(
  "../../src/components/admin/canvas/home-section-ops",
  async (import_original) => {
    const original =
      await import_original<
        typeof import("../../src/components/admin/canvas/home-section-ops")
      >();
    return {
      ...original,
      update_home_section: vi.fn(original.update_home_section),
    };
  },
);

import {
  CONTENT_TEXT_FIELDS,
  HOME_SECTION_LABELS,
  HOME_SECTION_TABS,
  LAYOUT_OPTIONS,
  commit_home_section,
  cta_url_error,
  find_home_section,
  hero_cta_list,
  home_section_id_of_key,
  needs_privacy_warning,
  effective_overlay,
  overlay_values_of,
  style_controls_of,
  style_default,
  text_counter,
  text_field_value,
  text_media_cta,
  type TextFieldSpec,
} from "../../src/components/admin/canvas/popovers/HomeSectionPopover";
import { home_section_of_selection } from "../../src/components/admin/canvas/PopoverHost";
import {
  home_section_popover_key,
  update_home_section,
} from "../../src/components/admin/canvas/home-section-ops";
import {
  getSettingsSnapshot,
  updateSettingsImmediate,
} from "../../src/components/admin/queries";
import {
  CTA_BAND_VARIANTS,
  HERO_VARIANTS,
  SECTION_TEXT_LIMITS,
  type HomeSection,
} from "../../src/components/admin/types/settings";

const update_spy = vi.mocked(update_home_section);

const HERO: HomeSection = {
  id: "hero0001",
  type: "hero",
  content: { headline: "Hello" },
  style: {
    width: "content",
    spacing: "md",
    bg: "none",
    overlay: "dark-50",
    variant: "split",
    height: "auto",
    align: "start",
    image_side: "end",
  },
};

const CTA_BAND: HomeSection = {
  id: "ctaband1",
  type: "cta-band",
  content: {
    title: "Join",
    button: { label: "Subscribe", url: "https://example.com" },
    consent_mode: "notice",
  },
  style: {
    width: "content",
    spacing: "md",
    bg: "none",
    overlay: "dark-50",
    variant: "band",
    align: "center",
  },
};

const POSTS: HomeSection = {
  id: "posts001",
  type: "posts",
  content: {},
  style: { width: "content", spacing: "md", bg: "none", overlay: "dark-50" },
};

function field_keys(type: HomeSection["type"]): string[] {
  return CONTENT_TEXT_FIELDS[type].map((field) => field.key);
}

function field(type: HomeSection["type"], key: string): TextFieldSpec {
  const spec = CONTENT_TEXT_FIELDS[type].find((item) => item.key === key);
  if (!spec) throw new Error(`no field ${key}`);
  return spec;
}

describe("home section popover: tabs per type", () => {
  it("offers Content and Style tabs", () => {
    expect(HOME_SECTION_TABS.map((tab) => tab.label)).toEqual([
      "Content",
      "Style",
    ]);
  });

  it("labels every section type in English", () => {
    expect(HOME_SECTION_LABELS).toEqual({
      hero: "Hero",
      "text-media": "Text + media",
      posts: "Posts",
      "cta-band": "Call to action",
    });
  });

  it("renders the content fields of each type with limits from SECTION_TEXT_LIMITS", () => {
    expect(field_keys("hero")).toEqual(["headline", "subheadline"]);
    expect(field_keys("text-media")).toEqual(["title", "body_md"]);
    expect(field_keys("posts")).toEqual(["title"]);
    expect(field_keys("cta-band")).toEqual(["title", "body", "consent_text"]);
    expect(field("hero", "headline")).toMatchObject({
      max: SECTION_TEXT_LIMITS.hero_headline_chars,
      required: true,
    });
    expect(field("text-media", "body_md")).toMatchObject({
      max: SECTION_TEXT_LIMITS.text_media_body_bytes,
      unit: "bytes",
    });
    expect(field("cta-band", "consent_text").max).toBe(
      SECTION_TEXT_LIMITS.cta_band_consent_chars,
    );
  });

  it("shows Style controls per type, Overlay only with an image background", () => {
    expect(style_controls_of("hero", { bg: "none", variant: "split" })).toEqual(
      [
        "layout",
        "background",
        "width",
        "spacing",
        "height",
        "align",
        "image_side",
      ],
    );
    expect(
      style_controls_of("hero", { bg: "image", variant: "overlay" }),
    ).toEqual([
      "layout",
      "background",
      "overlay",
      "width",
      "spacing",
      "height",
      "align",
    ]);
    expect(style_controls_of("text-media", { bg: "card" })).toEqual([
      "layout",
      "background",
      "width",
      "spacing",
      "ratio",
      "image_shape",
    ]);
    expect(style_controls_of("cta-band", { bg: "primary" })).toEqual([
      "layout",
      "background",
      "width",
      "spacing",
      "align",
    ]);
    expect(style_controls_of("posts", { bg: "none" })).toEqual([
      "background",
      "width",
      "spacing",
    ]);
    expect(style_controls_of("cta-band", { bg: "image" })).toEqual([
      "layout",
      "background",
      "bg_image",
      "overlay",
      "width",
      "spacing",
      "align",
    ]);
  });

  it("shows Overlay for the hero overlay variant without an image background", () => {
    expect(
      style_controls_of("hero", { bg: "none", variant: "overlay" }),
    ).toContain("overlay");
    expect(
      style_controls_of("hero", { bg: "none", variant: "overlay" }),
    ).not.toContain("bg_image");
  });

  it("offers only the overlays the renderer accepts", () => {
    expect(overlay_values_of("hero", "overlay")).toEqual([
      "dark-50",
      "dark-70",
      "light-50",
    ]);
    expect(overlay_values_of("text-media", undefined)).not.toContain("none");
    expect(effective_overlay("hero", "overlay", "dark-30")).toBe("dark-50");
    expect(effective_overlay("hero", "overlay", "none")).toBe("dark-50");
    expect(effective_overlay("cta-band", undefined, "dark-30")).toBe("dark-30");
  });

  it("offers only schema enum values as layout radios", () => {
    expect(LAYOUT_OPTIONS.hero.map((option) => option.value)).toEqual([
      ...HERO_VARIANTS,
    ]);
    expect(LAYOUT_OPTIONS["cta-band"].map((option) => option.value)).toEqual([
      ...CTA_BAND_VARIANTS,
    ]);
    expect(LAYOUT_OPTIONS["text-media"].map((option) => option.value)).toEqual([
      "start",
      "end",
    ]);
  });

  it("falls back to the schema style defaults per type", () => {
    expect(style_default("cta-band", "align")).toBe("center");
    expect(style_default("hero", "align")).toBe("start");
    expect(style_default("posts", "spacing")).toBe("md");
  });
});

describe("home section popover: character counter", () => {
  const headline = field("hero", "headline");
  const body = field("text-media", "body_md");

  it("is neutral below 90%", () => {
    expect(text_counter("a".repeat(80), headline)).toEqual({
      count: 80,
      max: 90,
      tone: "normal",
      text: "80/90",
    });
  });

  it("turns amber from 90% and red at the limit", () => {
    expect(text_counter("a".repeat(81), headline).tone).toBe("warn");
    expect(text_counter("a".repeat(90), headline).tone).toBe("limit");
  });

  it("counts code points for text and UTF-8 bytes for markdown", () => {
    expect(text_counter("ąę", headline).count).toBe(2);
    expect(text_counter("ąę", body).count).toBe(4);
    expect(text_counter(undefined, body).text).toBe("0/1200");
  });

  it("clamps typed text to the char limit and drops empty optional fields", () => {
    expect(text_field_value(headline, "a".repeat(95))).toBe("a".repeat(90));
    expect(text_field_value(headline, "")).toBe("");
    expect(text_field_value(field("hero", "subheadline"), "")).toBeUndefined();
    const long_md = "x".repeat(1300);
    expect(text_field_value(body, long_md)).toBe(long_md);
  });
});

describe("home section popover: saving", () => {
  beforeEach(() => {
    updateSettingsImmediate({ home: { sections: [HERO, POSTS, CTA_BAND] } });
    update_spy.mockClear();
  });

  it("writes a text edit through update_home_section with the field patch", () => {
    const ok = commit_home_section("hero0001", "hero", () => ({
      content: { headline: "New headline" },
    }));
    expect(ok).toBe(true);
    expect(update_spy).toHaveBeenCalledWith(
      expect.objectContaining({ home: expect.anything() }),
      "hero0001",
      "hero",
      { content: { headline: "New headline" } },
    );
    const hero = find_home_section(getSettingsSnapshot(), "hero0001");
    expect(hero?.content).toEqual({ headline: "New headline" });
  });

  it("removes an optional field with an undefined patch value", () => {
    commit_home_section("hero0001", "hero", () => ({
      content: { subheadline: "Sub" },
    }));
    commit_home_section("hero0001", "hero", () => ({
      content: { subheadline: undefined },
    }));
    const hero = find_home_section(getSettingsSnapshot(), "hero0001");
    expect(hero?.content).not.toHaveProperty("subheadline");
  });

  it("writes style enums as a style patch", () => {
    commit_home_section("ctaband1", "cta-band", () => ({
      style: { variant: "card" as const },
    }));
    expect(update_spy).toHaveBeenLastCalledWith(
      expect.anything(),
      "ctaband1",
      "cta-band",
      { style: { variant: "card" } },
    );
    const band = find_home_section(getSettingsSnapshot(), "ctaband1");
    expect(band?.style).toMatchObject({ variant: "card", align: "center" });
  });

  it("rejects a patch for a missing section or a wrong type", () => {
    expect(commit_home_section("missing1", "hero", () => ({}))).toBe(false);
    expect(
      commit_home_section("ctaband1", "hero", () => ({
        content: { headline: "x" },
      })),
    ).toBe(false);
    expect(update_spy).not.toHaveBeenCalled();
  });

  it("builds the patch from the current section", () => {
    commit_home_section("hero0001", "hero", (section) => ({
      content: {
        cta: hero_cta_list(section.content.cta, 0, { label: "Read" }),
      },
    }));
    commit_home_section("hero0001", "hero", (section) => ({
      content: {
        cta: hero_cta_list(section.content.cta, 0, { url: "https://a.io" }),
      },
    }));
    const hero = find_home_section(getSettingsSnapshot(), "hero0001");
    expect(hero?.type === "hero" && hero.content.cta).toEqual([
      { label: "Read", url: "https://a.io" },
    ]);
  });
});

describe("home section popover: CTA helpers", () => {
  it("keeps the CTA index while typing and drops empty trailing entries", () => {
    expect(hero_cta_list(undefined, 1, { label: "More" })).toEqual([
      { label: "", url: "" },
      { label: "More", url: "" },
    ]);
    expect(
      hero_cta_list([{ label: "A", url: "https://a.io" }], 0, {
        label: "",
        url: "",
      }),
    ).toBeUndefined();
  });

  it("removes an empty text-media CTA", () => {
    expect(text_media_cta(undefined, { label: "Go" })).toEqual({
      label: "Go",
      url: "",
    });
    expect(text_media_cta({ label: "Go", url: "" }, { label: "" })).toBe(
      undefined,
    );
  });

  it("allows mailto/tel only where the schema allows contact links", () => {
    expect(cta_url_error("", false)).toBeNull();
    expect(cta_url_error("https://example.com", false)).toBeNull();
    expect(cta_url_error("mailto:a@b.co", true)).toBeNull();
    expect(cta_url_error("mailto:a@b.co", false)).toBe("Use an https:// link.");
    expect(cta_url_error("javascript:alert(1)", true)).toMatch(/https/);
  });
});

describe("home section popover: privacy warning", () => {
  const privacy = {
    label: "Privacy",
    kind: "page" as const,
    target: "privacy",
  };

  it("warns on a call-to-action without footer.privacy", () => {
    const footer = getSettingsSnapshot().footer;
    expect(
      needs_privacy_warning("cta-band", {
        footer: { ...footer, privacy: undefined },
      }),
    ).toBe(true);
    expect(
      needs_privacy_warning("cta-band", { footer: { ...footer, privacy } }),
    ).toBe(false);
  });

  it("never warns on other section types", () => {
    const footer = getSettingsSnapshot().footer;
    expect(
      needs_privacy_warning("hero", {
        footer: { ...footer, privacy: undefined },
      }),
    ).toBe(false);
  });
});

describe("home section popover: host key", () => {
  it("parses only home-section keys with a valid id", () => {
    expect(home_section_id_of_key(home_section_popover_key("hero0001"))).toBe(
      "hero0001",
    );
    expect(home_section_id_of_key("page-sec-main:section")).toBeNull();
    expect(home_section_id_of_key("home-section:BAD")).toBeNull();
    expect(home_section_id_of_key(null)).toBeNull();
  });

  it("finds the home section in the selection as section or element id", () => {
    const key = home_section_popover_key("ctaband1");
    expect(
      home_section_of_selection({ section_id: key, element_id: null }),
    ).toBe("ctaband1");
    expect(
      home_section_of_selection({
        section_id: "page-sec-main",
        element_id: key,
      }),
    ).toBe("ctaband1");
    expect(
      home_section_of_selection({
        section_id: "page-sec-main",
        element_id: "posts",
      }),
    ).toBeNull();
  });
});
