// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal } from 'solid-js'
import type { PageSlotPosition } from '../types/layout'

/** Selected canvas instance; `element_id` is null when a whole section (slot) is selected. */
export interface CanvasSelection {
  section_id: string
  element_id: string | null
  slot: PageSlotPosition
  anchor_el: HTMLElement
}

const [selection, set_selection] = createSignal<CanvasSelection | null>(null)
const [popover_open, set_popover_open] = createSignal(false)
const [active_tab, set_active_tab] = createSignal('posts')

/** Navigation tab shown in the canvas (posts, comments, threads or a category tab); popovers may follow it. */
export { active_tab, set_active_tab }

/** Current selection (reactive). */
export { selection }

/** Popover of the selected instance should be visible (reactive); the shell renders it next to `anchor_el`. */
export function is_popover_open(): boolean {
  return popover_open() && selection() !== null
}

/** Selects an instance and opens its popover. */
export function select_instance(next: CanvasSelection): void {
  set_selection(next)
  set_popover_open(true)
}

export function is_selected(section_id: string, element_id: string | null): boolean {
  const current = selection()
  return current !== null && current.section_id === section_id && current.element_id === element_id
}

/** Section of the selection, also when one of its elements is selected (parent gets the hover outline). */
export function is_section_active(section_id: string): boolean {
  return selection()?.section_id === section_id
}

/** Closes the popover, keeps the selection and moves focus back to the selected wrapper. */
export function close_popover(): void {
  set_popover_open(false)
  selection()?.anchor_el.focus()
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

/** Keeps the anchor in sync when the selected wrapper is re-rendered (e.g. after a layout change). */
export function update_selection_anchor(section_id: string, element_id: string | null, anchor_el: HTMLElement): void {
  const current = selection()
  if (!current || current.section_id !== section_id || current.element_id !== element_id) return
  if (current.anchor_el !== anchor_el) set_selection({ ...current, anchor_el })
}

/** Rendered wrapper of an element instance (EditableElement sets the data attributes). */
export function find_instance_anchor(section_id: string, element_id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-section-id="${CSS.escape(section_id)}"][data-element-id="${CSS.escape(element_id)}"]`
  )
}

/**
 * Follows the selected element into another section after a slot change, so its popover stays open.
 * Until the new wrapper mounts the old anchor is kept; `update_selection_anchor` swaps it in.
 */
export function move_selection(section_id: string, slot: PageSlotPosition): void {
  const current = selection()
  if (!current || current.element_id === null) return
  const anchor_el = find_instance_anchor(section_id, current.element_id) ?? current.anchor_el
  set_selection({ ...current, section_id, slot, anchor_el })
}
