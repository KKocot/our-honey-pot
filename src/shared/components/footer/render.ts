// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Footer render functions - HTML string output
 * Used by both Astro (set:html) and SolidJS (innerHTML)
 */

import type { FooterData, FooterOwnerData, FooterSettings } from './types'
import { DEFAULT_FOOTER_DATA, DEFAULT_FOOTER_SETTINGS } from './types'
import { escape_html, escape_html_attr } from '../../formatters/html'
import { safe_link_url } from '../../../lib/image-ref'
import { getSocialIcon, platformColors } from '../../icons'
import { t } from '../../../lib/i18n'
import { build_social_url, is_social_platform, platformInfos } from '../../../components/admin/types/social'
import { FOOTER_LIMITS, type FooterColumn } from '../../../components/admin/types/settings'
import { LINK_LABEL_MAX_CHARS, type Link } from '../../../components/admin/types/navigation'
import type { NavigationTabConfig } from '../navigation/types'
import { resolveOwnerLink } from '../navigation/utils'

const LINK_ICON_SVG = `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>`

const LINK_CLASS = 'hover:text-text transition-colors focus-visible:outline-2 focus-visible:outline-primary rounded-sm'

const COLUMN_GRID: Record<number, string> = {
  1: '',
  2: 'page-sm:grid-cols-2',
  3: 'page-sm:grid-cols-3',
}

function escape_url(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '#'
    return escape_html(parsed.href)
  } catch {
    return '#'
  }
}

function code_points(value: string): number {
  return Array.from(value).length
}

/** Validated href for a footer Link (same resolution as the nav), or null when unsafe or malformed. */
export function footer_link_href(link: Link, tabs: NavigationTabConfig[] = []): string | null {
  return resolveOwnerLink(link, tabs)?.href ?? null
}

function render_link(link: Link, tabs: NavigationTabConfig[]): string {
  if (!link || typeof link.label !== 'string') return ''
  const label = link.label.trim()
  if (!label || code_points(label) > LINK_LABEL_MAX_CHARS) return ''
  const href = footer_link_href(link, tabs)
  if (!href) return ''
  const external = href.startsWith('https://') ? ' target="_blank" rel="noopener noreferrer"' : ''
  return `<a href="${escape_html_attr(href)}"${external} class="${LINK_CLASS}">${escape_html(label)}</a>`
}

function render_link_items(links: Link[] | undefined, limit: number, tabs: NavigationTabConfig[]): string[] {
  if (!Array.isArray(links)) return []
  return links
    .slice(0, limit)
    .map((link) => render_link(link, tabs))
    .filter((html) => html.length > 0)
}

function owner_tabs(owner: FooterOwnerData): NavigationTabConfig[] {
  return Array.isArray(owner.tabs) ? owner.tabs : []
}

function valid_columns(columns: FooterColumn[] | undefined): FooterColumn[] {
  return Array.isArray(columns) ? columns.slice(0, FOOTER_LIMITS.columns).filter(Boolean) : []
}

function render_mast(owner: FooterOwnerData): string {
  const columns = valid_columns(owner.footer.columns)
    .map((column) => {
      const items = render_link_items(column.links, FOOTER_LIMITS.links_per_column, owner_tabs(owner))
      if (items.length === 0) return ''
      const title = typeof column.title === 'string' ? column.title.trim() : ''
      const heading = title
        ? `<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-text">${escape_html(title)}</h2>`
        : ''
      const list = items.map((item) => `<li>${item}</li>`).join('')
      return `<div class="min-w-0">${heading}<ul class="flex flex-col gap-1.5">${list}</ul></div>`
    })
    .filter((html) => html.length > 0)

  const site_name = owner.site_name?.trim() ?? ''
  if (columns.length === 0 && !site_name) return ''

  const wordmark = site_name
    ? `<p class="text-lg font-semibold text-text break-words">${escape_html(site_name)}</p>`
    : ''
  const nav = columns.length
    ? `<nav aria-label="Footer" class="grid grid-cols-1 gap-6 ${COLUMN_GRID[columns.length]} page-md:flex-1 page-md:max-w-2xl">${columns.join('')}</nav>`
    : ''
  return `<div class="flex flex-col gap-6 py-8 page-md:flex-row page-md:justify-between">${wordmark}${nav}</div>`
}

function render_inline(owner: FooterOwnerData): string {
  const items = valid_columns(owner.footer.columns).flatMap((column) =>
    render_link_items(column.links, FOOTER_LIMITS.links_per_column, owner_tabs(owner))
  )
  if (items.length === 0) return ''
  const list = items.map((item) => `<li>${item}</li>`).join('')
  return `<nav aria-label="Footer" class="py-4"><ul class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 page-md:justify-start">${list}</ul></nav>`
}

function render_social(owner: FooterOwnerData): string {
  if (!owner.footer.show_social || !Array.isArray(owner.social_links)) return ''
  const icons = owner.social_links
    .filter((link) => link && is_social_platform(link.platform))
    .map((link) => {
      const url = safe_link_url(build_social_url(link))
      if (!url) return ''
      const name = platformInfos[link.platform].name
      const icon = link.platform === 'custom' ? LINK_ICON_SVG : getSocialIcon(link.platform)
      const color = platformColors[link.platform] ?? platformInfos.custom.color
      return `<li><a href="${escape_html_attr(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escape_html_attr(name)}" title="${escape_html_attr(name)}" class="flex p-1.5 rounded-md transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-primary" style="background: ${color};">${icon}</a></li>`
    })
    .filter((html) => html.length > 0)
  if (icons.length === 0) return ''
  return `<ul class="flex flex-wrap items-center gap-2" aria-label="Social media">${icons.join('')}</ul>`
}

function render_bottom_row(owner: FooterOwnerData, locale: unknown): string {
  const footer = owner.footer
  const year = Number.isInteger(owner.year) ? (owner.year as number) : new Date().getFullYear()
  const site_name = owner.site_name?.trim() ?? ''
  const copyright = footer.copyright?.trim() || t(locale, 'footer.copyright_default', { year, site: site_name }).trim()
  const company = footer.company?.trim() ?? ''

  const legal = [
    ...(footer.privacy ? render_link_items([footer.privacy], 1, owner_tabs(owner)) : []),
    ...render_link_items(footer.legal_links, FOOTER_LIMITS.legal_links, owner_tabs(owner)),
  ]

  const identity = `<div class="flex min-w-0 flex-col gap-1"><p class="break-words">${escape_html(copyright)}</p>${
    company ? `<p class="break-words">${escape_html(company)}</p>` : ''
  }</div>`
  const legal_html = legal.length
    ? `<ul class="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legal">${legal.map((item) => `<li>${item}</li>`).join('')}</ul>`
    : ''

  return `<div class="flex flex-col gap-3 py-4 page-md:flex-row page-md:items-center page-md:justify-between">${identity}${legal_html}${render_social(owner)}</div>`
}

function render_owner(owner: FooterOwnerData, locale: unknown): string {
  if (!owner?.footer) return ''
  const top = owner.footer.variant === 'mast' ? render_mast(owner) : render_inline(owner)
  return `<div class="text-left">${top}${render_bottom_row(owner, locale)}</div>`
}

function render_attribution(footer_data: FooterData, locale: unknown): string {
  const author_url = escape_url(footer_data.author_url)
  const author_name = escape_html(footer_data.author_name)
  const kofi_url = escape_url(footer_data.kofi_url)
  const kofi_image_url = escape_url(footer_data.kofi_image_url)
  const custom_text = footer_data.custom_text?.trim() ?? ''

  const segments: string[] = []
  if (custom_text) {
    segments.push(`<span>${escape_html(custom_text)}</span>`)
  } else {
    segments.push(
      `<span>${escape_html(t(locale, 'footer.built_by'))} <a href="${author_url}" target="_blank" rel="noopener noreferrer" class="text-primary hover:text-primary-hover transition-colors font-medium">${author_name}</a></span>`
    )
  }
  segments.push(`<a href="${kofi_url}" target="_blank" rel="noopener noreferrer" class="inline-flex hover:opacity-90 transition-opacity" aria-label="${escape_html_attr(t(locale, 'footer.kofi_aria'))}">
      <img src="${kofi_image_url}" alt="${escape_html_attr(t(locale, 'footer.kofi_alt'))}" height="24" width="120" loading="lazy" />
    </a>`)
  segments.push(
    `<span>${escape_html(t(locale, 'footer.powered_by', { platform: footer_data.platform_name }))}</span>`
  )

  const separator = '<span class="text-border">|</span>'
  return segments.join(`\n    ${separator}\n    `)
}

/**
 * Render footer as HTML string; without `owner` the output is the attribution row only.
 * `locale` only translates the fixed attribution labels, never its links or names.
 * @returns Sanitized HTML string (all user strings escaped, every href validated)
 */
export function renderFooter(
  data?: FooterData,
  settings?: FooterSettings,
  owner?: FooterOwnerData,
  locale?: unknown
): string {
  const footer_data = data ?? DEFAULT_FOOTER_DATA
  const footer_settings = settings ?? DEFAULT_FOOTER_SETTINGS
  const extra_class = escape_html(footer_settings.extra_class)
  const attribution = render_attribution(footer_data, locale)

  if (!owner?.footer) {
    return `<footer class="text-center py-6 text-text-muted text-sm border-t border-border ${extra_class}">
  <div class="flex items-center justify-center gap-3 flex-wrap">
    ${attribution}
  </div>
</footer>`
  }

  return `<footer class="text-text-muted text-sm border-t border-border ${extra_class}">
  ${render_owner(owner, locale)}
  <div class="flex items-center justify-center gap-3 flex-wrap py-6 text-center border-t border-border">
    ${attribution}
  </div>
</footer>`
}
