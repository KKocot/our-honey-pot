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
  HomeSectionContainer,
  HomeContainerItem,
  HomeContainersSplit,
} from './types'

export {
  home_hero_shown,
  home_lead_section_ids,
  home_priority_section_id,
  home_section_containers,
  render_section_html,
  resolve_section_container,
  split_home_containers,
  split_home_sections,
} from './render'
export type {
  ContainerElementFilter,
  HomeSectionContainersOptions,
  SectionRenderOptions,
  SplitHomeContainersOptions,
  SplitHomeSectionsOptions,
} from './render'
export { render_page_markdown, render_section_markdown } from './markdown'
export { is_in_container, template_has_sidebars } from './utils'
