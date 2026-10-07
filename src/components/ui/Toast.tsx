// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, Show } from 'solid-js'

export type ToastType = 'success' | 'error' | 'warning'

const TOAST_BG: Record<ToastType, string> = {
  success: 'bg-success',
  error: 'bg-error',
  warning: 'bg-warning',
}

const DEFAULT_DURATION_MS = 3000

export interface ToastAction {
  label: string
  on_click: () => void
}

export interface ToastOptions {
  action?: ToastAction
  duration_ms?: number
}

interface ToastState {
  id: number
  message: string
  type: ToastType
  visible: boolean
  action?: ToastAction
}

const [toastState, setToastState] = createSignal<ToastState>({
  id: 0,
  message: '',
  type: 'success',
  visible: false,
})

let timeoutId: number | undefined
let lastId = 0

/** Shows the global toast and returns its id for `dismissToast`. */
export function showToast(message: string, type: ToastType = 'success', options: ToastOptions = {}): number {
  if (timeoutId) {
    clearTimeout(timeoutId)
  }

  const id = ++lastId
  setToastState({ id, message, type, visible: true, action: options.action })

  timeoutId = window.setTimeout(() => dismissToast(id), options.duration_ms ?? DEFAULT_DURATION_MS)
  return id
}

/** Hides the toast; with `id`, only when that toast is still the one shown. */
export function dismissToast(id?: number) {
  const current = toastState()
  if (!current.visible || (id !== undefined && current.id !== id)) return
  clearTimeout(timeoutId)
  timeoutId = undefined
  setToastState((prev) => ({ ...prev, visible: false }))
}

function run_action(action: ToastAction) {
  dismissToast()
  action.on_click()
}

export function Toast() {
  const state = toastState

  return (
    <div
      role="status"
      aria-live="polite"
      class={`
        fixed top-4 right-4 z-50 transform transition-all duration-300 ease-out
        ${state().visible ? 'translate-x-0 opacity-100' : 'translate-x-[calc(100%+1rem)] opacity-0 pointer-events-none'}
      `}
    >
      <div
        class={`
          px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 text-white
          ${TOAST_BG[state().type]}
        `}
      >
        <Show when={state().type === 'success'}>
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </Show>
        <Show when={state().type === 'warning'}>
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </Show>
        <Show when={state().type === 'error'}>
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Show>
        <span class="font-medium">{state().message}</span>
        <Show when={state().visible && state().action}>
          {(action) => (
            <button
              type="button"
              onClick={() => run_action(action())}
              class="ml-2 shrink-0 rounded-sm font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {action().label}
            </button>
          )}
        </Show>
      </div>
    </div>
  )
}
