// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createUniqueId, Show } from 'solid-js'
import { emptied, url_field_error } from './field-utils'
import { describedby, FieldHint, FieldLabel } from './FieldLabel'
import { ERROR_CLASS, FIELD_CLASS } from './styles'

/** Link input gated by `safe_link_url`; an off-gate value stays as a draft with an inline error and blocks save. */
export function UrlField(props: {
  label: string
  value: string | undefined
  allow_contact: boolean
  required?: boolean
  hint?: string
  on_change: (value: string | undefined) => void
}) {
  const id = `section-url-${createUniqueId()}`
  const value = () => props.value ?? ''
  const error = () => url_field_error(value(), props.allow_contact)
  return (
    <div class="flex min-w-0 flex-col gap-1">
      <FieldLabel for={id} label={props.label} required={props.required} />
      <input
        id={id}
        type="url"
        inputmode="url"
        class={FIELD_CLASS}
        value={value()}
        placeholder="https://"
        required={props.required}
        aria-invalid={error() !== null || (props.required && value() === '') || undefined}
        aria-describedby={describedby(error() && `${id}-error`, props.hint && `${id}-hint`)}
        onInput={(event) => props.on_change(emptied(event.currentTarget.value.trim(), props.required))}
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
