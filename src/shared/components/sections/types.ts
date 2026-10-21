// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Home section types - shared between Astro (SSR) and SolidJS (/admin canvas)
 */

import type { ContainerElement } from '../../../components/admin/types/layout'
import type { HomeSection, SettingsData } from '../../../components/admin/types/settings'
import type { ThemeColors } from '../../../components/admin/types/theme'
import type { Locale } from '../../../lib/i18n'
import type { SectionPlacementContainer } from './registry-types'

export type { HomeSection }

/** Where a home section renders: the main column or one of the layout containers (`resolve_section_container`). */
export type HomeSectionContainer = 'main' | SectionPlacementContainer

export type HeroSection = Extract<HomeSection, { type: 'hero' }>
export type TextMediaSection = Extract<HomeSection, { type: 'text-media' }>
export type AboutSection = Extract<HomeSection, { type: 'about' }>
export type LinksSection = Extract<HomeSection, { type: 'links' }>
export type CalloutSection = Extract<HomeSection, { type: 'callout' }>
export type NowSection = Extract<HomeSection, { type: 'now' }>
export type QuoteSection = Extract<HomeSection, { type: 'quote' }>
export type FaqSection = Extract<HomeSection, { type: 'faq' }>
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
  /** False in sidebar templates, where `width: full` falls back to `content` (spec 2), except for lead sections. */
  allow_full_width: boolean
  /** Images of this section load eagerly with fetchpriority=high (the LCP hero only). */
  priority: boolean
  /** Absent = main column; in a sidebar text-media always stacks its image above the text. */
  container?: HomeSectionContainer
}

/** One entry of a container in render order: a layout element or a home section placed there. */
export type HomeContainerItem =
  { kind: 'element'; element: ContainerElement } | { kind: 'section'; section: HomeSection }

export interface HomeContainersSplit {
  /** Sections of the main column, in `home.sections` order (`posts` included). */
  main: HomeSection[]
  /** Rendered elements and placed sections per container; a container hidden by the template is []. */
  containers: Record<SectionPlacementContainer, HomeContainerItem[]>
}

export interface HomeSectionsSplit {
  /** Leading `width: full` sections of a sidebar template, rendered above the sidebars (`home_lead_section_ids`). */
  lead: HomeSection[]
  before: HomeSection[]
  after: HomeSection[]
}
