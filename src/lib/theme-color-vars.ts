// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Theme colors -> --theme-* CSS custom properties, shared by the SSR Layout and the client dev config overlay.

import type { ThemeColors } from "../components/admin/types/theme";

const THEME_COLOR_VAR_NAMES: Readonly<Record<keyof ThemeColors, string>> =
  Object.freeze({
    bg: "--theme-bg",
    bgSecondary: "--theme-bg-secondary",
    bgCard: "--theme-bg-card",
    text: "--theme-text",
    textMuted: "--theme-text-muted",
    primary: "--theme-primary",
    primaryHover: "--theme-primary-hover",
    primaryText: "--theme-primary-text",
    accent: "--theme-accent",
    border: "--theme-border",
    success: "--theme-success",
    error: "--theme-error",
    warning: "--theme-warning",
    info: "--theme-info",
  });

/** `[css var, value]` pairs for every theme color. */
function build_theme_color_vars(
  colors: ThemeColors,
): Array<[name: string, value: string]> {
  return (Object.keys(THEME_COLOR_VAR_NAMES) as Array<keyof ThemeColors>).map(
    (key) => [THEME_COLOR_VAR_NAMES[key], colors[key]],
  );
}

/** Serializes the theme color vars into a `style` attribute fragment. */
export function theme_color_vars_to_css(colors: ThemeColors): string {
  return build_theme_color_vars(colors)
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
}
