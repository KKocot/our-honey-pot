// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { INSTANCE_OVERRIDE_RANGES, type Density, DENSITY_MULTIPLIERS, type SettingsData } from '../types/settings'

/** Keys written by "Apply layout only": page structure and post card content. */
export const PRESET_LAYOUT_KEYS = Object.freeze([
  'postsLayout',
  'gridColumns',
  'cardLayout',
  'thumbnailPosition',
  'thumbnailSizePx',
  'showThumbnail',
  'showSummary',
  'summaryMaxLength',
  'showDate',
  'showVotes',
  'showComments',
  'showPayout',
  'showTags',
  'maxTags',
  'titleSizePx',
  'postCardLayout',
  'pageLayoutConfig',
  'pageLayout',
] as const satisfies ReadonlyArray<keyof SettingsData>)

export const PRESET_MOTION_KEYS = Object.freeze([
  'cardHoverEffect',
  'cardTransitionDuration',
  'cardHoverScale',
  'cardHoverShadow',
  'cardHoverBrightness',
  'scrollAnimationEnabled',
  'scrollAnimationType',
  'scrollAnimationDuration',
  'scrollAnimationDelay',
] as const satisfies ReadonlyArray<keyof SettingsData>)

/** Keys written by "Apply style only": palette, fonts, shape and rhythm macros, motion. Never touches layout. */
export const PRESET_STYLE_KEYS = Object.freeze([
  'siteTheme',
  'customColors',
  'presetId',
  'fontHeading',
  'fontBody',
  'radiusPx',
  'cardBorderRadiusPx',
  'density',
  'cardPaddingPx',
  'cardGapPx',
  'commentPaddingPx',
  'cardBorder',
  ...PRESET_MOTION_KEYS,
] as const satisfies ReadonlyArray<keyof SettingsData>)

export type PresetLayoutKey = (typeof PRESET_LAYOUT_KEYS)[number]
export type PresetStyleKey = (typeof PRESET_STYLE_KEYS)[number]

const DENSITY_BASE = Object.freeze({ cardPaddingPx: 24, cardGapPx: 24, commentPaddingPx: 16 })

function scaled(key: keyof typeof DENSITY_BASE, multiplier: number): number {
  const { min, max } = INSTANCE_OVERRIDE_RANGES[key]
  return Math.min(max, Math.max(min, Math.round(DENSITY_BASE[key] * multiplier)))
}

/** Card spacing derived from the density macro (brief 4.2): comfortable = the 24/24/16 defaults. */
export function density_spacing(
  density: Density
): Pick<SettingsData, 'cardPaddingPx' | 'cardGapPx' | 'commentPaddingPx'> {
  const multiplier = DENSITY_MULTIPLIERS[density]
  return {
    cardPaddingPx: scaled('cardPaddingPx', multiplier),
    cardGapPx: scaled('cardGapPx', multiplier),
    commentPaddingPx: scaled('commentPaddingPx', multiplier),
  }
}

export function assign_setting<K extends keyof SettingsData>(
  target: Partial<SettingsData>,
  key: K,
  value: SettingsData[K] | undefined
): void {
  if (value !== undefined) target[key] = structuredClone(value)
}

/** Deep copy of the given keys present in `source`. */
export function pick_settings(
  source: Partial<SettingsData>,
  keys: ReadonlyArray<keyof SettingsData>
): Partial<SettingsData> {
  const picked: Partial<SettingsData> = {}
  for (const key of keys) assign_setting(picked, key, source[key])
  return picked
}
