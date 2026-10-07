// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { Accessor } from 'solid-js'
import { useDragDropMonitor } from '@dnd-kit/solid'
import { useSortable } from '@dnd-kit/solid/sortable'
import { prefers_reduced_motion } from '../../../../shared/utils/animations'

export type DndOrientation = 'vertical' | 'horizontal'

/** Payload attached to every sortable item, read by DndRoot for ghost, insertion line and announcements. */
export interface SortableItemData {
  label: string
  orientation: DndOrientation
  [key: string]: unknown
}

export interface UseSortableOptions {
  id: string
  index: Accessor<number>
  /** Container the item lives in (slot id or parent CardSection id for nested CardLayout). */
  container_id: Accessor<string>
  type: string
  accept?: string[]
  label: Accessor<string>
  orientation?: Accessor<DndOrientation>
  disabled?: Accessor<boolean>
  /** Nesting depth; deeper items win collisions over their parent section. */
  depth?: number
}

export interface SortableHandle {
  ref: (element: HTMLElement) => void
  handle_ref: (element: HTMLElement) => void
  is_dragging: Accessor<boolean>
  is_drag_source: Accessor<boolean>
  is_drop_target: Accessor<boolean>
}

/** Classes for the dragged source element; the source stays in the DOM and marks the drop position. */
export const SORTABLE_SOURCE_CLASS = 'opacity-40 outline-2 outline-dashed outline-text-muted rounded-lg'

const FLIP_DURATION_MS = 200

export function use_sortable(options: UseSortableOptions): SortableHandle {
  const reduced_motion = prefers_reduced_motion()

  const sortable = useSortable<SortableItemData>({
    get id() {
      return options.id
    },
    get index() {
      return options.index()
    },
    get group() {
      return options.container_id()
    },
    get type() {
      return options.type
    },
    get accept() {
      return options.accept ?? [options.type]
    },
    get disabled() {
      return options.disabled?.() ?? false
    },
    get collisionPriority() {
      return options.depth ?? 0
    },
    get data() {
      return { label: options.label(), orientation: options.orientation?.() ?? 'vertical' }
    },
    // useSortable in 0.5.0 maps `null` back to defaults, so zero duration is the only way to disable FLIP.
    transition: { duration: reduced_motion ? 0 : FLIP_DURATION_MS, easing: 'ease-in-out' },
  })

  // Optimistic sorting rewrites index/group during drag; resync with store values once the consumer applied the move (or rejected it).
  useDragDropMonitor({
    onDragEnd() {
      queueMicrotask(() => {
        sortable.sortable.group = options.container_id()
        sortable.sortable.index = options.index()
      })
    },
  })

  return {
    ref: sortable.ref,
    handle_ref: sortable.handleRef,
    is_dragging: sortable.isDragging,
    is_drag_source: sortable.isDragSource,
    is_drop_target: sortable.isDropTarget,
  }
}
