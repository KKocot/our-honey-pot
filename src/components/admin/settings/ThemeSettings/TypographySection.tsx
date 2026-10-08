// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For, createUniqueId } from 'solid-js'
import { FONT_STACKS } from '../../../../lib/style-tokens'
import { FONT_IDS, type FontId, type SettingsData } from '../../types/settings'
import { GROUP_LABEL } from './controls'
import type { StyleChange } from './style-macros'

export const FONT_LABELS: Readonly<Record<FontId, string>> = Object.freeze({
  system: 'System',
  inter: 'Inter',
  'source-serif': 'Source Serif 4',
  fraunces: 'Fraunces',
  'space-grotesk': 'Space Grotesk',
  'jetbrains-mono': 'JetBrains Mono',
  atkinson: 'Atkinson Hyperlegible Next',
})

const SAMPLE = 'The quick brown fox'

interface FontListProps {
  label: string
  value: FontId
  on_change: (id: FontId) => void
}

/** Radio list with a sample in each typeface; mounting it is what makes the browser fetch the font files. */
function FontList(props: FontListProps) {
  const name = `font-${createUniqueId()}`
  return (
    <fieldset>
      <legend class={GROUP_LABEL}>{props.label}</legend>
      <div class="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-bg">
        <For each={FONT_IDS}>
          {(id) => (
            <label class="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-bg-secondary has-checked:bg-bg-secondary has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-primary">
              <input
                type="radio"
                name={name}
                value={id}
                checked={props.value === id}
                onChange={() => props.on_change(id)}
                class="accent-primary"
              />
              <span class="min-w-0 flex-1">
                <span class="block text-xs text-text-muted">{FONT_LABELS[id]}</span>
                <span class="block truncate text-base text-text" style={{ 'font-family': FONT_STACKS[id] }}>
                  {SAMPLE}
                </span>
              </span>
            </label>
          )}
        </For>
      </div>
    </fieldset>
  )
}

interface TypographySectionProps {
  settings: Pick<SettingsData, 'fontHeading' | 'fontBody'>
  on_change: StyleChange
}

export function TypographySection(props: TypographySectionProps) {
  return (
    <div class="space-y-5">
      <FontList
        label="Heading font"
        value={props.settings.fontHeading}
        on_change={(id) => props.on_change({ fontHeading: id }, `Changed heading font to ${FONT_LABELS[id]}`)}
      />
      <FontList
        label="Body font"
        value={props.settings.fontBody}
        on_change={(id) => props.on_change({ fontBody: id }, `Changed body font to ${FONT_LABELS[id]}`)}
      />
    </div>
  )
}
