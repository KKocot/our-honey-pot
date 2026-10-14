// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Header utilities - data transformation functions
 */

import type { HeaderBrand, HeaderData } from './types'
import type { PageSlotPosition } from '../page-layout/types'
import { t } from '../../../lib/i18n'

/**
 * Create normalized header data; without `brand` the header renders text only
 */
export function createHeaderData(site_name: string, site_description: string, brand?: HeaderBrand): HeaderData {
  return brand ? { site_name, site_description, brand } : { site_name, site_description }
}

export interface SiteIdentitySettings {
  siteName?: string
  siteDescription?: string
  hiveUsername?: string
  brand?: HeaderBrand
  locale?: string
}

/** Community mode is signalled by a defined `community_title` (may be empty). */
export interface SiteIdentityContext {
  community_title?: string
  community_about?: string
}

export function resolveSiteName(settings: SiteIdentitySettings, context: SiteIdentityContext = {}): string {
  if (settings.siteName) return settings.siteName
  const username = settings.hiveUsername
  if (context.community_title !== undefined) {
    return context.community_title || username || t(settings.locale, 'site.default_community_name')
  }
  return username
    ? t(settings.locale, 'site.default_blog_name', { user: username })
    : t(settings.locale, 'site.default_hive_blog_name')
}

export function resolveSiteDescription(settings: SiteIdentitySettings, context: SiteIdentityContext = {}): string {
  if (settings.siteDescription) return settings.siteDescription
  if (context.community_title !== undefined) {
    return context.community_about || t(settings.locale, 'site.default_community_description')
  }
  return t(settings.locale, 'site.default_blog_description')
}

/** Site header data shared by SSR (SlotRenderer.astro) and the canvas (ElementRenderer.tsx). */
export function createSiteHeaderData(settings: SiteIdentitySettings, context: SiteIdentityContext = {}): HeaderData {
  return createHeaderData(resolveSiteName(settings, context), resolveSiteDescription(settings, context), settings.brand)
}

export type HeaderVariant = 'card' | 'compact' | 'bottom'

/** Header markup per page slot; SSR (SlotRenderer.astro) and the canvas (ElementRenderer.tsx) both pick it here. */
export function resolveHeaderVariant(slot: PageSlotPosition | undefined): HeaderVariant {
  if (slot === 'sidebar-left' || slot === 'sidebar-right') return 'compact'
  return slot === 'bottom' ? 'bottom' : 'card'
}
