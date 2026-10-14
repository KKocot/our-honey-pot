// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, For, onCleanup, Show } from 'solid-js'
import { Plus } from 'lucide-solid'
import type { AddableHomeSectionType } from '../home-section-ops'
import { ADD_SECTION_OPTIONS, type AddOptionState } from './model'

export interface AddSectionMenuProps {
  /** Insertion index, used for the accessible name of the trigger. */
  position: number
  option_state: (type: AddableHomeSectionType) => AddOptionState
  on_add: (type: AddableHomeSectionType) => void
  /** Trigger visible without hover (e.g. the only control of an empty stack). */
  always_visible?: boolean
}

/** Inline "+ Add section" button with a menu of section types and their limits (spec 5.1). */
export function AddSectionMenu(props: AddSectionMenuProps) {
  const [open, set_open] = createSignal(false)
  let root: HTMLDivElement | undefined
  let trigger: HTMLButtonElement | undefined
  let menu: HTMLDivElement | undefined

  const items = () => (menu ? [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')] : [])

  const focus_item = (index: number) => {
    const list = items()
    if (list.length === 0) return
    list[(index + list.length) % list.length].focus({ preventScroll: true })
  }

  const close = (restore_focus: boolean) => {
    set_open(false)
    stop_listening()
    if (restore_focus) trigger?.focus({ preventScroll: true })
  }

  const stop_listening = () => document.removeEventListener('pointerdown', on_outside, true)
  onCleanup(stop_listening)

  function on_outside(event: PointerEvent) {
    if (root && event.target instanceof Node && !root.contains(event.target)) close(false)
  }

  const show = () => {
    set_open(true)
    document.addEventListener('pointerdown', on_outside, true)
    queueMicrotask(() => {
      const first_enabled = items().findIndex((item) => item.getAttribute('aria-disabled') !== 'true')
      focus_item(Math.max(first_enabled, 0))
    })
  }

  const toggle = () => (open() ? close(true) : show())

  const handle_menu_key = (event: KeyboardEvent) => {
    const list = items()
    const current = list.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focus_item(current + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focus_item(current - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focus_item(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focus_item(list.length - 1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  const choose = (type: AddableHomeSectionType) => {
    if (props.option_state(type).disabled) return
    close(false)
    props.on_add(type)
  }

  return (
    <div
      ref={root}
      data-canvas-chrome=""
      onFocusOut={(event) => {
        if (open() && !(event.relatedTarget instanceof Node && root?.contains(event.relatedTarget))) close(false)
      }}
      class="relative flex justify-center"
    >
      <button
        type="button"
        ref={trigger}
        aria-haspopup="menu"
        aria-expanded={open()}
        aria-label={`Add section at position ${props.position + 1}`}
        onClick={toggle}
        class={`inline-flex items-center gap-1 rounded-full border border-border bg-bg-card px-3 py-1 text-xs font-medium text-text shadow-sm transition-opacity duration-150 ease-out hover:border-primary hover:text-primary focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none max-md:min-h-11 ${
          props.always_visible || open()
            ? 'opacity-100'
            : 'opacity-0 group-hover/hs:opacity-100 group-focus-within/hs:opacity-100'
        }`}
      >
        <Plus size={14} aria-hidden="true" />
        Add section
      </button>
      <Show when={open()}>
        <div
          ref={menu}
          role="menu"
          aria-label="Section types"
          onKeyDown={handle_menu_key}
          class="absolute top-full left-1/2 z-30 mt-1 w-72 -translate-x-1/2 rounded-lg border border-border bg-bg-card p-1 text-left shadow-lg"
        >
          <For each={ADD_SECTION_OPTIONS}>
            {(option) => {
              const state = () => props.option_state(option.type)
              return (
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={state().disabled ? 'true' : undefined}
                  onClick={() => choose(option.type)}
                  class={`flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-primary ${
                    state().disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-bg-secondary'
                  }`}
                >
                  <span class="flex items-center justify-between gap-2 text-sm font-medium text-text">
                    {option.label}
                    <span class={`text-xs font-normal ${state().disabled ? 'text-warning' : 'text-text-muted'}`}>
                      {state().status}
                    </span>
                  </span>
                  <span class="text-xs text-text-muted">{option.description}</span>
                </button>
              )
            }}
          </For>
        </div>
      </Show>
    </div>
  )
}
