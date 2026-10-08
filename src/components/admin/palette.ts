// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { ThemeColors } from './types/theme'

export type PaletteMode = 'light' | 'dark'
export type Harmony = 'analogous' | 'complementary' | 'triadic' | 'split-complementary'
export type ThemeToken = keyof ThemeColors
export type ContrastStatus = 'AAA' | 'AA' | 'fail'

export interface ContrastPair {
  fg: ThemeToken
  bg: ThemeToken
  ratio: number
  status: ContrastStatus
}

export interface GeneratePaletteOptions {
  accent: string
  mode: PaletteMode
  harmony?: Harmony
  seed?: number
}

export interface ShufflePaletteOptions {
  mode: PaletteMode
  locked?: Iterable<ThemeToken>
  accent?: string
  harmony?: Harmony
  seed?: number
}

export interface ShuffleResult {
  colors: ThemeColors
  harmony: Harmony
}

export const HARMONIES: readonly Harmony[] = ['analogous', 'complementary', 'triadic', 'split-complementary']

export const THEME_TOKENS: readonly ThemeToken[] = [
  'bg',
  'bgSecondary',
  'bgCard',
  'text',
  'textMuted',
  'primary',
  'primaryHover',
  'primaryText',
  'accent',
  'border',
  'success',
  'error',
  'warning',
  'info',
]

export const AA_RATIO = 4.5
export const AAA_RATIO = 7
export const BORDER_RATIO_MIN = 1.3
export const BORDER_RATIO_MAX = 1.8

const AUDIT_PAIRS: ReadonlyArray<readonly [ThemeToken, ThemeToken]> = [
  ['text', 'bg'],
  ['text', 'bgCard'],
  ['textMuted', 'bgCard'],
  ['primary', 'bgCard'],
  ['accent', 'bgCard'],
  ['warning', 'bgCard'],
  ['error', 'bgCard'],
  ['primaryText', 'primary'],
  ['primaryText', 'primaryHover'],
]

interface Lch {
  l: number
  c: number
  h: number
}

type Rgb = [number, number, number]

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val))
}

function normalize_hex(hex: string): string {
  let h = hex.trim().toLowerCase()
  if (!h.startsWith('#')) h = '#' + h
  if (/^#[0-9a-f]{3}$/.test(h)) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`
  if (!/^#[0-9a-f]{6}$/.test(h)) throw new Error(`Invalid hex color: ${hex}`)
  return h
}

function srgb_to_linear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function linear_to_srgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

function hex_to_linear(hex: string): Rgb {
  const h = normalize_hex(hex)
  return [
    srgb_to_linear(parseInt(h.slice(1, 3), 16) / 255),
    srgb_to_linear(parseInt(h.slice(3, 5), 16) / 255),
    srgb_to_linear(parseInt(h.slice(5, 7), 16) / 255),
  ]
}

function linear_to_hex(rgb: Rgb): string {
  return (
    '#' +
    rgb
      .map((c) =>
        Math.round(clamp(linear_to_srgb(clamp(c, 0, 1)), 0, 1) * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

function linear_to_oklch([r, g, b]: Rgb): Lch {
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  const c = Math.hypot(A, B)
  const h = c < 1e-6 ? 0 : (Math.atan2(B, A) * 180) / Math.PI
  return { l: L, c, h: (h + 360) % 360 }
}

function oklch_to_linear({ l, c, h }: Lch): Rgb {
  const rad = (h * Math.PI) / 180
  const A = c * Math.cos(rad)
  const B = c * Math.sin(rad)
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

function in_gamut(rgb: Rgb): boolean {
  return rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4)
}

export function hex_to_oklch(hex: string): Lch {
  return linear_to_oklch(hex_to_linear(hex))
}

/** OKLCH -> hex; out-of-gamut colors keep L and h, chroma is reduced. */
export function oklch_to_hex(lch: Lch): string {
  const l = clamp(lch.l, 0, 1)
  const h = ((lch.h % 360) + 360) % 360
  let c = Math.max(0, lch.c)
  if (!in_gamut(oklch_to_linear({ l, c, h }))) {
    let lo = 0
    let hi = c
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      if (in_gamut(oklch_to_linear({ l, c: mid, h }))) lo = mid
      else hi = mid
    }
    c = lo
  }
  return linear_to_hex(oklch_to_linear({ l, c, h }))
}

function relative_luminance(hex: string): number {
  const [r, g, b] = hex_to_linear(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast_ratio(hex1: string, hex2: string): number {
  const l1 = relative_luminance(hex1)
  const l2 = relative_luminance(hex2)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

export function contrast_status(ratio: number): ContrastStatus {
  if (ratio >= AAA_RATIO) return 'AAA'
  if (ratio >= AA_RATIO) return 'AA'
  return 'fail'
}

interface Constraint {
  against: string
  min: number
}

function meets(hex: string, constraints: readonly Constraint[]): boolean {
  return constraints.every((k) => contrast_ratio(hex, k.against) >= k.min)
}

function worst_margin(hex: string, constraints: readonly Constraint[]): number {
  return Math.min(...constraints.map((k) => contrast_ratio(hex, k.against) / k.min))
}

/** Nearest OKLCH lightness (same hue/chroma) satisfying all constraints; best effort when impossible. */
function solve_lightness(start: Lch, constraints: readonly Constraint[]): string {
  const first = oklch_to_hex(start)
  if (constraints.length === 0 || meets(first, constraints)) return first
  let best = first
  let best_margin = worst_margin(first, constraints)
  const step = 0.0025
  for (let d = step; d <= 1 + step; d += step) {
    for (const sign of [-1, 1]) {
      const l = start.l + sign * d
      if (l < 0 || l > 1) continue
      const hex = oklch_to_hex({ ...start, l })
      if (meets(hex, constraints)) return hex
      const margin = worst_margin(hex, constraints)
      if (margin > best_margin) {
        best = hex
        best_margin = margin
      }
    }
  }
  return best
}

function solve_border(start: Lch, against: string, direction: 1 | -1): string {
  const target = (BORDER_RATIO_MIN + BORDER_RATIO_MAX) / 2
  let best = oklch_to_hex(start)
  let best_diff = Math.abs(contrast_ratio(best, against) - target)
  for (let l = start.l; l >= 0 && l <= 1; l += direction * 0.0025) {
    const hex = oklch_to_hex({ ...start, l })
    const ratio = contrast_ratio(hex, against)
    const diff = Math.abs(ratio - target)
    if (diff < best_diff) {
      best = hex
      best_diff = diff
    }
    if (ratio > BORDER_RATIO_MAX + 0.2) break
  }
  return best
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function random_seed(): number {
  return Math.floor(Math.random() * 0xffffffff)
}

function harmony_offset(harmony: Harmony, rng: () => number): number {
  switch (harmony) {
    case 'analogous':
      return rng() < 0.5 ? 30 : -30
    case 'complementary':
      return 180
    case 'triadic':
      return rng() < 0.5 ? 120 : 240
    case 'split-complementary':
      return rng() < 0.5 ? 150 : 210
  }
}

function is_light_surface(hex: string): boolean {
  return relative_luminance(hex) > 0.18
}

function build_palette(
  accent: string,
  mode: PaletteMode,
  harmony: Harmony,
  rng: () => number,
  fixed: Partial<ThemeColors>
): ThemeColors {
  const seed = hex_to_oklch(accent)
  const hue = seed.h
  const jitter = (min: number, max: number) => min + rng() * (max - min)
  const out: Partial<ThemeColors> = {}
  const take = (token: ThemeToken, compute: () => string): string => {
    const value = fixed[token] ?? compute()
    out[token] = value
    return value
  }

  const dark = mode === 'dark'
  const tint = Math.min(seed.c * 0.15, dark ? 0.03 : 0.02)

  const bg = take('bg', () => oklch_to_hex({ l: dark ? jitter(0.15, 0.18) : jitter(0.965, 0.985), c: tint, h: hue }))
  const bg_l = hex_to_oklch(bg).l
  take('bgSecondary', () =>
    oklch_to_hex({ l: dark ? bg_l + jitter(0.035, 0.05) : bg_l - jitter(0.03, 0.045), c: tint * 1.3, h: hue })
  )
  const bg_card = take('bgCard', () =>
    oklch_to_hex({ l: dark ? bg_l + jitter(0.06, 0.08) : jitter(0.99, 1), c: dark ? tint : tint * 0.3, h: hue })
  )

  const light_card = is_light_surface(bg_card)
  const on_card = (min: number): Constraint[] => [
    { against: bg_card, min },
    { against: bg, min },
  ]

  take('text', () =>
    solve_lightness(
      { l: light_card ? jitter(0.2, 0.28) : jitter(0.93, 0.97), c: Math.min(seed.c * 0.25, 0.04), h: hue },
      [
        { against: bg, min: AAA_RATIO },
        { against: bg_card, min: AAA_RATIO },
      ]
    )
  )
  take('textMuted', () =>
    solve_lightness(
      { l: light_card ? jitter(0.46, 0.52) : jitter(0.74, 0.8), c: Math.min(seed.c * 0.2, 0.035), h: hue },
      on_card(AA_RATIO)
    )
  )

  const brand_c = clamp(seed.c, 0.02, 0.2)
  const primary = take('primary', () =>
    solve_lightness(
      { l: light_card ? clamp(seed.l, 0.35, 0.55) : clamp(seed.l, 0.7, 0.85), c: brand_c, h: hue },
      on_card(AA_RATIO)
    )
  )

  const primary_text = take('primaryText', () => {
    const candidate = solve_lightness(
      { l: light_card ? 0.995 : 0.2, c: light_card ? 0.005 : Math.min(brand_c * 0.3, 0.04), h: hue },
      [{ against: primary, min: AA_RATIO }]
    )
    if (contrast_ratio(candidate, primary) >= AA_RATIO) return candidate
    return contrast_ratio('#ffffff', primary) >= contrast_ratio('#000000', primary) ? '#ffffff' : '#000000'
  })

  take('primaryHover', () => {
    const p = hex_to_oklch(primary)
    const constraints = [...on_card(AA_RATIO), { against: primary_text, min: AA_RATIO }]
    const toward_text = is_light_surface(primary_text) ? -1 : 1
    for (const dir of [toward_text, -toward_text]) {
      const hex = oklch_to_hex({ ...p, l: p.l + dir * 0.08 })
      if (meets(hex, constraints)) return hex
    }
    return solve_lightness({ ...p, l: p.l + toward_text * 0.08 }, constraints)
  })

  take('accent', () =>
    solve_lightness(
      {
        l: light_card ? clamp(seed.l, 0.4, 0.55) : clamp(seed.l, 0.72, 0.85),
        c: clamp(seed.c * 0.9, 0.04, 0.18),
        h: hue + harmony_offset(harmony, rng),
      },
      on_card(AA_RATIO)
    )
  )

  const card_lch = hex_to_oklch(bg_card)
  take('border', () => solve_border({ l: card_lch.l, c: tint * 1.5, h: hue }, bg_card, light_card ? -1 : 1))

  const status = (token: ThemeToken, h: number, c: number) =>
    take(token, () => solve_lightness({ l: light_card ? 0.5 : 0.78, c, h: h + jitter(-5, 5) }, on_card(AA_RATIO)))
  status('success', 150, 0.15)
  status('error', 27, 0.19)
  status('warning', 70, 0.15)
  status('info', 240, 0.13)

  return out as ThemeColors
}

/** 14 ThemeColors tokens from one accent; deterministic for a given seed. */
export function generate_palette(options: GeneratePaletteOptions): ThemeColors {
  const rng = mulberry32(options.seed ?? random_seed())
  const harmony = options.harmony ?? HARMONIES[Math.floor(rng() * HARMONIES.length)]
  return build_palette(normalize_hex(options.accent), options.mode, harmony, rng, {})
}

/** New harmony and variation; locked tokens are kept verbatim and the rest is derived around them. */
export function shuffle_palette(current: ThemeColors, options: ShufflePaletteOptions): ShuffleResult {
  const rng = mulberry32(options.seed ?? random_seed())
  const harmony = options.harmony ?? HARMONIES[Math.floor(rng() * HARMONIES.length)]
  const locked = new Set(options.locked ?? [])
  const fixed: Partial<ThemeColors> = {}
  for (const token of locked) fixed[token] = current[token]
  const accent = normalize_hex(locked.has('primary') ? current.primary : (options.accent ?? current.primary))
  return { colors: build_palette(accent, options.mode, harmony, rng, fixed), harmony }
}

export function audit_contrast(colors: ThemeColors): ContrastPair[] {
  return AUDIT_PAIRS.map(([fg, bg]) => {
    const ratio = contrast_ratio(colors[fg], colors[bg])
    return { fg, bg, ratio, status: contrast_status(ratio) }
  })
}

/** Moves one token's lightness to the nearest value passing AA in every audited pair it belongs to. */
export function fix_token(colors: ThemeColors, token: ThemeToken): ThemeColors {
  const constraints: Constraint[] = []
  for (const [fg, bg] of AUDIT_PAIRS) {
    if (fg === token) constraints.push({ against: colors[bg], min: AA_RATIO })
    else if (bg === token) constraints.push({ against: colors[fg], min: AA_RATIO })
  }
  if (constraints.length === 0) return { ...colors }
  const current = normalize_hex(colors[token])
  if (meets(current, constraints)) return { ...colors }
  return { ...colors, [token]: solve_lightness(hex_to_oklch(current), constraints) }
}
