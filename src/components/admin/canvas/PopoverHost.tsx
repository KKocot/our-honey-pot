// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createMemo, createSignal, onCleanup, onMount, Show, untrack } from 'solid-js'
import { Dynamic, Portal } from 'solid-js/web'
import { apply_layout_op, is_community_mode, settings } from '../queries'
import {
  COMMUNITY_PAGE_ELEMENT_IDS,
  USER_PAGE_ELEMENT_IDS,
  slotLabels,
  type ContainerElement,
  type ContainerName,
  type PageSlotPosition,
} from '../types/layout'
import type { SettingsData } from '../types/settings'
import {
  CONTAINER_NAMES,
  CONTAINER_SECTION_IDS,
  is_container_element_allowed,
  move_element,
  template_after_move,
} from './layout-ops'
import { SELECTED_RING_CLASS } from './EditableElement'
import { get_element_entry } from './element-registry'
import type { PopoverMoveControls } from './popovers/PopoverShell'
import {
  active_tab,
  close_popover,
  is_popover_open,
  move_selection,
  selection,
  type CanvasSelection,
} from './selection'

export interface PopoverHostProps {
  /** Opens the settings drawer on the Site section (Header popover link). */
  on_edit_site: () => void
}

const CONTAINER_SLOTS: Readonly<Record<ContainerName, PageSlotPosition>> = {
  top: 'top',
  sidebarLeft: 'sidebar-left',
  sidebarRight: 'sidebar-right',
  bottom: 'bottom',
}

const POST_CARD_SELECTOR = 'article'

function container_of(section_id: string): ContainerName | null {
  return CONTAINER_NAMES.find((name) => CONTAINER_SECTION_IDS[name] === section_id) ?? null
}

function mode_ids(): ReadonlySet<string> {
  return is_community_mode() ? COMMUNITY_PAGE_ELEMENT_IDS : USER_PAGE_ELEMENT_IDS
}

function is_rendered(element: ContainerElement): boolean {
  return element.active && mode_ids().has(element.id)
}

function rendered_indexes(elements: ContainerElement[]): number[] {
  return elements.flatMap((element, index) => (is_rendered(element) ? [index] : []))
}

function container_elements(current: SettingsData, container: ContainerName): ContainerElement[] {
  return current.pageLayoutConfig?.containers?.[container]?.elements ?? []
}

/** Up/down among rendered neighbours, so hidden (inactive) elements never swallow a step. */
function shift_op(container: ContainerName, element_id: string, direction: -1 | 1) {
  return (current: SettingsData): Partial<SettingsData> | null => {
    const config = current.pageLayoutConfig
    if (!config) return null
    const elements = container_elements(current, container)
    const from = elements.findIndex((element) => element.id === element_id)
    const visible = rendered_indexes(elements)
    const neighbour = visible[visible.indexOf(from) + direction]
    if (from < 0 || neighbour === undefined) return null
    const next = move_element(
      { pageLayoutConfig: config, instanceOverrides: current.instanceOverrides ?? {} },
      { container, index: from },
      { container, index: neighbour }
    )
    return next ? { pageLayoutConfig: next.pageLayoutConfig, instanceOverrides: next.instanceOverrides } : null
  }
}

function transfer_op(from_container: ContainerName, element_id: string, to_container: ContainerName) {
  return (current: SettingsData): Partial<SettingsData> | null => {
    const config = current.pageLayoutConfig
    if (!config || from_container === to_container) return null
    const from = container_elements(current, from_container).findIndex((element) => element.id === element_id)
    if (from < 0) return null
    const next = move_element(
      { pageLayoutConfig: config, instanceOverrides: current.instanceOverrides ?? {} },
      { container: from_container, index: from },
      { container: to_container, index: container_elements(current, to_container).length }
    )
    if (!next) return null
    return {
      pageLayoutConfig: {
        ...next.pageLayoutConfig,
        template: template_after_move(next, from_container, to_container, is_rendered),
      },
      instanceOverrides: next.instanceOverrides,
    }
  }
}

function create_move_controls(section_id: string, element_id: string): () => PopoverMoveControls | undefined {
  return createMemo(() => {
    const container = container_of(section_id)
    if (!container || !is_container_element_allowed(element_id, is_community_mode())) return undefined

    const elements = settings.pageLayoutConfig?.containers?.[container]?.elements ?? []
    const visible = rendered_indexes(elements)
    const position = visible.indexOf(elements.findIndex((element) => element.id === element_id))

    const slot_options = CONTAINER_NAMES.filter(
      (name) =>
        name === container ||
        !(settings.pageLayoutConfig?.containers?.[name]?.elements ?? []).some((element) => element.id === element_id)
    ).map((name) => ({ value: name, label: slotLabels[CONTAINER_SLOTS[name]] ?? name }))

    return {
      slot_options,
      current_slot: container,
      onSlotChange: (slot_id: string) => {
        const target = CONTAINER_NAMES.find((name) => name === slot_id)
        if (!target || target === container) return
        if (apply_layout_op(transfer_op(container, element_id, target))) {
          move_selection(CONTAINER_SECTION_IDS[target], CONTAINER_SLOTS[target])
        }
      },
      can_move_up: position > 0,
      can_move_down: position >= 0 && position < visible.length - 1,
      onMoveUp: () => apply_layout_op(shift_op(container, element_id, -1)),
      onMoveDown: () => apply_layout_op(shift_op(container, element_id, 1)),
    }
  })
}

function post_card_index(anchor: HTMLElement, card: Element): number {
  return Array.from(anchor.querySelectorAll<Element>(POST_CARD_SELECTOR)).indexOf(card)
}

interface RingBox {
  top: number
  left: number
  width: number
  height: number
}

function same_box(a: RingBox | null, b: RingBox | null): boolean {
  return a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height)
}

/** Selected post card outline as an overlay: it survives re-renders of the card, which reset its classes. */
function PostCardRing(props: { anchor: HTMLElement; index: number }) {
  const [box, set_box] = createSignal<RingBox | null>(null, { equals: same_box })

  const measure = () => {
    const card = props.anchor.querySelectorAll(POST_CARD_SELECTOR)[props.index]
    if (!card) return set_box(null)
    const outer = props.anchor.getBoundingClientRect()
    const inner = card.getBoundingClientRect()
    set_box({ top: inner.top - outer.top, left: inner.left - outer.left, width: inner.width, height: inner.height })
  }

  onMount(() => {
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(props.anchor)
    const mutations = new MutationObserver(measure)
    mutations.observe(props.anchor, { childList: true, subtree: true, attributeFilter: ['class', 'style'] })
    props.anchor.addEventListener('transitionend', measure)
    window.addEventListener('resize', measure)
    onCleanup(() => {
      resize.disconnect()
      mutations.disconnect()
      props.anchor.removeEventListener('transitionend', measure)
      window.removeEventListener('resize', measure)
    })
  })

  return (
    <Portal mount={props.anchor}>
      <Show when={box()}>
        {(current) => (
          <div
            aria-hidden="true"
            data-canvas-chrome=""
            class={`pointer-events-none absolute z-10 rounded-xl ${SELECTED_RING_CLASS}`}
            style={{
              top: `${current().top}px`,
              left: `${current().left}px`,
              width: `${current().width}px`,
              height: `${current().height}px`,
            }}
          />
        )}
      </Show>
    </Portal>
  )
}

function HostedPopover(props: { initial: CanvasSelection; clicked_card: Element | null; on_edit_site: () => void }) {
  const element_id = props.initial.element_id ?? ''
  const entry = get_element_entry(element_id)
  const move = create_move_controls(props.initial.section_id, element_id)
  const anchor = () => selection()?.anchor_el ?? props.initial.anchor_el

  const card_index = props.clicked_card ? post_card_index(props.initial.anchor_el, props.clicked_card) : -1

  return (
    <>
      <Show when={card_index >= 0 && anchor()} keyed>
        {(anchor_el) => <PostCardRing anchor={anchor_el} index={card_index} />}
      </Show>
      <Show when={entry}>
        {(current) => (
          <Dynamic
            component={current().popover}
            section_id={props.initial.section_id}
            element_id={element_id}
            slot={props.initial.slot}
            anchor={anchor()}
            on_close={close_popover}
            move={move()}
            initial_tab={card_index >= 0 ? 'card' : 'list'}
            show_comments_tab={active_tab() === 'comments'}
            on_edit_site={props.on_edit_site}
          />
        )}
      </Show>
    </>
  )
}

/** Mounts the popover of the selected canvas element next to it; one popover at a time. */
export function PopoverHost(props: PopoverHostProps) {
  let last_pointer_target: Element | null = null

  const remember_pointer = (event: PointerEvent) => {
    last_pointer_target = event.target instanceof Element ? event.target : null
  }
  const forget_pointer = () => {
    last_pointer_target = null
  }

  onMount(() => {
    document.addEventListener('pointerdown', remember_pointer, true)
    document.addEventListener('keydown', forget_pointer, true)
    onCleanup(() => {
      document.removeEventListener('pointerdown', remember_pointer, true)
      document.removeEventListener('keydown', forget_pointer, true)
    })
  })

  const open_key = createMemo(() => {
    const current = selection()
    if (!is_popover_open() || !current || !get_element_entry(current.element_id)) return null
    return `${current.section_id}:${current.element_id}`
  })

  const clicked_card = (current: CanvasSelection): Element | null => {
    if (current.element_id !== 'posts') return null
    const card = last_pointer_target?.closest(POST_CARD_SELECTOR) ?? null
    return card && current.anchor_el.contains(card) ? card : null
  }

  return (
    <Show when={open_key()} keyed>
      {(_key) => {
        const current = untrack(selection)
        if (!current) return null
        return (
          <HostedPopover initial={current} clicked_card={clicked_card(current)} on_edit_site={props.on_edit_site} />
        )
      }}
    </Show>
  )
}
