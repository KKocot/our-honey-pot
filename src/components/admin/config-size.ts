// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/** Largest config body accepted on chain and in dev mode localStorage, in UTF-8 bytes. */
export const MAX_BODY_SIZE = 64 * 1024

export const CONFIG_SIZE_WARN_RATIO = 0.7
export const CONFIG_SIZE_DANGER_RATIO = 0.85

export type ConfigSizeLevel = 'ok' | 'warn' | 'danger' | 'blocked'

export interface ConfigSize {
  bytes: number
  max: number
  ratio: number
  level: ConfigSizeLevel
}

const encoder = new TextEncoder()

export function body_byte_size(body: string): number {
  return encoder.encode(body).length
}

export function config_size_level(bytes: number, max: number = MAX_BODY_SIZE): ConfigSizeLevel {
  if (bytes > max) return 'blocked'
  const ratio = bytes / max
  if (ratio >= CONFIG_SIZE_DANGER_RATIO) return 'danger'
  if (ratio >= CONFIG_SIZE_WARN_RATIO) return 'warn'
  return 'ok'
}

/** Size of a config body as the save limit counts it, with the editor threshold level. */
export function measure_config_body(body: string, max: number = MAX_BODY_SIZE): ConfigSize {
  const bytes = body_byte_size(body)
  return { bytes, max, ratio: bytes / max, level: config_size_level(bytes, max) }
}

export type ConfigSizeAreaId = 'style' | 'navigation' | 'footer' | 'sections' | 'pages' | 'other'

/** Editor areas of the size breakdown (spec 5.5) and the settings keys each one owns; the rest is `Other`. */
export const CONFIG_SIZE_AREAS: ReadonlyArray<{
  id: Exclude<ConfigSizeAreaId, 'other'>
  label: string
  keys: readonly string[]
}> = [
  {
    id: 'style',
    label: 'Style',
    keys: [
      'siteTheme',
      'customColors',
      'presetId',
      'fontHeading',
      'fontBody',
      'radiusPx',
      'density',
      'contentWidthPx',
      'baseFontSizePx',
      'headingScale',
      'brand',
    ],
  },
  { id: 'navigation', label: 'Navigation', keys: ['nav', 'topbar', 'navigationTabs', 'socialLinks'] },
  { id: 'footer', label: 'Footer', keys: ['footer', 'footer_text'] },
  { id: 'sections', label: 'Sections', keys: ['home'] },
  { id: 'pages', label: 'Pages', keys: ['pages'] },
]

export const CONFIG_SIZE_OTHER_LABEL = 'Other'

export interface ConfigSizeArea {
  id: ConfigSizeAreaId
  label: string
  bytes: number
}

export function shows_size_breakdown(level: ConfigSizeLevel): boolean {
  return level === 'danger' || level === 'blocked'
}

function own_value(record: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(record, key)?.value
}

/**
 * Bytes per editor area of a config measured at `total_bytes`. `encode` must be the encoder of the saved
 * JSON; each key counts `"key":value` plus its separating comma, `Other` gets the rest of the body.
 */
export function config_size_breakdown(
  settings: object,
  total_bytes: number,
  encode: (fragment: Record<string, unknown>) => string = JSON.stringify
): ConfigSizeArea[] {
  const areas: ConfigSizeArea[] = CONFIG_SIZE_AREAS.map(({ id, label, keys }) => {
    const fragment: Record<string, unknown> = {}
    for (const key of keys) {
      const value = own_value(settings, key)
      if (value !== undefined) fragment[key] = value
    }
    if (Object.keys(fragment).length === 0) return { id, label, bytes: 0 }
    // The object already holds the commas between its keys; one more separates the area from the rest.
    return { id, label, bytes: body_byte_size(encode(fragment)) - '{}'.length + ','.length }
  })
  const measured = areas.reduce((sum, area) => sum + area.bytes, 0)
  return [...areas, { id: 'other', label: CONFIG_SIZE_OTHER_LABEL, bytes: Math.max(total_bytes - measured, 0) }]
}

/** Areas with an editor to open from the breakdown; `Other` is a remainder without one. */
export function size_area_has_editor(id: ConfigSizeAreaId): boolean {
  return id !== 'other'
}

/** Largest editor area of a breakdown (`Other` has no editor to open, so it never wins); first wins a tie. */
export function largest_size_area(areas: readonly ConfigSizeArea[]): ConfigSizeArea | null {
  return areas.reduce<ConfigSizeArea | null>((largest, area) => {
    if (area.id === 'other' || area.bytes === 0) return largest
    return largest && largest.bytes >= area.bytes ? largest : area
  }, null)
}
