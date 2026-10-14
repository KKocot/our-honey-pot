// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Footer types - shared between Astro and SolidJS
 */

import type { FooterSettings as FooterContent } from '../../../components/admin/types/settings'
import type { SocialLink } from '../../../components/admin/types/social'
import type { NavigationTabConfig } from '../navigation/types'

export type { FooterContent }

/** Owner content rendered above the fixed attribution row (spec custom blogs 1.6). */
export interface FooterOwnerData {
  footer: FooterContent
  site_name?: string
  social_links?: SocialLink[]
  /** Category tabs, so a `tag` link resolves exactly like in the nav. */
  tabs?: NavigationTabConfig[]
  /** Copyright year fallback; pass it from the server so SSR and canvas agree. */
  year?: number
}

export interface FooterData {
  author_name: string
  author_url: string
  kofi_url: string
  kofi_image_url: string
  platform_name: string
  custom_text?: string
}

export interface FooterSettings {
  extra_class: string
}

export const DEFAULT_FOOTER_DATA: FooterData = {
  author_name: 'BardDev',
  author_url: 'https://bard-dev.com',
  kofi_url: 'https://ko-fi.com/K3K713SMAY',
  kofi_image_url: 'https://storage.ko-fi.com/cdn/kofi6.png?v=6',
  platform_name: 'Hive Blockchain',
}

export const DEFAULT_FOOTER_SETTINGS: FooterSettings = {
  extra_class: '',
}
