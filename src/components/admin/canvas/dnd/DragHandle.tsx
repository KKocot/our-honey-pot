// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { GripVertical } from 'lucide-solid'
import type { SortableHandle } from './use_sortable'

export interface DragHandleProps {
  sortable: SortableHandle
  /** Accessible name, e.g. "Move Author Profile". */
  label: string
  class?: string
}

export function DragHandle(props: DragHandleProps) {
  return (
    <button
      type="button"
      ref={props.sortable.handle_ref}
      aria-label={props.label}
      aria-roledescription="draggable"
      class={`inline-flex size-8 touch-none items-center justify-center rounded p-1 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary max-md:size-11 max-md:p-2.5 ${
        props.sortable.is_dragging() ? 'cursor-grabbing' : 'cursor-grab'
      } ${props.class ?? ''}`}
    >
      <span class="inline-flex size-6 items-center justify-center rounded bg-primary text-primary-text">
        <GripVertical size={16} aria-hidden="true" />
      </span>
    </button>
  )
}
