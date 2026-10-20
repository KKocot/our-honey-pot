// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createEffect, onCleanup, onMount, Show, type Accessor, type JSX } from 'solid-js'
import { pageElementLabels, slotLabels, type PageSlotPosition } from '../types/layout'
import { CanvasGearButton } from './CanvasGearButton'
import { DragHandle } from './dnd/DragHandle'
import { SORTABLE_SOURCE_CLASS, use_sortable, type DndOrientation } from './dnd/use_sortable'
import { get_element_entry } from './element-registry'
import {
  close_popover,
  escape_selection,
  is_popover_open,
  is_selected,
  select_instance,
  select_instance_only,
  update_selection_anchor,
  type CanvasSelection,
  type InstanceAnchors,
} from './selection'

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
/** Always-on canvas guide; text-muted keeps it visible where the border token is near the background. */
export const GUIDE_CLASS = 'outline-1 outline-dashed outline-text-muted/40'
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
  /** Chip text when `has_data` is false (e.g. a hidden block); defaults to "No data". */
  empty_label?: string
  children: JSX.Element
}

export function EditableElement(props: EditableElementProps) {
  let wrapper: HTMLDivElement | undefined
  let content: HTMLDivElement | undefined
  let gear: HTMLButtonElement | undefined

  const label = () => pageElementLabels[props.element_id] ?? props.element_id
  const slot_label = () => slotLabels[props.slot] ?? props.slot
  const selected = () => is_selected(props.section_id, props.element_id)
  const has_gear = get_element_entry(props.element_id) !== null
  const popover_shown = () => selected() && is_popover_open()

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

  // The popover sits beside the wrapper (its content changes while edited); focus returns to the gear when it closes.
  const anchors = (): InstanceAnchors | null => (wrapper ? { anchor_el: gear ?? wrapper, position_el: wrapper } : null)

  const instance = (): CanvasSelection | null => {
    const current = anchors()
    if (!current) return null
    return { section_id: props.section_id, element_id: props.element_id, slot: props.slot, ...current }
  }

  const select = () => {
    const next = instance()
    if (next) select_instance_only(next)
  }

  const open_popover = () => {
    const next = instance()
    if (next) select_instance(next)
  }

  const toggle_popover = () => (popover_shown() ? close_popover() : open_popover())

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
      open_popover()
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
    const current = anchors()
    if (current) update_selection_anchor(props.section_id, props.element_id, current)
  })

  const state_class = () => {
    if (sortable?.is_drag_source()) return SORTABLE_SOURCE_CLASS
    if (selected()) return SELECTED_RING_CLASS
    if (!props.has_data) return `outline-1 outline-dashed outline-warning ${FOCUS_RING_CLASS}`
    return `${GUIDE_CLASS} hover:outline-primary/60 ${FOCUS_RING_CLASS}`
  }

  const chip_shown = () => selected() || !props.has_data

  const chip_class = () =>
    chip_shown()
      ? 'opacity-100'
      : 'opacity-0 group-hover/el:opacity-100 group-focus-visible/el:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100'

  // The chip sits over the content, so only the handle and the gear take the pointer; label clicks fall through and select.
  // Touch has no hover to reveal them, so there they stay tappable without a prior selection.
  const handle_class = () =>
    chip_shown() ? 'pointer-events-auto' : 'group-hover/el:pointer-events-auto [@media(hover:none)]:pointer-events-auto'

  const chip_padding = () => {
    if (sortable && has_gear) return ''
    if (sortable) return 'pr-0.5 @max-[12rem]/chip:pr-0'
    if (has_gear) return 'pl-0.5'
    return 'px-0.5 py-0.5'
  }

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
      class={`group/el relative rounded-sm -outline-offset-2 ${state_class()}`}
    >
      {/* Sized by its insets, not by content, so the inline-size container cannot change the element layout. */}
      <div data-canvas-chrome="" class="@container/chip pointer-events-none absolute inset-0 z-10">
        <div
          class={`absolute top-1 left-1 flex max-w-[calc(100%-0.5rem)] items-center gap-0.5 rounded-md border border-border bg-bg-card/90 shadow-sm transition-opacity duration-100 ease-out motion-reduce:transition-none ${chip_padding()} ${chip_class()}`}
        >
          <Show when={sortable}>
            {(handle) => <DragHandle sortable={handle()} label={`Move ${label()}`} class={handle_class()} />}
          </Show>
          <span
            title={props.has_data ? undefined : `${label()} · ${props.empty_label ?? 'No data'}`}
            class={`truncate rounded-sm px-1.5 text-[0.6875rem] leading-5 font-medium ${
              props.has_data ? 'bg-primary text-primary-text' : 'border border-warning/40 bg-warning/10 text-warning'
            } ${sortable ? '@max-[12rem]/chip:hidden' : ''}`}
          >
            {props.has_data ? label() : `${label()} · ${props.empty_label ?? 'No data'}`}
          </span>
          <Show when={has_gear}>
            <CanvasGearButton
              ref={gear}
              data-element-gear={props.element_id}
              label={`${label()} settings`}
              expanded={popover_shown()}
              on_toggle={toggle_popover}
              class={handle_class()}
            />
          </Show>
        </div>
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
