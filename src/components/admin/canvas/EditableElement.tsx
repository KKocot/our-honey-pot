// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createEffect, onCleanup, onMount, Show, type Accessor, type JSX } from 'solid-js'
import { pageElementLabels, slotLabels, type PageSlotPosition } from '../types/layout'
import { DragHandle } from './dnd/DragHandle'
import { SORTABLE_SOURCE_CLASS, use_sortable, type DndOrientation } from './dnd/use_sortable'
import { escape_selection, is_selected, select_instance, update_selection_anchor } from './selection'

/** Sortable type of page layout elements; drop zones of slots accept it. */
export const PAGE_ELEMENT_DND_TYPE = 'page-element'

/** Marks edit chrome (chips, handles) so canvas click interception leaves it alone. */
export const CANVAS_CHROME_ATTR = 'data-canvas-chrome'
/** Marks element wrappers, so a section ignores clicks that belong to one of its elements. */
export const CANVAS_ELEMENT_ATTR = 'data-canvas-element'
/** Controls that keep working in the canvas: navigation tabs and community sort tabs (buttons, no page navigation). */
export const CANVAS_INTERACTIVE_SELECTOR = '[data-tab], [data-sort-tab]'

/** Double ring: theme colour plus a bg-card separator, so the outline stays visible on every theme. */
export const SELECTED_RING_CLASS = 'outline-2 outline-solid outline-primary shadow-[0_0_0_1px_var(--color-bg-card)]'
export const FOCUS_RING_CLASS =
  'focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-primary focus-visible:shadow-[0_0_0_1px_var(--color-bg-card)]'

const BLOG_FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'

/** Keeps keyboard focus out of the rendered blog content: Tab moves between edit wrappers only. */
export function remove_content_from_tab_order(container: HTMLElement): () => void {
  const apply = () => {
    for (const node of container.querySelectorAll<HTMLElement>(BLOG_FOCUSABLE)) node.tabIndex = -1
  }
  apply()
  const observer = new MutationObserver(apply)
  observer.observe(container, { childList: true, subtree: true })
  return () => observer.disconnect()
}

export interface EditableElementDnd {
  sortable_id: string
  container_id: Accessor<string>
  orientation: Accessor<DndOrientation>
}

export interface EditableElementProps {
  section_id: string
  slot: PageSlotPosition
  element_id: string
  index: Accessor<number>
  count: Accessor<number>
  /** Element can be dragged between slots; fixed elements (navigation, posts) omit it. */
  dnd?: EditableElementDnd
  is_mock: boolean
  has_data: boolean
  children: JSX.Element
}

export function EditableElement(props: EditableElementProps) {
  let wrapper: HTMLDivElement | undefined
  let content: HTMLDivElement | undefined

  const label = () => pageElementLabels[props.element_id] ?? props.element_id
  const slot_label = () => slotLabels[props.slot] ?? props.slot
  const selected = () => is_selected(props.section_id, props.element_id)

  const dnd = props.dnd
  const sortable = dnd
    ? use_sortable({
        id: dnd.sortable_id,
        index: props.index,
        container_id: dnd.container_id,
        type: PAGE_ELEMENT_DND_TYPE,
        label,
        orientation: dnd.orientation,
      })
    : undefined

  const select = () => {
    if (!wrapper) return
    select_instance({
      section_id: props.section_id,
      element_id: props.element_id,
      slot: props.slot,
      anchor_el: wrapper,
    })
  }

  // Capture phase runs before the blog's own handlers: links must not navigate, only view tabs keep switching the view.
  const intercept_click = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element) || target.closest(`[${CANVAS_CHROME_ATTR}]`)) return
    select()
    const control = target.closest(CANVAS_INTERACTIVE_SELECTOR)
    if (event.type === 'click' && control && content?.contains(control)) return
    event.preventDefault()
    event.stopPropagation()
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

  onMount(() => {
    if (!wrapper || !content) return
    wrapper.addEventListener('click', intercept_click, true)
    wrapper.addEventListener('auxclick', intercept_click, true)
    const stop_tab_guard = remove_content_from_tab_order(content)
    onCleanup(() => {
      wrapper?.removeEventListener('click', intercept_click, true)
      wrapper?.removeEventListener('auxclick', intercept_click, true)
      stop_tab_guard()
    })
  })

  createEffect(() => {
    if (wrapper) update_selection_anchor(props.section_id, props.element_id, wrapper)
  })

  const state_class = () => {
    if (sortable?.is_drag_source()) return SORTABLE_SOURCE_CLASS
    if (selected()) return SELECTED_RING_CLASS
    if (!props.has_data) return `outline-1 outline-dashed outline-warning ${FOCUS_RING_CLASS}`
    return `hover:outline-1 hover:outline-dashed hover:outline-primary/60 ${FOCUS_RING_CLASS}`
  }

  const chip_class = () =>
    selected() || !props.has_data
      ? 'opacity-100'
      : 'pointer-events-none opacity-0 group-hover/el:pointer-events-auto group-hover/el:opacity-100 group-focus-visible/el:opacity-100'

  return (
    <div
      ref={(element) => {
        wrapper = element
        sortable?.ref(element)
      }}
      data-canvas-element=""
      data-section-id={props.section_id}
      data-element-id={props.element_id}
      tabIndex={0}
      role="group"
      aria-label={`${label()}, ${slot_label()}, element ${props.index() + 1} of ${props.count()}`}
      onKeyDown={handle_key_down}
      class={`group/el relative rounded-sm outline-offset-2 ${state_class()}`}
    >
      <div
        data-canvas-chrome=""
        class={`absolute top-0 left-0 z-10 flex -translate-y-full items-center gap-0.5 transition-opacity duration-100 ease-out motion-reduce:transition-none ${chip_class()}`}
      >
        <Show when={sortable}>{(handle) => <DragHandle sortable={handle()} label={`Move ${label()}`} />}</Show>
        <span
          class={`rounded-sm px-1.5 text-[0.6875rem] leading-5 font-medium ${
            props.has_data ? 'bg-primary text-primary-text' : 'border border-warning/40 bg-warning/10 text-warning'
          }`}
        >
          {props.has_data ? label() : `${label()} · No data`}
        </span>
      </div>
      <Show when={props.is_mock}>
        <span
          aria-hidden="true"
          class="pointer-events-none absolute top-1 right-1 z-10 rounded-sm bg-bg-secondary px-1 text-[0.625rem] text-text-muted uppercase"
        >
          sample
        </span>
      </Show>
      <div ref={content} class={props.has_data ? '' : 'min-h-12'}>
        {props.children}
      </div>
    </div>
  )
}
