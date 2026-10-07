// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createEffect, Show, type Accessor, type JSX } from 'solid-js'
import { slotLabels, type PageSlotPosition } from '../types/layout'
import { DragHandle } from './dnd/DragHandle'
import { SORTABLE_SOURCE_CLASS, use_sortable } from './dnd/use_sortable'
import { CANVAS_CHROME_ATTR, CANVAS_ELEMENT_ATTR, FOCUS_RING_CLASS, SELECTED_RING_CLASS } from './EditableElement'
import { escape_selection, is_section_active, is_selected, select_instance, update_selection_anchor } from './selection'

function element_noun(count: number): string {
  return count === 1 ? 'element' : 'elements'
}

/** Sortable type of slot sections; drop zones of other slots accept it (all elements move together). */
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
  children: JSX.Element
}

export function EditableSection(props: EditableSectionProps) {
  let wrapper: HTMLDivElement | undefined

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
      })
    : undefined

  const select = () => {
    if (!wrapper) return
    select_instance({ section_id: props.section_id, element_id: null, slot: props.slot, anchor_el: wrapper })
  }

  // Element wrappers handle their own clicks (navigation tab clicks still bubble here), so only the section's gaps select it.
  const handle_click = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest(`[${CANVAS_CHROME_ATTR}], [${CANVAS_ELEMENT_ATTR}]`))
      return
    select()
  }

  const handle_key_down = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      select()
    } else if (event.key === 'Escape' && selected()) {
      event.preventDefault()
      escape_selection()
    }
  }

  createEffect(() => {
    if (wrapper) update_selection_anchor(props.section_id, null, wrapper)
  })

  const state_class = () => {
    if (sortable?.is_drag_source()) return SORTABLE_SOURCE_CLASS
    if (selected()) return SELECTED_RING_CLASS
    if (child_selected()) return 'outline-1 outline-dashed outline-border'
    return `hover:outline-1 hover:outline-dashed hover:outline-border ${FOCUS_RING_CLASS}`
  }

  const chip_class = () =>
    selected() || child_selected()
      ? 'opacity-100'
      : 'pointer-events-none opacity-0 group-hover/sec:pointer-events-auto group-hover/sec:opacity-100 group-focus-visible/sec:opacity-100'

  return (
    <div
      ref={(element) => {
        wrapper = element
        sortable?.ref(element)
      }}
      tabIndex={0}
      role="group"
      aria-label={`${label()}, section, ${props.element_count} ${element_noun(props.element_count)}`}
      onClick={handle_click}
      onKeyDown={handle_key_down}
      class={`group/sec relative rounded-lg outline-offset-4 ${state_class()}`}
    >
      <div
        data-canvas-chrome=""
        class={`absolute top-0 right-0 z-10 flex -translate-y-full items-center gap-0.5 transition-opacity duration-100 ease-out motion-reduce:transition-none ${chip_class()}`}
      >
        <Show when={sortable}>{(handle) => <DragHandle sortable={handle()} label={`Move ${label()} section`} />}</Show>
        <span
          aria-hidden="true"
          class="rounded-sm border border-border bg-bg-card px-1.5 text-[0.6875rem] leading-5 text-text-muted"
        >
          {label()}
        </span>
      </div>
      {props.children}
    </div>
  )
}
