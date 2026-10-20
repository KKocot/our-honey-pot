// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { Show } from 'solid-js'
import { HINT_CLASS, LABEL_CLASS } from './styles'

export function FieldLabel(props: { for: string; label: string; required?: boolean }) {
  return (
    <label for={props.for} class={LABEL_CLASS}>
      {props.label}
      <Show when={props.required}>
        <span class="text-text-muted"> (required)</span>
      </Show>
    </label>
  )
}

export function FieldHint(props: { id: string; hint: string | undefined }) {
  return (
    <Show when={props.hint}>
      {(hint) => (
        <p id={props.id} class={HINT_CLASS}>
          {hint()}
        </p>
      )}
    </Show>
  )
}

/** Space-separated ids of the present describers, or undefined. */
export function describedby(...ids: Array<string | false | null | undefined>): string | undefined {
  const present = ids.filter((id): id is string => typeof id === 'string' && id !== '')
  return present.length > 0 ? present.join(' ') : undefined
}
