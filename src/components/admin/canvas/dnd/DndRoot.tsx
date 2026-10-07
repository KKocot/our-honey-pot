// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createEffect, createSignal, onCleanup, Show, type JSX, type ParentProps } from 'solid-js'
import { DragDropProvider, DragOverlay, KeyboardSensor, PointerSensor, useDragOperation } from '@dnd-kit/solid'
import { isSortable } from '@dnd-kit/solid/sortable'
import { prefers_reduced_motion } from '../../../../shared/utils/animations'
import {
  Accessibility,
  AutoScroller,
  Cursor,
  Feedback,
  PointerActivationConstraints,
  PreventSelection,
  type DragDropManager,
  type DragEndEvent,
  type DragStartEvent,
  type Draggable,
  type Droppable,
} from '@dnd-kit/dom'

export interface DndPosition {
  container_id: string
  index: number
}

export interface DndMoveEvent {
  id: string
  source: DndPosition
  target: DndPosition
}

export interface DndRootProps extends ParentProps {
  onDragEnd: (event: DndMoveEvent) => void
  onDragStart?: (id: string) => void
  onDragCancel?: () => void
  /** Human-readable container name for screen reader announcements (e.g. slot label). */
  container_label?: (container_id: string) => string
}

/** Drop zone payload; DropZone registers droppables with this shape. */
export interface DropZoneData {
  container_id: string
  count: number
}

const TOUCH_LONG_PRESS_MS = 400
const TOUCH_TOLERANCE_PX = 5
const POINTER_DISTANCE_PX = 4
const DROP_ANIMATION = { duration: 200, easing: 'ease-in-out' }
const INSERTION_OFFSET_PX = 4

function item_label(source: Draggable | null | undefined): string {
  if (!source) return ''
  const label = source.data?.label
  return typeof label === 'string' ? label : String(source.id)
}

function is_drop_zone_data(data: unknown): data is DropZoneData {
  return typeof data === 'object' && data !== null && typeof (data as DropZoneData).container_id === 'string'
}

function resolve_target(source: Draggable, target: Droppable | null): DndPosition | null {
  if (!isSortable(source)) return null
  const current: DndPosition = { container_id: String(source.group), index: source.index }
  if (
    target &&
    !isSortable(target) &&
    is_drop_zone_data(target.data) &&
    target.data.container_id !== current.container_id
  ) {
    return { container_id: target.data.container_id, index: target.data.count }
  }
  return current
}

function create_announcements(container_label: (id: string) => string) {
  const position_text = (source: Draggable) => {
    if (!isSortable(source)) return ''
    return ` Position ${source.index + 1} in ${container_label(String(source.group))}.`
  }
  return {
    dragstart({ operation: { source } }: { operation: { source: Draggable | null } }) {
      if (!source) return undefined
      return `Picked up ${item_label(source)}.${position_text(source)}`
    },
    dragover({ operation: { source } }: { operation: { source: Draggable | null } }) {
      if (!source) return undefined
      return `${item_label(source)}.${position_text(source)}`
    },
    dragend({
      operation: { source, target },
      canceled,
    }: {
      operation: { source: Draggable | null; target: Droppable | null }
      canceled: boolean
    }) {
      if (!source) return undefined
      if (canceled) return 'Drag cancelled.'
      const destination = resolve_target(source, target)
      if (!destination) return `Dropped ${item_label(source)}.`
      return `Moved to ${container_label(destination.container_id)}, position ${destination.index + 1}.`
    },
  }
}

export function DndRoot(props: DndRootProps) {
  const reduced_motion = prefers_reduced_motion()
  const container_label = (id: string) => props.container_label?.(id) ?? id

  const sensors = [
    PointerSensor.configure({
      activationConstraints(event: PointerEvent) {
        if (event.pointerType === 'touch') {
          return [new PointerActivationConstraints.Delay({ value: TOUCH_LONG_PRESS_MS, tolerance: TOUCH_TOLERANCE_PX })]
        }
        return [new PointerActivationConstraints.Distance({ value: POINTER_DISTANCE_PX })]
      },
    }),
    KeyboardSensor,
  ]

  const plugins = [
    Accessibility.configure({
      announcements: create_announcements(container_label),
      screenReaderInstructions: {
        draggable:
          'To pick up an item, press Space or Enter. Use the arrow keys to move it, Space or Enter to drop it, Escape to cancel.',
      },
    }),
    AutoScroller,
    Cursor,
    Feedback,
    PreventSelection,
  ]

  const handle_drag_start = (event: DragStartEvent) => {
    const source = event.operation.source
    if (!source) return
    if (event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType === 'touch') {
      navigator.vibrate?.(10)
    }
    props.onDragStart?.(String(source.id))
  }

  const handle_drag_end = (event: DragEndEvent, _manager: DragDropManager) => {
    const { source, target } = event.operation
    if (!source || !isSortable(source) || event.canceled) {
      props.onDragCancel?.()
      return
    }
    const destination = resolve_target(source, target)
    const origin: DndPosition = { container_id: String(source.initialGroup), index: source.initialIndex }
    if (!destination || (destination.container_id === origin.container_id && destination.index === origin.index)) {
      props.onDragCancel?.()
      return
    }
    props.onDragEnd({ id: String(source.id), source: origin, target: destination })
  }

  return (
    <DragDropProvider sensors={sensors} plugins={plugins} onDragStart={handle_drag_start} onDragEnd={handle_drag_end}>
      {props.children}
      <DragOverlay dropAnimation={reduced_motion ? null : DROP_ANIMATION} class="pointer-events-none z-50">
        {(source: Draggable) => <GhostChip label={item_label(source)} reduced_motion={reduced_motion} />}
      </DragOverlay>
      <InsertionLine />
    </DragDropProvider>
  )
}

function GhostChip(props: { label: string; reduced_motion: boolean }): JSX.Element {
  return (
    <span
      class={`inline-flex items-center rounded-md border border-border bg-bg-card px-2 py-1 text-sm font-medium text-text shadow-lg ${
        props.reduced_motion ? '' : 'scale-[1.02] transition-transform duration-150 ease-out starting:scale-100'
      }`}
    >
      {props.label}
    </span>
  )
}

interface LineGeometry {
  x: number
  y: number
  length: number
  vertical: boolean
}

function InsertionLine(): JSX.Element {
  const operation = useDragOperation()
  const [line, set_line] = createSignal<LineGeometry | null>(null)

  createEffect(() => {
    const source = operation.source()
    if (!source || !isSortable(source)) {
      set_line(null)
      return
    }
    let frame = 0
    const tick = () => {
      const moved = source.index !== source.initialIndex || source.group !== source.initialGroup
      const element = source.element
      if (moved && element) {
        const rect = element.getBoundingClientRect()
        const vertical = source.data?.orientation === 'horizontal'
        set_line(
          vertical
            ? { x: rect.left - INSERTION_OFFSET_PX, y: rect.top, length: rect.height, vertical }
            : { x: rect.left, y: rect.top - INSERTION_OFFSET_PX, length: rect.width, vertical }
        )
      } else {
        set_line(null)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    onCleanup(() => {
      cancelAnimationFrame(frame)
      set_line(null)
    })
  })

  return (
    <Show when={line()}>
      {(geometry) => (
        <div
          aria-hidden="true"
          class={`pointer-events-none fixed top-0 left-0 z-50 flex items-center ${geometry().vertical ? 'w-1.5 -translate-x-1/2 flex-col' : 'h-1.5 -translate-y-1/2'}`}
          style={{
            transform: `translate3d(${geometry().x}px, ${geometry().y}px, 0)`,
            [geometry().vertical ? 'height' : 'width']: `${geometry().length}px`,
          }}
        >
          <span class="size-1.5 shrink-0 rounded-full bg-primary" />
          <span class={`flex-1 bg-primary ${geometry().vertical ? 'w-0.5' : 'h-0.5'}`} />
          <span class="size-1.5 shrink-0 rounded-full bg-primary" />
        </div>
      )}
    </Show>
  )
}
