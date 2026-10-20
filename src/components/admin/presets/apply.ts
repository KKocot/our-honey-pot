// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import {
  HOME_MAX_SECTIONS,
  strip_irrelevant_fields,
  type HomeSection,
  type HomeSectionType,
  type SettingsData,
} from '../types/settings'
import { adapt_layout_for_mode } from '../types/templates'
import { create_posts_section } from '../types/settings-schema'
import { generate_section_id, home_sections_of, type RandomSource } from '../canvas/home-section-ops'
import { get_section_definition } from '../../../shared/components/sections/registry'
import { is_record, type AnySectionDefinition } from '../../../shared/components/sections/registry-types'
import type { BlogPreset } from './catalog'
import { DEFAULT_PRESET_SECTIONS_MODE, type PresetHome, type PresetSectionsMode } from './keys'

export type PresetApplyScope = 'full' | 'layout' | 'style'

/** Minimal shape shared by catalog presets and user presets. */
export interface PresetParts {
  name: string
  layout: Partial<SettingsData>
  community_layout?: Partial<SettingsData>
  style: Partial<SettingsData>
  /** Home sections of the preset; user presets never carry them. */
  home?: PresetHome
}

export interface PresetApplyOptions {
  /** Default `append-missing`; `replace` needs a confirmation when `preset_sections_need_confirmation` says so. */
  sections_mode?: PresetSectionsMode
  random?: RandomSource
}

export interface PresetApplyResult {
  patch: Partial<SettingsData>
  /** History step label and toast title. */
  undo_label: string
  /** Size overrides dropped by this apply; 0 for style only (brief 3.2). */
  reset_overrides_count: number
  /** Home sections the preset added (placeholder content until the owner fills them in). */
  added_sections_count: number
  /** Owner sections dropped by `replace`; `posts` is always kept. */
  removed_sections_count: number
}

interface SectionSpec {
  type: HomeSectionType
  content?: Record<string, unknown>
  style?: Record<string, unknown>
}

const SPEC_KEYS: ReadonlySet<string> = new Set(['type', 'content', 'style'])

function definition_of(type: unknown): AnySectionDefinition | undefined {
  return get_section_definition(type)
}

function spec_of(entry: unknown): SectionSpec | null {
  if (typeof entry === 'string') return definition_of(entry) ? { type: entry as HomeSectionType } : null
  if (!is_record(entry) || !definition_of(entry.type)) return null
  if (Object.keys(entry).some((key) => !SPEC_KEYS.has(key))) return null
  const { content, style } = entry
  if ((content !== undefined && !is_record(content)) || (style !== undefined && !is_record(style))) return null
  return { type: entry.type as HomeSectionType, content, style }
}

/** Registered specs within HOME_MAX_SECTIONS and each type's max_per_page; anything else is dropped. */
function preset_section_specs(home: unknown): SectionSpec[] {
  if (!is_record(home) || !Array.isArray(home.sections)) return []
  const specs: SectionSpec[] = []
  const counts = new Map<string, number>()
  for (const entry of home.sections) {
    if (specs.length >= HOME_MAX_SECTIONS) break
    const spec = spec_of(entry)
    const definition = spec && definition_of(spec.type)
    if (!spec || !definition) continue
    const count = counts.get(spec.type) ?? 0
    if (count >= definition.max_per_page) continue
    counts.set(spec.type, count + 1)
    specs.push(spec)
  }
  return specs
}

/** Exactly `{ sections }` with every entry a valid spec within the limits (guard for catalog presets). */
export function is_preset_home(value: unknown): value is PresetHome {
  if (!is_record(value) || !Array.isArray(value.sections)) return false
  if (Object.keys(value).some((key) => key !== 'sections')) return false
  return preset_section_specs(value).length === value.sections.length
}

function copy_section(section: HomeSection): HomeSection {
  // JSON round-trip instead of structuredClone: Solid store proxies are not structured-cloneable.
  return JSON.parse(JSON.stringify(section)) as HomeSection
}

function build_section(spec: SectionSpec, id: string): HomeSection {
  const defaults = (definition_of(spec.type) as AnySectionDefinition).defaults()
  return {
    id,
    type: spec.type,
    content: { ...defaults.content, ...structuredClone(spec.content) },
    style: { ...defaults.style, ...structuredClone(spec.style) },
  } as HomeSection
}

function taken_ids(sections: readonly HomeSection[]): Set<string> {
  return new Set(sections.map((section) => section.id))
}

interface SectionsOutcome {
  sections: HomeSection[]
  added: number
  removed: number
}

/** Types the owner has are kept as they are; a missing type lands after the preset's previous type found on the page. */
function append_missing(current: readonly HomeSection[], specs: SectionSpec[], random?: RandomSource): SectionsOutcome {
  const sections = current.map(copy_section)
  const owned = new Set<string>(current.map((section) => section.type))
  let cursor = 0
  let added = 0
  for (const spec of specs) {
    if (owned.has(spec.type)) {
      cursor = Math.max(cursor, sections.findIndex((section) => section.type === spec.type) + 1)
      continue
    }
    if (definition_of(spec.type)?.fixed || sections.length >= HOME_MAX_SECTIONS) continue
    sections.splice(cursor, 0, build_section(spec, generate_section_id(taken_ids(sections), random)))
    cursor += 1
    added += 1
  }
  return { sections, added, removed: 0 }
}

/** The preset's sections; the owner's `posts` section (id, title, style) sits where the preset puts `posts`, else last. */
function replace_sections(
  current: readonly HomeSection[],
  specs: SectionSpec[],
  random?: RandomSource
): SectionsOutcome {
  const posts = copy_section(current.find((section) => section.type === 'posts') ?? create_posts_section())
  const sections: HomeSection[] = []
  let posts_placed = false
  for (const spec of specs) {
    if (spec.type === 'posts') {
      sections.push(posts)
      posts_placed = true
      continue
    }
    if (definition_of(spec.type)?.fixed) continue
    if (sections.length + (posts_placed ? 0 : 1) >= HOME_MAX_SECTIONS) continue
    const taken = taken_ids(sections).add(posts.id)
    sections.push(build_section(spec, generate_section_id(taken, random)))
  }
  if (!posts_placed) sections.push(posts)
  const added = sections.length - 1
  const removed = current.filter((section) => section.type !== 'posts').length
  return { sections, added, removed }
}

function sections_outcome(
  parts: PresetParts,
  current: SettingsData,
  mode: PresetSectionsMode,
  random?: RandomSource
): SectionsOutcome | null {
  const specs = preset_section_specs(parts.home)
  if (mode === 'skip' || specs.length === 0) return null
  const sections = home_sections_of(current)
  const outcome =
    mode === 'replace' ? replace_sections(sections, specs, random) : append_missing(sections, specs, random)
  return mode === 'append-missing' && outcome.added === 0 ? null : outcome
}

function deep_equal(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => deep_equal(item, b[i]))
  }
  if (!is_record(a) || !is_record(b)) return false
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && deep_equal(a[key], b[key]))
  )
}

/** Content still exactly as a new section of its type starts (style changes alone are not the owner's text). */
function is_untouched_placeholder(section: HomeSection): boolean {
  const definition = definition_of(section.type)
  return definition !== undefined && deep_equal(section.content, definition.defaults().content)
}

/**
 * Whether `replace` would drop the owner's own content: false when the preset has no sections or every
 * section besides `posts` is an untouched placeholder, so the UI may replace without asking.
 */
export function preset_sections_need_confirmation(
  settings: Pick<SettingsData, 'home'>,
  preset: Pick<PresetParts, 'home'>
): boolean {
  if (preset_section_specs(preset.home).length === 0) return false
  return home_sections_of(settings).some((section) => section.type !== 'posts' && !is_untouched_placeholder(section))
}

function count_overrides(settings: SettingsData): number {
  return Object.keys(settings.instanceOverrides ?? {}).length
}

function layout_for_mode(parts: PresetParts, is_community: boolean): Partial<SettingsData> {
  const layout = structuredClone({ ...parts.layout, ...(is_community ? parts.community_layout : undefined) })
  return adapt_layout_for_mode(layout, is_community)
}

function apply_label(name: string, scope: PresetApplyScope): string {
  if (scope === 'layout') return `Apply "${name}" layout`
  if (scope === 'style') return `Apply "${name}" style`
  return `Apply "${name}"`
}

/**
 * Layout scopes replace every instanceOverride: the preset defines sizes and old `section:element` keys rarely survive.
 * Home sections are page structure, so they follow the layout scopes; style only never touches them.
 */
export function apply_preset_parts(
  parts: PresetParts,
  current: SettingsData,
  scope: PresetApplyScope,
  is_community: boolean,
  options: PresetApplyOptions = {}
): PresetApplyResult {
  const patch: Partial<SettingsData> = {}
  const touches_layout = scope !== 'style'
  let outcome: SectionsOutcome | null = null
  if (touches_layout) {
    Object.assign(patch, layout_for_mode(parts, is_community))
    patch.instanceOverrides = {}
    outcome = sections_outcome(parts, current, options.sections_mode ?? DEFAULT_PRESET_SECTIONS_MODE, options.random)
  }
  if (scope !== 'layout') Object.assign(patch, structuredClone(parts.style))
  if (outcome) patch.home = { sections: outcome.sections }
  return {
    patch: strip_irrelevant_fields(patch, is_community),
    undo_label: apply_label(parts.name, scope),
    reset_overrides_count: touches_layout ? count_overrides(current) : 0,
    added_sections_count: outcome?.added ?? 0,
    removed_sections_count: outcome?.removed ?? 0,
  }
}

export function apply_blog_preset(
  preset: BlogPreset,
  current: SettingsData,
  scope: PresetApplyScope,
  is_community: boolean,
  options?: PresetApplyOptions
): PresetApplyResult {
  return apply_preset_parts(preset, current, scope, is_community, options)
}
