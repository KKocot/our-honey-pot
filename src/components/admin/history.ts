// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, type Accessor } from 'solid-js'
import type { SettingsData } from './types/settings'

export const HISTORY_LIMIT = 50
export const HISTORY_COALESCE_MS = 600

export interface HistoryOptions {
  limit?: number
  coalesce_ms?: number
  now?: () => number
}

export interface PushOptions {
  label: string
  /** Consecutive pushes with the same key inside the coalesce window merge into one step. */
  coalesce_key?: string
}

export interface HistoryStep {
  snapshot: SettingsData
  label: string
}

export interface SettingsHistory {
  reset: (baseline: SettingsData) => void
  push: (next: SettingsData, options: PushOptions) => boolean
  undo: () => HistoryStep | null
  redo: () => HistoryStep | null
  clear: () => void
  seal: () => void
  present: () => SettingsData | null
  can_undo: Accessor<boolean>
  can_redo: Accessor<boolean>
  undo_label: Accessor<string | null>
  /** Id of the step `undo` would revert; ids are unique per history, so a caller can tell its own step apart. */
  undo_id: Accessor<number | null>
  redo_label: Accessor<string | null>
  size: Accessor<{ undo: number; redo: number }>
}

interface Entry {
  snapshot: SettingsData
  label: string
  id: number
}

interface CoalesceWindow {
  key: string
  at: number
}

/** Per-editor undo/redo stack of full SettingsData snapshots; no shared module state. */
export function create_settings_history(options: HistoryOptions = {}): SettingsHistory {
  const limit = Math.max(1, options.limit ?? HISTORY_LIMIT)
  const coalesce_ms = options.coalesce_ms ?? HISTORY_COALESCE_MS
  const now = options.now ?? Date.now

  let past: Entry[] = []
  let future: Entry[] = []
  let current: SettingsData | null = null
  let current_serialized = ''
  let open_window: CoalesceWindow | null = null
  let next_id = 1

  const [revision, set_revision] = createSignal(0)
  const bump = () => set_revision((value) => value + 1)

  const set_current = (snapshot: SettingsData) => {
    current = structuredClone(snapshot)
    current_serialized = JSON.stringify(current)
  }

  const reset = (baseline: SettingsData) => {
    past = []
    future = []
    open_window = null
    set_current(baseline)
    bump()
  }

  const push = (next: SettingsData, { label, coalesce_key }: PushOptions): boolean => {
    if (current === null) {
      reset(next)
      return false
    }
    const serialized = JSON.stringify(next)
    if (serialized === current_serialized) return false

    const at = now()
    const coalesces =
      coalesce_key !== undefined &&
      open_window !== null &&
      open_window.key === coalesce_key &&
      at - open_window.at <= coalesce_ms &&
      past.length > 0

    if (!coalesces) {
      past.push({ snapshot: current, label, id: next_id++ })
      if (past.length > limit) past.splice(0, past.length - limit)
    }

    future = []
    open_window = coalesce_key === undefined ? null : { key: coalesce_key, at }
    current = structuredClone(next)
    current_serialized = serialized
    bump()
    return true
  }

  const move = (from: Entry[], to: Entry[]): HistoryStep | null => {
    const entry = from.pop()
    if (!entry || current === null) return null
    to.push({ snapshot: current, label: entry.label, id: entry.id })
    open_window = null
    set_current(entry.snapshot)
    bump()
    return { snapshot: structuredClone(entry.snapshot), label: entry.label }
  }

  const tracked =
    <T>(read: () => T): Accessor<T> =>
    () => {
      revision()
      return read()
    }

  return {
    reset,
    push,
    undo: () => move(past, future),
    redo: () => move(future, past),
    clear: () => {
      past = []
      future = []
      open_window = null
      bump()
    },
    seal: () => {
      open_window = null
    },
    present: () => (current === null ? null : structuredClone(current)),
    can_undo: tracked(() => past.length > 0),
    can_redo: tracked(() => future.length > 0),
    undo_label: tracked(() => past.at(-1)?.label ?? null),
    undo_id: tracked(() => past.at(-1)?.id ?? null),
    redo_label: tracked(() => future.at(-1)?.label ?? null),
    size: tracked(() => ({ undo: past.length, redo: future.length })),
  }
}
