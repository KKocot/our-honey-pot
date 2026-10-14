// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Home section dispatch - the one renderer used by SSR (HomeSections.astro) and the /admin canvas
 * (ADR 6ac6089d63221e857a3bac13: canvas renders 1:1 with the public page).
 */

import type { HomeSettings } from '../../../components/admin/types/settings'
import { render_cta_band } from './cta-band/render'
import { render_hero } from './hero/render'
import { render_text_media } from './text-media/render'
import type { HomeSection, HomeSectionsSplit, SectionRenderSettings } from './types'
import { create_section_context } from './utils'

export interface SectionRenderOptions {
  /** The section holds the LCP image: eager + fetchpriority=high (see `home_priority_section_id`). */
  priority?: boolean
}

/**
 * HTML of one home section; '' for `posts` (rendered by the posts island), hidden or invalid sections.
 * `locale` defaults to `settings.locale`.
 */
export function render_section_html(
  section: HomeSection,
  settings: SectionRenderSettings = {},
  locale?: unknown,
  options: SectionRenderOptions = {}
): string {
  if (!section || typeof section !== 'object' || section.hidden === true) return ''
  const ctx = create_section_context(settings ?? {}, locale, options.priority === true)
  switch (section.type) {
    case 'hero':
      return render_hero(section, ctx)
    case 'text-media':
      return render_text_media(section, ctx)
    case 'cta-band':
      return render_cta_band(section, ctx)
    default:
      return ''
  }
}

/**
 * Sections rendered above and below the `posts` section; no `home` keeps today's layout (both empty).
 * Without a `posts` entry every section goes above the posts island, like the /admin canvas stack.
 */
export function split_home_sections(home: HomeSettings | undefined): HomeSectionsSplit {
  const sections = Array.isArray(home?.sections) ? home.sections : []
  const posts_index = sections.findIndex((section) => section?.type === 'posts')
  if (posts_index === -1) return { before: sections.slice(), after: [] }
  return { before: sections.slice(0, posts_index), after: sections.slice(posts_index + 1) }
}

/** Id of the hero that is the first rendered section above the posts, i.e. the LCP candidate; else null. */
export function home_priority_section_id(settings: SectionRenderSettings = {}): string | null {
  const first = split_home_sections(settings?.home).before.find((section) => render_section_html(section, settings) !== '')
  return first?.type === 'hero' ? first.id : null
}

/** A hero renders on the home page; it owns the page H1, so the header shows the site name without a heading. */
export function home_hero_shown(settings: SectionRenderSettings = {}): boolean {
  const { before, after } = split_home_sections(settings?.home)
  return [...before, ...after].some((section) => section?.type === 'hero' && render_section_html(section, settings) !== '')
}
