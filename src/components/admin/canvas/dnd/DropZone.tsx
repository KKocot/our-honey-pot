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
  /** Source types this zone claims over sortables inside it; it also catches the pointer in gaps next to it. */
  claim_types?: string[]
  label?: string
  empty_label?: string
  idle_empty_label?: string
  class?: string
  children?: JSX.Element
}

const ZONE_ID_PREFIX = 'zone:'

type ZoneCollisionDetector = NonNullable<Parameters<typeof useDroppable>[0]['collisionDetector']>
type ZoneCollision = NonNullable<ReturnType<ZoneCollisionDetector>>

// Numeric values of CollisionType / CollisionPriority from @dnd-kit/abstract, which is not a direct dependency.
const PROXIMITY: ZoneCollision['type'] = 0
const SHAPE_INTERSECTION: ZoneCollision['type'] = 1
const POINTER_INTERSECTION: ZoneCollision['type'] = 2
const CLAIM_PRIORITY = 4
/** Pointer this close to a claiming zone still targets it, covering slot gaps (gap-8, mt-6, mb-4). */
const GAP_CATCH_PX = 48

interface Point {
  x: number
  y: number
}

interface Rect {
  top: number
  right: number
  bottom: number
  left: number
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function distance_to_rect(point: Point, rect: Rect): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right)
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom)
  return Math.hypot(dx, dy)
}

export function DropZone(props: DropZoneProps) {
  const operation = useDragOperation()

  const accepts_source = (type: unknown, source_id: string) =>
    !props.disabled && props.accept.includes(String(type)) && (props.can_accept?.(source_id) ?? true)

  const claims = (type: unknown) => props.claim_types?.includes(String(type)) ?? false

  // Default dnd-kit detection (pointer ?? shape intersection) for other sources; claimed sources outrank sortables and
  // snap to the nearest zone within GAP_CATCH_PX, so a pointer in a gap never lands on a random sortable or nothing.
  const detect_collision: ZoneCollisionDetector = ({ droppable: entry, dragOperation }) => {
    const shape = entry.shape
    const pointer = dragOperation.position.current
    if (!shape) return null
    const claimed = claims(dragOperation.source?.type)
    const priority = claimed ? CLAIM_PRIORITY : (props.depth ?? 0)

    if (shape.containsPoint(pointer)) {
      return {
        id: entry.id,
        value: 1 / Math.max(1, distance(shape.center, pointer)),
        type: POINTER_INTERSECTION,
        priority,
      }
    }
    if (claimed) {
      const gap = distance_to_rect(pointer, shape.boundingRectangle)
      return gap <= GAP_CATCH_PX ? { id: entry.id, value: 1 / (1 + gap), type: PROXIMITY, priority } : null
    }
    const drag_shape = dragOperation.shape?.current
    if (!drag_shape) return null
    const area = drag_shape.intersectionArea(shape)
    if (!area) return null
    const ratio = area / (drag_shape.area + shape.area - area)
    return {
      id: entry.id,
      value: ratio / Math.max(1, distance(shape.center, pointer)),
      type: SHAPE_INTERSECTION,
      priority,
    }
  }

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
    // Left unset: a set collisionPriority overrides the priority returned by detect_collision.
    collisionDetector: detect_collision,
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
        return 'after:opacity-100 after:outline-2 after:outline-primary/40 after:bg-primary/5'
      case 'over':
        return 'after:opacity-100 after:outline-2 after:outline-primary after:bg-primary/10'
      default:
        // Filled zones are already outlined by the section guide inside them; only an empty slot needs its own.
        return props.count === 0 ? 'after:opacity-100 after:outline-1 after:outline-text-muted/40' : 'after:opacity-0'
    }
  }

  return (
    <div
      ref={droppable.ref}
      role="group"
      aria-label={props.label}
      data-drop-zone={props.id}
      class={`relative rounded-lg after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:outline-dashed after:transition-opacity after:duration-150 after:ease-out motion-reduce:after:transition-none ${state_class()} ${props.class ?? ''}`}
    >
      {props.children}
      <Show when={props.count === 0}>
        <div class="flex min-h-16 items-center justify-center rounded-lg px-3 text-center text-sm text-text-muted">
          {drag_state() === 'idle'
            ? (props.idle_empty_label ?? 'Empty slot — drag an element here')
            : (props.empty_label ?? 'Drop here')}
        </div>
      </Show>
    </div>
  )
}
