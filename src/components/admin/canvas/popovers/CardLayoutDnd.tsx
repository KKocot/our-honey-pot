// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createMemo, For, onCleanup, Show, type JSX } from 'solid-js'
import { ArrowDownUp, ArrowLeftRight, Plus, X } from 'lucide-solid'
import { apply_layout_op, settings } from '../../queries'
import { dismissToast, showToast } from '../../../ui'
import { collectAllElementIds, migrateCardLayout, type CardLayout, type CardSection, type CardSectionChild } from '../../types/layout'
import { defaultSettings, type SettingsData } from '../../types/settings'
import {
  add_card_element,
  add_card_section,
  move_card_node,
  remove_card_node,
  toggle_card_orientation,
  type CardNodePath,
} from '../layout-ops'
import { DndRoot, type DndMoveEvent } from '../dnd/DndRoot'
import { DropZone } from '../dnd/DropZone'
import { DragHandle } from '../dnd/DragHandle'
import { SORTABLE_SOURCE_CLASS, use_sortable, type DndOrientation } from '../dnd/use_sortable'

export type CardLayoutKey = 'postCardLayout' | 'commentCardLayout' | 'authorProfileLayout2'

export interface CardLayoutDndProps {
  layout_key: CardLayoutKey
  element_labels: Record<string, string>
  /** Elements that may be added; defaults to every key of `element_labels`. */
  element_ids?: ReadonlyArray<string>
  /** Accessible name of the editor, e.g. "Post card layout". */
  label: string
  /** Card rendered with the current layout above the editable structure. */
  preview?: JSX.Element
}

const ROOT_CONTAINER_ID = '__card-root'
const ELEMENT_TYPE = 'card-element'
const SECTION_TYPE = 'card-section'
const ELEMENT_PREFIX = 'el:'
const SECTION_PREFIX = 'sec:'
const UNDO_TIMEOUT_MS = 5000

const ICON_BUTTON =
  'inline-flex size-8 shrink-0 items-center justify-center rounded text-text-muted hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 max-md:size-11'

function read_layout(source: Pick<SettingsData, CardLayoutKey>, key: CardLayoutKey): CardLayout {
  return migrateCardLayout(source[key]) ?? structuredClone(defaultSettings[key])
}

function to_changes(key: CardLayoutKey, layout: CardLayout): Partial<SettingsData> {
  switch (key) {
    case 'postCardLayout':
      return { postCardLayout: layout }
    case 'commentCardLayout':
      return { commentCardLayout: layout }
    case 'authorProfileLayout2':
      return { authorProfileLayout2: layout }
  }
}

function find_section(sections: CardSection[], section_id: string, path: number[] = []): number[] | null {
  for (const [index, section] of sections.entries()) {
    const current = [...path, index]
    if (section.id === section_id) return current
    const nested = find_in_children(section, section_id, current, 'section')
    if (nested) return nested
  }
  return null
}

function find_in_children(
  section: CardSection,
  id: string,
  path: number[],
  kind: 'element' | 'section'
): number[] | null {
  for (const [index, child] of section.children.entries()) {
    const current = [...path, index]
    if (child.type === 'element') {
      if (kind === 'element' && child.id === id) return current
      continue
    }
    if (kind === 'section' && child.section.id === id) return current
    const nested = find_in_children(child.section, id, current, kind)
    if (nested) return nested
  }
  return null
}

function find_element(sections: CardSection[], element_id: string): number[] | null {
  for (const [index, section] of sections.entries()) {
    const found = find_in_children(section, element_id, [index], 'element')
    if (found) return found
  }
  return null
}

function section_at(sections: CardSection[], path: CardNodePath): CardSection | null {
  let section: CardSection | undefined = sections[path[0]]
  for (const index of path.slice(1)) {
    const child: CardSectionChild | undefined = section?.children[index]
    section = child?.type === 'section' ? child.section : undefined
  }
  return section ?? null
}

/** True when `candidate_id` is `ancestor_id` itself or nested anywhere inside it. */
function section_contains(sections: CardSection[], ancestor_id: string, candidate_id: string): boolean {
  if (ancestor_id === candidate_id) return true
  const path = find_section(sections, ancestor_id)
  const ancestor = path ? section_at(sections, path) : null
  return ancestor !== null && find_in_children(ancestor, candidate_id, [], 'section') !== null
}

function new_section_id(): string {
  return `sec-${crypto.randomUUID().slice(0, 8)}`
}

interface EditorContext {
  layout: () => CardLayout
  label_of: (element_id: string) => string
  unused: () => string[]
  add_element: (section_id: string, element_id: string) => void
  add_section: (parent_id: string) => void
  toggle_orientation: (section_id: string) => void
  remove_section: (section_id: string) => void
  remove_element: (element_id: string) => void
}

export function CardLayoutDnd(props: CardLayoutDndProps) {
  const layout = createMemo(() => read_layout(settings, props.layout_key))
  const all_ids = () => [...(props.element_ids ?? Object.keys(props.element_labels))]
  const unused = createMemo(() => {
    const used = new Set(collectAllElementIds(layout()))
    return all_ids().filter((id) => !used.has(id))
  })
  const label_of = (element_id: string) => props.element_labels[element_id] ?? element_id

  let undo_toast_id: number | undefined
  const clear_undo = () => {
    if (undo_toast_id !== undefined) dismissToast(undo_toast_id)
    undo_toast_id = undefined
  }
  onCleanup(clear_undo)

  const commit = (op: (current: CardLayout) => CardLayout | null): CardLayout | null => {
    const captured: { before: CardLayout | null } = { before: null }
    const ok = apply_layout_op((current) => {
      const before = read_layout(current, props.layout_key)
      const next = op(before)
      if (!next) return null
      captured.before = before
      return to_changes(props.layout_key, next)
    })
    clear_undo()
    return ok ? captured.before : null
  }

  const commit_at_section = (section_id: string, op: (current: CardLayout, path: CardNodePath) => CardLayout | null) =>
    commit((current) => {
      const path = find_section(current.sections, section_id)
      return path ? op(current, path) : null
    })

  const offer_undo = (message: string, before: CardLayout | null) => {
    if (!before) return
    undo_toast_id = showToast(message, 'success', {
      duration_ms: UNDO_TIMEOUT_MS,
      action: {
        label: 'Undo',
        on_click: () => {
          undo_toast_id = undefined
          apply_layout_op(() => to_changes(props.layout_key, before))
        },
      },
    })
  }

  const context: EditorContext = {
    layout,
    label_of,
    unused,
    add_element: (section_id, element_id) =>
      commit_at_section(section_id, (current, path) => add_card_element(current, path, element_id, all_ids())),
    add_section: (parent_id) =>
      commit_at_section(parent_id, (current, path) => add_card_section(current, path, new_section_id())),
    toggle_orientation: (section_id) => commit_at_section(section_id, toggle_card_orientation),
    remove_section: (section_id) => offer_undo('Section removed', commit_at_section(section_id, remove_card_node)),
    remove_element: (element_id) =>
      offer_undo(
        `Removed: ${label_of(element_id)}`,
        commit((current) => {
          const path = find_element(current.sections, element_id)
          return path ? remove_card_node(current, path) : null
        })
      ),
  }

  const handle_drag_end = (event: DndMoveEvent) => {
    const is_section = event.id.startsWith(SECTION_PREFIX)
    const raw_id = event.id.slice(is_section ? SECTION_PREFIX.length : ELEMENT_PREFIX.length)
    commit((current) => {
      const from = is_section ? find_section(current.sections, raw_id) : find_element(current.sections, raw_id)
      if (!from) return null
      const to_parent =
        event.target.container_id === ROOT_CONTAINER_ID ? [] : find_section(current.sections, event.target.container_id)
      if (!to_parent) return null
      return move_card_node(current, from, to_parent, event.target.index)
    })
  }

  const container_label = (container_id: string) => {
    if (container_id === ROOT_CONTAINER_ID) return 'the card'
    const path = find_section(layout().sections, container_id)
    return path ? `section ${path.map((index) => index + 1).join('.')}` : 'section'
  }

  return (
    <div class="flex flex-col gap-3" role="group" aria-label={props.label}>
      <Show when={props.preview}>
        <div aria-hidden="true" class="pointer-events-none select-none">
          {props.preview}
        </div>
      </Show>

      <DndRoot onDragEnd={handle_drag_end} container_label={container_label}>
        <DropZone
          id={ROOT_CONTAINER_ID}
          count={layout().sections.length}
          accept={[SECTION_TYPE]}
          label="Card sections"
          idle_empty_label="The card is empty — add a section"
          class="flex flex-col gap-2"
        >
          <For each={layout().sections}>
            {(section, index) => (
              <SectionItem
                section={section}
                index={index()}
                container_id={ROOT_CONTAINER_ID}
                parent_orientation="vertical"
                depth={0}
                context={context}
              />
            )}
          </For>
        </DropZone>
      </DndRoot>

      <button
        type="button"
        onClick={() => commit((current) => add_card_section(current, [], new_section_id()))}
        class="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-sm text-text-muted hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
      >
        <Plus size={14} aria-hidden="true" />
        Add section
      </button>

    </div>
  )
}

interface SectionItemProps {
  section: CardSection
  index: number
  container_id: string
  parent_orientation: DndOrientation
  depth: number
  context: EditorContext
}

function SectionItem(props: SectionItemProps) {
  const is_vertical = () => props.section.orientation === 'vertical'
  const orientation_name = () => (is_vertical() ? 'vertical' : 'horizontal')
  const sortable = use_sortable({
    id: `${SECTION_PREFIX}${props.section.id}`,
    index: () => props.index,
    container_id: () => props.container_id,
    type: SECTION_TYPE,
    accept: props.depth === 0 ? [SECTION_TYPE] : [SECTION_TYPE, ELEMENT_TYPE],
    label: () => `Section (${orientation_name()})`,
    orientation: () => props.parent_orientation,
    depth: props.depth,
  })

  const accepts = (source_id: string) =>
    !source_id.startsWith(SECTION_PREFIX) ||
    !section_contains(props.context.layout().sections, source_id.slice(SECTION_PREFIX.length), props.section.id)

  return (
    <div
      ref={sortable.ref}
      class={`rounded-lg border border-dashed border-border bg-bg-card p-1 ${sortable.is_drag_source() ? SORTABLE_SOURCE_CLASS : ''}`}
    >
      <div class="flex items-center gap-1">
        <DragHandle sortable={sortable} label={`Move section (${orientation_name()})`} />
        <button
          type="button"
          onClick={() => props.context.toggle_orientation(props.section.id)}
          aria-label={`Section orientation: ${orientation_name()}. Toggle`}
          title={`Orientation: ${orientation_name()}`}
          class="inline-flex h-6 items-center gap-1 rounded-sm bg-bg-secondary px-1.5 text-xs text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-primary max-md:h-11"
        >
          <Show when={is_vertical()} fallback={<ArrowLeftRight size={12} aria-hidden="true" />}>
            <ArrowDownUp size={12} aria-hidden="true" />
          </Show>
        </button>
        <span class="flex-1" />
        <AddElementSelect
          options={props.context.unused()}
          label_of={props.context.label_of}
          onSelect={(element_id) => props.context.add_element(props.section.id, element_id)}
        />
        <button
          type="button"
          class={ICON_BUTTON}
          aria-label="Add subsection"
          title="Add subsection"
          onClick={() => props.context.add_section(props.section.id)}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          class={ICON_BUTTON}
          aria-label="Remove section"
          onClick={() => props.context.remove_section(props.section.id)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <DropZone
        id={props.section.id}
        count={props.section.children.length}
        accept={[ELEMENT_TYPE, SECTION_TYPE]}
        can_accept={accepts}
        depth={props.depth + 1}
        label={`Section content (${orientation_name()})`}
        idle_empty_label="Empty section"
        class={`mt-1 flex gap-1 p-0.5 ${is_vertical() ? 'flex-col' : 'flex-row flex-wrap'}`}
      >
        <For each={props.section.children}>
          {(child, index) => (
            <Show
              when={child.type === 'section' ? child.section : undefined}
              fallback={
                <ElementItem
                  element_id={child.type === 'element' ? child.id : ''}
                  index={index()}
                  container_id={props.section.id}
                  orientation={props.section.orientation}
                  depth={props.depth + 1}
                  context={props.context}
                />
              }
            >
              {(nested) => (
                <SectionItem
                  section={nested()}
                  index={index()}
                  container_id={props.section.id}
                  parent_orientation={props.section.orientation}
                  depth={props.depth + 1}
                  context={props.context}
                />
              )}
            </Show>
          )}
        </For>
      </DropZone>
    </div>
  )
}

interface ElementItemProps {
  element_id: string
  index: number
  container_id: string
  orientation: DndOrientation
  depth: number
  context: EditorContext
}

function ElementItem(props: ElementItemProps) {
  const label = () => props.context.label_of(props.element_id)
  const sortable = use_sortable({
    id: `${ELEMENT_PREFIX}${props.element_id}`,
    index: () => props.index,
    container_id: () => props.container_id,
    type: ELEMENT_TYPE,
    accept: [ELEMENT_TYPE, SECTION_TYPE],
    label,
    orientation: () => props.orientation,
    depth: props.depth,
  })

  return (
    <div
      ref={sortable.ref}
      class={`inline-flex min-w-0 items-center rounded-md border border-border bg-bg-secondary pr-0.5 text-xs text-text ${
        sortable.is_drag_source() ? SORTABLE_SOURCE_CLASS : ''
      }`}
    >
      <DragHandle sortable={sortable} label={`Move ${label()}`} />
      <span class="min-w-0 truncate px-1">{label()}</span>
      <button
        type="button"
        class={ICON_BUTTON}
        aria-label={`Remove ${label()}`}
        onClick={() => props.context.remove_element(props.element_id)}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

function AddElementSelect(props: {
  options: string[]
  label_of: (element_id: string) => string
  onSelect: (element_id: string) => void
}) {
  return (
    <select
      aria-label="Add element"
      disabled={props.options.length === 0}
      value=""
      onChange={(event) => {
        const element_id = event.currentTarget.value
        event.currentTarget.value = ''
        if (element_id) props.onSelect(element_id)
      }}
      class="h-8 w-24 min-w-0 rounded border border-border bg-bg px-1 text-xs text-text focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 max-md:h-11"
    >
      <option value="">{props.options.length === 0 ? 'All in use' : '+ Element'}</option>
      <For each={props.options}>{(element_id) => <option value={element_id}>{props.label_of(element_id)}</option>}</For>
    </select>
  )
}
