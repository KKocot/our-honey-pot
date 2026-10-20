// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Pure operations on `home.sections` for the admin canvas, independent of dnd-kit (ADR 6ac6089e63221e857a3bac14).
// Inputs are never mutated (they may be Solid store proxies); `null` means the operation was rejected.

import {
  HOME_MAX_SECTIONS,
  HOME_SECTION_ID_REGEX,
  type HomeSection,
  type HomeSectionType,
  type SettingsData,
} from '../types/settings'
import { create_posts_section } from '../types/settings-schema'
import { get_section_definition } from '../../../shared/components/sections/registry'
import {
  is_record,
  placeholder_paths,
  unfilled_paths,
  type AnySectionDefinition,
  type FieldDescriptor,
} from '../../../shared/components/sections/registry-types'

type HomeSource = Pick<SettingsData, 'home'>
type HomePatch = Partial<SettingsData> | null
type SectionOfType<T extends HomeSectionType> = Extract<HomeSection, { type: T }>

/** Uniform [0, 1) source; injectable so tests get deterministic ids. */
export type RandomSource = () => number

/** Section types the owner can add; `posts` exists exactly once and is never added. */
export type AddableHomeSectionType = Exclude<HomeSectionType, 'posts'>

export interface HomeSectionPatch<T extends HomeSectionType> {
  content?: Partial<SectionOfType<T>['content']>
  style?: Partial<SectionOfType<T>['style']>
}

export interface SectionAvailability {
  allowed: boolean
  count: number
  max: number
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const ID_LENGTH = 8
const RANDOM_ID_ATTEMPTS = 32

/** Popover key of a home section; `home-section` is no layout section id, so it cannot clash with `section_id[:element]`. */
export function home_section_popover_key(id: string): string {
  return `home-section:${id}`
}

/** Sections as rendered: the stored list, or the virtual single `posts` section when `home` is absent. */
export function home_sections_of(settings: HomeSource): readonly HomeSection[] {
  return settings.home?.sections ?? [create_posts_section()]
}

function random_id(random: RandomSource): string {
  let id = ''
  for (let position = 0; position < ID_LENGTH; position += 1) {
    const index = Math.floor(random() * ID_ALPHABET.length)
    id += ID_ALPHABET[Math.min(Math.max(index, 0), ID_ALPHABET.length - 1)]
  }
  return id
}

/** New id matching ^[a-z0-9]{8}$ (no hyphen, so never `page-sec-*`) and unused in `taken_ids`. */
export function generate_section_id(taken_ids: ReadonlySet<string>, random: RandomSource = Math.random): string {
  for (let attempt = 0; attempt < RANDOM_ID_ATTEMPTS; attempt += 1) {
    const id = random_id(random)
    if (HOME_SECTION_ID_REGEX.test(id) && !taken_ids.has(id)) return id
  }
  // A degenerate random source (constant, NaN) must not loop forever; at most 8 sections are taken.
  let counter = 0
  let id = `sec${String(counter).padStart(5, '0')}`
  while (taken_ids.has(id)) {
    counter += 1
    id = `sec${String(counter).padStart(5, '0')}`
  }
  return id
}

function count_of_type(sections: readonly HomeSection[], type: HomeSectionType): number {
  return sections.filter((section) => section.type === type).length
}

/** Whether another section of `type` fits the per-type and total limits (drives the Add section menu). */
export function can_add_section(settings: HomeSource, type: HomeSectionType): SectionAvailability {
  const definition: AnySectionDefinition = get_section_definition(type)
  const sections = home_sections_of(settings)
  const count = count_of_type(sections, type)
  const max = definition.max_per_page
  const allowed = !definition.fixed && count < max && sections.length < HOME_MAX_SECTIONS
  return { allowed, count, max }
}

function create_section(type: AddableHomeSectionType, id: string): HomeSection {
  const definition: AnySectionDefinition = get_section_definition(type)
  return { id, type, ...definition.defaults() } as HomeSection
}

/**
 * Who a field belongs to, which decides how an issue names it ("add a headline", "add a button link",
 * "replace the placeholder label in item 2"); `item` is an entry of a list without `item_labels`.
 */
type IssueOwner =
  | { kind: 'section' }
  | { kind: 'group'; name: string }
  | { kind: 'entry'; name: string }
  | { kind: 'item'; position: number }

interface IssueWalk {
  definition: AnySectionDefinition
  issues: string[]
  visited: Set<string>
  missing_groups: string[]
  placeholders: ReadonlySet<string>
}

function issue_noun(label: string): string {
  return /^[A-Z0-9]+$/.test(label) ? label : label.toLowerCase()
}

function with_article(phrase: string): string {
  return `${/^[aeio]/.test(phrase) ? 'an' : 'a'} ${phrase}`
}

function is_filled(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  if (is_record(value)) return !Object.hasOwn(value, 'url') || is_filled(value.url)
  return value !== undefined && value !== null
}

function placeholder_issue(field: FieldDescriptor, owner: IssueOwner): string {
  const name = issue_noun(field.label)
  if (owner.kind === 'group') return `replace the placeholder ${owner.name} ${name}`
  if (owner.kind === 'entry') return `replace the placeholder ${name} of the ${owner.name}`
  if (owner.kind === 'item') return `replace the placeholder ${name} in item ${owner.position}`
  return `replace the placeholder ${name}`
}

function missing_issue(field: FieldDescriptor, owner: IssueOwner): string {
  const name = issue_noun(field.label)
  if (owner.kind === 'group') return `add ${with_article(`${owner.name} ${field.kind === 'url' ? 'link' : name}`)}`
  if (owner.kind === 'entry') return `add ${with_article(name)} to the ${owner.name}`
  if (owner.kind === 'item') return `add ${with_article(name)} to item ${owner.position}`
  return `add ${with_article(name)}`
}

function requires_value(walk: IssueWalk, field: FieldDescriptor, path: string): boolean {
  return field.required === true || walk.definition.must_fill.includes(path)
}

function collect_field_issues(
  walk: IssueWalk,
  fields: readonly FieldDescriptor[],
  content: unknown,
  prefix: string,
  owner: IssueOwner
): void {
  for (const field of fields) {
    const path = prefix === '' ? field.key : `${prefix}.${field.key}`
    const value = is_record(content) ? content[field.key] : undefined
    walk.visited.add(path)
    if (field.kind === 'group') {
      if (is_record(value)) {
        const name = issue_noun(field.label)
        const group_owner: IssueOwner = field.required ? { kind: 'group', name } : { kind: 'entry', name }
        collect_field_issues(walk, field.fields, value, path, group_owner)
      } else if (requires_value(walk, field, path)) {
        walk.missing_groups.push(path)
        walk.issues.push(missing_issue(field, owner))
      }
      continue
    }
    if (field.kind === 'list') {
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          const label = field.item_labels?.[index]
          const item_owner: IssueOwner =
            label === undefined ? { kind: 'item', position: index + 1 } : { kind: 'entry', name: issue_noun(label) }
          collect_field_issues(walk, field.item_fields, item, `${path}.${index}`, item_owner)
        })
      } else if (requires_value(walk, field, path)) {
        walk.issues.push(missing_issue(field, owner))
      }
      continue
    }
    if (walk.placeholders.has(path)) walk.issues.push(placeholder_issue(field, owner))
    else if (requires_value(walk, field, path) && !is_filled(value)) walk.issues.push(missing_issue(field, owner))
  }
}

/**
 * Content problems that block Save, generated from the registry definition: a field still holding its
 * `placeholder` text ("replace the placeholder headline"), an empty `required` field or `must_fill` path
 * ("add a headline", "add a button link"), an added optional button left incomplete ("add a URL to the button")
 * and an example list entry ("replace the placeholder label in item 2").
 * [] = the section can be saved; the one source for save errors and the canvas "fill in" chrome.
 */
export function home_section_issues(section: HomeSection): string[] {
  return section_content_issues(get_section_definition(section.type), section.content)
}

/** `home_section_issues` for any definition, registered or not. */
export function section_content_issues(definition: AnySectionDefinition, content: unknown): string[] {
  const placeholders = new Set(placeholder_paths(definition, content))
  const walk: IssueWalk = { definition, issues: [], visited: new Set(), missing_groups: [], placeholders }
  collect_field_issues(walk, definition.fields, content, '', { kind: 'section' })
  // Placeholder or must_fill paths without a field descriptor still block Save, named by their path.
  for (const path of unfilled_paths(definition, content)) {
    if (walk.visited.has(path) || walk.missing_groups.some((group) => path.startsWith(`${group}.`))) continue
    walk.issues.push(placeholders.has(path) ? `replace the placeholder ${path}` : `add ${path}`)
  }
  return walk.issues
}

/** Sections that block Save (`home_section_issues` not empty). */
export function count_placeholder_sections(home: SettingsData['home']): number {
  return (home?.sections ?? []).filter((section) => home_section_issues(section).length > 0).length
}

function to_patch(sections: HomeSection[]): Partial<SettingsData> {
  return { home: { sections } }
}

function index_of(sections: readonly HomeSection[], id: string): number {
  return sections.findIndex((section) => section.id === id)
}

function clamp_index(index: number, length: number): number {
  if (!Number.isInteger(index)) return length
  return Math.min(Math.max(index, 0), length)
}

function taken_ids_of(sections: readonly HomeSection[]): Set<string> {
  return new Set(sections.map((section) => section.id))
}

/** New section with placeholder content at `index` (default: end of the stack). */
export function add_home_section(
  settings: HomeSource,
  type: AddableHomeSectionType,
  options: { index?: number; random?: RandomSource } = {}
): HomePatch {
  if (!can_add_section(settings, type).allowed) return null
  const sections = [...home_sections_of(settings)]
  const id = generate_section_id(taken_ids_of(sections), options.random)
  sections.splice(clamp_index(options.index ?? sections.length, sections.length), 0, create_section(type, id))
  return to_patch(sections)
}

/** Rejected for the `posts` section and unknown ids. */
export function remove_home_section(settings: HomeSource, id: string): HomePatch {
  const sections = [...home_sections_of(settings)]
  const index = index_of(sections, id)
  if (index === -1 || sections[index].type === 'posts') return null
  sections.splice(index, 1)
  return to_patch(sections)
}

/** `to` is the position after the section is removed; out-of-range `to` is clamped, a no-op move is rejected. */
export function move_home_section(settings: HomeSource, from: number, to: number): HomePatch {
  const sections = [...home_sections_of(settings)]
  if (!Number.isInteger(from) || from < 0 || from >= sections.length) return null
  const [moved] = sections.splice(from, 1)
  const target = clamp_index(to, sections.length)
  if (target === from) return null
  sections.splice(target, 0, moved)
  return to_patch(sections)
}

export function move_home_section_up(settings: HomeSource, id: string): HomePatch {
  const index = index_of(home_sections_of(settings), id)
  return index > 0 ? move_home_section(settings, index, index - 1) : null
}

export function move_home_section_down(settings: HomeSource, id: string): HomePatch {
  const sections = home_sections_of(settings)
  const index = index_of(sections, id)
  return index !== -1 && index < sections.length - 1 ? move_home_section(settings, index, index + 1) : null
}

export function swap_home_sections(settings: HomeSource, first_id: string, second_id: string): HomePatch {
  if (first_id === second_id) return null
  const sections = [...home_sections_of(settings)]
  const first = index_of(sections, first_id)
  const second = index_of(sections, second_id)
  if (first === -1 || second === -1) return null
  ;[sections[first], sections[second]] = [sections[second], sections[first]]
  return to_patch(sections)
}

/** Copy with a new id right after the original; rejected for `posts` and when the type or total limit is reached. */
export function duplicate_home_section(settings: HomeSource, id: string, random?: RandomSource): HomePatch {
  const sections = [...home_sections_of(settings)]
  const index = index_of(sections, id)
  if (index === -1) return null
  const original = sections[index]
  if (!can_add_section(settings, original.type).allowed) return null
  // JSON round-trip instead of structuredClone: Solid store proxies are not structured-cloneable.
  const copy = JSON.parse(JSON.stringify(original)) as HomeSection
  copy.id = generate_section_id(taken_ids_of(sections), random)
  sections.splice(index + 1, 0, copy)
  return to_patch(sections)
}

/** Hide/Show; a visible section drops the `hidden` key instead of storing `false` (config bytes). */
export function toggle_home_section_hidden(settings: HomeSource, id: string): HomePatch {
  const sections = [...home_sections_of(settings)]
  const index = index_of(sections, id)
  if (index === -1) return null
  const { hidden, ...visible } = sections[index]
  sections[index] = hidden ? visible : { ...visible, hidden: true }
  return to_patch(sections)
}

function merge_fields<T extends object>(current: T, patch: Partial<T> | undefined): T {
  if (!patch) return current
  const merged: Record<string, unknown> = { ...current, ...patch }
  for (const key of Object.keys(patch)) {
    if (merged[key] === undefined) delete merged[key]
  }
  return merged as T
}

/** Shallow merge of content/style; `undefined` clears an optional field. Rejected when `type` does not match the section. */
export function update_home_section<T extends HomeSectionType>(
  settings: HomeSource,
  id: string,
  type: T,
  patch: HomeSectionPatch<T>
): HomePatch {
  const sections = [...home_sections_of(settings)]
  const index = index_of(sections, id)
  if (index === -1 || sections[index].type !== type) return null
  const section = sections[index] as SectionOfType<T>
  sections[index] = {
    ...section,
    content: merge_fields(section.content, patch.content),
    style: merge_fields(section.style, patch.style),
  } as HomeSection
  return to_patch(sections)
}
