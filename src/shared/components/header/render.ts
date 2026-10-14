// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Header render functions - HTML string output
 * Used by both Astro (set:html) and SolidJS (innerHTML)
 */

import type { HeaderBrand, HeaderData } from './types'
import { escape_html } from '../../formatters'
import { hive_image_proxy } from '../../../lib/config'
import { safe_image_url } from '../../../lib/image-ref'

/** Rendered logo height per brand size (spec 1.1) */
export const BRAND_LOGO_HEIGHT_PX = Object.freeze({ sm: 24, md: 32, lg: 40 })

type LogoSize = keyof typeof BRAND_LOGO_HEIGHT_PX

const LOGO_HEIGHT_CLASS: Record<LogoSize, string> = {
  sm: 'h-6',
  md: 'h-8',
  lg: 'h-10',
}

const PROXY_DENSITY = 2

interface ResolvedLogo {
  src: string
  width?: number
  height: number
  size: LogoSize
}

function own_key<T extends object>(map: T, key: unknown): key is keyof T {
  return typeof key === 'string' && Object.hasOwn(map, key)
}

function resolve_logo(brand: HeaderBrand | undefined): ResolvedLogo | null {
  if (!brand || (brand.mode !== 'logo' && brand.mode !== 'logo+text')) return null
  const url = safe_image_url(brand.logo?.url)
  if (!url) return null

  const size: LogoSize = own_key(BRAND_LOGO_HEIGHT_PX, brand.size) ? brand.size : 'md'
  const height = BRAND_LOGO_HEIGHT_PX[size]
  const { w, h } = brand.logo ?? {}
  const width = w && h ? Math.max(1, Math.round((height * w) / h)) : undefined

  const src = hive_image_proxy(url, (width ?? 0) * PROXY_DENSITY, height * PROXY_DENSITY)
  if (!src) return null
  return { src, width, height, size }
}

function render_logo_img(logo: ResolvedLogo, alt: string, extra_attrs: string): string {
  const width_attr = logo.width ? ` width="${logo.width}"` : ''
  return `<img src="${escape_html(logo.src)}" alt="${escape_html(alt)}"${width_attr} height="${logo.height}" decoding="async" class="block ${LOGO_HEIGHT_CLASS[logo.size]} w-auto max-w-full shrink-0"${extra_attrs} />`
}

/**
 * Site name heading. Logo mode keeps the brand name as the img alt, so a broken image
 * shows the name as text (no data-fallback); logo+text hides a broken image instead.
 */
function render_brand_heading(data: HeaderData, heading_class: string): string {
  const site_name = escape_html(data.site_name)
  const logo = resolve_logo(data.brand)

  if (!logo) {
    return `<h1 class="${heading_class} wrap-anywhere">${site_name}</h1>`
  }

  if (data.brand?.mode === 'logo') {
    const brand_alt = data.brand.logo?.decorative ? '' : (data.brand.logo?.alt ?? '').trim()
    return `<h1 class="${heading_class} wrap-anywhere">${render_logo_img(logo, brand_alt || data.site_name, '')}</h1>`
  }

  return `<h1 class="${heading_class} flex items-center gap-3 min-w-0">${render_logo_img(logo, '', ' data-fallback="hide"')}<span class="min-w-0 wrap-anywhere">${site_name}</span></h1>`
}

/**
 * Render main header - card style (top slot)
 * @returns Sanitized HTML string (uses escape_html for all user content)
 */
export function renderHeader(data: HeaderData): string {
  const site_description = escape_html(data.site_description)

  return `<header class="bg-bg-card rounded-xl shadow-sm border border-border p-6">
  ${render_brand_heading(data, 'text-heading-3 font-bold text-text')}
  <p class="text-text-muted mt-1 wrap-anywhere">${site_description}</p>
</header>`
}

/**
 * Render compact header - sidebar variant (smaller text)
 * @returns Sanitized HTML string (uses escape_html for all user content)
 */
export function renderHeaderCompact(data: HeaderData): string {
  const site_description = escape_html(data.site_description)

  return `<div class="pb-4 border-b border-border">
  ${render_brand_heading(data, 'text-heading-4 font-bold text-text')}
  <p class="text-text-muted mt-1 text-sm wrap-anywhere">${site_description}</p>
</div>`
}

/**
 * Render bottom header - bottom slot variant
 * @returns Sanitized HTML string (uses escape_html for all user content)
 */
export function renderHeaderBottom(data: HeaderData): string {
  const site_description = escape_html(data.site_description)

  return `<div class="pt-4 border-t border-border">
  ${render_brand_heading(data, 'text-heading-3 font-bold text-text')}
  <p class="text-text-muted mt-1 wrap-anywhere">${site_description}</p>
</div>`
}
