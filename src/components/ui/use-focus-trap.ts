// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { onCleanup, onMount } from 'solid-js'
import { lock_scroll, unlock_scroll } from '../../lib/scroll-lock'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export interface FocusTrapOptions {
  /** Tab pulls focus back when it escaped the container; an empty container swallows Tab. */
  catch_escaped_focus?: boolean
  /** Skip elements without layout boxes (inactive tabs, display:none). */
  skip_hidden?: boolean
  /** Picks the element focused after activation; null leaves focus where it is. Default: first focusable. */
  initial_focus?: (elements: HTMLElement[], container: HTMLElement) => HTMLElement | null
  /** Escape not already handled (defaultPrevented) by a nested widget. */
  on_escape?: () => void
  /** Lock body scroll while active. Default: true. */
  lock_scroll?: boolean
  /** Move initial focus in the next animation frame instead of the next task. */
  focus_in_frame?: boolean
  /** Return-focus target when nothing (or body) was focused at activation. */
  fallback_return_focus?: () => HTMLElement | undefined
}

export interface TabMove<T> {
  prevent: boolean
  target: T | null
}

/** Decides where Tab goes inside a trap: native move, blocked, or wrapped to a target. */
export function resolve_tab_move<T>(
  elements: readonly T[],
  active: T | null,
  backwards: boolean,
  active_inside: boolean,
  catch_escaped_focus: boolean
): TabMove<T> {
  if (elements.length === 0) return { prevent: catch_escaped_focus, target: null }
  const first = elements[0]
  const last = elements[elements.length - 1]
  const escaped = catch_escaped_focus && !active_inside
  if (backwards && (escaped || active === first)) return { prevent: true, target: last }
  if (!backwards && (escaped || active === last)) return { prevent: true, target: first }
  return { prevent: false, target: null }
}

export function focusable_elements(container: HTMLElement, skip_hidden = false): HTMLElement[] {
  const elements = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  return skip_hidden ? elements.filter((element) => element.getClientRects().length > 0) : elements
}

const active_traps: object[] = []

export interface FocusTrap {
  handle_key_down: (e: KeyboardEvent) => void
  activate: () => void
  /** `restore_focus: false` keeps focus where it is (e.g. the user already moved it outside). */
  release: (restore_focus?: boolean) => void
}

/** Framework-free trap core; traps share one stack and only the most recently activated one reacts to keys. */
export function create_focus_trap(
  containerRef: () => HTMLElement | undefined,
  isActive: () => boolean,
  options: FocusTrapOptions = {}
): FocusTrap {
  const token = {}
  let opener: HTMLElement | null = null
  let scroll_locked = false
  let cancel_focus = () => {}

  const is_top = () => active_traps[active_traps.length - 1] === token

  const handle_key_down = (e: KeyboardEvent) => {
    const container = containerRef()
    if (!container || !isActive() || !is_top() || e.defaultPrevented) return

    if (e.key === 'Tab') {
      const elements = focusable_elements(container, options.skip_hidden)
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const move = resolve_tab_move(
        elements,
        active,
        e.shiftKey,
        active !== null && container.contains(active),
        options.catch_escaped_focus ?? false
      )
      if (move.prevent) e.preventDefault()
      move.target?.focus({ preventScroll: true })
      return
    }

    if (e.key === 'Escape' && options.on_escape && !e.isComposing) {
      e.preventDefault()
      options.on_escape()
    }
  }

  const release = (restore_focus = true) => {
    cancel_focus()
    const index = active_traps.indexOf(token)
    if (index !== -1) active_traps.splice(index, 1)
    if (scroll_locked) {
      scroll_locked = false
      unlock_scroll()
    }
    if (restore_focus && opener?.isConnected) opener.focus({ preventScroll: true })
    opener = null
  }

  const activate = () => {
    const active = document.activeElement
    opener =
      active instanceof HTMLElement && active !== document.body ? active : (options.fallback_return_focus?.() ?? null)
    const container = containerRef()
    if (!container) return
    if (!scroll_locked && (options.lock_scroll ?? true)) {
      lock_scroll()
      scroll_locked = true
    }
    if (!active_traps.includes(token)) active_traps.push(token)

    cancel_focus()
    const focus_initial = () => {
      const elements = focusable_elements(container, options.skip_hidden)
      const target = options.initial_focus ? options.initial_focus(elements, container) : (elements[0] ?? null)
      target?.focus({ preventScroll: true })
    }
    if (options.focus_in_frame) {
      const frame = requestAnimationFrame(focus_initial)
      cancel_focus = () => cancelAnimationFrame(frame)
    } else {
      const timer = setTimeout(focus_initial, 0)
      cancel_focus = () => clearTimeout(timer)
    }
  }

  return { handle_key_down, activate, release }
}

export function useFocusTrap(
  containerRef: () => HTMLElement | undefined,
  isActive: () => boolean,
  options: FocusTrapOptions = {}
) {
  const trap = create_focus_trap(containerRef, isActive, options)

  onMount(() => {
    document.addEventListener('keydown', trap.handle_key_down)
  })

  onCleanup(() => {
    document.removeEventListener('keydown', trap.handle_key_down)
    trap.release()
  })

  return { activate: trap.activate, deactivate: () => trap.release() }
}
