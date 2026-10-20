// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createUniqueId } from 'solid-js'
import { describedby, FieldHint } from './FieldLabel'

/** Checkbox; unchecking an optional field removes it instead of storing `false`. */
export function BooleanField(props: {
  label: string
  value: boolean | undefined
  required?: boolean
  hint?: string
  on_change: (value: boolean | undefined) => void
}) {
  const id = `section-bool-${createUniqueId()}`
  return (
    <div class="flex min-w-0 flex-col gap-1">
      <label for={id} class="flex items-center gap-2 text-sm text-text max-md:min-h-11">
        <input
          id={id}
          type="checkbox"
          checked={props.value === true}
          aria-describedby={describedby(props.hint && `${id}-hint`)}
          onChange={(event) => props.on_change(event.currentTarget.checked ? true : props.required ? false : undefined)}
          class="size-4 cursor-pointer rounded border-border text-primary focus:ring-primary"
        />
        {props.label}
      </label>
      <FieldHint id={`${id}-hint`} hint={props.hint} />
    </div>
  )
}
