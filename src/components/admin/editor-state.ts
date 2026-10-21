// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createEffect, createSignal, on, onCleanup, untrack, type Accessor } from 'solid-js'
import { create_settings_history, type HistoryOptions, type HistoryStep, type SettingsHistory } from './history'
import type { SettingsData } from './types/settings'

export type EditorZoom = 'fit' | 0.5 | 0.75 | 1
export type EditorDevice = 'desktop' | 'tablet' | 'mobile'
export type EditorPanelTab = 'templates' | 'theme' | 'site'
export type EditorMode = 'design' | 'moderation'
export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error'

export const EDITOR_ZOOMS: readonly EditorZoom[] = ['fit', 0.5, 0.75, 1]
export const DEVICE_WIDTHS: Readonly<Record<EditorDevice, number>> = { desktop: 1280, tablet: 834, mobile: 390 }
export const UNSAVED_COUNT_DEBOUNCE_MS = 300

export interface EditorStateDeps {
  /** Plain snapshot of the live settings store. */
  read: () => SettingsData
  /** Replace the live settings store with `snapshot` (undo/redo). */
  apply: (snapshot: SettingsData) => void
  /** Bumped on every settings edit. */
  version: Accessor<number>
  dirty: Accessor<boolean>
  set_dirty: (value: boolean) => void
  history?: HistoryOptions
}

export interface EditorState {
  zoom: Accessor<EditorZoom>
  set_zoom: (zoom: EditorZoom) => void
  device: Accessor<EditorDevice>
  set_device: (device: EditorDevice) => void
  device_width: Accessor<number>
  panel_tab: Accessor<EditorPanelTab>
  set_panel_tab: (tab: EditorPanelTab) => void
  mode: Accessor<EditorMode>
  set_mode: (mode: EditorMode) => void
  save_status: Accessor<SaveStatus>
  unsaved_count: Accessor<number>
  /** Per-instance guard so a second Save click never starts a parallel broadcast. */
  is_saving: () => boolean
  begin_save: () => boolean
  end_save: (result: 'saved' | 'kept_dirty' | 'failed') => void
  history: SettingsHistory
  /** Settings were (re)loaded from the server: new baseline, history restarts from it. */
  mark_loaded: () => void
  /**
   * Pushes the live settings as one history step; runs on every settings edit. `label` overrides the computed
   * "Changed ..." label, `coalesce_key` (e.g. one form field) replaces the default per-top-level-key coalescing.
   */
  record_edit: (label?: string, coalesce_key?: string) => boolean
  /** Runs `edit` against the live store and records everything it changed as exactly one step labelled `label`. */
  apply_edit: (edit: () => void, label: string, coalesce_key?: string) => boolean
  undo: () => HistoryStep | null
  redo: () => HistoryStep | null
}

/** Top-level keys whose JSON differs between two settings records. */
export function changed_keys(previous: object | null, next: object): string[] {
  const before = (previous ?? {}) as Record<string, unknown>
  const after = next as Record<string, unknown>
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])).sort()
}

function humanize_key(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
}

export function history_label(keys: string[]): string {
  if (keys.length === 1) return `Changed ${humanize_key(keys[0])}`
  return `Changed ${keys.length} settings`
}

/** Editor shell state for one AdminPanel instance; call inside a component (owns effects), never at module scope. */
export function create_editor_state(deps: EditorStateDeps): EditorState {
  const [zoom, set_zoom] = createSignal<EditorZoom>('fit')
  const [device, set_device] = createSignal<EditorDevice>('desktop')
  const [panel_tab, set_panel_tab] = createSignal<EditorPanelTab>('templates')
  const [mode, set_mode] = createSignal<EditorMode>('design')
  const [saving, set_saving] = createSignal(false)
  const [failed, set_failed] = createSignal(false)
  const [baseline, set_baseline] = createSignal<SettingsData | null>(null)
  const [unsaved_count, set_unsaved_count] = createSignal(0)
  const history = create_settings_history(deps.history)
  let applying = false

  const record_edit = (label?: string, coalesce_key?: string): boolean => {
    const next = deps.read()
    const keys = changed_keys(history.present(), next)
    if (keys.length === 0) return false
    const default_key = label === undefined ? keys.join(',') : `${label}|${keys.join(',')}`
    // Prefixed so a field key never equals the top-level key of an untagged edit (e.g. "footer_text").
    const key = coalesce_key === undefined ? default_key : `field#${coalesce_key}`
    return history.push(next, { label: label ?? history_label(keys), coalesce_key: key })
  }

  const apply_edit = (edit: () => void, label: string, coalesce_key?: string): boolean => {
    record_edit()
    applying = true
    try {
      edit()
    } finally {
      applying = false
    }
    return record_edit(label, coalesce_key)
  }

  const mark_loaded = () => {
    const snapshot = deps.read()
    set_baseline(snapshot)
    history.reset(snapshot)
  }

  createEffect(
    on(deps.dirty, (dirty) => {
      if (dirty) return
      set_baseline(untrack(deps.read))
      set_failed(false)
    })
  )

  createEffect(
    on(
      deps.version,
      () => {
        if (!applying) record_edit()
      },
      { defer: true }
    )
  )

  createEffect(
    on([deps.version, deps.dirty, baseline], ([, dirty, base]) => {
      if (!dirty || !base) {
        set_unsaved_count(0)
        return
      }
      const timer = setTimeout(
        () => set_unsaved_count(changed_keys(base, deps.read()).length),
        UNSAVED_COUNT_DEBOUNCE_MS
      )
      onCleanup(() => clearTimeout(timer))
    })
  )

  const restore = (step: HistoryStep | null): HistoryStep | null => {
    if (!step) return null
    applying = true
    try {
      deps.apply(step.snapshot)
      const base = baseline()
      deps.set_dirty(base === null || changed_keys(base, step.snapshot).length > 0)
    } finally {
      applying = false
    }
    return step
  }

  const save_status = (): SaveStatus => {
    if (saving()) return 'saving'
    if (!deps.dirty()) return 'saved'
    return failed() ? 'error' : 'dirty'
  }

  return {
    zoom,
    set_zoom,
    device,
    set_device,
    device_width: () => DEVICE_WIDTHS[device()],
    panel_tab,
    set_panel_tab,
    mode,
    set_mode,
    save_status,
    unsaved_count,
    is_saving: saving,
    begin_save: () => {
      if (saving()) return false
      set_saving(true)
      set_failed(false)
      return true
    },
    end_save: (result) => {
      set_saving(false)
      set_failed(result === 'failed')
      if (result === 'saved') history.seal()
    },
    history,
    mark_loaded,
    record_edit,
    apply_edit,
    undo: () => {
      record_edit()
      return restore(history.undo())
    },
    redo: () => {
      if (record_edit()) return null
      return restore(history.redo())
    },
  }
}
