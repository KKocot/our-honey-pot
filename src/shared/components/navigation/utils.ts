// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Navigation utilities - data transformation and processing functions
 */

import type { NavigationTabConfig, NavigationItem, NavigationSettings, OwnerNavItem } from './types'
import { defaultNavigationTabs } from './types'
import {
  LINK_LABEL_MAX_CHARS,
  LINK_TAG_REGEX,
  PAGE_SLUG_LENGTH,
  PAGE_SLUG_REGEX,
  type Cta,
  type Link,
} from '../../../components/admin/types/navigation'
import { safe_link_url } from '../../../lib/image-ref'
import { get_hive_blog_url } from '../../../lib/config'
import { NAV_MAX_LINKS } from '../../../components/admin/types/settings'

/**
 * Get count for a specific tab
 */
export function getTabCount(tab: NavigationTabConfig, postsCount: number, commentsCount: number): number | undefined {
  if (!tab.showCount) return undefined
  if (tab.id === 'posts') return postsCount
  if (tab.id === 'comments') return commentsCount
  return undefined
}

/**
 * Build href for navigation item based on tab type
 */
export function buildNavHref(tab: { id: string; tag?: string }): string {
  if (tab.id === 'posts') {
    return '/'
  }
  // Category tabs link to /?tab={id} (filtered by tag on the server)
  return `/?tab=${encodeURIComponent(tab.id)}`
}

/**
 * Process tab configs into navigation items
 */
export function buildNavigationItems(settings: NavigationSettings): NavigationItem[] {
  const tabs = settings.tabs.length > 0 ? settings.tabs : defaultNavigationTabs

  return tabs
    .filter((tab) => tab.enabled)
    .map((tab) => {
      const count = getTabCount(tab, settings.postsCount, settings.commentsCount)
      return {
        id: tab.id,
        label: tab.label,
        count,
        href: buildNavHref(tab),
        disabled: false,
        tooltip: tab.tooltip,
      }
    })
}

/**
 * Check if any navigation tabs are enabled
 */
export function hasEnabledTabs(tabs?: NavigationTabConfig[]): boolean {
  const resolved = tabs && tabs.length > 0 ? tabs : defaultNavigationTabs
  return resolved.some((tab) => tab.enabled)
}

function clean_label(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const label = Array.from(raw.trim()).slice(0, LINK_LABEL_MAX_CHARS).join('')
  return label.length > 0 ? label : null
}

function contact_item(label: string, raw_url: unknown): OwnerNavItem | null {
  const href = safe_link_url(raw_url, { allow_contact: true })
  if (!href) return null
  return { label, href, external: href.startsWith('https:') }
}

function is_page_slug(value: string): boolean {
  return value.length >= PAGE_SLUG_LENGTH.min && value.length <= PAGE_SLUG_LENGTH.max && PAGE_SLUG_REGEX.test(value)
}

/**
 * Validate an owner link; `tag` reuses a matching enabled category tab, otherwise links to the tag on Hive.
 * Invalid input -> null (skipped, never a render error).
 */
export function resolveOwnerLink(link: Link | undefined, tabs: NavigationTabConfig[] = []): OwnerNavItem | null {
  if (!link || typeof link !== 'object') return null
  const label = clean_label(link.label)
  const target = link.target
  if (!label || typeof target !== 'string') return null

  if (link.kind === 'url') return contact_item(label, target)
  if (link.kind === 'page') {
    return is_page_slug(target) ? { label, href: `/p/${target}`, external: false } : null
  }
  if (link.kind === 'tag') {
    if (!LINK_TAG_REGEX.test(target)) return null
    const tab = tabs.find((candidate) => candidate.enabled && candidate.tag === target)
    if (tab) return { label, href: buildNavHref(tab), external: false, tabId: tab.id }
    const href = safe_link_url(`${get_hive_blog_url()}/trending/${target}`)
    return href ? { label, href, external: true } : null
  }
  return null
}

export function resolveCta(cta: Cta | undefined): OwnerNavItem | null {
  if (!cta || typeof cta !== 'object') return null
  const label = clean_label(cta.label)
  return label ? contact_item(label, cta.url) : null
}

/** Valid owner links (max 6, order kept) and the optional CTA. */
export function buildOwnerNavItems(settings: Pick<NavigationSettings, 'tabs' | 'links' | 'cta'>): {
  links: OwnerNavItem[]
  cta: OwnerNavItem | null
} {
  const raw_links = Array.isArray(settings.links) ? settings.links.slice(0, NAV_MAX_LINKS) : []
  const links = raw_links
    .map((link) => resolveOwnerLink(link, settings.tabs))
    .filter((item): item is OwnerNavItem => item !== null)
  return { links, cta: resolveCta(settings.cta) }
}

/** True when the nav bar has anything to show: an enabled tab, an owner link or a CTA. */
export function hasNavigationContent(config: { tabs?: NavigationTabConfig[]; links?: Link[]; cta?: Cta }): boolean {
  if (hasEnabledTabs(config.tabs)) return true
  const owner = buildOwnerNavItems({ tabs: config.tabs ?? [], links: config.links, cta: config.cta })
  return owner.links.length > 0 || owner.cta !== null
}

/** Mobile menu id per layout section, so a nav rendered in several sections keeps unique ids. */
export function navMenuId(section_id: string | undefined): string | undefined {
  return section_id ? `site-nav-menu-${section_id}` : undefined
}

export interface NavSourceSettings {
  nav?: { links?: Link[]; cta?: Cta }
  locale?: string
}

export interface OwnerNavConfig {
  links?: Link[]
  cta?: Cta
  locale?: string
  menuId?: string
}

/** Settings -> owner nav config; SSR (SlotRenderer.astro) and canvas (ElementRenderer.tsx) share it. */
export function createOwnerNavConfig(settings: NavSourceSettings, section_id?: string): OwnerNavConfig {
  return {
    links: settings.nav?.links,
    cta: settings.nav?.cta,
    locale: settings.locale,
    menuId: navMenuId(section_id),
  }
}

/**
 * Create navigation settings from partial config
 */
export function createNavigationSettings(config: {
  navigationTabs?: NavigationTabConfig[]
  activeTab?: string
  postsCount?: number
  commentsCount?: number
  links?: Link[]
  cta?: Cta
  locale?: string
  menuId?: string
}): NavigationSettings {
  const settings: NavigationSettings = {
    tabs: config.navigationTabs ?? defaultNavigationTabs,
    activeTab: config.activeTab ?? 'posts',
    postsCount: config.postsCount ?? 0,
    commentsCount: config.commentsCount ?? 0,
  }
  if (config.links) settings.links = config.links
  if (config.cta) settings.cta = config.cta
  if (config.locale) settings.locale = config.locale
  if (config.menuId) settings.menuId = config.menuId
  return settings
}
