// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  FONT_IDS,
  defaultCommunitySettings,
  defaultSettings,
  get_default_settings,
} from "../../src/components/admin/types/settings";
import {
  FONT_STACKS,
  build_style_token_vars,
  resolve_font_id,
  style_token_vars_to_css,
} from "../../src/lib/style-tokens";

const DEFAULT_VARS = {
  "--font-heading": "var(--font-sans)",
  "--font-body": "var(--font-sans)",
  "--radius": "0.5rem",
  "--space": "1",
  "--content-width": "80rem",
  "--base-font-size": "1rem",
  "--heading-scale": "1.25",
};

describe("build_style_token_vars", () => {
  it("maps defaults to the pre-token look (Tailwind sans, rounded-lg, max-w-7xl, 16px)", () => {
    expect(build_style_token_vars(defaultSettings)).toEqual(DEFAULT_VARS);
    expect(build_style_token_vars(defaultCommunitySettings)).toEqual(
      DEFAULT_VARS,
    );
  });

  it("falls back to defaults for missing tokens (partial SSR settings)", () => {
    expect(build_style_token_vars({})).toEqual(DEFAULT_VARS);
  });

  it("converts custom values to rem and density to its multiplier", () => {
    const vars = build_style_token_vars({
      fontHeading: "fraunces",
      fontBody: "inter",
      radiusPx: 16,
      density: "spacious",
      contentWidthPx: 1120,
      baseFontSizePx: 18,
      headingScale: 1.333,
    });
    expect(vars).toEqual({
      "--font-heading": "var(--font-fraunces)",
      "--font-body": "var(--font-inter)",
      "--radius": "1rem",
      "--space": "1.25",
      "--content-width": "70rem",
      "--base-font-size": "1.125rem",
      "--heading-scale": "1.333",
    });
  });

  it("clamps and snaps numeric tokens to STYLE_TOKEN_RANGES", () => {
    const vars = build_style_token_vars({
      radiusPx: 500,
      contentWidthPx: -1,
      baseFontSizePx: 15.4,
    });
    expect(vars["--radius"]).toBe("1.5rem");
    expect(vars["--content-width"]).toBe("60rem");
    expect(vars["--base-font-size"]).toBe("0.9375rem");
    expect(
      build_style_token_vars({ contentWidthPx: 9999 })["--content-width"],
    ).toBe("90rem");
  });

  it("replaces unvalidated values that would reach the inline style", () => {
    const hostile = {
      fontHeading: "x; background: url(evil)",
      fontBody: 42,
      radiusPx: "8px; color: red",
      density: "huge",
      contentWidthPx: Number.NaN,
      baseFontSizePx: Number.POSITIVE_INFINITY,
      headingScale: 3,
    } as unknown as Parameters<typeof build_style_token_vars>[0];
    expect(build_style_token_vars(hostile)).toEqual(DEFAULT_VARS);
  });

  it("maps every font id to a family var from fonts.css", () => {
    for (const id of FONT_IDS) {
      const vars = build_style_token_vars({ fontHeading: id, fontBody: id });
      expect(vars["--font-heading"]).toBe(FONT_STACKS[id]);
      expect(vars["--font-body"]).toMatch(/^var\(--font-[a-z0-9-]+\)$/);
    }
  });

  it("does not mutate its input", () => {
    const settings = get_default_settings(true);
    const snapshot = structuredClone(settings);
    build_style_token_vars(settings);
    expect(settings).toEqual(snapshot);
  });
});

describe("resolve_font_id", () => {
  it("keeps valid ids and falls back otherwise", () => {
    expect(resolve_font_id("inter", "system")).toBe("inter");
    expect(resolve_font_id("comic-sans", "system")).toBe("system");
    expect(resolve_font_id(undefined, "atkinson")).toBe("atkinson");
  });
});

describe("style_token_vars_to_css", () => {
  it("serializes declarations for the style attribute", () => {
    const css = style_token_vars_to_css(build_style_token_vars({}));
    expect(css).toBe(
      "--font-heading: var(--font-sans); --font-body: var(--font-sans); --radius: 0.5rem; --space: 1; --content-width: 80rem; --base-font-size: 1rem; --heading-scale: 1.25;",
    );
  });
});
