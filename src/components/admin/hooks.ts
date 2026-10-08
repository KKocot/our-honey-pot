// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, createEffect, on, type Accessor } from 'solid-js'
import { currentUser, isAuthenticated, login, logout, needsReauth, type AuthUser } from '../auth'
import { showToast } from '../ui'

/**
 * Return type for createLocalInput hook.
 * [localValue, setLocalValue, commitValue]
 */
export type LocalInputReturn = [Accessor<string>, (value: string) => void, () => void]

/**
 * Creates a local input state that syncs with an external getter.
 * Updates are committed to the store only on blur (not on every keystroke).
 *
 * If the setter returns `false`, the commit is treated as rejected
 * and the local value rolls back to the current getter value.
 *
 * @param getter - Reactive accessor for the external/store value
 * @param setter - Callback to commit the value back to the store. Return false to reject.
 * @returns [localValue, setLocalValue, commitValue] tuple
 */
export function createLocalInput(
  getter: Accessor<string>,
  setter: (value: string) => boolean | void
): LocalInputReturn {
  const [localValue, setLocalValue] = createSignal(getter())

  // Sync local state when external value changes (e.g., loading from Hive)
  createEffect(on(getter, (val) => setLocalValue(val), { defer: true }))

  // Commit local value to store (call on blur)
  // If setter returns false, rollback local value to current getter value
  const commitValue = () => {
    if (localValue() !== getter()) {
      const result = setter(localValue())
      if (result === false) {
        setLocalValue(getter())
      }
    }
  }

  return [localValue, setLocalValue, commitValue]
}

/**
 * Return type for createLocalNumericInput hook.
 * [localValue, setLocalValue, commitValue]
 */
export type LocalNumericInputReturn = [Accessor<number>, (value: number) => void, () => void]

/**
 * Numeric variant of createLocalInput for number inputs.
 * Commits on blur with clamping to min/max range.
 *
 * @param getter - Reactive accessor for the external/store value
 * @param setter - Callback to commit the clamped value back to the store
 * @param options - Min/max bounds and fallback value
 * @returns [localValue, setLocalValue, commitValue] tuple
 */
export function createLocalNumericInput(
  getter: Accessor<number>,
  setter: (value: number) => void,
  options: { min: number; max: number; fallback?: number }
): LocalNumericInputReturn {
  const fallback = options.fallback ?? options.min
  const clamp = (val: number) => Math.min(Math.max(val || fallback, options.min), options.max)

  const [localValue, setLocalValue] = createSignal(clamp(getter()))

  // Sync local state when external value changes
  createEffect(on(getter, (val) => setLocalValue(clamp(val)), { defer: true }))

  // Commit clamped value to store (call on blur)
  const commitValue = () => {
    const clamped = clamp(localValue())
    setLocalValue(clamped)
    if (clamped !== getter()) {
      setter(clamped)
    }
  }

  return [localValue, setLocalValue, commitValue]
}

/** Login modal + expired-session banner state for one admin panel instance. */
export function create_admin_session() {
  const [login_open, set_login_open] = createSignal(false)
  const [reauth_session, set_reauth_session] = createSignal<ReturnType<typeof needsReauth>>(null)

  createEffect(() => {
    set_reauth_session(isAuthenticated() ? null : needsReauth())
  })

  const username = (): string | null => (isAuthenticated() ? (currentUser()?.username ?? null) : null)

  const handle_login_success = (user: AuthUser) => {
    login(user)
    set_login_open(false)
    set_reauth_session(null)
    showToast(`Welcome, @${user.username}!`, 'success')
  }

  const handle_logout = () => {
    logout()
    showToast('Logged out successfully', 'success')
  }

  return {
    login_open,
    open_login: () => set_login_open(true),
    close_login: () => set_login_open(false),
    reauth_session,
    username,
    handle_login_success,
    handle_logout,
  }
}
