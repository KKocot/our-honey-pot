// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createUniqueId } from 'solid-js'
import { settings, updateSettings } from '../../queries'
import { pageElementLabels } from '../../types/layout'
import { PopoverShell, slot_label, type PopoverMoveControls } from './PopoverShell'

export interface FooterPopoverProps {
  section_id: string
  element_id: string
  slot: string
  anchor: HTMLElement | undefined
  on_close: () => void
  move?: PopoverMoveControls
}

const FOOTER_TEXT_MAX_LENGTH = 500

export function FooterPopover(props: FooterPopoverProps) {
  const id = createUniqueId()
  const global_id = `footer-popover-global-${id}`
  const text_id = `footer-popover-text-${id}`
  const hint_id = `footer-popover-hint-${id}`
  const counter_id = `footer-popover-counter-${id}`
  const footer_text = () => settings.footer_text ?? ''

  return (
    <PopoverShell
      open
      anchor={props.anchor}
      onClose={props.on_close}
      element_label={pageElementLabels[props.element_id] ?? props.element_id}
      slot_label={slot_label(props.slot)}
      move={props.move}
    >
      <section aria-labelledby={global_id} class="flex flex-col gap-2">
        <div>
          <h3 id={global_id} class="text-xs font-semibold uppercase text-text-muted">
            Global
          </h3>
          <p class="text-xs text-text-muted">Changes every instance</p>
        </div>
        <div>
          <label for={text_id} class="mb-1 block text-sm font-medium text-text">
            Footer text
          </label>
          <textarea
            id={text_id}
            value={footer_text()}
            onInput={(event) => updateSettings({ footer_text: event.currentTarget.value })}
            placeholder="Empty = default footer"
            rows={3}
            maxlength={FOOTER_TEXT_MAX_LENGTH}
            aria-describedby={`${hint_id} ${counter_id}`}
            class="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div class="mt-1 flex items-start justify-between gap-2 text-xs text-text-muted">
            <p id={hint_id}>Leave empty to use the default text.</p>
            <p id={counter_id} class="shrink-0 tabular-nums" aria-live="polite">
              {footer_text().length}/{FOOTER_TEXT_MAX_LENGTH}
            </p>
          </div>
        </div>
      </section>
    </PopoverShell>
  )
}
