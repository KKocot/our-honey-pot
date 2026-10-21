// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Home section dispatch - the one renderer used by SSR (HomeSections.astro) and the /admin canvas
 * (ADR 6ac6089d63221e857a3bac13: canvas renders 1:1 with the public page).
 */

import { hasLeftSidebar, hasRightSidebar, type ContainerElement } from '../../../components/admin/types/layout'
import type { HomeSettings } from '../../../components/admin/types/settings'
import { resolve_locale } from '../../../lib/i18n'
import { render_about } from './about/render'
import { render_callout } from './callout/render'
import { render_cta_band } from './cta-band/render'
import { render_faq } from './faq/render'
import { render_hero } from './hero/render'
import { render_links } from './links/render'
import { render_now } from './now/render'
import { render_quote } from './quote/render'
import { get_section_definition, is_placement_allowed, type SectionDefinitions } from './registry'
import { SECTION_PLACEMENT_CONTAINERS, type SectionPlacementContainer, type SectionRenderers } from './registry-types'
import { render_text_media } from './text-media/render'
import type {
  HomeContainerItem,
  HomeContainersSplit,
  HomeSection,
  HomeSectionContainer,
  HomeSectionsSplit,
  SectionRenderContext,
  SectionRenderSettings,
} from './types'
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

interface HomeRenderMemo {
  html: WeakMap<HomeSection, Map<string, string>>
  lead_ids?: string[]
  hero_shown?: boolean
  priority_id?: string | null
}

// Opt-in only: the canvas settings store mutates in place under a stable identity, so its results must not be cached.
const RENDER_MEMOS = new WeakMap<object, HomeRenderMemo>()

/**
 * SSR: `settings` stays unchanged for the request, so each home section is serialized once and the page-level
 * results (lead, hero, priority) computed once for every SlotRenderer/HomeSections instance of the request.
 */
export function memoize_home_render(settings: SectionRenderSettings): void {
  if (!RENDER_MEMOS.has(settings)) RENDER_MEMOS.set(settings, { html: new WeakMap() })
}

function serialize_section(
  section: HomeSection,
  current: SectionRenderSettings,
  locale: unknown,
  priority: boolean
): string {
  const definition = get_section_definition(section.type)
  const render = definition ? RENDERERS_BY_TYPE.get(definition.type) : undefined
  if (!render) return ''
  const container = resolve_section_container(section, current)
  const above_sidebars = home_lead_section_ids(current).includes(section.id)
  return render(section, create_section_context(current, locale, priority, above_sidebars, container))
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
  const current = settings ?? {}
  const priority = options.priority === true
  const memo = RENDER_MEMOS.get(current)
  if (!memo) return serialize_section(section, current, locale, priority)
  const key = `${priority}|${resolve_locale(locale ?? current.locale)}`
  const cached = memo.html.get(section) ?? new Map<string, string>()
  memo.html.set(section, cached)
  const hit = cached.get(key)
  if (hit !== undefined) return hit
  const html = serialize_section(section, current, locale, priority)
  cached.set(key, html)
  return html
}

function is_container_shown(container: SectionPlacementContainer, settings: SectionRenderSettings): boolean {
  const template = settings.pageLayoutConfig?.template
  if (container === 'sidebarLeft') return typeof template === 'string' && hasLeftSidebar(template)
  if (container === 'sidebarRight') return typeof template === 'string' && hasRightSidebar(template)
  return true
}

function placement_container(section: HomeSection | null | undefined): SectionPlacementContainer | null {
  const container: unknown = section?.placement?.container
  return SECTION_PLACEMENT_CONTAINERS.find((name) => name === container) ?? null
}

/**
 * Where a home section renders: its `placement` container when the template shows it and the type may sit there
 * (`is_placement_allowed`), else the main column. A sidebar hidden by the template sends its sections to main.
 */
export function resolve_section_container(
  section: HomeSection | null | undefined,
  settings: SectionRenderSettings = {}
): HomeSectionContainer {
  const container = placement_container(section)
  if (!container || !is_placement_allowed(section?.type, container)) return 'main'
  return is_container_shown(container, settings ?? {}) ? container : 'main'
}

/** Rendered element `active`; callers pass the blog-mode check too, the same one on SSR and the canvas. */
export type ContainerElementFilter = (element: ContainerElement) => boolean

export interface SplitHomeContainersOptions {
  /** Element counts towards `placement.index` and is listed; default: `active`. */
  is_element_rendered?: ContainerElementFilter
}

function container_elements(
  settings: SectionRenderSettings,
  container: SectionPlacementContainer,
  is_rendered: ContainerElementFilter
): ContainerElement[] {
  const elements: unknown = settings.pageLayoutConfig?.containers?.[container]?.elements
  if (!Array.isArray(elements)) return []
  return elements.filter(
    (element): element is ContainerElement => typeof element === 'object' && element !== null && is_rendered(element)
  )
}

function placement_slot(section: HomeSection, element_count: number): number {
  const index: unknown = section.placement?.index
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return element_count
  return Math.min(index, element_count)
}

/** `placement.index` = rendered elements before the section (clamped); equal slots keep `home.sections` order. */
function merge_container(elements: ContainerElement[], sections: HomeSection[]): HomeContainerItem[] {
  const items: HomeContainerItem[] = []
  for (let slot = 0; slot <= elements.length; slot++) {
    for (const section of sections) {
      if (placement_slot(section, elements.length) === slot) items.push({ kind: 'section', section })
    }
    const element = elements[slot]
    if (element) items.push({ kind: 'element', element })
  }
  return items
}

/**
 * Home sections split between the main column and the layout containers, every section exactly once; each container
 * lists its rendered elements merged with its sections in render order. Shared by SSR and the canvas (1:1).
 */
export function split_home_containers(
  settings: SectionRenderSettings = {},
  options: SplitHomeContainersOptions = {}
): HomeContainersSplit {
  const current = settings ?? {}
  const is_rendered = options.is_element_rendered ?? ((element: ContainerElement) => element.active === true)
  const sections = Array.isArray(current.home?.sections) ? current.home.sections : []
  const main: HomeSection[] = []
  const placed = new Map<SectionPlacementContainer, HomeSection[]>()
  for (const section of sections) {
    const container = resolve_section_container(section, current)
    if (container === 'main') main.push(section)
    else placed.set(container, [...(placed.get(container) ?? []), section])
  }
  const containers = {} as Record<SectionPlacementContainer, HomeContainerItem[]>
  for (const name of SECTION_PLACEMENT_CONTAINERS) {
    containers[name] = is_container_shown(name, current)
      ? merge_container(container_elements(current, name, is_rendered), placed.get(name) ?? [])
      : []
  }
  return { main, containers }
}

export interface HomeSectionContainersOptions {
  /** Count hidden and empty sections too (the canvas shows them); default: only sections with HTML. */
  include_hidden?: boolean
}

/**
 * Containers holding at least one home section: such a container is not empty even without elements, so
 * `pageLayoutConfigToLegacy` keeps its slot and `template_after_move` keeps its sidebar shown.
 */
export function home_section_containers(
  settings: SectionRenderSettings = {},
  options: HomeSectionContainersOptions = {}
): Set<SectionPlacementContainer> {
  const current = settings ?? {}
  const sections = Array.isArray(current.home?.sections) ? current.home.sections : []
  const occupied = new Set<SectionPlacementContainer>()
  for (const section of sections) {
    const container = resolve_section_container(section, current)
    if (container === 'main') continue
    if (options.include_hidden === true || render_section_html(section, current) !== '') occupied.add(container)
  }
  return occupied
}

export interface SplitHomeSectionsOptions {
  /** Sidebar template: leading `width: full` sections move to `lead`, above the sidebars. */
  sidebars?: boolean
  /** Page settings: sections placed in a shown container are left out (they render there, `split_home_containers`). */
  settings?: SectionRenderSettings
}

/**
 * Sections rendered above and below the `posts` section; no `home` keeps today's layout (all lists empty).
 * Without a `posts` entry every section goes above the posts island, like the /admin canvas stack.
 */
export function split_home_sections(
  home: HomeSettings | undefined,
  options: SplitHomeSectionsOptions = {}
): HomeSectionsSplit {
  const all = Array.isArray(home?.sections) ? home.sections : []
  const placement_settings = options.settings
  const sections = placement_settings
    ? all.filter((section) => resolve_section_container(section, placement_settings) === 'main')
    : all
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

/**
 * Ids of the leading `width: full` main-column sections that the public page and the canvas render above the
 * sidebars; sections placed in a container neither join nor end that run.
 */
export function home_lead_section_ids(settings: SectionRenderSettings = {}): string[] {
  const current = settings ?? {}
  const memo = RENDER_MEMOS.get(current)
  if (memo?.lead_ids) return memo.lead_ids
  const sidebars = template_has_sidebars(current)
  const ids = sidebars
    ? split_home_sections(current.home, { sidebars, settings: current }).lead.map((section) => section.id)
    : []
  if (memo) memo.lead_ids = ids
  return ids
}

function container_sections(items: readonly HomeContainerItem[]): HomeSection[] {
  return items.flatMap((item) => (item.kind === 'section' ? [item.section] : []))
}

/**
 * Id of the hero that is the first rendered section of the page, i.e. the LCP candidate; else null.
 * Document order: sections of the top container, then the main column above the posts. Sidebars cannot hold a hero
 * and the bottom container renders below the posts, so neither is a candidate.
 */
export function home_priority_section_id(settings: SectionRenderSettings = {}): string | null {
  const current = settings ?? {}
  const memo = RENDER_MEMOS.get(current)
  if (memo?.priority_id !== undefined) return memo.priority_id
  const top = container_sections(split_home_containers(current).containers.top)
  const { before } = split_home_sections(current.home, { settings: current })
  const first = [...top, ...before].find((section) => render_section_html(section, current) !== '')
  const id = first?.type === 'hero' ? first.id : null
  if (memo) memo.priority_id = id
  return id
}

/**
 * A hero renders anywhere on the home page (main column, top or bottom container); it owns the page H1, so the
 * header shows the site name without a heading. A hero in the top container is that H1: the slot renders it
 * through `render_section_html` like the main column and adds no heading of its own.
 */
export function home_hero_shown(settings: SectionRenderSettings = {}): boolean {
  const current = settings ?? {}
  const memo = RENDER_MEMOS.get(current)
  if (memo?.hero_shown !== undefined) return memo.hero_shown
  const { main, containers } = split_home_containers(current)
  const placed = SECTION_PLACEMENT_CONTAINERS.flatMap((name) => container_sections(containers[name]))
  const shown = [...main, ...placed].some(
    (section) => section?.type === 'hero' && render_section_html(section, current) !== ''
  )
  if (memo) memo.hero_shown = shown
  return shown
}
