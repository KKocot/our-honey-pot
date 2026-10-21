// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createEffect, onCleanup, onMount, Show, type Accessor, type JSX } from 'solid-js'
import { Eye, Trash2 } from 'lucide-solid'
import { pageElementLabels, slotLabels, type PageSlotPosition } from '../types/layout'
import { CanvasGearButton } from './CanvasGearButton'
import { DragHandle } from './dnd/DragHandle'
import { SORTABLE_SOURCE_CLASS, use_sortable, type DndOrientation } from './dnd/use_sortable'
import { element_has_settings } from './element-registry'
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
  /** Removes the element from its slot; the trash button renders only for draggable elements. */
  on_remove?: () => void
  /** Turns a hidden block back on; renders the Show button. */
  on_show?: () => void
  children: JSX.Element
}

interface ChromeActionButtonProps {
  label: string
  on_press: () => void
  class: string
  children: JSX.Element
  'data-element-action': string
}

function ChromeActionButton(props: ChromeActionButtonProps) {
  return (
    <button
      type="button"
      aria-label={props.label}
      data-element-action={props['data-element-action']}
      onClick={(event) => {
        event.stopPropagation()
        props.on_press()
      }}
      class={`group/action inline-flex size-8 shrink-0 items-center justify-center rounded p-1 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary max-md:size-11 max-md:p-2.5 ${props.class}`}
    >
      <span class="inline-flex size-6 items-center justify-center rounded border border-border bg-bg-card text-text-muted transition-colors duration-100 ease-out group-hover/action:text-text motion-reduce:transition-none">
        {props.children}
      </span>
    </button>
  )
}

export function EditableElement(props: EditableElementProps) {
  let wrapper: HTMLDivElement | undefined
  let content: HTMLDivElement | undefined
  let gear: HTMLButtonElement | undefined

  const label = () => pageElementLabels[props.element_id] ?? props.element_id
  const slot_label = () => slotLabels[props.slot] ?? props.slot
  const selected = () => is_selected(props.section_id, props.element_id)
  const has_gear = element_has_settings(props.element_id)
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
    if (!(target instanceof Element) || target.closest(`[${CANVAS_CHROME_ATTR}] button`)) return
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

  // A hidden chip must not take the pointer from neighbours; touch has no hover, so there its controls stay tappable.
  const handle_class = () =>
    chip_shown() ? 'pointer-events-auto' : 'group-hover/el:pointer-events-auto [@media(hover:none)]:pointer-events-auto'

  // Only a hover-revealed chip takes the pointer between its controls (gaps would drop the hover); a shown one leaves
  // its padding to the element below, whose content it overlaps across the slot gap.
  const chip_box_class = () => (chip_shown() ? '' : 'group-hover/el:pointer-events-auto')

  // The first sidebar element shares the band above the section with its toolbar (right-aligned, ~11.5rem; 44px
  // controls on max-md), so its chip ends before the toolbar and keeps the section handle reachable.
  const toolbar_reserve_class = () =>
    (props.slot === 'sidebar-left' || props.slot === 'sidebar-right') && props.index() === 0
      ? 'right-46 max-md:right-55'
      : 'right-0'

  const can_remove = () => Boolean(sortable && props.on_remove)
  // Narrow chips drop the label of a filled element; a placeholder keeps it, since the label is its only content.
  const label_hides_when_narrow = () => Boolean(sortable) && props.has_data
  const has_trailing = () => has_gear || Boolean(props.on_show)

  const chip_padding = () => {
    if (sortable && has_trailing()) return ''
    if (sortable) return label_hides_when_narrow() ? 'pr-0.5 @max-[12rem]/chip:pr-0' : 'pr-0.5'
    if (has_trailing()) return 'pl-0.5'
    return 'px-0.5 py-0.5'
  }

  // A filled element shows the chip above its top edge, off the content; an empty one shows it in flow as a one-row placeholder.
  const chrome_class = () =>
    props.has_data ? `absolute bottom-full left-0 ${toolbar_reserve_class()} z-10 flex` : 'relative z-10 flex p-1'

  // An active element rises above its neighbours: a chip above the top edge crosses the slot gap onto the element before it.
  const layer_class = () => (selected() ? 'z-20' : 'hover:z-20 focus-within:z-20')

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
      class={`group/el relative rounded-sm -outline-offset-2 ${layer_class()} ${state_class()}`}
    >
      {/* Sized by its insets, not by content, so the inline-size container cannot change the element layout. */}
      <div data-canvas-chrome="" class={`@container/chip pointer-events-none ${chrome_class()}`}>
        <div
          data-canvas-chip=""
          class={`flex max-w-full min-w-0 items-center gap-0.5 rounded-md border border-border bg-bg-card/90 shadow-sm transition-opacity duration-100 ease-out motion-reduce:transition-none ${chip_padding()} ${chip_class()} ${chip_box_class()}`}
        >
          <Show when={sortable}>
            {(handle) => <DragHandle sortable={handle()} label={`Move ${label()}`} class={handle_class()} />}
          </Show>
          <Show when={can_remove()}>
            <ChromeActionButton
              data-element-action="remove"
              label={`Remove ${label()}`}
              on_press={() => props.on_remove?.()}
              class={handle_class()}
            >
              <Trash2 size={14} aria-hidden="true" />
            </ChromeActionButton>
          </Show>
          <span
            title={props.has_data ? undefined : `${label()} · ${props.empty_label ?? 'No data'}`}
            class={`min-w-0 truncate rounded-sm px-1.5 text-[0.6875rem] leading-5 font-medium ${
              props.has_data ? 'bg-primary text-primary-text' : 'border border-warning/40 bg-warning/10 text-warning'
            } ${label_hides_when_narrow() ? '@max-[12rem]/chip:hidden' : ''} ${handle_class()}`}
          >
            {props.has_data ? label() : `${label()} · ${props.empty_label ?? 'No data'}`}
          </span>
          <Show when={props.on_show}>
            {(on_show) => (
              <ChromeActionButton
                data-element-action="show"
                label={`Show ${label()}`}
                on_press={() => on_show()()}
                class={handle_class()}
              >
                <Eye size={14} aria-hidden="true" />
              </ChromeActionButton>
            )}
          </Show>
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
      <div ref={content}>{props.children}</div>
    </div>
  )
}
