// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { resolve_theme_colors, type ThemeColors } from '../../types/theme'
import {
  DENSITY_MULTIPLIERS,
  INSTANCE_OVERRIDE_RANGES,
  clamp_style_token,
  is_density,
  type Density,
  type SettingsData,
} from '../../types/settings'

/** Patch from the Style tab plus the history label of the intent behind it. */
export type StyleChange = (patch: Partial<SettingsData>, label: string) => void

const DENSITY_SCALED_KEYS = ['cardPaddingPx', 'cardGapPx', 'commentPaddingPx'] as const

function clamp_range(key: keyof typeof INSTANCE_OVERRIDE_RANGES, value: number): number {
  const { min, max } = INSTANCE_OVERRIDE_RANGES[key]
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** Colors the blog renders now: custom palette first, else the palette resolved from `siteTheme`. */
export function current_theme_colors(settings: Pick<SettingsData, 'customColors' | 'siteTheme'>): ThemeColors {
  return settings.customColors ? { ...settings.customColors } : resolve_theme_colors(settings.siteTheme)
}

/** Radius macro: the token and the card radius move together; instanceOverrides stay untouched. */
export function radius_patch(value: number): Partial<SettingsData> {
  const radius = clamp_style_token('radiusPx', value) ?? 0
  return { radiusPx: radius, cardBorderRadiusPx: clamp_range('cardBorderRadiusPx', radius) }
}

/** Density macro: rescales the card/comment spacing by the multiplier ratio; instanceOverrides stay untouched. */
export function density_patch(
  settings: Pick<SettingsData, 'density' | (typeof DENSITY_SCALED_KEYS)[number]>,
  next: Density
): Partial<SettingsData> {
  const previous = is_density(settings.density) ? settings.density : 'comfortable'
  const ratio = DENSITY_MULTIPLIERS[next] / DENSITY_MULTIPLIERS[previous]
  const patch: Partial<SettingsData> = { density: next }
  for (const key of DENSITY_SCALED_KEYS) patch[key] = clamp_range(key, settings[key] * ratio)
  return patch
}

const HEX_REGEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** `#rrggbb` lower case, or null for anything that is not a 3/6 digit hex color. */
export function parse_hex(value: string): string | null {
  const match = HEX_REGEX.exec(value.trim())
  if (!match) return null
  const digits = match[1].toLowerCase()
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits
  return `#${full}`
}
