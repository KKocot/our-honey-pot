// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Shape validators for the structured settings fields the editor canvas and SSR render read directly.
// Shared by the design file import (config-io) and the config read from Hive (settings-schema).

import {
  migrateCardLayout,
  migrateCardSection,
  type CardLayout,
  type CardSection,
  type CardSectionChild,
  type LayoutSection,
  type PageLayout,
  type PageLayoutSection,
} from './layout'
import type { NavigationTab } from './navigation'
import type { ThemeColors } from './theme'
import { THEME_TOKENS } from '../palette'
import { is_hex_color } from '../../../shared/utils/color'

export const MAX_STRUCTURE_ITEMS = 64
export const MAX_CARD_LAYOUT_DEPTH = 6
export const MAX_CARD_LAYOUT_NODES = 256
export const MAX_ID_LENGTH = 64
export const MAX_TEXT_LENGTH = 200

const ORIENTATIONS: ReadonlyArray<string> = ['horizontal', 'vertical']
const SLOTS: ReadonlyArray<string> = ['top', 'sidebar-left', 'main', 'sidebar-right', 'bottom']

export const CARD_LAYOUT_KEYS = Object.freeze(['postCardLayout', 'commentCardLayout', 'authorProfileLayout2'] as const)

const CARD_LAYOUT_KEY_SET: ReadonlySet<string> = new Set(CARD_LAYOUT_KEYS)

export type Shaped<T> = { ok: true; value: T } | { ok: false }
const INVALID = { ok: false } as const

function is_plain_object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function is_id(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
}

function is_text(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TEXT_LENGTH
}

function is_bounded_array(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length <= MAX_STRUCTURE_ITEMS
}

function is_enum(value: unknown, allowed: ReadonlyArray<string>): value is string {
  return typeof value === 'string' && allowed.includes(value)
}

// Accepts the current recursive format and the legacy `elements: string[]` one; migrateCardLayout normalizes both.
function parse_card_section(raw: unknown, depth: number, budget: { nodes: number }): CardSection | null {
  budget.nodes += 1
  if (depth > MAX_CARD_LAYOUT_DEPTH || budget.nodes > MAX_CARD_LAYOUT_NODES) return null
  if (!is_plain_object(raw) || !is_id(raw.id) || !is_enum(raw.orientation, ORIENTATIONS)) return null
  const orientation = raw.orientation as CardSection['orientation']
  if (raw.children === undefined) {
    if (!is_bounded_array(raw.elements) || !raw.elements.every(is_id)) return null
    budget.nodes += raw.elements.length
    if (budget.nodes > MAX_CARD_LAYOUT_NODES) return null
    return migrateCardSection({ id: raw.id, orientation, elements: [...raw.elements] })
  }
  if (!is_bounded_array(raw.children)) return null
  const children: CardSectionChild[] = []
  for (const child of raw.children) {
    budget.nodes += 1
    if (budget.nodes > MAX_CARD_LAYOUT_NODES || !is_plain_object(child)) return null
    if (child.type === 'element' && is_id(child.id)) {
      children.push({ type: 'element', id: child.id })
      continue
    }
    if (child.type !== 'section') return null
    const section = parse_card_section(child.section, depth + 1, budget)
    if (section === null) return null
    children.push({ type: 'section', section })
  }
  return { id: raw.id, orientation, children }
}

export function parse_card_layout(raw: unknown): Shaped<CardLayout> {
  if (!is_plain_object(raw) || !is_bounded_array(raw.sections)) return INVALID
  const budget = { nodes: 0 }
  const sections: CardSection[] = []
  for (const item of raw.sections) {
    const section = parse_card_section(item, 1, budget)
    if (section === null) return INVALID
    sections.push(section)
  }
  const migrated = migrateCardLayout({ sections })
  return migrated === null ? INVALID : { ok: true, value: migrated }
}

export function parse_page_layout(raw: unknown): Shaped<PageLayout> {
  if (!is_plain_object(raw) || !is_bounded_array(raw.sections)) return INVALID
  const sections: PageLayoutSection[] = []
  for (const item of raw.sections) {
    if (
      !is_plain_object(item) ||
      !is_id(item.id) ||
      !is_enum(item.slot, SLOTS) ||
      !is_enum(item.orientation, ORIENTATIONS) ||
      typeof item.active !== 'boolean' ||
      !is_bounded_array(item.elements) ||
      !item.elements.every(is_id)
    ) {
      return INVALID
    }
    sections.push({
      id: item.id,
      slot: item.slot as PageLayoutSection['slot'],
      orientation: item.orientation as PageLayoutSection['orientation'],
      elements: [...item.elements],
      active: item.active,
    })
  }
  return { ok: true, value: { sections } }
}

export function parse_layout_sections(raw: unknown): Shaped<LayoutSection[]> {
  if (!is_bounded_array(raw)) return INVALID
  const sections: LayoutSection[] = []
  for (const item of raw) {
    if (
      !is_plain_object(item) ||
      !is_id(item.id) ||
      !is_enum(item.position, SLOTS) ||
      typeof item.enabled !== 'boolean'
    ) {
      return INVALID
    }
    sections.push({ id: item.id, position: item.position as LayoutSection['position'], enabled: item.enabled })
  }
  return { ok: true, value: sections }
}

export function parse_navigation_tabs(raw: unknown): Shaped<NavigationTab[]> {
  if (!is_bounded_array(raw)) return INVALID
  const tabs: NavigationTab[] = []
  for (const item of raw) {
    if (
      !is_plain_object(item) ||
      !is_id(item.id) ||
      !is_text(item.label) ||
      typeof item.enabled !== 'boolean' ||
      typeof item.showCount !== 'boolean' ||
      (item.tag !== undefined && !is_text(item.tag)) ||
      (item.tooltip !== undefined && !is_text(item.tooltip))
    ) {
      return INVALID
    }
    const tab: NavigationTab = { id: item.id, label: item.label, enabled: item.enabled, showCount: item.showCount }
    if (item.tag !== undefined) tab.tag = item.tag as string
    if (item.tooltip !== undefined) tab.tooltip = item.tooltip as string
    tabs.push(tab)
  }
  return { ok: true, value: tabs }
}

/** Complete hex palette or null; customColors land in CSS custom properties, so partial or non-hex palettes are rejected whole. */
export function parse_custom_colors(raw: unknown): Shaped<ThemeColors | null> {
  if (raw === null) return { ok: true, value: null }
  if (!is_plain_object(raw)) return INVALID
  const colors: Partial<ThemeColors> = {}
  for (const token of THEME_TOKENS) {
    const value = Object.hasOwn(raw, token) ? raw[token] : undefined
    if (!is_hex_color(value)) return INVALID
    colors[token] = value
  }
  return { ok: true, value: colors as ThemeColors }
}

export function is_custom_colors(value: unknown): value is ThemeColors | null {
  return parse_custom_colors(value).ok
}

/** Shape check for a structured field; `null` when `key` is not a structured settings field. */
export function parse_structured_setting(key: string, raw: unknown): Shaped<unknown> | null {
  if (CARD_LAYOUT_KEY_SET.has(key)) return parse_card_layout(raw)
  if (key === 'pageLayout') return parse_page_layout(raw)
  if (key === 'layoutSections') return parse_layout_sections(raw)
  if (key === 'navigationTabs') return parse_navigation_tabs(raw)
  if (key === 'customColors') return parse_custom_colors(raw)
  return null
}
