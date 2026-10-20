// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createUniqueId, Show } from 'solid-js'
import { field_counter, text_input_value, type CounterUnit } from './field-utils'
import { describedby, FieldHint, FieldLabel } from './FieldLabel'
import { COUNTER_TONE_CLASS, FIELD_CLASS } from './styles'

export interface CountedTextInputProps {
  label: string
  value: string | undefined
  max: number
  unit: CounterUnit
  required?: boolean
  hint?: string
  multiline?: boolean
  rows?: number
  on_input: (value: string | undefined) => void
}

/** Text input with the `count/max` counter of the Content tab; `chars` clamps, `bytes` only warns. */
export function CountedTextInput(props: CountedTextInputProps) {
  const id = `section-field-${createUniqueId()}`
  const counter = () => field_counter(props.value, props.max, props.unit)
  const unit_text = () => (props.unit === 'bytes' ? 'bytes' : 'characters')

  const handle_input = (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
    const next = text_input_value(event.currentTarget.value, props.max, props.unit, props.required === true)
    if ((next ?? '') !== event.currentTarget.value) event.currentTarget.value = next ?? ''
    props.on_input(next)
  }

  const shared = () => ({
    id,
    class: FIELD_CLASS,
    value: props.value ?? '',
    required: props.required,
    'aria-describedby': describedby(`${id}-counter`, props.hint && `${id}-hint`),
    'aria-invalid': counter().count > props.max || (props.required && !props.value) || undefined,
    onInput: handle_input,
  })

  return (
    <div class="flex min-w-0 flex-col gap-1">
      <div class="flex items-baseline justify-between gap-2">
        <FieldLabel for={id} label={props.label} required={props.required} />
        <span id={`${id}-counter`} class={`text-xs tabular-nums ${COUNTER_TONE_CLASS[counter().tone]}`}>
          {counter().text}
          <span class="sr-only"> {unit_text()}</span>
        </span>
      </div>
      <Show when={props.multiline} fallback={<input type="text" {...shared()} />}>
        <textarea rows={props.rows ?? 3} {...shared()} />
      </Show>
      <FieldHint id={`${id}-hint`} hint={props.hint} />
    </div>
  )
}

interface TextFieldProps {
  label: string
  value: string | undefined
  max_len: number
  required?: boolean
  hint?: string
  on_change: (value: string | undefined) => void
}

export function TextField(props: TextFieldProps) {
  return (
    <CountedTextInput
      label={props.label}
      value={props.value}
      max={props.max_len}
      unit="chars"
      required={props.required}
      hint={props.hint}
      on_input={props.on_change}
    />
  )
}

export function TextareaField(props: TextFieldProps) {
  return (
    <CountedTextInput
      label={props.label}
      value={props.value}
      max={props.max_len}
      unit="chars"
      required={props.required}
      hint={props.hint}
      multiline
      on_input={props.on_change}
    />
  )
}
