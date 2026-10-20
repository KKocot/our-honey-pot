// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { Show } from 'solid-js'
import type { ImageRef } from '../../../../../lib/image-ref'
import { ImageField as ImageRefField, type ImageRecommendation } from '../ImageField'
import { image_value } from './field-utils'
import { HINT_CLASS } from './styles'

export interface ImageFieldContext {
  /** Role may write the config (enables Upload). */
  can_upload: boolean
  recommended?: ImageRecommendation
}

/** Descriptor wrapper of the shared ImageField: host allowlist (`safe_image_url`), upload and alt rules live there (ADR 6acfb92e63221e857a3c63ef). */
export function ImageField(props: {
  label: string
  value: unknown
  hint?: string
  context: ImageFieldContext
  on_change: (value: ImageRef | undefined) => void
}) {
  return (
    <div class="flex min-w-0 flex-col gap-1">
      <ImageRefField
        label={props.label}
        value={image_value(props.value)}
        on_change={props.on_change}
        can_upload={props.context.can_upload}
        recommended={props.context.recommended}
      />
      <Show when={props.hint}>{(hint) => <p class={HINT_CLASS}>{hint()}</p>}</Show>
    </div>
  )
}
