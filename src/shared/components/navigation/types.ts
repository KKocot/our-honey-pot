// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Navigation types - shared between Astro and SolidJS
 */

import type { Cta, Link } from '../../../components/admin/types/navigation'

/**
 * Navigation tab configuration from settings
 */
export interface NavigationTabConfig {
  id: string
  label: string
  enabled: boolean
  showCount: boolean
  tag?: string
  tooltip?: string
}

/**
 * Processed navigation item ready for rendering
 */
export interface NavigationItem {
  id: string
  label: string
  count?: number
  href: string
  disabled: boolean
  tooltip?: string
}

/**
 * Navigation settings for rendering
 */
export interface NavigationSettings {
  tabs: NavigationTabConfig[]
  activeTab: string
  /** Slug of the current static page; its `page` owner link gets aria-current. */
  activePage?: string
  postsCount: number
  commentsCount: number
  /** Owner links (settings.nav.links); untrusted, re-validated at render. */
  links?: Link[]
  cta?: Cta
  locale?: string
  /** id of the mobile links menu; must be unique per page when the nav renders more than once. */
  menuId?: string
}

/** Owner link or CTA after validation, ready for rendering. */
export interface OwnerNavItem {
  label: string
  href: string
  external: boolean
  /** Set when a `tag` link resolves to an existing category tab. */
  tabId?: string
  /** Set for `page` links. */
  pageSlug?: string
}

/**
 * Default navigation tabs
 */
export const defaultNavigationTabs: NavigationTabConfig[] = [
  { id: 'posts', label: 'Posts', enabled: true, showCount: false },
  { id: 'threads', label: 'Hive Threads', enabled: false, showCount: false },
  { id: 'comments', label: 'Comments', enabled: true, showCount: false },
]
