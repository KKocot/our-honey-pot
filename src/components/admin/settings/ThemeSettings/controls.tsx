// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For, Show, createSignal, createUniqueId, type JSX } from 'solid-js'
import { ChevronDown } from 'lucide-solid'

export interface SegmentOption<T extends string | number> {
  value: T
  label: string
  hint?: string
}

interface SegmentedProps<T extends string | number> {
  label: string
  options: ReadonlyArray<SegmentOption<T>>
  value: T
  on_change: (value: T) => void
  disabled?: boolean
}

export const GROUP_LABEL = 'mb-1.5 block text-sm font-medium text-text'
export const SUBHEADING = 'text-xs font-medium tracking-wide text-text-muted uppercase'
export const ICON_BUTTON =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50'

/** Native radio group styled as a segmented control; arrow keys come from the browser. */
export function Segmented<T extends string | number>(props: SegmentedProps<T>) {
  const name = `segmented-${createUniqueId()}`
  return (
    <fieldset disabled={props.disabled}>
      <legend class={GROUP_LABEL}>{props.label}</legend>
      <div class="flex rounded-lg border border-border bg-bg p-0.5">
        <For each={props.options}>
          {(option) => (
            <label
              class="flex min-h-9 flex-1 cursor-pointer flex-col items-center justify-center rounded-md px-2 py-1 text-center text-xs font-medium text-text-muted transition-colors has-checked:bg-bg-card has-checked:text-text has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-primary hover:text-text"
              title={option.hint}
            >
              <input
                type="radio"
                class="sr-only"
                name={name}
                value={String(option.value)}
                checked={props.value === option.value}
                onChange={() => props.on_change(option.value)}
              />
              <span>{option.label}</span>
              <Show when={option.hint}>
                <span class="text-[0.625rem] font-normal text-text-muted">{option.hint}</span>
              </Show>
            </label>
          )}
        </For>
      </div>
    </fieldset>
  )
}

interface DisclosureProps {
  title: string
  default_open?: boolean
  children: JSX.Element
}

/** Progressive disclosure ("Fine-tune", "Classic palettes"); content is mounted only while open. */
export function Disclosure(props: DisclosureProps) {
  const id = `disclosure-${createUniqueId()}`
  const [open, set_open] = createSignal(props.default_open ?? false)
  return (
    <div class="border-t border-border/60 pt-3">
      <button
        type="button"
        aria-expanded={open()}
        aria-controls={id}
        onClick={() => set_open(!open())}
        class="flex w-full items-center justify-between rounded-md py-1 text-sm font-medium text-text focus-visible:outline-2 focus-visible:outline-primary"
      >
        {props.title}
        <ChevronDown
          size={16}
          aria-hidden="true"
          class={`text-text-muted transition-transform duration-150 ease-out motion-reduce:transition-none ${open() ? 'rotate-180' : ''}`}
        />
      </button>
      <div id={id} hidden={!open()}>
        <Show when={open()}>
          <div class="space-y-4 pt-3">{props.children}</div>
        </Show>
      </div>
    </div>
  )
}
