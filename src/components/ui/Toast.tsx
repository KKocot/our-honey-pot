// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, Show } from 'solid-js'

export type ToastType = 'success' | 'error' | 'warning'

const TOAST_BG: Record<ToastType, string> = {
  success: 'bg-success',
  error: 'bg-error',
  warning: 'bg-warning',
}

interface ToastState {
  message: string
  type: ToastType
  visible: boolean
}

const [toastState, setToastState] = createSignal<ToastState>({
  message: '',
  type: 'success',
  visible: false,
})

let timeoutId: number | undefined

export function showToast(message: string, type: ToastType = 'success') {
  if (timeoutId) {
    clearTimeout(timeoutId)
  }

  setToastState({ message, type, visible: true })

  timeoutId = window.setTimeout(() => {
    setToastState((prev) => ({ ...prev, visible: false }))
  }, 3000)
}

export function Toast() {
  const state = toastState

  return (
    <div
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
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </Show>
        <Show when={state().type === 'error'}>
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Show>
        <span class="font-medium">{state().message}</span>
      </div>
    </div>
  )
}
