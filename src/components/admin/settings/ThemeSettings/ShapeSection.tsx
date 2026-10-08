// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For } from 'solid-js'
import { Slider } from '../../../ui'
import {
  DENSITY_IDS,
  DENSITY_MULTIPLIERS,
  HEADING_SCALES,
  STYLE_TOKEN_RANGES,
  type Density,
  type HeadingScale,
  type SettingsData,
} from '../../types/settings'
import { Segmented } from './controls'
import { density_patch, radius_patch, type StyleChange } from './style-macros'

const RADIUS_QUICK = [
  { label: 'Sharp', value: 0 },
  { label: 'Soft', value: 8 },
  { label: 'Round', value: 16 },
  { label: 'Pill', value: 24 },
] as const

const DENSITY_LABELS: Readonly<Record<Density, string>> = Object.freeze({
  compact: 'Compact',
  comfortable: 'Comfortable',
  spacious: 'Spacious',
})

const HEADING_SCALE_HINTS: Readonly<Record<HeadingScale, string>> = Object.freeze({
  1.125: 'Subtle',
  1.2: 'Balanced',
  1.25: 'Classic',
  1.333: 'Bold',
})

type ShapeSettings = Pick<
  SettingsData,
  | 'radiusPx'
  | 'density'
  | 'contentWidthPx'
  | 'baseFontSizePx'
  | 'headingScale'
  | 'cardPaddingPx'
  | 'cardGapPx'
  | 'commentPaddingPx'
>

interface ShapeSectionProps {
  settings: ShapeSettings
  on_change: StyleChange
}

export function ShapeSection(props: ShapeSectionProps) {
  const set_radius = (value: number) => props.on_change(radius_patch(value), 'Changed corner radius')

  return (
    <div class="space-y-5">
      <div class="space-y-2">
        <Slider
          label="Corner radius"
          unit="px"
          min={STYLE_TOKEN_RANGES.radiusPx.min}
          max={STYLE_TOKEN_RANGES.radiusPx.max}
          step={STYLE_TOKEN_RANGES.radiusPx.step}
          value={props.settings.radiusPx}
          onChange={set_radius}
        />
        <div class="grid grid-cols-4 gap-1" role="group" aria-label="Corner radius presets">
          <For each={RADIUS_QUICK}>
            {(quick) => (
              <button
                type="button"
                aria-pressed={props.settings.radiusPx === quick.value}
                onClick={() => set_radius(quick.value)}
                class="flex min-h-9 flex-col items-center gap-1 rounded-md border border-border px-1 py-1.5 text-xs text-text-muted transition-colors hover:border-primary/50 hover:text-text focus-visible:outline-2 focus-visible:outline-primary aria-pressed:border-primary aria-pressed:text-text"
              >
                <span
                  aria-hidden="true"
                  class="block h-3 w-6 border-2 border-current"
                  style={{ 'border-radius': `${quick.value / 2}px` }}
                />
                {quick.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <Segmented
        label="Density"
        value={props.settings.density}
        options={DENSITY_IDS.map((id) => ({
          value: id,
          label: DENSITY_LABELS[id],
          hint: `${DENSITY_MULTIPLIERS[id]}x`,
        }))}
        on_change={(next) => {
          if (next === props.settings.density) return
          props.on_change(density_patch(props.settings, next), 'Changed density')
        }}
      />

      <Slider
        label="Content width"
        unit="px"
        min={STYLE_TOKEN_RANGES.contentWidthPx.min}
        max={STYLE_TOKEN_RANGES.contentWidthPx.max}
        step={STYLE_TOKEN_RANGES.contentWidthPx.step}
        value={props.settings.contentWidthPx}
        onChange={(value) => props.on_change({ contentWidthPx: value }, 'Changed content width')}
      />

      <Slider
        label="Base font size"
        unit="px"
        min={STYLE_TOKEN_RANGES.baseFontSizePx.min}
        max={STYLE_TOKEN_RANGES.baseFontSizePx.max}
        step={STYLE_TOKEN_RANGES.baseFontSizePx.step}
        value={props.settings.baseFontSizePx}
        onChange={(value) => props.on_change({ baseFontSizePx: value }, 'Changed base font size')}
      />

      <Segmented
        label="Heading scale"
        value={props.settings.headingScale}
        options={HEADING_SCALES.map((scale) => ({
          value: scale,
          label: String(scale),
          hint: HEADING_SCALE_HINTS[scale],
        }))}
        on_change={(scale) => props.on_change({ headingScale: scale }, 'Changed heading scale')}
      />
    </div>
  )
}
