// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createEffect, Show, type Accessor, type JSX } from 'solid-js'
import { slotLabels, type PageSlotPosition } from '../types/layout'
import { AddElementMenu, type AddElementMenuItem, type AddElementMenuSection } from './AddElementMenu'
import type { AddableHomeSectionType } from './home-section-ops'
import { CanvasGearButton } from './CanvasGearButton'
import { DragHandle } from './dnd/DragHandle'
import { SORTABLE_SOURCE_CLASS, use_sortable } from './dnd/use_sortable'
import {
  CANVAS_CHROME_ATTR,
  CANVAS_ELEMENT_ATTR,
  FOCUS_RING_CLASS,
  GUIDE_CLASS,
  SELECTED_RING_CLASS,
} from './EditableElement'
import {
  close_popover,
  escape_selection,
  is_popover_open,
  is_section_active,
  is_selected,
  select_instance,
  select_instance_only,
  update_selection_anchor,
  type CanvasSelection,
  type InstanceAnchors,
} from './selection'

function element_noun(count: number): string {
  return count === 1 ? 'element' : 'elements'
}

/** Sortable type of slot sections; dropping one on another slot swaps the contents of both slots. */
export const PAGE_SECTION_DND_TYPE = 'page-section'

export interface EditableSectionDnd {
  sortable_id: string
  container_id: Accessor<string>
}

export interface EditableSectionProps {
  section_id: string
  slot: PageSlotPosition
  element_count: number
  /** Section can be dragged to another slot; the fixed main section omits it. */
  dnd?: EditableSectionDnd
  /** Components that can be added to the section; without it the "+" menu is not rendered. */
  add_items?: AddElementMenuItem[]
  on_add?: (id: string) => void
  /** Home section types of the "Sections" group of the "+" menu. */
  sections?: AddElementMenuSection[]
  on_add_section?: (type: AddableHomeSectionType) => void
  children: JSX.Element
}

export function EditableSection(props: EditableSectionProps) {
  let root: HTMLDivElement | undefined
  let gear: HTMLButtonElement | undefined

  const label = () => slotLabels[props.slot] ?? props.slot
  const selected = () => is_selected(props.section_id, null)
  const child_selected = () => !selected() && is_section_active(props.section_id)

  const dnd = props.dnd
  const sortable = dnd
    ? use_sortable({
        id: dnd.sortable_id,
        index: () => 0,
        container_id: dnd.container_id,
        type: PAGE_SECTION_DND_TYPE,
        label: () => `${label()} section`,
        optimistic_sorting: false,
      })
    : undefined

  const popover_shown = () => selected() && is_popover_open()

  // The popover sits beside the section; focus returns to the gear when it closes.
  const anchors = (): InstanceAnchors | null => (gear && root ? { anchor_el: gear, position_el: root } : null)

  const instance = (): CanvasSelection | null => {
    const current = anchors()
    return current ? { section_id: props.section_id, element_id: null, slot: props.slot, ...current } : null
  }

  const open_popover = () => {
    const next = instance()
    if (next) select_instance(next)
  }

  const toggle_popover = () => {
    if (popover_shown()) close_popover()
    else open_popover()
  }

  // Element wrappers handle their own clicks (navigation tab clicks still bubble here), so only the section's gaps select it.
  const handle_click = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest(`[${CANVAS_CHROME_ATTR}], [${CANVAS_ELEMENT_ATTR}]`))
      return
    const next = instance()
    if (next) select_instance_only(next)
  }

  const handle_key_down = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      open_popover()
    } else if (event.key === 'Escape' && selected()) {
      event.preventDefault()
      escape_selection()
    }
  }

  createEffect(() => {
    const current = anchors()
    if (current) update_selection_anchor(props.section_id, null, current)
  })

  const state_class = () => {
    if (sortable?.is_drag_source()) return SORTABLE_SOURCE_CLASS
    if (selected()) return SELECTED_RING_CLASS
    if (child_selected()) return 'outline-1 outline-dashed outline-text-muted'
    return `${GUIDE_CLASS} hover:outline-text-muted ${FOCUS_RING_CLASS}`
  }

  const chip_class = () =>
    selected() || child_selected()
      ? 'opacity-100'
      : 'pointer-events-none opacity-0 group-hover/sec:pointer-events-auto group-hover/sec:opacity-100 group-focus-visible/sec:opacity-100'

  return (
    <div
      ref={(element) => {
        root = element
        sortable?.ref(element)
      }}
      tabIndex={0}
      role="group"
      aria-label={`${label()}, section, ${props.element_count} ${element_noun(props.element_count)}`}
      onClick={handle_click}
      onKeyDown={handle_key_down}
      class={`group/sec relative rounded-lg outline-offset-4 ${state_class()}`}
    >
      {/* Above the z-20 layer of an active element, so the "+" menu opening in this stacking context is not covered by it. */}
      <div data-canvas-chrome="" class="absolute top-0 right-0 z-30 flex -translate-y-full items-center gap-0.5">
        <div
          class={`flex items-center gap-0.5 transition-opacity duration-100 ease-out motion-reduce:transition-none ${chip_class()}`}
        >
          <Show when={sortable}>
            {(handle) => <DragHandle sortable={handle()} label={`Move ${label()} section`} />}
          </Show>
          <span
            aria-hidden="true"
            class="rounded-sm border border-border bg-bg-card px-1.5 text-[0.6875rem] leading-5 text-text-muted"
          >
            {label()}
          </span>
        </div>
        <Show when={props.add_items}>
          {(items) => (
            <AddElementMenu
              items={items()}
              label={`Add component to ${label()} section`}
              on_add={(id) => props.on_add?.(id)}
              sections={props.sections}
              on_add_section={(type) => props.on_add_section?.(type)}
            />
          )}
        </Show>
        <CanvasGearButton
          ref={gear}
          data-section-gear={props.section_id}
          label="Section settings"
          expanded={popover_shown()}
          on_toggle={toggle_popover}
        />
      </div>
      {props.children}
    </div>
  )
}
