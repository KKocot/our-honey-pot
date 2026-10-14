// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Footer utilities - data transformation functions
 */

import type { FooterContent, FooterData, FooterOwnerData, FooterSettings } from './types'
import { DEFAULT_FOOTER_DATA, DEFAULT_FOOTER_SETTINGS } from './types'
import type { SocialLink } from '../../../components/admin/types/social'
import type { NavigationTabConfig } from '../navigation/types'
import { FOOTER_LIMITS, type PageDef } from '../../../components/admin/types/settings'
import { LINK_LABEL_MAX_CHARS, type Link } from '../../../components/admin/types/navigation'

type FooterPageSource = Pick<PageDef, 'slug' | 'title' | 'in_footer' | 'footer_column'>

/**
 * Create footer data with optional overrides
 */
export function createFooterData(overrides?: Partial<FooterData>): FooterData {
  return {
    ...DEFAULT_FOOTER_DATA,
    ...overrides,
  }
}

/**
 * Create footer settings from partial settings object
 */
export function createFooterSettings(settings?: { class?: string }): FooterSettings {
  return {
    extra_class: settings?.class ?? DEFAULT_FOOTER_SETTINGS.extra_class,
  }
}

/** An unconfigured footer keeps the attribution-only output of existing blogs. */
export function hasFooterContent(footer: FooterContent | undefined): footer is FooterContent {
  if (!footer) return false
  return (
    footer.variant === 'mast' ||
    (footer.columns?.length ?? 0) > 0 ||
    !!footer.copyright?.trim() ||
    !!footer.company?.trim() ||
    !!footer.privacy ||
    (footer.legal_links?.length ?? 0) > 0 ||
    footer.show_social === true
  )
}

export interface FooterSourceSettings {
  footer_text?: string
  footer?: FooterContent
  pages?: FooterPageSource[]
  socialLinks?: SocialLink[]
  navigationTabs?: NavigationTabConfig[]
  locale?: string
}

export interface FooterRenderInput {
  data: FooterData
  owner?: FooterOwnerData
  locale?: string
}

function page_footer_link(page: FooterPageSource): Link | null {
  if (typeof page.slug !== 'string' || typeof page.title !== 'string') return null
  const label = Array.from(page.title.trim()).slice(0, LINK_LABEL_MAX_CHARS).join('')
  return label ? { label, kind: 'page', target: page.slug } : null
}

function linked_page_slugs(footer: FooterContent): Set<string> {
  const links = [
    ...(Array.isArray(footer.columns) ? footer.columns.flatMap((column) => column?.links ?? []) : []),
    ...(Array.isArray(footer.legal_links) ? footer.legal_links : []),
    ...(footer.privacy ? [footer.privacy] : []),
  ]
  return new Set(links.filter((link) => link?.kind === 'page').map((link) => link.target))
}

/** Owner footer plus `pages[].in_footer` links: legal row up to 3, column up to 4; owner links keep priority. */
export function withPageFooterLinks(
  footer: FooterContent | undefined,
  pages: FooterSourceSettings['pages']
): FooterContent | undefined {
  if (!Array.isArray(pages)) return footer
  const placed = pages.filter((page) => page?.in_footer === 'legal' || page?.in_footer === 'column')
  if (placed.length === 0) return footer

  const base: FooterContent = footer ?? { variant: 'inline', columns: [], legal_links: [], show_social: false }
  const columns = (Array.isArray(base.columns) ? base.columns.slice(0, FOOTER_LIMITS.columns) : []).map((column) => ({
    ...column,
    links: Array.isArray(column?.links) ? [...column.links] : [],
  }))
  const legal_links = Array.isArray(base.legal_links) ? [...base.legal_links] : []
  const linked_slugs = linked_page_slugs(base)

  for (const page of placed) {
    const link = page_footer_link(page)
    if (!link || linked_slugs.has(link.target)) continue
    if (page.in_footer === 'legal') {
      if (legal_links.length >= FOOTER_LIMITS.legal_links) continue
      legal_links.push(link)
    } else {
      const column_index = Number.isInteger(page.footer_column) ? page.footer_column : 0
      if (column_index < 0 || column_index >= FOOTER_LIMITS.columns) continue
      while (columns.length <= column_index) columns.push({ title: '', links: [] })
      const column = columns[column_index]
      if (column.links.length >= FOOTER_LIMITS.links_per_column) continue
      column.links.push(link)
    }
    linked_slugs.add(link.target)
  }
  return { ...base, columns, legal_links }
}

/** Settings -> renderFooter arguments; SSR (SlotRenderer.astro) and canvas (ElementRenderer.tsx) share it. */
export function createFooterRenderInput(
  settings: FooterSourceSettings,
  site_name: string,
  year: number
): FooterRenderInput {
  const footer = withPageFooterLinks(settings.footer, settings.pages)
  const owner = hasFooterContent(footer)
    ? { footer, site_name, social_links: settings.socialLinks, tabs: settings.navigationTabs, year }
    : undefined
  return {
    data: createFooterData({ custom_text: settings.footer_text }),
    owner,
    locale: settings.locale,
  }
}
