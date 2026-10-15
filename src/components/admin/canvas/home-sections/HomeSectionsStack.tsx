// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { children, createEffect, createMemo, For, onCleanup, onMount, Show, type JSX } from 'solid-js'
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Settings, Trash2 } from 'lucide-solid'
import { showToast } from '../../../ui'
import type { SettingsData } from '../../types/settings'
import { home_lead_section_ids } from '../../../../shared/components/sections'
import { DropZone } from '../dnd/DropZone'
import { DragHandle } from '../dnd/DragHandle'
import { SORTABLE_SOURCE_CLASS, use_sortable } from '../dnd/use_sortable'
import {
  CANVAS_CHROME_ATTR,
  FOCUS_RING_CLASS,
  GUIDE_CLASS,
  PAGE_ELEMENT_DND_TYPE,
  SELECTED_RING_CLASS,
  remove_content_from_tab_order,
} from '../EditableElement'
import { PAGE_SECTION_DND_TYPE } from '../EditableSection'
import {
  add_home_section,
  duplicate_home_section,
  home_section_popover_key,
  home_sections_of,
  move_home_section_down,
  move_home_section_up,
  remove_home_section,
  toggle_home_section_hidden,
  type AddableHomeSectionType,
} from '../home-section-ops'
import {
  clear_selection,
  close_popover,
  escape_selection,
  is_home_section_selected,
  is_popover_open,
  select_home_section,
  update_selection_anchor,
} from '../selection'
import { AddSectionMenu } from './AddSectionMenu'
import {
  DELETE_UNDO_MS,
  HOME_OP_LABELS,
  HOME_SECTION_DND_TYPE,
  add_option_state,
  add_section_index,
  build_home_stack,
  canvas_section_html,
  home_sortable_id,
  home_zone_id,
  neighbor_after_delete,
  type HomeStackItem,
} from './model'

/** Pure settings op, applied by the editor as one history step. */
export type HomeSectionOp = (current: SettingsData) => Partial<SettingsData> | null

export interface HomeSectionsStackProps {
  /** Settings shown on the canvas (store or a hover preview). */
  view: () => SettingsData
  /** The posts section (main slot with the community posts), placed at the position of `posts` in the stack. */
  posts: JSX.Element
  /** Applies `op` as exactly one undo step labelled `label`; false when the op was rejected. */
  commit: (op: HomeSectionOp, label: string) => boolean
  /** Undoes history step `step` when it is still the last one. */
  undo_step: (step: number) => boolean
  /** Id of the last history step (null without history); read right after `commit`. */
  last_step: () => number | null
  /** `lead`: only the sections lifted above the sidebars (`home_lead_section_ids`); `body`: all the others. */
  part?: 'lead' | 'body'
}

type ActionName = 'up' | 'down' | 'duplicate' | 'hide' | 'delete'

const LAYOUT_DND_TYPES = [PAGE_ELEMENT_DND_TYPE, PAGE_SECTION_DND_TYPE]
// Undoes the canvas zoom below 100% (EditorCanvas sets --canvas-zoom), so toolbar targets stay 32px.
const TOOLBAR_COUNTER_ZOOM = 'max(1, calc(1 / var(--canvas-zoom, 1)))'
const TOOL_BUTTON_CLASS =
  'inline-flex size-8 items-center justify-center rounded text-text-muted hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-40 max-md:size-11'

/** Home sections around the posts section on the canvas, rendered by the public renderer (ADR 6ac6089d63221e857a3bac13). */
export function HomeSectionsStack(props: HomeSectionsStackProps) {
  let root: HTMLDivElement | undefined
  const posts_content = children(() => props.posts)

  const stack = createMemo(() => build_home_stack(props.view()))
  const items_by_id = createMemo(() => new Map(stack().items.map((item) => [item.section.id, item])))
  // Same lead split as index.astro, so a width:full hero sits above the sidebars on both.
  const lead_ids = createMemo(() => new Set(home_lead_section_ids(props.view())))
  const in_part = (id: string) => props.part === undefined || lead_ids().has(id) === (props.part === 'lead')
  const before_ids = createMemo(() => stack().before.map((item) => item.section.id).filter(in_part))
  const after_ids = createMemo(() => (props.part === 'lead' ? [] : stack().after.map((item) => item.section.id)))
  const posts_id = createMemo(() => (props.part === 'lead' ? null : (stack().posts?.section.id ?? null)))

  const focus_section = (id: string | null | undefined, action?: ActionName) => {
    if (!id) return
    queueMicrotask(() => {
      // A move can carry the section into the other stack part (lead above the sidebars or body), so search the page.
      const wrapper = (root?.ownerDocument ?? document).querySelector<HTMLElement>(`[data-home-section="${CSS.escape(id)}"]`)
      if (!wrapper) return
      const control = action ? wrapper.querySelector<HTMLButtonElement>(`[data-home-action="${action}"]`) : null
      const target = control && !control.disabled ? control : wrapper
      target.focus({ preventScroll: true })
      wrapper.scrollIntoView?.({ block: 'nearest' })
    })
  }

  const section_id_at = (index: number) => stack().items[index]?.section.id

  const add = (type: AddableHomeSectionType, slot: number) => {
    const index = add_section_index(type, slot)
    if (props.commit((current) => add_home_section(current, type, { index }), HOME_OP_LABELS.add)) {
      focus_section(section_id_at(index))
    }
  }

  const move = (id: string, direction: 'up' | 'down') => {
    const op: HomeSectionOp =
      direction === 'up'
        ? (current) => move_home_section_up(current, id)
        : (current) => move_home_section_down(current, id)
    if (props.commit(op, HOME_OP_LABELS.move)) focus_section(id, direction)
  }

  const duplicate = (id: string) => {
    if (props.commit((current) => duplicate_home_section(current, id), HOME_OP_LABELS.duplicate)) {
      const index = items_by_id().get(id)?.index
      focus_section(index === undefined ? null : section_id_at(index + 1))
    }
  }

  const toggle_hidden = (id: string) => {
    const label = items_by_id().get(id)?.hidden ? HOME_OP_LABELS.show : HOME_OP_LABELS.hide
    if (props.commit((current) => toggle_home_section_hidden(current, id), label)) focus_section(id, 'hide')
  }

  const remove = (id: string) => {
    const neighbor = neighbor_after_delete(home_sections_of(props.view()), id)
    if (is_home_section_selected(id)) clear_selection()
    if (!props.commit((current) => remove_home_section(current, id), HOME_OP_LABELS.delete)) {
      showToast('This section cannot be deleted.', 'error')
      return
    }
    const step = props.last_step()
    focus_section(neighbor)
    showToast('Section deleted', 'success', {
      duration_ms: DELETE_UNDO_MS,
      action:
        step === null
          ? undefined
          : {
              label: 'Undo',
              on_click: () => {
                if (props.undo_step(step)) focus_section(id)
                else showToast('Undo is no longer available for this section.', 'error')
              },
            },
    })
  }

  const actions: SectionActions = { add, move, duplicate, toggle_hidden, remove }

  const render_item = (id: string, content?: () => JSX.Element) => (
    <Show when={items_by_id().get(id)}>
      {(item) => <HomeSectionItem item={item} view={props.view} content={content} actions={actions} />}
    </Show>
  )

  return (
    <div ref={root} data-home-sections-stack="">
      <Show when={before_ids().length > 0}>
        <div class="home-sections home-sections-before">
          <For each={before_ids()}>{(id) => render_item(id)}</For>
        </div>
      </Show>
      <Show when={posts_id()} keyed fallback={posts_content()}>
        {(id) => render_item(id, posts_content)}
      </Show>
      <Show when={after_ids().length > 0}>
        <div class="home-sections home-sections-after">
          <For each={after_ids()}>{(id) => render_item(id)}</For>
        </div>
      </Show>
    </div>
  )
}

interface SectionActions {
  add: (type: AddableHomeSectionType, index: number) => void
  move: (id: string, direction: 'up' | 'down') => void
  duplicate: (id: string) => void
  toggle_hidden: (id: string) => void
  remove: (id: string) => void
}

interface HomeSectionItemProps {
  item: () => HomeStackItem
  view: () => SettingsData
  /** Set for `posts`: its canvas content instead of rendered section HTML. */
  content?: () => JSX.Element
  actions: SectionActions
}

function HomeSectionItem(props: HomeSectionItemProps) {
  let content_el: HTMLDivElement | undefined
  let gear: HTMLButtonElement | undefined

  const item = () => props.item()
  const id = item().section.id
  const is_posts = props.content !== undefined
  const label = () => `${item().label} section`
  const html = createMemo(() => (is_posts ? '' : canvas_section_html(item().section, props.view(), item().priority)))
  const selected = () => !is_posts && is_home_section_selected(id)
  const popover_shown = () => selected() && is_popover_open()

  const sortable = use_sortable({
    id: home_sortable_id(id),
    index: () => 0,
    container_id: () => home_zone_id(id),
    type: HOME_SECTION_DND_TYPE,
    label,
    optimistic_sorting: false,
  })

  const open_popover = () => {
    if (gear) select_home_section(id, gear)
  }

  const toggle_popover = () => (popover_shown() ? close_popover() : open_popover())

  // Rendered links and buttons are preview only: a click selects the section instead of navigating.
  const intercept_click = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element) || target.closest(`[${CANVAS_CHROME_ATTR}]`)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.type === 'click') open_popover()
  }

  const handle_key_down = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget || is_posts) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      open_popover()
    } else if (event.key === 'Escape' && selected()) {
      event.preventDefault()
      escape_selection()
    }
  }

  onMount(() => {
    if (is_posts || !content_el) return
    const content = content_el
    content.addEventListener('click', intercept_click, true)
    content.addEventListener('auxclick', intercept_click, true)
    const stop_tab_guard = remove_content_from_tab_order(content)
    onCleanup(() => {
      content.removeEventListener('click', intercept_click, true)
      content.removeEventListener('auxclick', intercept_click, true)
      stop_tab_guard()
    })
  })

  createEffect(() => {
    if (gear) update_selection_anchor(home_section_popover_key(id), null, gear)
  })

  const state_class = () => {
    if (sortable.is_drag_source()) return SORTABLE_SOURCE_CLASS
    if (selected()) return SELECTED_RING_CLASS
    if (is_posts) return FOCUS_RING_CLASS
    if (item().placeholder) return `outline-1 outline-dashed outline-warning ${FOCUS_RING_CLASS}`
    return `${GUIDE_CLASS} hover:outline-text-muted ${FOCUS_RING_CLASS}`
  }

  const toolbar_class = () =>
    selected()
      ? 'opacity-100'
      : 'pointer-events-none opacity-0 group-hover/hs:pointer-events-auto group-hover/hs:opacity-100 group-focus-within/hs:pointer-events-auto group-focus-within/hs:opacity-100'

  const position_text = () => `${item().index + 1} of ${item().total}`

  return (
    <DropZone
      id={home_zone_id(id)}
      count={1}
      accept={[HOME_SECTION_DND_TYPE]}
      claim_types={[HOME_SECTION_DND_TYPE]}
      ignore_types={LAYOUT_DND_TYPES}
    >
      <div
        ref={sortable.ref}
        data-home-section={id}
        tabIndex={is_posts ? -1 : 0}
        role="group"
        aria-label={`${label()}, ${position_text()}${item().hidden ? ', hidden' : ''}${item().placeholder ? ', placeholder content' : ''}`}
        onKeyDown={handle_key_down}
        class={`group/hs relative rounded-lg outline-offset-4 ${state_class()}`}
      >
        <div
          data-canvas-chrome=""
          role="toolbar"
          aria-label={`${label()} actions`}
          style={{ zoom: TOOLBAR_COUNTER_ZOOM }}
          class={`absolute top-0 left-0 z-20 flex -translate-y-full items-center gap-0.5 rounded-md border border-border bg-bg-card/95 px-0.5 shadow-sm transition-opacity duration-100 ease-out motion-reduce:transition-none ${toolbar_class()}`}
        >
          <DragHandle sortable={sortable} label={`Drag ${label()} to swap with another section`} />
          <span aria-hidden="true" class="px-1 text-[0.6875rem] leading-5 font-medium text-text-muted">
            {item().label}
          </span>
          <button
            type="button"
            data-home-action="up"
            aria-label={`Move ${label()} up`}
            disabled={!item().can_move_up}
            onClick={() => props.actions.move(id, 'up')}
            class={TOOL_BUTTON_CLASS}
          >
            <ArrowUp size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            data-home-action="down"
            aria-label={`Move ${label()} down`}
            disabled={!item().can_move_down}
            onClick={() => props.actions.move(id, 'down')}
            class={TOOL_BUTTON_CLASS}
          >
            <ArrowDown size={14} aria-hidden="true" />
          </button>
          <Show when={item().removable}>
            <button
              type="button"
              data-home-action="duplicate"
              aria-label={`Duplicate ${label()}`}
              disabled={!item().can_duplicate}
              title={item().can_duplicate ? undefined : 'Limit reached'}
              onClick={() => props.actions.duplicate(id)}
              class={TOOL_BUTTON_CLASS}
            >
              <Copy size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              data-home-action="hide"
              aria-label={item().hidden ? `Show ${label()}` : `Hide ${label()}`}
              aria-pressed={item().hidden}
              onClick={() => props.actions.toggle_hidden(id)}
              class={TOOL_BUTTON_CLASS}
            >
              <Show when={item().hidden} fallback={<EyeOff size={14} aria-hidden="true" />}>
                <Eye size={14} aria-hidden="true" />
              </Show>
            </button>
            <button
              type="button"
              data-home-action="delete"
              aria-label={`Delete ${label()}`}
              onClick={() => props.actions.remove(id)}
              class={`${TOOL_BUTTON_CLASS} hover:text-error`}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              ref={gear}
              data-home-section-gear={id}
              aria-label={`${label()} settings`}
              aria-haspopup="dialog"
              aria-expanded={popover_shown()}
              onClick={toggle_popover}
              class={`${TOOL_BUTTON_CLASS} ${popover_shown() ? 'bg-primary text-primary-text hover:bg-primary hover:text-primary-text' : ''}`}
            >
              <Settings size={14} aria-hidden="true" />
            </button>
          </Show>
        </div>
        <Show when={item().hidden || item().placeholder}>
          <div
            data-canvas-chrome=""
            aria-hidden="true"
            class="pointer-events-none absolute top-2 right-2 z-10 flex gap-1 text-[0.6875rem] leading-5 font-medium"
          >
            <Show when={item().hidden}>
              <span class="rounded-sm border border-border bg-bg-card px-1.5 text-text-muted">Hidden</span>
            </Show>
            <Show when={item().placeholder}>
              <span class="rounded-sm border border-warning/40 bg-bg-card px-1.5 text-warning">
                Placeholder content
              </span>
            </Show>
          </div>
        </Show>
        <Show when={!is_posts} fallback={props.content?.()}>
          <div
            ref={content_el}
            data-home-section-content=""
            class={item().hidden ? 'opacity-50' : undefined}
            innerHTML={html()}
          />
        </Show>
        <Show when={item().index === 0}>
          <div class="absolute inset-x-0 top-2 z-20">
            <AddSectionMenu
              position={0}
              option_state={(type) => add_option_state(props.view(), type)}
              on_add={(type) => props.actions.add(type, 0)}
            />
          </div>
        </Show>
        <div class="absolute inset-x-0 bottom-0 z-20 translate-y-1/2">
          <AddSectionMenu
            position={item().index + 1}
            option_state={(type) => add_option_state(props.view(), type)}
            on_add={(type) => props.actions.add(type, item().index + 1)}
          />
        </div>
      </div>
    </DropZone>
  )
}
