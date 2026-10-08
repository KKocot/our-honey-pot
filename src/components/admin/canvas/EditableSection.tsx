// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createEffect, Show, type Accessor, type JSX } from 'solid-js'
import { Settings } from 'lucide-solid'
import { slotLabels, type PageSlotPosition } from '../types/layout'
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
  update_selection_anchor,
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
  children: JSX.Element
}

export function EditableSection(props: EditableSectionProps) {
  let wrapper: HTMLDivElement | undefined
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

  // The section popover is anchored on the gear, so focus returns there when it closes.
  const select = () => {
    if (!gear) return
    select_instance({ section_id: props.section_id, element_id: null, slot: props.slot, anchor_el: gear })
  }

  const toggle_popover = () => {
    if (popover_shown()) close_popover()
    else select()
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
    if (gear) update_selection_anchor(props.section_id, null, gear)
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
      <div data-canvas-chrome="" class="absolute top-0 right-0 z-10 flex -translate-y-full items-center gap-0.5">
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
        <button
          type="button"
          ref={gear}
          data-section-gear={props.section_id}
          aria-label="Section settings"
          aria-haspopup="dialog"
          aria-expanded={popover_shown()}
          onClick={toggle_popover}
          class="group/gear inline-flex size-8 items-center justify-center rounded p-1 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary max-md:size-11 max-md:p-2.5"
        >
          <span
            class={`inline-flex size-6 items-center justify-center rounded border transition-colors duration-100 ease-out motion-reduce:transition-none ${
              popover_shown()
                ? 'border-primary bg-primary text-primary-text'
                : 'border-border bg-bg-card text-text-muted group-hover/gear:text-text'
            }`}
          >
            <Settings size={14} aria-hidden="true" />
          </span>
        </button>
      </div>
      {props.children}
    </div>
  )
}
