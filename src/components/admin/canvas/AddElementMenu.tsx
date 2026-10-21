// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, createUniqueId, For, onCleanup, Show } from 'solid-js'
import { Plus } from 'lucide-solid'
import type { AddableHomeSectionType } from './home-section-ops'

export interface AddElementMenuItem {
  id: string
  label: string
}

export interface AddElementMenuSection {
  type: AddableHomeSectionType
  label: string
}

export interface AddElementMenuProps {
  items: AddElementMenuItem[]
  on_add: (id: string) => void
  /** Home section types listed in a separate "Sections" group; picking one calls `on_add_section`. */
  sections?: AddElementMenuSection[]
  on_add_section?: (type: AddableHomeSectionType) => void
  /** Accessible name of the trigger, e.g. "Add component to Main". */
  label: string
}

const MENU_ITEM_CLASS =
  'flex w-full rounded-md px-3 py-2 text-left text-sm font-medium break-words text-text hover:bg-bg-secondary focus-visible:outline-2 focus-visible:outline-primary'

/** "+" button of a canvas section with a menu of the components and home sections that can be added to it. */
export function AddElementMenu(props: AddElementMenuProps) {
  const [open, set_open] = createSignal(false)
  const sections_label_id = createUniqueId()
  let root: HTMLDivElement | undefined
  let trigger: HTMLButtonElement | undefined
  let menu: HTMLDivElement | undefined

  const sections = () => props.sections ?? []
  const empty = () => props.items.length === 0 && sections().length === 0
  const menu_items = () => (menu ? [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')] : [])

  const focus_item = (index: number) => {
    const list = menu_items()
    if (list.length === 0) return
    list[(index + list.length) % list.length].focus({ preventScroll: true })
  }

  const stop_listening = () => document.removeEventListener('pointerdown', on_outside, true)
  onCleanup(stop_listening)

  const close = (restore_focus: boolean) => {
    set_open(false)
    stop_listening()
    if (restore_focus) trigger?.focus({ preventScroll: true })
  }

  function on_outside(event: PointerEvent) {
    if (root && event.target instanceof Node && !root.contains(event.target)) close(false)
  }

  const show = () => {
    if (empty()) return
    set_open(true)
    document.addEventListener('pointerdown', on_outside, true)
    queueMicrotask(() => focus_item(0))
  }

  const toggle = () => (open() ? close(true) : show())

  const handle_menu_key = (event: KeyboardEvent) => {
    const list = menu_items()
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

  const choose = (id: string) => {
    close(true)
    props.on_add(id)
  }

  const choose_section = (type: AddableHomeSectionType) => {
    close(true)
    props.on_add_section?.(type)
  }

  return (
    <div
      ref={root}
      data-canvas-chrome=""
      onFocusOut={(event) => {
        if (open() && !(event.relatedTarget instanceof Node && root?.contains(event.relatedTarget))) close(false)
      }}
      class="relative"
    >
      <button
        type="button"
        ref={trigger}
        aria-haspopup="menu"
        aria-expanded={open()}
        aria-label={props.label}
        disabled={empty()}
        title={empty() ? 'No components available' : undefined}
        onClick={toggle}
        class="group/add inline-flex size-8 shrink-0 items-center justify-center rounded p-1 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-not-allowed max-md:size-11 max-md:p-2.5"
      >
        <span
          class={`inline-flex size-6 items-center justify-center rounded border transition-colors duration-100 ease-out motion-reduce:transition-none ${
            open()
              ? 'border-primary bg-primary text-primary-text'
              : 'border-border bg-bg-card text-text-muted group-enabled/add:group-hover/add:text-text group-disabled/add:opacity-60'
          }`}
        >
          <Plus size={14} aria-hidden="true" />
        </span>
      </button>
      <Show when={open()}>
        <div
          ref={menu}
          role="menu"
          aria-label={props.label}
          onKeyDown={handle_menu_key}
          // A chosen item is already detached when the click bubbles, so ancestors could not tell it came from chrome.
          onClick={(event) => event.stopPropagation()}
          class="absolute top-full right-0 z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-border bg-bg-card p-1 text-left shadow-lg"
        >
          <For each={props.items}>
            {(item) => (
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => choose(item.id)}
                class={MENU_ITEM_CLASS}
              >
                {item.label}
              </button>
            )}
          </For>
          <Show when={sections().length > 0}>
            <Show when={props.items.length > 0}>
              <div role="separator" class="my-1 h-px bg-border" />
            </Show>
            <div role="group" aria-labelledby={sections_label_id}>
              <div
                id={sections_label_id}
                role="presentation"
                class="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-text-muted uppercase"
              >
                Sections
              </div>
              <For each={sections()}>
                {(section) => (
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    data-section-type={section.type}
                    onClick={() => choose_section(section.type)}
                    class={MENU_ITEM_CLASS}
                  >
                    {section.label}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}
