// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Home section types - shared between Astro (SSR) and SolidJS (/admin canvas)
 */

import type { HomeSection, SettingsData } from '../../../components/admin/types/settings'
import type { ThemeColors } from '../../../components/admin/types/theme'
import type { Locale } from '../../../lib/i18n'

export type { HomeSection }

export type HeroSection = Extract<HomeSection, { type: 'hero' }>
export type TextMediaSection = Extract<HomeSection, { type: 'text-media' }>
export type CtaBandSection = Extract<HomeSection, { type: 'cta-band' }>
export type PostsSection = Extract<HomeSection, { type: 'posts' }>

/** Settings read by the section renderers; the full SettingsData satisfies it. */
export type SectionRenderSettings = Partial<
  Pick<
    SettingsData,
    'siteTheme' | 'customColors' | 'pageLayoutConfig' | 'footer' | 'navigationTabs' | 'locale' | 'home'
  >
>

export interface SectionRenderContext {
  settings: SectionRenderSettings
  locale: Locale
  colors: ThemeColors
  /** False in sidebar templates, where `width: full` falls back to `content` (spec 2). */
  allow_full_width: boolean
  /** Images of this section load eagerly with fetchpriority=high (the LCP hero only). */
  priority: boolean
}

export interface HomeSectionsSplit {
  before: HomeSection[]
  after: HomeSection[]
}
