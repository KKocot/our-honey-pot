// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal } from 'solid-js'
import type { PageSlotPosition } from '../types/layout'
import { home_section_popover_key } from './home-section-ops'

/** Elements of a rendered instance: `anchor_el` opens the popover and takes focus back, `position_el` is the rect it sits beside. */
export interface InstanceAnchors {
  anchor_el: HTMLElement
  position_el: HTMLElement
}

/** Selected canvas instance; `element_id` is null when a whole section (slot) is selected. */
export interface CanvasSelection extends InstanceAnchors {
  section_id: string
  element_id: string | null
  slot: PageSlotPosition
}

const [selection, set_selection] = createSignal<CanvasSelection | null>(null)
const [popover_open, set_popover_open] = createSignal(false)
const [active_tab, set_active_tab] = createSignal('posts')

/** Navigation tab shown in the canvas (posts, comments, threads or a category tab); popovers may follow it. */
export { active_tab, set_active_tab }

/** Current selection (reactive). */
export { selection }

/** Popover of the selected instance should be visible (reactive); the shell renders it beside `position_el`. */
export function is_popover_open(): boolean {
  return popover_open() && selection() !== null
}

/** Selects an instance and opens its popover (gear, Enter/Space, popover navigation). */
export function select_instance(next: CanvasSelection): void {
  set_selection(next)
  set_popover_open(true)
}

/** Selects an instance without opening its popover (a click on canvas content); an open popover closes. */
export function select_instance_only(next: CanvasSelection): void {
  set_selection(next)
  set_popover_open(false)
}

export function is_selected(section_id: string, element_id: string | null): boolean {
  const current = selection()
  return current !== null && current.section_id === section_id && current.element_id === element_id
}

/** Section of the selection, also when one of its elements is selected (parent gets the hover outline). */
export function is_section_active(section_id: string): boolean {
  return selection()?.section_id === section_id
}

/** Closes the popover, keeps the selection and moves focus back to its anchor (gear, or the wrapper without one). */
export function close_popover(): void {
  set_popover_open(false)
  selection()?.anchor_el.focus({ preventScroll: true })
}

export function clear_selection(): void {
  set_popover_open(false)
  set_selection(null)
}

/** Escape semantics of the canvas: first press closes the popover, second clears the selection. */
export function escape_selection(): void {
  if (is_popover_open()) close_popover()
  else clear_selection()
}

/** Keeps the anchors in sync when the selected instance is re-rendered (e.g. after a layout change). */
export function update_selection_anchor(section_id: string, element_id: string | null, anchors: InstanceAnchors): void {
  const current = selection()
  if (!current || current.section_id !== section_id || current.element_id !== element_id) return
  if (current.anchor_el !== anchors.anchor_el || current.position_el !== anchors.position_el) {
    set_selection({ ...current, ...anchors })
  }
}

/** Anchors of a rendered element instance: its gear (the wrapper without one) and the wrapper. */
export function find_instance_anchors(section_id: string, element_id: string): InstanceAnchors | null {
  const wrapper = document.querySelector<HTMLElement>(
    `[data-section-id="${CSS.escape(section_id)}"][data-element-id="${CSS.escape(element_id)}"]`
  )
  if (!wrapper) return null
  const gear = wrapper.querySelector<HTMLElement>(`[data-element-gear="${CSS.escape(element_id)}"]`)
  return { anchor_el: gear ?? wrapper, position_el: wrapper }
}

/** Always-visible settings button of a rendered section (EditableSection sets `data-section-gear`). */
export function find_section_gear(section_id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-section-gear="${CSS.escape(section_id)}"]`)
}

/**
 * Follows the selected element into another section after a slot change, so its popover stays open.
 * Until the new wrapper mounts the old anchors are kept; `update_selection_anchor` swaps them in.
 */
export function move_selection(section_id: string, slot: PageSlotPosition): void {
  const current = selection()
  if (!current || current.element_id === null) return
  const anchors = find_instance_anchors(section_id, current.element_id)
  set_selection({ ...current, ...anchors, section_id, slot })
}

function home_section_selection(id: string, anchors: InstanceAnchors): CanvasSelection {
  return { section_id: home_section_popover_key(id), element_id: null, slot: 'main', ...anchors }
}

/** Selects a home section and opens its popover (key `home-section:<id>`), beside the section. */
export function select_home_section(id: string, anchors: InstanceAnchors): void {
  select_instance(home_section_selection(id, anchors))
}

/** Selects a home section without opening its popover. */
export function select_home_section_only(id: string, anchors: InstanceAnchors): void {
  select_instance_only(home_section_selection(id, anchors))
}

export function is_home_section_selected(id: string): boolean {
  return is_selected(home_section_popover_key(id), null)
}
