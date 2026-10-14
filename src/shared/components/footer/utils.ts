// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Footer utilities - data transformation functions
 */

import type { FooterContent, FooterData, FooterOwnerData, FooterSettings } from './types'
import { DEFAULT_FOOTER_DATA, DEFAULT_FOOTER_SETTINGS } from './types'
import type { SocialLink } from '../../../components/admin/types/social'
import type { NavigationTabConfig } from '../navigation/types'

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
  socialLinks?: SocialLink[]
  navigationTabs?: NavigationTabConfig[]
  locale?: string
}

export interface FooterRenderInput {
  data: FooterData
  owner?: FooterOwnerData
  locale?: string
}

/** Settings -> renderFooter arguments; SSR (SlotRenderer.astro) and canvas (ElementRenderer.tsx) share it. */
export function createFooterRenderInput(
  settings: FooterSourceSettings,
  site_name: string,
  year: number
): FooterRenderInput {
  const owner = hasFooterContent(settings.footer)
    ? { footer: settings.footer, site_name, social_links: settings.socialLinks, tabs: settings.navigationTabs, year }
    : undefined
  return {
    data: createFooterData({ custom_text: settings.footer_text }),
    owner,
    locale: settings.locale,
  }
}
