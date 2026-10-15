// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Pure model of the home section stack on the /admin canvas; the Solid components only wire it to the DOM.

import { home_priority_section_id, render_section_html } from '../../../../shared/components/sections'
import type { SectionRenderSettings } from '../../../../shared/components/sections'
import { HOME_MAX_SECTIONS, type HomeSection, type HomeSectionType, type SettingsData } from '../../types/settings'
import {
  HOME_SECTION_PLACEHOLDERS,
  can_add_section,
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

export const HOME_SECTION_LABELS: Readonly<Record<HomeSectionType, string>> = Object.freeze({
  hero: 'Hero',
  'text-media': 'Text + media',
  'cta-band': 'Call to action',
  posts: 'Posts',
})

export interface AddSectionOption {
  type: AddableHomeSectionType
  label: string
  description: string
}

export const ADD_SECTION_OPTIONS: readonly AddSectionOption[] = Object.freeze([
  { type: 'hero', label: 'Hero', description: 'Headline, intro and call to action at the top.' },
  { type: 'text-media', label: 'Text + media', description: 'Text with an image, e.g. an about section.' },
  { type: 'cta-band', label: 'Call to action', description: 'Newsletter or signup band with one button.' },
])

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

/** Content still holds the placeholders of a new section (or an unlinked button), so the editor marks it unfilled. */
export function has_placeholder_content(section: HomeSection): boolean {
  switch (section.type) {
    case 'hero':
      return section.content.headline === HOME_SECTION_PLACEHOLDERS.hero_headline
    case 'text-media':
      return (
        section.content.title === HOME_SECTION_PLACEHOLDERS.text_media_title ||
        section.content.body_md === HOME_SECTION_PLACEHOLDERS.text_media_body
      )
    case 'cta-band':
      return (
        section.content.title === HOME_SECTION_PLACEHOLDERS.cta_band_title ||
        section.content.button?.label === HOME_SECTION_PLACEHOLDERS.cta_band_button ||
        !section.content.button?.url
      )
    default:
      return false
  }
}

const HERO_CTA_ISSUE_NAMES: readonly string[] = ['primary button', 'secondary link']

/** Content problems that block Save (spec 5.1): placeholders left from Add section and empty required fields. */
export function home_section_issues(section: HomeSection): string[] {
  const issues: string[] = []
  const filled = (value: unknown) => typeof value === 'string' && value.trim().length > 0
  switch (section.type) {
    case 'hero':
      if (!filled(section.content.headline)) issues.push('add a headline')
      else if (section.content.headline === HOME_SECTION_PLACEHOLDERS.hero_headline) issues.push('replace the placeholder headline')
      // An absent CTA is fine (0..2); an added one needs both fields or must be removed.
      ;(section.content.cta ?? []).forEach((cta, index) => {
        const name = HERO_CTA_ISSUE_NAMES[index] ?? 'button'
        if (!filled(cta.label)) issues.push(`add a label to the ${name}`)
        if (!filled(cta.url)) issues.push(`add a URL to the ${name}`)
      })
      break
    case 'text-media':
      if (section.content.title === HOME_SECTION_PLACEHOLDERS.text_media_title) issues.push('replace the placeholder title')
      if (section.content.body_md === HOME_SECTION_PLACEHOLDERS.text_media_body) issues.push('replace the placeholder text')
      if (section.content.cta) {
        if (!filled(section.content.cta.label)) issues.push('add a label to the button')
        if (!filled(section.content.cta.url)) issues.push('add a URL to the button')
      }
      break
    case 'cta-band':
      if (!filled(section.content.title)) issues.push('add a title')
      else if (section.content.title === HOME_SECTION_PLACEHOLDERS.cta_band_title) issues.push('replace the placeholder title')
      if (section.content.button?.label === HOME_SECTION_PLACEHOLDERS.cta_band_button) {
        issues.push('replace the placeholder button label')
      }
      if (!filled(section.content.button?.url)) issues.push('add a button link')
      break
  }
  return issues
}

export interface HomeSaveError {
  section_id: string
  message: string
}

/** One error per section that blocks Save, in stack order; hidden sections count too (they are saved). */
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

/**
 * Stack in render order, split around `posts` like the public page (HomeSections before and after the island);
 * without `posts` every section sits above the posts content, the same fallback as `split_home_sections`.
 */
export function build_home_stack(settings: Pick<SettingsData, 'home'>): HomeStack {
  const sections = home_sections_of(settings)
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
