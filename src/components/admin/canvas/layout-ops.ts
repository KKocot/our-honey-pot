// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Pure layout operations of the admin canvas: inputs are never mutated (they may be Solid store proxies or
// module-level defaults) and `null` means the operation was rejected, so callers keep the current state.

import {
  COMMUNITY_CONTAINER_ELEMENT_IDS,
  COMMUNITY_PAGE_ELEMENT_IDS,
  USER_CONTAINER_ELEMENT_IDS,
  USER_PAGE_ELEMENT_IDS,
  collectAllElementIds,
  type CardLayout,
  type CardSection,
  type CardSectionChild,
  type ContainerConfig,
  type ContainerElement,
  type ContainerName,
  type LayoutElementId,
  type LayoutTemplate,
  type PageLayoutConfig,
  hasLeftSidebar,
  hasRightSidebar,
} from '../types/layout'
import {
  INSTANCE_OVERRIDE_KEY_REGEX,
  MAX_INSTANCE_OVERRIDES,
  instance_key,
  instance_override_keys_for,
  is_instance_override_value,
  type InstanceOverrideKey,
  type InstanceOverrides,
} from '../types/settings'
import { move_instance_override } from '../../../lib/instance-overrides'

export interface PageLayoutState {
  pageLayoutConfig: PageLayoutConfig
  instanceOverrides: InstanceOverrides
}

export interface ContainerPosition {
  container: ContainerName
  index: number
}

export const CONTAINER_NAMES: ReadonlyArray<ContainerName> = ['top', 'sidebarLeft', 'sidebarRight', 'bottom']

/** Section id of each container as rendered by pageLayoutConfigToLegacy; instance override keys depend on it. */
export const CONTAINER_SECTION_IDS: Readonly<Record<ContainerName, string>> = Object.freeze({
  top: 'page-sec-top',
  sidebarLeft: 'page-sec-sidebar-left',
  sidebarRight: 'page-sec-sidebar-right',
  bottom: 'page-sec-bottom',
})

const CONTAINER_ELEMENT_IDS: ReadonlySet<string> = new Set([
  ...USER_CONTAINER_ELEMENT_IDS,
  ...COMMUNITY_CONTAINER_ELEMENT_IDS,
])

/** Element can be placed in a container in this mode (navigation and posts stay fixed in the main section). */
export function is_container_element_allowed(element_id: string, is_community: boolean): element_id is LayoutElementId {
  const mode_ids = is_community ? COMMUNITY_PAGE_ELEMENT_IDS : USER_PAGE_ELEMENT_IDS
  return mode_ids.has(element_id) && CONTAINER_ELEMENT_IDS.has(element_id)
}

function copy_container(container: ContainerConfig | undefined): ContainerConfig {
  return { elements: (container?.elements ?? []).map((element) => ({ ...element })) }
}

function copy_state(state: PageLayoutState): PageLayoutState {
  const containers = state.pageLayoutConfig.containers
  return {
    pageLayoutConfig: {
      template: state.pageLayoutConfig.template,
      containers: {
        top: copy_container(containers?.top),
        sidebarLeft: copy_container(containers?.sidebarLeft),
        sidebarRight: copy_container(containers?.sidebarRight),
        bottom: copy_container(containers?.bottom),
      },
    },
    instanceOverrides: copy_overrides(state.instanceOverrides ?? {}),
  }
}

function copy_overrides(overrides: InstanceOverrides): InstanceOverrides {
  const copied: InstanceOverrides = {}
  for (const [key, entry] of Object.entries(overrides)) copied[key] = { ...entry }
  return copied
}

function clamp_index(index: number, length: number): number {
  if (!Number.isInteger(index)) return length
  return Math.min(Math.max(index, 0), length)
}

function has_element(container: ContainerConfig, element_id: string): boolean {
  return container.elements.some((element) => element.id === element_id)
}

/**
 * Element moved within its container or to another one; its instance overrides follow it to the new section.
 * `to.index` is the position in the target list after the element is removed. Rejected when the target already holds that element.
 */
export function move_element(
  state: PageLayoutState,
  from: ContainerPosition,
  to: ContainerPosition
): PageLayoutState | null {
  const next = copy_state(state)
  const source = next.pageLayoutConfig.containers[from.container]
  const moved = source.elements[from.index]
  if (!moved) return null

  const target = next.pageLayoutConfig.containers[to.container]
  if (from.container !== to.container && has_element(target, moved.id)) return null

  source.elements.splice(from.index, 1)
  target.elements.splice(clamp_index(to.index, target.elements.length), 0, moved)

  if (from.container !== to.container) {
    next.instanceOverrides = move_instance_override(
      next.instanceOverrides,
      moved.id,
      CONTAINER_SECTION_IDS[from.container],
      CONTAINER_SECTION_IDS[to.container]
    )
  }
  return next
}

/** All elements of one container moved into another at `index` (default: end), overrides included. */
export function move_section(
  state: PageLayoutState,
  from: ContainerName,
  to: ContainerName,
  index?: number
): PageLayoutState | null {
  if (from === to) return null
  const next = copy_state(state)
  const source = next.pageLayoutConfig.containers[from]
  const target = next.pageLayoutConfig.containers[to]
  if (source.elements.length === 0) return null
  if (source.elements.some((element) => has_element(target, element.id))) return null

  const moved: ContainerElement[] = source.elements
  source.elements = []
  target.elements.splice(clamp_index(index ?? target.elements.length, target.elements.length), 0, ...moved)

  for (const element of moved) {
    next.instanceOverrides = move_instance_override(
      next.instanceOverrides,
      element.id,
      CONTAINER_SECTION_IDS[from],
      CONTAINER_SECTION_IDS[to]
    )
  }
  return next
}

/** Visibility toggled; overrides are kept so showing the element again restores its sizes. */
export function toggle_element_active(state: PageLayoutState, position: ContainerPosition): PageLayoutState | null {
  const next = copy_state(state)
  const element = next.pageLayoutConfig.containers[position.container].elements[position.index]
  if (!element) return null
  element.active = !element.active
  return next
}

/** Rejected when the element is not allowed in this mode or the container already holds it. */
export function add_element(
  state: PageLayoutState,
  container: ContainerName,
  element_id: string,
  is_community: boolean,
  index?: number
): PageLayoutState | null {
  if (!is_container_element_allowed(element_id, is_community)) return null
  const next = copy_state(state)
  const target = next.pageLayoutConfig.containers[container]
  if (has_element(target, element_id)) return null

  target.elements.splice(clamp_index(index ?? target.elements.length, target.elements.length), 0, {
    id: element_id,
    active: true,
  })
  return next
}

/** Element removed together with its instance overrides. */
export function remove_element(state: PageLayoutState, position: ContainerPosition): PageLayoutState | null {
  const next = copy_state(state)
  const source = next.pageLayoutConfig.containers[position.container]
  const [removed] = source.elements.splice(position.index, 1)
  if (!removed) return null
  delete next.instanceOverrides[instance_key(CONTAINER_SECTION_IDS[position.container], removed.id)]
  return next
}

/** Template with the sidebar of `container` shown; a drop into a hidden sidebar would otherwise vanish. */
export function template_showing(template: LayoutTemplate, container: ContainerName): LayoutTemplate {
  if (container === 'sidebarLeft' && !hasLeftSidebar(template)) {
    return hasRightSidebar(template) ? 'both-sidebars' : 'sidebar-left'
  }
  if (container === 'sidebarRight' && !hasRightSidebar(template)) {
    return hasLeftSidebar(template) ? 'both-sidebars' : 'sidebar-right'
  }
  return template
}

/** Template with the sidebar of `container` hidden; other containers leave it unchanged. */
export function template_hiding(template: LayoutTemplate, container: ContainerName): LayoutTemplate {
  if (container === 'sidebarLeft' && hasLeftSidebar(template)) {
    return hasRightSidebar(template) ? 'sidebar-right' : 'no-sidebar'
  }
  if (container === 'sidebarRight' && hasRightSidebar(template)) {
    return hasLeftSidebar(template) ? 'sidebar-left' : 'no-sidebar'
  }
  return template
}

/**
 * Template of `state` (already moved) after elements went from `from` to `to`: the target sidebar is shown
 * and the source sidebar is hidden once none of its remaining elements is rendered.
 */
export function template_after_move(
  state: PageLayoutState,
  from: ContainerName,
  to: ContainerName,
  is_rendered: (element: ContainerElement) => boolean = (element) => element.active
): LayoutTemplate {
  const shown = template_showing(state.pageLayoutConfig.template, to)
  if (from === to) return shown
  const remaining = state.pageLayoutConfig.containers[from]?.elements ?? []
  return remaining.some(is_rendered) ? shown : template_hiding(shown, from)
}

// Instance overrides

/** Copy of `overrides` with one value set; null for a key the element may not override, an out-of-range value or a full map. */
export function with_instance_override(
  overrides: InstanceOverrides | undefined,
  section_id: string,
  element_id: string,
  key: InstanceOverrideKey,
  value: number
): InstanceOverrides | null {
  if (!instance_override_keys_for(element_id).includes(key)) return null
  if (!is_instance_override_value(key, value)) return null
  const entry_key = instance_key(section_id, element_id)
  if (!INSTANCE_OVERRIDE_KEY_REGEX.test(entry_key)) return null

  const next = copy_overrides(overrides ?? {})
  if (!Object.hasOwn(next, entry_key) && Object.keys(next).length >= MAX_INSTANCE_OVERRIDES) return null
  next[entry_key] = { ...next[entry_key], [key]: value }
  return next
}

/** Copy of `overrides` without one value (or the whole entry when `key` is omitted); empty entries are dropped. */
export function without_instance_override(
  overrides: InstanceOverrides | undefined,
  section_id: string,
  element_id: string,
  key?: InstanceOverrideKey
): InstanceOverrides {
  const next = copy_overrides(overrides ?? {})
  const entry_key = instance_key(section_id, element_id)
  if (!Object.hasOwn(next, entry_key)) return next

  if (key !== undefined) delete next[entry_key][key]
  if (key === undefined || Object.keys(next[entry_key]).length === 0) delete next[entry_key]
  return next
}

// CardLayout (recursive sections). Path: [top-level section index, child index, child index, ...].

export type CardNodePath = ReadonlyArray<number>

type CardNode = { type: 'element'; id: string } | { type: 'section'; section: CardSection }

function update_children_at_path(
  children: CardSectionChild[],
  path: CardNodePath,
  updater: (section: CardSection) => CardSection
): CardSectionChild[] {
  const [index, ...rest] = path
  return children.map((child, i) => {
    if (i !== index || child.type !== 'section') return child
    const section =
      rest.length === 0
        ? updater(child.section)
        : { ...child.section, children: update_children_at_path(child.section.children, rest, updater) }
    return { type: 'section', section }
  })
}

/** Sections with the section at `path` replaced by `updater`'s result; unknown paths leave the tree unchanged. */
export function update_card_section_at_path(
  sections: CardSection[],
  path: CardNodePath,
  updater: (section: CardSection) => CardSection
): CardSection[] {
  if (path.length === 0) return sections
  const [index, ...rest] = path
  return sections.map((section, i) => {
    if (i !== index) return section
    if (rest.length === 0) return updater(section)
    return { ...section, children: update_children_at_path(section.children, rest, updater) }
  })
}

function card_section_at_path(sections: CardSection[], path: CardNodePath): CardSection | null {
  if (path.length === 0) return null
  let section: CardSection | undefined = sections[path[0]]
  for (const index of path.slice(1)) {
    const child: CardSectionChild | undefined = section?.children[index]
    section = child?.type === 'section' ? child.section : undefined
  }
  return section ?? null
}

function card_node_at_path(sections: CardSection[], path: CardNodePath): CardNode | null {
  if (path.length === 0) return null
  if (path.length === 1) {
    const section = sections[path[0]]
    return section ? { type: 'section', section } : null
  }
  const parent = card_section_at_path(sections, path.slice(0, -1))
  return parent?.children[path[path.length - 1]] ?? null
}

function is_path_prefix(prefix: CardNodePath, path: CardNodePath): boolean {
  return prefix.length <= path.length && prefix.every((index, i) => path[i] === index)
}

export function toggle_card_orientation(layout: CardLayout, path: CardNodePath): CardLayout | null {
  if (!card_section_at_path(layout.sections, path)) return null
  return {
    sections: update_card_section_at_path(layout.sections, path, (section) => ({
      ...section,
      orientation: section.orientation === 'horizontal' ? 'vertical' : 'horizontal',
    })),
  }
}

/** Empty section appended at top level (`parent_path` empty) or inside the section at `parent_path`. */
export function add_card_section(layout: CardLayout, parent_path: CardNodePath, section_id: string): CardLayout | null {
  const section: CardSection = { id: section_id, orientation: 'horizontal', children: [] }
  if (parent_path.length === 0) return { sections: [...layout.sections, section] }
  if (!card_section_at_path(layout.sections, parent_path)) return null
  return {
    sections: update_card_section_at_path(layout.sections, parent_path, (parent) => ({
      ...parent,
      children: [...parent.children, { type: 'section', section }],
    })),
  }
}

/** Rejected when the element is outside `allowed_ids` or already used anywhere in the layout. */
export function add_card_element(
  layout: CardLayout,
  parent_path: CardNodePath,
  element_id: string,
  allowed_ids: ReadonlyArray<string>
): CardLayout | null {
  if (!allowed_ids.includes(element_id)) return null
  if (collectAllElementIds(layout).includes(element_id)) return null
  if (!card_section_at_path(layout.sections, parent_path)) return null
  return {
    sections: update_card_section_at_path(layout.sections, parent_path, (parent) => ({
      ...parent,
      children: [...parent.children, { type: 'element', id: element_id }],
    })),
  }
}

export function remove_card_node(layout: CardLayout, path: CardNodePath): CardLayout | null {
  if (!card_node_at_path(layout.sections, path)) return null
  if (path.length === 1) return { sections: layout.sections.filter((_, i) => i !== path[0]) }
  const child_index = path[path.length - 1]
  return {
    sections: update_card_section_at_path(layout.sections, path.slice(0, -1), (parent) => ({
      ...parent,
      children: parent.children.filter((_, i) => i !== child_index),
    })),
  }
}

/**
 * Node moved to `to_parent_path` (empty = top level) at `to_index`, the position in the target list after removal.
 * Rejected for an element at top level and for a section dropped into itself or its descendant.
 */
export function move_card_node(
  layout: CardLayout,
  from_path: CardNodePath,
  to_parent_path: CardNodePath,
  to_index: number
): CardLayout | null {
  const node = card_node_at_path(layout.sections, from_path)
  if (!node) return null
  if (node.type === 'section' && is_path_prefix(from_path, to_parent_path)) return null
  if (to_parent_path.length > 0 && !card_section_at_path(layout.sections, to_parent_path)) return null

  const removed = remove_card_node(layout, from_path)
  if (!removed) return null

  // Removing a node shifts later siblings, so a target path running through one of them moves up by one.
  const depth = from_path.length - 1
  const target_path = [...to_parent_path]
  if (
    target_path.length > depth &&
    is_path_prefix(from_path.slice(0, depth), target_path) &&
    target_path[depth] > from_path[depth]
  ) {
    target_path[depth] -= 1
  }

  if (target_path.length === 0) {
    if (node.type !== 'section') return null
    const sections = [...removed.sections]
    sections.splice(clamp_index(to_index, sections.length), 0, node.section)
    return { sections }
  }

  return {
    sections: update_card_section_at_path(removed.sections, target_path, (parent) => {
      const children = [...parent.children]
      children.splice(clamp_index(to_index, children.length), 0, node)
      return { ...parent, children }
    }),
  }
}
