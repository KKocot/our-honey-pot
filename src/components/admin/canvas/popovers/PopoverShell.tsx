// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createContext, createUniqueId, For, Show, useContext, type JSX } from 'solid-js'
import { ArrowDown, ArrowUp, X } from 'lucide-solid'
import { Button, Popover, Select, type SelectOption } from '../../../ui'
import { slotLabels } from '../../types/layout'

export type PopoverScope = 'instance' | 'global'

/** Card structure edited in the side panel Layout tab (the DnD trees live there, not in popovers). */
export type CardStructure = 'post' | 'comment' | 'profile'

export function slot_label(slot: string): string {
  return slotLabels[slot] ?? slot
}

export interface PopoverMoveControls {
  slot_options: SelectOption[]
  current_slot: string
  onSlotChange: (slot_id: string) => void
  can_move_up: boolean
  can_move_down: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}

/** Trigger (gear) of the hosted popover, so element popovers need no extra prop; `PopoverHost` provides it. */
export const PopoverTriggerContext = createContext<() => HTMLElement | undefined>(() => undefined)

export interface PopoverShellProps {
  open: boolean
  /** Rect the panel sits beside (`position_el`). */
  anchor: HTMLElement | undefined
  /** Gear toggling the popover, exempt from light dismiss; defaults to `PopoverTriggerContext`, then `anchor`. */
  trigger?: HTMLElement
  onClose: () => void
  element_label: string
  slot_label?: string
  /** Extra header content next to the title (e.g. tabs trigger). */
  header_extra?: JSX.Element
  /** Scope switch is rendered only when `onScopeChange` is provided. */
  scope?: PopoverScope
  onScopeChange?: (scope: PopoverScope) => void
  /** Reset button is rendered only when `onResetInstance` is provided. */
  onResetInstance?: () => void
  has_instance_overrides?: boolean
  move?: PopoverMoveControls
  children?: JSX.Element
}

const SCOPE_OPTIONS: { value: PopoverScope; label: string }[] = [
  { value: 'instance', label: 'This element' },
  { value: 'global', label: 'All of this type' },
]

export interface PopoverTabsProps<T extends string> {
  label: string
  tabs: ReadonlyArray<{ value: T; label: string }>
  active: T
  on_change: (tab: T) => void
  panel_id: string
  tab_id: (tab: T) => string
}

function tab_index_for_key(key: string, index: number, count: number): number | null {
  if (key === 'ArrowRight') return (index + 1) % count
  if (key === 'ArrowLeft') return (index - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

/** Segmented tablist of a popover (Arrow Left/Right, Home/End move between tabs); the caller renders the tabpanel. */
export function PopoverTabs<T extends string>(props: PopoverTabsProps<T>) {
  const refs = new Map<T, HTMLButtonElement>()
  const on_key = (event: KeyboardEvent, index: number) => {
    const target = tab_index_for_key(event.key, index, props.tabs.length)
    if (target === null) return
    event.preventDefault()
    const next = props.tabs[target].value
    props.on_change(next)
    refs.get(next)?.focus({ preventScroll: true })
  }
  return (
    <div role="tablist" aria-label={props.label} class="flex rounded-lg bg-bg-secondary p-0.5 text-xs">
      <For each={props.tabs}>
        {(tab, index) => (
          <button
            ref={(el) => refs.set(tab.value, el)}
            type="button"
            role="tab"
            id={props.tab_id(tab.value)}
            aria-selected={props.active === tab.value}
            aria-controls={props.panel_id}
            tabIndex={props.active === tab.value ? 0 : -1}
            onClick={() => props.on_change(tab.value)}
            onKeyDown={(event) => on_key(event, index())}
            class={`flex-1 rounded-md px-2 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11 ${
              props.active === tab.value ? 'bg-bg-card text-text shadow-sm' : 'text-text-muted hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        )}
      </For>
    </div>
  )
}

const ICON_BUTTON =
  'inline-flex size-8 shrink-0 items-center justify-center rounded text-text-muted hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 max-md:size-11'

export function PopoverShell(props: PopoverShellProps) {
  const title_id = `popover-title-${createUniqueId()}`
  const scope = () => props.scope ?? 'instance'
  const hosted_trigger = useContext(PopoverTriggerContext)

  return (
    <Popover
      open={props.open}
      anchor={props.anchor}
      trigger={props.trigger ?? hosted_trigger()}
      onClose={props.onClose}
      labelledby={title_id}
      placement="beside"
    >
      <div class="flex items-center gap-2 border-b border-border px-3 py-2">
        <h2 id={title_id} class="min-w-0 flex-1 truncate text-sm font-semibold text-text">
          {props.element_label}
          <Show when={props.slot_label}>
            <span class="font-normal text-text-muted"> · {props.slot_label}</span>
          </Show>
        </h2>
        {props.header_extra}
        <button type="button" class={ICON_BUTTON} aria-label="Close" onClick={() => props.onClose()}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <Show when={props.onScopeChange}>
        {(on_scope_change) => (
          <div class="px-3 pt-3">
            <div role="group" aria-label="Change scope" class="flex rounded-lg bg-bg-secondary p-0.5 text-xs">
              <For each={SCOPE_OPTIONS}>
                {(option) => (
                  <button
                    type="button"
                    aria-pressed={scope() === option.value}
                    onClick={() => on_scope_change()(option.value)}
                    class={`flex-1 rounded-md px-2 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11 ${
                      scope() === option.value ? 'bg-bg-card text-text shadow-sm' : 'text-text-muted hover:text-text'
                    }`}
                  >
                    {option.label}
                  </button>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>

      <div class="flex flex-col gap-4 p-3">{props.children}</div>

      <Show when={props.onResetInstance}>
        {(on_reset) => (
          <div class="border-t border-border px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!props.has_instance_overrides}
              onClick={() => on_reset()()}
              class="w-full"
            >
              Reset all for this instance
            </Button>
          </div>
        )}
      </Show>

      <Show when={props.move}>
        {(move) => (
          <div class="border-t border-border px-3 py-3">
            <h3 class="mb-2 text-xs font-semibold uppercase text-text-muted">Move</h3>
            <div class="flex items-end gap-2">
              <div class="min-w-0 flex-1">
                <Select
                  label="Slot"
                  options={move().slot_options}
                  value={move().current_slot}
                  onChange={(event) => move().onSlotChange(event.currentTarget.value)}
                />
              </div>
              <button
                type="button"
                class={`${ICON_BUTTON} mb-1`}
                aria-label="Move up"
                disabled={!move().can_move_up}
                onClick={() => move().onMoveUp()}
              >
                <ArrowUp size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                class={`${ICON_BUTTON} mb-1`}
                aria-label="Move down"
                disabled={!move().can_move_down}
                onClick={() => move().onMoveDown()}
              >
                <ArrowDown size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </Show>
    </Popover>
  )
}
