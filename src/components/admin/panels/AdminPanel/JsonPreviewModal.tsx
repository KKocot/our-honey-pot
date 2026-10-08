// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { Show, For, createEffect, createUniqueId, on, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'
import { CircleCheck, Copy, GitCompareArrows, LoaderCircle, X } from 'lucide-solid'
import { showToast } from '../../../ui'
import { lock_scroll, unlock_scroll } from '../../../../lib/scroll-lock'

type DiffViewMode = 'diff' | 'old' | 'new'

interface JsonPreviewModalProps {
  show: boolean
  is_loading: boolean
  diff_view_mode: DiffViewMode
  json_old_content: Record<string, unknown> | null
  json_new_content: Record<string, unknown> | null
  json_diff: Array<{ key: string; oldValue: unknown; newValue: unknown; type: 'changed' | 'added' | 'removed' }>
  onClose: () => void
  onChangeDiffMode: (mode: DiffViewMode) => void
}

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

const VIEW_TAB_BASE =
  'rounded-md px-3 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11'

/** Dev tools > Compare with saved (JSON): current settings vs the config stored on Hive. */
export function JsonPreviewModal(props: JsonPreviewModalProps) {
  const title_id = `json-preview-title-${createUniqueId()}`
  let dialog: HTMLDivElement | undefined

  const count = (type: 'changed' | 'added' | 'removed') => props.json_diff.filter((d) => d.type === type).length

  const handle_copy_json = async () => {
    try {
      const content =
        props.diff_view_mode === 'old'
          ? JSON.stringify(props.json_old_content, null, 2)
          : JSON.stringify(props.json_new_content, null, 2)
      await navigator.clipboard.writeText(content || '')
      showToast('JSON copied to clipboard', 'success')
    } catch (error) {
      showToast(`Failed to copy JSON: ${error instanceof Error ? error.message : 'clipboard unavailable'}`, 'error')
    }
  }

  const handle_keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      props.onClose()
      return
    }
    if (event.key !== 'Tab' || !dialog) return
    const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  createEffect(
    on(
      () => props.show,
      (show) => {
        if (!show) return
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
        lock_scroll()
        const frame = requestAnimationFrame(() => dialog?.focus())
        onCleanup(() => {
          cancelAnimationFrame(frame)
          unlock_scroll()
          if (previous?.isConnected) previous.focus()
        })
      }
    )
  )

  const view_tab = (mode: DiffViewMode, label: string, active_class: string) => (
    <button
      type="button"
      aria-pressed={props.diff_view_mode === mode}
      onClick={() => props.onChangeDiffMode(mode)}
      class={`${VIEW_TAB_BASE} ${props.diff_view_mode === mode ? active_class : 'text-text-muted hover:text-text'}`}
    >
      {label}
    </button>
  )

  return (
    <Show when={props.show}>
      <Portal>
        <div
          class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={props.onClose}
        >
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title_id}
            aria-busy={props.is_loading}
            tabindex="-1"
            onKeyDown={handle_keydown}
            onClick={(e) => e.stopPropagation()}
            class="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-2xl border border-border bg-bg-card p-6 shadow-2xl focus:outline-none"
          >
            <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="flex size-10 items-center justify-center rounded-full bg-warning/10">
                  <GitCompareArrows size={20} aria-hidden="true" class="text-warning" />
                </div>
                <div>
                  <h2 id={title_id} class="text-lg font-bold text-text">
                    Compare with saved
                  </h2>
                  <p class="text-xs text-text-muted">Current settings against the config saved on Hive</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <div role="group" aria-label="View" class="flex rounded-lg border border-border bg-bg p-1">
                  {view_tab('diff', `Changes (${props.json_diff.length})`, 'bg-primary text-primary-text')}
                  {view_tab('old', 'Saved (Hive)', 'bg-error/20 text-error')}
                  {view_tab('new', 'Current', 'bg-success/20 text-success')}
                </div>
                <Show when={props.diff_view_mode !== 'diff'}>
                  <button
                    type="button"
                    onClick={handle_copy_json}
                    class="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-text transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary max-md:min-h-11"
                  >
                    <Copy size={16} aria-hidden="true" />
                    Copy
                  </button>
                </Show>
                <button
                  type="button"
                  onClick={props.onClose}
                  class="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11 max-md:min-w-11"
                  aria-label="Close comparison"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
            </div>

            <Show when={props.is_loading}>
              <div role="status" class="flex flex-1 items-center justify-center gap-3 py-8 text-text-muted">
                <LoaderCircle
                  size={20}
                  aria-hidden="true"
                  class="animate-spin text-primary motion-reduce:animate-none"
                />
                <span>Loading config from Hive...</span>
              </div>
            </Show>

            <Show when={!props.is_loading}>
              <Show when={props.diff_view_mode === 'diff'}>
                <div class="flex-1 overflow-auto rounded-lg border border-border bg-bg">
                  <Show
                    when={props.json_diff.length > 0}
                    fallback={
                      <div class="p-8 text-center text-text-muted">
                        <CircleCheck size={48} aria-hidden="true" class="mx-auto mb-3 opacity-50" />
                        <p class="font-medium">No changes detected</p>
                        <p class="mt-1 text-xs">Current settings match the config saved on Hive</p>
                      </div>
                    }
                  >
                    <ul class="divide-y divide-border">
                      <For each={props.json_diff}>
                        {(item) => (
                          <li class="p-3">
                            <div class="mb-2 flex items-center gap-2">
                              <span
                                class={`rounded px-2 py-0.5 text-xs font-medium ${
                                  item.type === 'changed'
                                    ? 'bg-warning/20 text-warning'
                                    : item.type === 'added'
                                      ? 'bg-success/20 text-success'
                                      : 'bg-error/20 text-error'
                                }`}
                              >
                                {item.type.toUpperCase()}
                              </span>
                              <span class="font-mono text-sm font-semibold text-text">{item.key}</span>
                            </div>
                            <div class="grid gap-2 text-xs md:grid-cols-2">
                              <div class="rounded border border-error/20 bg-error/5 p-2">
                                <p class="mb-1 text-xs font-medium uppercase text-error/70">Saved (Hive)</p>
                                <pre class="whitespace-pre-wrap break-all font-mono text-error/90">
                                  {item.oldValue === undefined ? '(not set)' : JSON.stringify(item.oldValue, null, 2)}
                                </pre>
                              </div>
                              <div class="rounded border border-success/20 bg-success/5 p-2">
                                <p class="mb-1 text-xs font-medium uppercase text-success/70">Current</p>
                                <pre class="whitespace-pre-wrap break-all font-mono text-success/90">
                                  {item.newValue === undefined ? '(removed)' : JSON.stringify(item.newValue, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </div>
              </Show>

              <Show when={props.diff_view_mode === 'old'}>
                <div class="flex-1 overflow-auto rounded-lg border border-error/30 bg-bg">
                  <Show
                    when={props.json_old_content}
                    fallback={<p class="p-8 text-center text-text-muted">No config saved on Hive yet</p>}
                  >
                    <pre class="overflow-x-auto whitespace-pre p-4 font-mono text-xs text-text">
                      {JSON.stringify(props.json_old_content, null, 2)}
                    </pre>
                  </Show>
                </div>
              </Show>

              <Show when={props.diff_view_mode === 'new'}>
                <div class="flex-1 overflow-auto rounded-lg border border-success/30 bg-bg">
                  <pre class="overflow-x-auto whitespace-pre p-4 font-mono text-xs text-text">
                    {JSON.stringify(props.json_new_content, null, 2)}
                  </pre>
                </div>
              </Show>
            </Show>

            <div class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-text-muted">
              <div class="flex items-center gap-4">
                <span class="flex items-center gap-1">
                  <span aria-hidden="true" class="size-2 rounded-full bg-warning" />
                  {count('changed')} changed
                </span>
                <span class="flex items-center gap-1">
                  <span aria-hidden="true" class="size-2 rounded-full bg-success" />
                  {count('added')} added
                </span>
                <span class="flex items-center gap-1">
                  <span aria-hidden="true" class="size-2 rounded-full bg-error" />
                  {count('removed')} removed
                </span>
              </div>
              <span class="text-warning">Preview only, nothing is sent to Hive</span>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  )
}
