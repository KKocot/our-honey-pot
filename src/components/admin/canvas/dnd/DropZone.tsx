// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createMemo, Show, type JSX } from 'solid-js'
import { useDragOperation, useDroppable } from '@dnd-kit/solid'
import { isSortable } from '@dnd-kit/solid/sortable'
import type { DropZoneData } from './DndRoot'

export interface DropZoneProps {
  /** Container id; sortable children must use the same value as `container_id`. */
  id: string
  /** Number of items rendered in the zone; a drop on the empty area appends at this index. */
  count: number
  accept: string[]
  /** Slot not allowed in the current mode: dimmed, no highlight, no drop. */
  disabled?: boolean
  /** Extra veto, e.g. to stop a CardSection from being dropped into its own descendants. */
  can_accept?: (source_id: string) => boolean
  depth?: number
  label?: string
  empty_label?: string
  idle_empty_label?: string
  class?: string
  children?: JSX.Element
}

const ZONE_ID_PREFIX = 'zone:'

export function DropZone(props: DropZoneProps) {
  const operation = useDragOperation()

  const accepts_source = (type: unknown, source_id: string) =>
    !props.disabled && props.accept.includes(String(type)) && (props.can_accept?.(source_id) ?? true)

  const droppable = useDroppable<DropZoneData>({
    get id() {
      return `${ZONE_ID_PREFIX}${props.id}`
    },
    get data() {
      return { container_id: props.id, count: props.count }
    },
    get disabled() {
      return props.disabled ?? false
    },
    get collisionPriority() {
      return props.depth ?? 0
    },
    accept: (source) => accepts_source(source.type, String(source.id)),
  })

  const drag_state = createMemo<'idle' | 'allowed' | 'blocked' | 'over'>(() => {
    const source = operation.source()
    if (!source) return 'idle'
    if (!accepts_source(source.type, String(source.id))) return 'blocked'
    const target = operation.target()
    const over = droppable.isDropTarget() || (target != null && isSortable(target) && String(target.group) === props.id)
    return over ? 'over' : 'allowed'
  })

  const state_class = () => {
    switch (drag_state()) {
      case 'blocked':
        return 'opacity-50 cursor-not-allowed'
      case 'allowed':
        return 'after:opacity-100 after:outline-primary/40 after:bg-primary/5'
      case 'over':
        return 'after:opacity-100 after:outline-primary after:bg-primary/10'
      default:
        return 'after:opacity-0'
    }
  }

  return (
    <div
      ref={droppable.ref}
      role="group"
      aria-label={props.label}
      data-drop-zone={props.id}
      class={`relative rounded-lg after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:outline-2 after:outline-dashed after:transition-opacity after:duration-150 after:ease-out motion-reduce:after:transition-none ${state_class()} ${props.class ?? ''}`}
    >
      {props.children}
      <Show when={props.count === 0}>
        <div
          class={`flex items-center justify-center rounded-lg px-3 text-center text-sm text-text-muted ${
            drag_state() === 'idle' ? 'min-h-12' : 'min-h-16'
          }`}
        >
          {drag_state() === 'idle'
            ? (props.idle_empty_label ?? 'Empty slot — drag an element here')
            : (props.empty_label ?? 'Drop here')}
        </div>
      </Show>
    </div>
  )
}
