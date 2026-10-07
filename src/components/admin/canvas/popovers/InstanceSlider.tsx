// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { Show } from 'solid-js'
import { Slider } from '../../../ui'

export interface InstanceSliderProps {
  label: string
  /** Effective value: instance override, or the global value when inherited. */
  value: number
  inherited: boolean
  min: number
  max: number
  step?: number
  unit?: string
  disabled?: boolean
  onChange: (value: number) => void
  /** Removes the instance override (does not write the global value into it). */
  onReset: () => void
}

// Slider owns its <label>; `contents` lifts label and input row into this grid so the indicator sits between them.
const LAYOUT =
  'grid grid-cols-[auto_1fr] items-center gap-x-1.5 [&>div]:contents [&>div>label]:col-start-1 [&>div>label]:row-start-1 [&>div>label]:mb-0 [&>div>div]:col-span-2 [&>div>div]:row-start-3 [&>div>div]:mt-1'

export function InstanceSlider(props: InstanceSliderProps) {
  return (
    <div class={`${LAYOUT} ${props.disabled ? 'opacity-50' : ''}`}>
      <Slider
        label={props.label}
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        unit={props.unit}
        disabled={props.disabled}
        onChange={props.onChange}
      />
      <span class="col-start-2 row-start-1 justify-self-start">
        <Show when={!props.inherited}>
          <span aria-hidden="true" class="block size-1.5 rounded-full bg-primary" />
          <span class="sr-only">value set for this instance</span>
        </Show>
      </span>
      <p class="col-span-2 row-start-2 mt-0.5 text-xs text-text-muted">
        <Show when={!props.inherited} fallback="from global settings">
          <button
            type="button"
            onClick={() => props.onReset()}
            disabled={props.disabled}
            class="rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed"
          >
            Restore global
          </button>
        </Show>
      </p>
    </div>
  )
}
