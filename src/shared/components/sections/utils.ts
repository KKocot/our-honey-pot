// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Building blocks shared by the home section renderers: section shell, images, links, tone.
 * Every enum read from config is clamped here, so class names never carry raw config text.
 */

import {
  HOME_SECTION_ID_REGEX,
  SECTION_BGS,
  SECTION_OVERLAYS,
  SECTION_SPACINGS,
  SECTION_STYLE_DEFAULTS,
  SECTION_WIDTHS,
} from '../../../components/admin/types/settings'
import type { Cta } from '../../../components/admin/types/navigation'
import { LINK_LABEL_MAX_CHARS } from '../../../components/admin/types/navigation'
import { hasLeftSidebar, hasRightSidebar } from '../../../components/admin/types/layout'
import { parse_custom_colors } from '../../../components/admin/types/layout-shape'
import { resolve_theme_colors, type ThemeColors } from '../../../components/admin/types/theme'
import { hive_image_proxy } from '../../../lib/config'
import { resolve_locale, t } from '../../../lib/i18n'
import { safe_image_url, safe_link_url, type ImageRef } from '../../../lib/image-ref'
import { is_hex_color } from '../../utils/color'
import { escape_html, escape_html_attr } from '../../formatters/html'
import type { SectionRenderContext, SectionRenderSettings } from './types'

const PROXY_DENSITY = 2
const MIN_TEXT_CONTRAST = 4.5

/** Overlays of an image background: text sits on the image, so `none` is not offered (spec 2.1). */
export const BG_IMAGE_OVERLAYS: readonly string[] = Object.freeze(SECTION_OVERLAYS.filter((value) => value !== 'none'))

export function pick_enum<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : fallback
}

export function clean_text(value: unknown, max_chars: number): string {
  if (typeof value !== 'string') return ''
  return Array.from(value.trim()).slice(0, max_chars).join('')
}

export function section_dom_id(id: unknown): string | null {
  return typeof id === 'string' && HOME_SECTION_ID_REGEX.test(id) ? `s-${id}` : null
}

export function create_section_context(
  settings: SectionRenderSettings,
  locale: unknown,
  priority = false
): SectionRenderContext {
  const template = settings.pageLayoutConfig?.template
  const has_sidebars = typeof template === 'string' && (hasLeftSidebar(template) || hasRightSidebar(template))
  return {
    settings,
    locale: resolve_locale(locale ?? settings.locale),
    colors: resolve_section_colors(settings),
    allow_full_width: !has_sidebars,
    priority,
  }
}

/** Same palette resolution as Layout.astro: preset by siteTheme, then a complete customColors palette. */
function resolve_section_colors(settings: SectionRenderSettings): ThemeColors {
  const custom = parse_custom_colors(settings.customColors ?? null)
  if (custom.ok && custom.value) return custom.value
  return resolve_theme_colors(settings.siteTheme)
}

function channel_luminance(hex_pair: string): number {
  const channel = parseInt(hex_pair, 16) / 255
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
}

function relative_luminance(color: string): number | null {
  if (!is_hex_color(color)) return null
  const raw = color.slice(1)
  const rgb = raw.length <= 4 ? Array.from(raw.slice(0, 3), (c) => c + c).join('') : raw.slice(0, 6)
  return (
    0.2126 * channel_luminance(rgb.slice(0, 2)) +
    0.7152 * channel_luminance(rgb.slice(2, 4)) +
    0.0722 * channel_luminance(rgb.slice(4, 6))
  )
}

function contrast_ratio(a: string, b: string): number {
  const la = relative_luminance(a)
  const lb = relative_luminance(b)
  if (la === null || lb === null) return 0
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

type Tone = 'default' | 'primary' | 'accent-text' | 'accent-bg' | 'image-dark' | 'image-light'

/** Spec 2.1: on accent pick the text or bg token with higher contrast; below 4.5:1 fall back to bg-secondary. */
function accent_tone(colors: ThemeColors): Tone | null {
  const with_text = contrast_ratio(colors.accent, colors.text)
  const with_bg = contrast_ratio(colors.accent, colors.bg)
  const best = Math.max(with_text, with_bg)
  if (best < MIN_TEXT_CONTRAST) return null
  return with_text >= with_bg ? 'accent-text' : 'accent-bg'
}

export interface ImageOptions {
  /** CSS width the image is laid out at; the proxy gets 1x and 2x of it. */
  width: number
  ratio: readonly [number, number]
  class_name: string
  eager?: boolean
}

function proxied(url: string, width: number): string {
  return hive_image_proxy(url, width, 0)
}

/** Proxied <img> with width/height and aspect-ratio (zero CLS); '' for an unsafe or missing image. */
export function render_image(ref: ImageRef | undefined, options: ImageOptions): string {
  const url = safe_image_url(ref?.url)
  if (!ref || !url) return ''
  const src = proxied(url, options.width)
  if (!src) return ''
  const [ratio_w, ratio_h] = options.ratio
  const height = Math.max(1, Math.round((options.width * ratio_h) / ratio_w))
  const alt = ref.decorative === true ? '' : clean_text(ref.alt, 125)
  const srcset = `${src} 1x, ${proxied(url, options.width * PROXY_DENSITY)} 2x`
  const loading = options.eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'
  return `<img src="${escape_html_attr(src)}" srcset="${escape_html_attr(srcset)}" alt="${escape_html_attr(alt)}" width="${options.width}" height="${height}" ${loading} decoding="async" class="${options.class_name}" style="aspect-ratio: ${ratio_w} / ${ratio_h};" />`
}

/** Image ratio from the ImageRef's own w/h, else `fallback`. */
export function image_ratio(ref: ImageRef | undefined, fallback: readonly [number, number]): readonly [number, number] {
  return ref && Number.isInteger(ref.w) && Number.isInteger(ref.h) && ref.w! > 0 && ref.h! > 0
    ? [ref.w!, ref.h!]
    : fallback
}

function render_backdrop(ref: ImageRef, eager: boolean): string {
  const url = safe_image_url(ref.url)
  const src = url ? proxied(url, 1600) : ''
  if (!url || !src) return ''
  const srcset = `${src} 1x, ${proxied(url, 1600 * PROXY_DENSITY)} 2x`
  const alt = ref.decorative === true ? '' : clean_text(ref.alt, 125)
  const loading = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'
  return `<img src="${escape_html_attr(src)}" srcset="${escape_html_attr(srcset)}" alt="${escape_html_attr(alt)}" ${loading} decoding="async" class="section-backdrop" />`
}

export function new_tab_hint(locale: unknown): string {
  return `<span class="sr-only"> ${escape_html(t(locale, 'section.opens_new_tab'))}</span>`
}

/** <a> for an already validated href; https opens in a new tab with an sr-only hint. */
export function render_anchor(href: string, label_html: string, class_name: string, locale: unknown): string {
  const external = href.startsWith('https:')
  const target = external ? ' target="_blank" rel="noopener noreferrer"' : ''
  return `<a href="${escape_html_attr(href)}"${target} class="${class_name}">${label_html}${external ? new_tab_hint(locale) : ''}</a>`
}

/** Cta button; '' when the label is empty or the URL fails the Url rules. */
export function render_cta(
  cta: Cta | undefined,
  class_name: string,
  locale: unknown,
  options: { allow_contact?: boolean } = { allow_contact: true }
): string {
  if (!cta || typeof cta !== 'object') return ''
  const label = clean_text(cta.label, LINK_LABEL_MAX_CHARS)
  const href = safe_link_url(cta.url, options)
  if (!label || !href) return ''
  return render_anchor(href, escape_html(label), class_name, locale)
}

interface ShellStyle {
  width?: unknown
  spacing?: unknown
  bg?: unknown
  bg_image?: ImageRef
  overlay?: unknown
}

export interface ShellOptions {
  id: unknown
  type: string
  style: ShellStyle | undefined
  ctx: SectionRenderContext
  inner: string
  class_name?: string
  /** Image placed behind the content instead of `style.bg_image` (hero `overlay`). */
  backdrop?: ImageRef
  backdrop_eager?: boolean
  /** Overlay values allowed for this section; others fall back to the first. */
  overlays?: readonly string[]
  labelled_by?: string | null
}

/** Outer <section>: id/anchor, width, spacing, background token, backdrop + overlay, derived text tone. */
export function render_section_shell(options: ShellOptions): string {
  const { ctx, style } = options
  const defaults = SECTION_STYLE_DEFAULTS.common
  const width = pick_enum(style?.width, SECTION_WIDTHS, defaults.width)
  const spacing = pick_enum(style?.spacing, SECTION_SPACINGS, defaults.spacing)
  let bg = pick_enum(style?.bg, SECTION_BGS, defaults.bg)

  const backdrop_ref = options.backdrop ?? (bg === 'image' ? style?.bg_image : undefined)
  const backdrop = backdrop_ref ? render_backdrop(backdrop_ref, options.backdrop_eager === true) : ''
  if (bg === 'image' && !backdrop) bg = 'none'

  let tone: Tone = 'default'
  let overlay_html = ''
  if (backdrop) {
    const allowed = options.overlays ?? BG_IMAGE_OVERLAYS
    const overlay = pick_enum(style?.overlay, allowed, allowed[0] ?? defaults.overlay)
    tone = overlay === 'light-50' ? 'image-light' : 'image-dark'
    overlay_html = `<div class="section-overlay section-overlay-${overlay}" aria-hidden="true"></div>`
    bg = 'image'
  } else if (bg === 'primary') {
    tone = 'primary'
  } else if (bg === 'accent') {
    const accent = accent_tone(ctx.colors)
    if (accent) tone = accent
    else bg = 'bg-secondary'
  }

  const full = width === 'full' && ctx.allow_full_width
  const classes = [
    'home-section',
    `section-${options.type}`,
    `section-space-${spacing}`,
    `section-bg-${bg}`,
    `section-tone-${tone}`,
    full ? 'section-full' : bg !== 'none' ? 'section-boxed' : '',
    options.class_name ?? '',
  ].filter(Boolean)

  const dom_id = section_dom_id(options.id)
  const id_attr = dom_id ? ` id="${dom_id}"` : ''
  const labelled = options.labelled_by ? ` aria-labelledby="${options.labelled_by}"` : ''
  return `<section${id_attr} data-section-type="${options.type}" class="${classes.join(' ')}"${labelled}>${backdrop}${overlay_html}<div class="section-inner">${options.inner}</div></section>`
}
