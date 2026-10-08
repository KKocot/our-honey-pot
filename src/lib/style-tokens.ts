// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Global style tokens (SettingsData) -> CSS custom properties, shared by the public Layout and the admin canvas.
// Pure: input is never mutated; every value is whitelisted or clamped, so the output is safe for inline styles.

import {
  DENSITY_MULTIPLIERS,
  clamp_style_token,
  defaultSettings,
  is_density,
  is_font_id,
  is_heading_scale,
  type FontId,
  type SettingsData,
  type StyleTokenRangeKey,
} from "../components/admin/types/settings";

export type StyleTokenSettings = Partial<
  Pick<
    SettingsData,
    | "fontHeading"
    | "fontBody"
    | "radiusPx"
    | "density"
    | "contentWidthPx"
    | "baseFontSizePx"
    | "headingScale"
  >
>;

export type StyleTokenVar =
  | "--font-heading"
  | "--font-body"
  | "--radius"
  | "--space"
  | "--content-width"
  | "--base-font-size"
  | "--heading-scale";

export type StyleTokenVars = Record<StyleTokenVar, string>;

const ROOT_FONT_SIZE_PX = 16;

/** Font stacks per font id; the family vars come from src/styles/fonts.css, `system` keeps the Tailwind default stack. */
export const FONT_STACKS: Readonly<Record<FontId, string>> = Object.freeze({
  system: "var(--font-sans)",
  inter: "var(--font-inter)",
  "source-serif": "var(--font-source-serif)",
  fraunces: "var(--font-fraunces)",
  "space-grotesk": "var(--font-space-grotesk)",
  "jetbrains-mono": "var(--font-jetbrains-mono)",
  atkinson: "var(--font-atkinson)",
});

function px_to_rem(px: number): string {
  return `${px / ROOT_FONT_SIZE_PX}rem`;
}

function range_token(
  settings: StyleTokenSettings,
  key: StyleTokenRangeKey,
): number {
  return clamp_style_token(key, settings[key]) ?? defaultSettings[key];
}

/** Valid font id from settings or the default; exported so the Layout can preload the same heading font it renders. */
export function resolve_font_id(value: unknown, fallback: FontId): FontId {
  return is_font_id(value) ? value : fallback;
}

/** CSS vars for the style tokens; lengths in rem so the user's browser font size still scales the page. */
export function build_style_token_vars(
  settings: StyleTokenSettings,
): StyleTokenVars {
  const density = is_density(settings.density)
    ? settings.density
    : defaultSettings.density;
  const heading_scale = is_heading_scale(settings.headingScale)
    ? settings.headingScale
    : defaultSettings.headingScale;

  return {
    "--font-heading":
      FONT_STACKS[
        resolve_font_id(settings.fontHeading, defaultSettings.fontHeading)
      ],
    "--font-body":
      FONT_STACKS[resolve_font_id(settings.fontBody, defaultSettings.fontBody)],
    "--radius": px_to_rem(range_token(settings, "radiusPx")),
    "--space": String(DENSITY_MULTIPLIERS[density]),
    "--content-width": px_to_rem(range_token(settings, "contentWidthPx")),
    "--base-font-size": px_to_rem(range_token(settings, "baseFontSizePx")),
    "--heading-scale": String(heading_scale),
  };
}

/** Serializes the vars into a `style` attribute fragment (same channel as the --theme-* vars). */
export function style_token_vars_to_css(vars: StyleTokenVars): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
}
