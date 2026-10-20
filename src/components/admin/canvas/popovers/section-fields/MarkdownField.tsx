// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createMemo, createSignal, Show } from 'solid-js'
import { render_section_markdown } from '../../../../../shared/components/sections/markdown'
import type { Locale } from '../../../../../lib/i18n'
import { CountedTextInput } from './TextField'
import { HINT_CLASS, LABEL_CLASS, LINK_BUTTON_CLASS } from './styles'

export function MarkdownField(props: {
  label: string
  value: string | undefined
  max_bytes: number
  required?: boolean
  hint?: string
  /** Site locale of the preview (new-tab hint of links). */
  locale?: Locale
  on_change: (value: string | undefined) => void
}) {
  const [preview, set_preview] = createSignal(false)
  const html = createMemo(() => (preview() ? render_section_markdown(props.value ?? '', props.locale) : ''))
  return (
    <div class="flex min-w-0 flex-col gap-1">
      <Show
        when={preview()}
        fallback={
          <CountedTextInput
            label={props.label}
            value={props.value}
            max={props.max_bytes}
            unit="bytes"
            required={props.required}
            hint={props.hint}
            multiline
            rows={6}
            on_input={props.on_change}
          />
        }
      >
        <span class={LABEL_CLASS}>{props.label} preview</span>
        <Show when={html()} fallback={<p class={HINT_CLASS}>Nothing to preview yet.</p>}>
          {/* Same allowlist renderer as the public page (ADR 6acfb92e63221e857a3c63f1), so the HTML is safe and 1:1. */}
          <div
            class="section-md wrap-anywhere max-h-60 overflow-auto rounded-lg border border-border bg-bg p-2 text-sm"
            innerHTML={html()}
          />
        </Show>
      </Show>
      <div class="flex items-center justify-between gap-2">
        <p class={HINT_CLASS}>Bold, italic, links and lists.</p>
        <button
          type="button"
          class={LINK_BUTTON_CLASS}
          aria-pressed={preview()}
          onClick={() => set_preview(!preview())}
        >
          Preview
        </button>
      </div>
    </div>
  )
}
