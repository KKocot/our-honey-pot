// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Home sections placed in layout containers (`placement`): each op returns one settings patch, so the caller commits
// it as a single undo step (ADR 6ac6089d63221e857a3bac13). `null` means the op was rejected; inputs are never mutated.

import type { ContainerName, PageLayoutConfig } from '../types/layout'
import type { HomeSection, SettingsData } from '../types/settings'
import { is_placement_allowed } from '../../../shared/components/sections/registry'
import type { SectionPlacement } from '../../../shared/components/sections/registry-types'
import { add_home_section, home_sections_of, type AddableHomeSectionType, type RandomSource } from './home-section-ops'
import { template_showing } from './layout-ops'

type ContainerSource = Pick<SettingsData, 'home' | 'pageLayoutConfig'>
type ContainerPatch = Partial<SettingsData> | null

/**
 * Target of a placement move; `main` drops the placement. Sections with an equal index render in `home.sections`
 * order, so `before` / `after` (a section id of that slot) moves the section next to it in that list.
 */
export interface PlacementTarget {
  container: ContainerName | 'main'
  index: number
  before?: string
  after?: string
}

function layout_of(settings: ContainerSource): PageLayoutConfig | null {
  const config = settings.pageLayoutConfig
  return config?.containers ? config : null
}

/** Number of layout elements stored in `container`: a placement index equal to it puts the section at the end. */
export function container_element_count(config: PageLayoutConfig, container: ContainerName): number {
  return config.containers[container]?.elements.length ?? 0
}

function clamp_index(index: number, length: number): number {
  if (!Number.isInteger(index)) return length
  return Math.min(Math.max(index, 0), length)
}

/** Layout patch showing the sidebar of `container` when the template hides it; null when nothing changes. */
function showing_patch(
  config: PageLayoutConfig,
  container: ContainerName
): Pick<SettingsData, 'pageLayoutConfig'> | null {
  const template = template_showing(config.template, container)
  if (template === config.template) return null
  // JSON round-trip instead of structuredClone: Solid store proxies are not structured-cloneable.
  const copy = JSON.parse(JSON.stringify(config)) as PageLayoutConfig
  return { pageLayoutConfig: { ...copy, template } }
}

/**
 * New section of `type` with placeholder content first in `container`, before its elements and placed sections; a
 * sidebar hidden by the template is shown in the same patch. Rejected without a layout, for a type not allowed there
 * and when the page limits are reached.
 */
export function add_section_to_container(
  settings: ContainerSource,
  container: ContainerName,
  type: AddableHomeSectionType,
  random?: RandomSource
): ContainerPatch {
  const config = layout_of(settings)
  if (!config || !is_placement_allowed(type, container)) return null
  const current = home_sections_of(settings)
  // Equal indexes render in home.sections order, so the new section goes before every section of this container.
  const first_in_container = current.findIndex((section) => section.placement?.container === container)
  const index = first_in_container === -1 ? current.length : first_in_container
  const sections = add_home_section(settings, type, { random, index })?.home?.sections
  if (!sections) return null
  const placement: SectionPlacement = { container, index: 0 }
  const placed = [...sections]
  placed[index] = { ...placed[index], placement } as HomeSection
  return { home: { sections: placed }, ...showing_patch(config, container) }
}

/** `sections` with the one at `index` moved right before / after the anchor of `to`; unchanged without a valid anchor. */
function reorder_for_tie(sections: HomeSection[], index: number, to: PlacementTarget): HomeSection[] {
  const anchor_id = to.before ?? to.after
  const moved = sections[index]
  if (anchor_id === undefined || anchor_id === moved.id) return sections
  const rest = sections.filter((_, position) => position !== index)
  const anchor = rest.findIndex((section) => section.id === anchor_id)
  if (anchor === -1) return sections
  rest.splice(to.before !== undefined ? anchor : anchor + 1, 0, moved)
  return rest
}

const same_order = (a: readonly HomeSection[], b: readonly HomeSection[]) =>
  a.every((section, position) => section.id === b[position]?.id)

/**
 * Section `id` moved to `to` (index clamped to the container's element count, ties broken by `before` / `after`);
 * a hidden target sidebar is shown in the same patch. Rejected for unknown ids, a container the type may not sit in,
 * without a layout and for a no-op.
 */
export function move_section_placement(settings: ContainerSource, id: string, to: PlacementTarget): ContainerPatch {
  const current = home_sections_of(settings)
  const index = current.findIndex((section) => section.id === id)
  if (index === -1) return null
  const section = current[index]
  if (!is_placement_allowed(section.type, to.container)) return null

  if (to.container === 'main') {
    if (section.placement === undefined) return null
    const { placement: _placement, ...in_main } = section
    const sections = [...current]
    sections[index] = in_main as HomeSection
    return { home: { sections } }
  }

  const config = layout_of(settings)
  if (!config) return null
  const placement: SectionPlacement = {
    container: to.container,
    index: clamp_index(to.index, container_element_count(config, to.container)),
  }
  const ordered = reorder_for_tie([...current], index, to)
  const unchanged = section.placement?.container === placement.container && section.placement.index === placement.index
  if (unchanged && same_order(ordered, current)) return null
  const sections = ordered.map((entry) => (entry.id === id ? ({ ...section, placement } as HomeSection) : entry))
  return { home: { sections }, ...showing_patch(config, to.container) }
}
