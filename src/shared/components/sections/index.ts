// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Home sections shared component (hero, text-media, cta-band)
 * Single source of truth for SSR and the /admin canvas
 */

export type {
  HomeSection,
  HeroSection,
  TextMediaSection,
  CtaBandSection,
  PostsSection,
  SectionRenderSettings,
  HomeSectionsSplit,
} from './types'

export {
  home_hero_shown,
  home_lead_section_ids,
  home_priority_section_id,
  render_section_html,
  split_home_sections,
} from './render'
export type { SectionRenderOptions, SplitHomeSectionsOptions } from './render'
export { render_page_markdown, render_section_markdown } from './markdown'
export { template_has_sidebars } from './utils'
