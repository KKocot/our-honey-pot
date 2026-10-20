// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createUniqueId, Show } from 'solid-js'
import { date_field_error, emptied } from './field-utils'
import { describedby, FieldHint, FieldLabel } from './FieldLabel'
import { ERROR_CLASS, FIELD_CLASS } from './styles'

/** ISO `YYYY-MM-DD` through the native date picker. */
export function DateField(props: {
  label: string
  value: string | undefined
  required?: boolean
  hint?: string
  on_change: (value: string | undefined) => void
}) {
  const id = `section-date-${createUniqueId()}`
  const value = () => props.value ?? ''
  const error = () => date_field_error(value())
  return (
    <div class="flex min-w-0 flex-col gap-1">
      <FieldLabel for={id} label={props.label} required={props.required} />
      <input
        id={id}
        type="date"
        class={FIELD_CLASS}
        value={value()}
        required={props.required}
        aria-invalid={error() !== null || (props.required && value() === '') || undefined}
        aria-describedby={describedby(error() && `${id}-error`, props.hint && `${id}-hint`)}
        onInput={(event) => props.on_change(emptied(event.currentTarget.value, props.required))}
      />
      <Show when={error()}>
        {(message) => (
          <p id={`${id}-error`} class={ERROR_CLASS}>
            {message()}
          </p>
        )}
      </Show>
      <FieldHint id={`${id}-hint`} hint={props.hint} />
    </div>
  )
}
