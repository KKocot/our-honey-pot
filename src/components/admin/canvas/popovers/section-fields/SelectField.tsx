// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createUniqueId, For, Show } from 'solid-js'
import type { FieldOption } from '../../../../../shared/components/sections/registry-types'
import { emptied } from './field-utils'
import { describedby, FieldHint, FieldLabel } from './FieldLabel'
import { FIELD_CLASS } from './styles'

/** Native select; an optional field offers `None`, which removes the value. */
export function SelectField(props: {
  label: string
  value: string | undefined
  options: readonly FieldOption[]
  required?: boolean
  hint?: string
  on_change: (value: string | undefined) => void
}) {
  const id = `section-select-${createUniqueId()}`
  const known = () => props.options.some((option) => option.value === props.value)
  const selected = () => (known() ? (props.value ?? '') : props.required ? (props.options[0]?.value ?? '') : '')
  return (
    <div class="flex min-w-0 flex-col gap-1">
      <FieldLabel for={id} label={props.label} required={props.required} />
      <select
        id={id}
        class={FIELD_CLASS}
        required={props.required}
        aria-describedby={describedby(props.hint && `${id}-hint`)}
        onChange={(event) => props.on_change(emptied(event.currentTarget.value, props.required))}
      >
        <Show when={!props.required}>
          <option value="" selected={selected() === ''}>
            None
          </option>
        </Show>
        <For each={props.options}>
          {(option) => (
            <option value={option.value} selected={selected() === option.value}>
              {option.label}
            </option>
          )}
        </For>
      </select>
      <FieldHint id={`${id}-hint`} hint={props.hint} />
    </div>
  )
}
