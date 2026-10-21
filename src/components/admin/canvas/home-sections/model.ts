// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Pure model of the home section stack on the /admin canvas; the Solid components only wire it to the DOM.

import { home_priority_section_id, render_section_html } from '../../../../shared/components/sections'
import type { SectionRenderSettings } from '../../../../shared/components/sections'
import { resolve_section_container } from '../../../../shared/components/sections/render'
import { SECTION_DEFINITIONS } from '../../../../shared/components/sections/registry'
import { HOME_MAX_SECTIONS, type HomeSection, type HomeSectionType, type SettingsData } from '../../types/settings'
import {
  can_add_section,
  home_section_issues,
  home_sections_of,
  swap_home_sections,
  type AddableHomeSectionType,
} from '../home-section-ops'

/** Sortable type of home sections; only home section drop zones accept it. */
export const HOME_SECTION_DND_TYPE = 'home-section'

/** How long the Undo action of "Section deleted" stays available. */
export const DELETE_UNDO_MS = 6000

/** History labels of stack operations (one undo step each). */
export const HOME_OP_LABELS = Object.freeze({
  add: 'Added section',
  delete: 'Deleted section',
  duplicate: 'Duplicated section',
  hide: 'Hid section',
  show: 'Showed section',
  move: 'Moved section',
  swap: 'Swapped sections',
})

/** Admin label of every section type, from the registry; the one source for the stack, popover and save errors. */
export const HOME_SECTION_LABELS: Readonly<Record<HomeSectionType, string>> = Object.freeze(
  Object.fromEntries(SECTION_DEFINITIONS.map((definition) => [definition.type, definition.label])) as Record<
    HomeSectionType,
    string
  >
)

export interface AddSectionOption {
  type: AddableHomeSectionType
  label: string
  description: string
}

/** Add section menu in registry order; fixed types (`posts`) are never offered. */
export const ADD_SECTION_OPTIONS: readonly AddSectionOption[] = Object.freeze(
  SECTION_DEFINITIONS.filter((definition) => !definition.fixed).map((definition): AddSectionOption => ({
    type: definition.type as AddableHomeSectionType,
    label: definition.label,
    description: definition.description,
  }))
)

/** Editor-only copy of the "fill in" chrome; never part of the rendered section HTML. */
export const FILL_IN_TITLE = 'Fill in this section'
export const FILL_IN_HINT = 'Edit it in the section settings (gear) or delete it.'

const SORTABLE_PREFIX = 'home-sec:'
const ZONE_PREFIX = 'home-zone:'

export function home_sortable_id(id: string): string {
  return `${SORTABLE_PREFIX}${id}`
}

export function parse_home_sortable_id(value: string): string | null {
  return value.startsWith(SORTABLE_PREFIX) && value.length > SORTABLE_PREFIX.length
    ? value.slice(SORTABLE_PREFIX.length)
    : null
}

/** Drop zone (and sortable group) of one section; a drop on another section's zone swaps the two. */
export function home_zone_id(id: string): string {
  return `${ZONE_PREFIX}${id}`
}

export function parse_home_zone_id(value: string): string | null {
  return value.startsWith(ZONE_PREFIX) && value.length > ZONE_PREFIX.length ? value.slice(ZONE_PREFIX.length) : null
}

/** Canvas HTML of a section: the public renderer 1:1; a hidden section is rendered as if shown (the stack dims it). */
export function canvas_section_html(section: HomeSection, settings: SectionRenderSettings, priority = false): string {
  const options = { priority }
  if (section.hidden !== true) return render_section_html(section, settings, undefined, options)
  const { hidden: _hidden, ...shown } = section
  return render_section_html(shown as HomeSection, settings, undefined, options)
}

/** The section blocks Save (placeholder text left, required content missing), so the editor marks it unfilled. */
export function has_placeholder_content(section: HomeSection): boolean {
  return home_section_issues(section).length > 0
}

/**
 * The canvas asks the owner to fill in a section that blocks Save or renders nothing (`html` = its canvas HTML).
 * The counter is therefore >= the number of `home_save_errors`: every save error is counted, plus empty renders.
 */
export function section_needs_fill(item: Pick<HomeStackItem, 'section' | 'placeholder'>, html: string): boolean {
  return item.section.type !== 'posts' && (item.placeholder || html === '')
}

/** Sections to fill in across the page, sections placed in containers included: they block Save too (ADR 6ad727f4). */
export function fill_in_section_ids(settings: SectionRenderSettings & Pick<SettingsData, 'home'>): string[] {
  return home_sections_of(settings)
    .filter((section) =>
      section_needs_fill(
        { section, placeholder: has_placeholder_content(section) },
        section.type === 'posts' ? '' : canvas_section_html(section, settings)
      )
    )
    .map((section) => section.id)
}

/** Text of the "sections to fill in" counter; null hides it (no "0" badge). */
export function fill_in_counter_text(count: number): string | null {
  if (count <= 0) return null
  return count === 1 ? '1 section to fill in' : `${count} sections to fill in`
}

export interface HomeSaveError {
  section_id: string
  message: string
}

/**
 * One error per section with `home_section_issues` (placeholder text left, e.g. from a preset, blocks Save until
 * the section is filled in or deleted), in stack order; hidden sections count too (they are saved).
 */
export function home_save_errors(settings: Pick<SettingsData, 'home'>): HomeSaveError[] {
  return home_sections_of(settings).flatMap((section, index) => {
    const issues = home_section_issues(section)
    if (issues.length === 0) return []
    const label = HOME_SECTION_LABELS[section.type] ?? section.type
    return [{ section_id: section.id, message: `${label} (section ${index + 1}): ${issues.join(', ')}` }]
  })
}

export interface HomeStackItem {
  section: HomeSection
  index: number
  total: number
  label: string
  hidden: boolean
  placeholder: boolean
  can_move_up: boolean
  can_move_down: boolean
  can_duplicate: boolean
  /** `posts` is never deleted, duplicated or hidden (hiding it would not change the public page). */
  removable: boolean
  /** Holds the LCP image on the public page (`home_priority_section_id`). */
  priority: boolean
}

export interface HomeStack {
  items: HomeStackItem[]
  before: HomeStackItem[]
  posts: HomeStackItem | null
  after: HomeStackItem[]
}

/** Settings of the main column stack: sections placed in a shown container leave it (`resolve_section_container`). */
export type HomeStackSource = Pick<SettingsData, 'home'> & Pick<SectionRenderSettings, 'pageLayoutConfig'>

/** Sections rendered in the main column, in `home.sections` order; the same split as the public page. */
export function main_home_sections(settings: HomeStackSource): HomeSection[] {
  return home_sections_of(settings).filter((section) => resolve_section_container(section, settings) === 'main')
}

/** `home.sections` index of an insertion at main column position `slot`; placed sections around it keep their place. */
export function main_insert_index(settings: HomeStackSource, slot: number): number {
  const all = home_sections_of(settings)
  const main = main_home_sections(settings)
  const position_of = (section: HomeSection) => all.findIndex((entry) => entry.id === section.id)
  const anchor = main[slot]
  if (anchor) return position_of(anchor)
  const last = main.at(-1)
  return last ? position_of(last) + 1 : all.length
}

/** Up/Down in the main column: swaps with the neighbouring main section, skipping sections placed in containers. */
export function move_main_home_section(
  settings: HomeStackSource,
  id: string,
  direction: 'up' | 'down'
): Partial<SettingsData> | null {
  const main = main_home_sections(settings)
  const index = main.findIndex((section) => section.id === id)
  const neighbor = index === -1 ? undefined : main[direction === 'up' ? index - 1 : index + 1]
  return neighbor ? swap_home_sections(settings, id, neighbor.id) : null
}

/**
 * Main column stack in render order, split around `posts` like the public page (HomeSections before and after the
 * island); without `posts` every section sits above the posts content, the same fallback as `split_home_sections`.
 */
export function build_home_stack(settings: HomeStackSource): HomeStack {
  const sections = main_home_sections(settings)
  const total = sections.length
  const priority_id = home_priority_section_id(settings)
  const items = sections.map((section, index): HomeStackItem => ({
    section,
    index,
    total,
    label: HOME_SECTION_LABELS[section.type] ?? section.type,
    hidden: section.hidden === true,
    placeholder: has_placeholder_content(section),
    can_move_up: index > 0,
    can_move_down: index < total - 1,
    can_duplicate: section.type !== 'posts' && can_add_section(settings, section.type).allowed,
    removable: section.type !== 'posts',
    priority: section.id === priority_id,
  }))
  const posts_index = items.findIndex((item) => item.section.type === 'posts')
  if (posts_index === -1) return { items, before: items, posts: null, after: [] }
  return {
    items,
    before: items.slice(0, posts_index),
    posts: items[posts_index],
    after: items.slice(posts_index + 1),
  }
}

/** Insertion index of a new section: the clicked slot, except Hero, which always goes to the top. */
export function add_section_index(type: AddableHomeSectionType, slot: number): number {
  return type === 'hero' ? 0 : slot
}

export interface AddOptionState {
  disabled: boolean
  /** Counter or limit text shown next to the option. */
  status: string
}

export function add_option_state(settings: Pick<SettingsData, 'home'>, type: AddableHomeSectionType): AddOptionState {
  const { allowed, count, max } = can_add_section(settings, type)
  if (allowed) return { disabled: false, status: `${count}/${max}` }
  if (count >= max) return { disabled: true, status: `Limit reached (${count}/${max})` }
  const total = home_sections_of(settings).length
  return { disabled: true, status: `Section limit reached (${total}/${HOME_MAX_SECTIONS})` }
}

/** Swap op for a drag of `source_sortable_id` dropped on `target_zone_id`; null when it is no home section drop. */
export function home_swap_op(
  source_sortable_id: string,
  target_zone_id: string
): ((current: SettingsData) => Partial<SettingsData> | null) | null {
  const source = parse_home_sortable_id(source_sortable_id)
  const target = parse_home_zone_id(target_zone_id)
  if (!source || !target || source === target) return null
  return (current) => swap_home_sections(current, source, target)
}

/** Section that takes focus after `id` is deleted: the next one, else the previous one. */
export function neighbor_after_delete(sections: readonly HomeSection[], id: string): string | null {
  const index = sections.findIndex((section) => section.id === id)
  if (index === -1) return null
  return sections[index + 1]?.id ?? sections[index - 1]?.id ?? null
}
