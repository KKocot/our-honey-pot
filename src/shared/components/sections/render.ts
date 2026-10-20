// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Home section dispatch - the one renderer used by SSR (HomeSections.astro) and the /admin canvas
 * (ADR 6ac6089d63221e857a3bac13: canvas renders 1:1 with the public page).
 */

import type { HomeSettings } from '../../../components/admin/types/settings'
import { render_about } from './about/render'
import { render_callout } from './callout/render'
import { render_cta_band } from './cta-band/render'
import { render_faq } from './faq/render'
import { render_hero } from './hero/render'
import { render_links } from './links/render'
import { render_now } from './now/render'
import { render_quote } from './quote/render'
import { get_section_definition, type SectionDefinitions } from './registry'
import type { SectionRenderers } from './registry-types'
import { render_text_media } from './text-media/render'
import type { HomeSection, HomeSectionsSplit, SectionRenderContext, SectionRenderSettings } from './types'
import { create_section_context, is_full_width_section, template_has_sidebars } from './utils'

const SECTION_RENDERERS = {
  hero: render_hero,
  'text-media': render_text_media,
  about: render_about,
  links: render_links,
  callout: render_callout,
  now: render_now,
  quote: render_quote,
  faq: render_faq,
  posts: () => '',
  'cta-band': render_cta_band,
} satisfies SectionRenderers<SectionDefinitions>

type HomeSectionRenderFn = (section: HomeSection, ctx: SectionRenderContext) => string

// Each renderer is keyed by its own type and called only for a section of that type, so the widening is sound.
const RENDERERS_BY_TYPE: ReadonlyMap<string, HomeSectionRenderFn> = new Map(
  Object.entries(SECTION_RENDERERS) as [string, HomeSectionRenderFn][]
)

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
  const definition = get_section_definition(section.type)
  const render = definition ? RENDERERS_BY_TYPE.get(definition.type) : undefined
  if (!render) return ''
  const current = settings ?? {}
  const above_sidebars = home_lead_section_ids(current).includes(section.id)
  const ctx = create_section_context(current, locale, options.priority === true, above_sidebars)
  return render(section, ctx)
}

export interface SplitHomeSectionsOptions {
  /** Sidebar template: leading `width: full` sections move to `lead`, above the sidebars. */
  sidebars?: boolean
}

/**
 * Sections rendered above and below the `posts` section; no `home` keeps today's layout (all lists empty).
 * Without a `posts` entry every section goes above the posts island, like the /admin canvas stack.
 */
export function split_home_sections(
  home: HomeSettings | undefined,
  options: SplitHomeSectionsOptions = {}
): HomeSectionsSplit {
  const sections = Array.isArray(home?.sections) ? home.sections : []
  const posts_index = sections.findIndex((section) => section?.type === 'posts')
  const before = posts_index === -1 ? sections.slice() : sections.slice(0, posts_index)
  const after = posts_index === -1 ? [] : sections.slice(posts_index + 1)
  if (options.sidebars !== true) return { lead: [], before, after }
  // Hidden sections render nothing publicly, so they neither end the leading run nor move with it.
  const lead: HomeSection[] = []
  for (const section of before) {
    if (section?.hidden === true) continue
    if (!is_full_width_section(section)) break
    lead.push(section)
  }
  return { lead, before: before.filter((section) => !lead.includes(section)), after }
}

/** Ids of the leading `width: full` sections that the public page and the canvas render above the sidebars. */
export function home_lead_section_ids(settings: SectionRenderSettings = {}): string[] {
  const sidebars = template_has_sidebars(settings ?? {})
  if (!sidebars) return []
  return split_home_sections(settings?.home, { sidebars }).lead.map((section) => section.id)
}

/** Id of the hero that is the first rendered section above the posts, i.e. the LCP candidate; else null. */
export function home_priority_section_id(settings: SectionRenderSettings = {}): string | null {
  const first = split_home_sections(settings?.home).before.find(
    (section) => render_section_html(section, settings) !== ''
  )
  return first?.type === 'hero' ? first.id : null
}

/** A hero renders on the home page; it owns the page H1, so the header shows the site name without a heading. */
export function home_hero_shown(settings: SectionRenderSettings = {}): boolean {
  const { before, after } = split_home_sections(settings?.home)
  return [...before, ...after].some(
    (section) => section?.type === 'hero' && render_section_html(section, settings) !== ''
  )
}
