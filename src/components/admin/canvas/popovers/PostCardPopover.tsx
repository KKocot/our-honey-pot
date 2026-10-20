// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createMemo, Show, type JSX } from 'solid-js'
import { ChevronRight, LayoutTemplate } from 'lucide-solid'
import { Slider, showToast } from '../../../ui'
import { clear_instance_override, set_global_size, set_instance_override, settings } from '../../queries'
import { collectAllElementIds, migrateCardLayout, pageElementLabels } from '../../types/layout'
import {
  INSTANCE_OVERRIDE_RANGES,
  defaultSettings,
  instance_key,
  instance_override_keys_for,
  is_instance_override_value,
  type InstanceOverrideKey,
} from '../../types/settings'
import { resolve_instance_settings } from '../../../../lib/instance-overrides'
import { InstanceSlider } from './InstanceSlider'
import type { PopoverScope } from './PopoverShell'
import { changed_label, use_field_edit } from './field-edit'

/** Props shared by every element popover of the canvas. */
export interface ElementPopoverProps {
  section_id: string
  element_id: string
  slot: string
  anchor: HTMLElement | undefined
  on_close: () => void
}

export interface ElementControlsProps {
  section_id: string
  element_id: string
  scope: PopoverScope
}

export function element_label(element_id: string): string {
  return pageElementLabels[element_id] ?? element_id
}

export function has_instance_overrides(section_id: string, element_id: string): boolean {
  const overrides = settings.instanceOverrides
  const key = instance_key(section_id, element_id)
  if (!overrides || !Object.hasOwn(overrides, key)) return false
  return Object.keys(overrides[key]).length > 0
}

export interface SizeSliderProps extends ElementControlsProps {
  setting: InstanceOverrideKey
  label: string
  unit?: string
  step?: number
}

/** Slider bound to one size: instance override in instance scope, global value otherwise; hidden outside the element whitelist. */
export function SizeSlider(props: SizeSliderProps) {
  const allowed = () => instance_override_keys_for(props.element_id).includes(props.setting)
  const range = () => INSTANCE_OVERRIDE_RANGES[props.setting]
  const global_value = () => settings[props.setting] ?? range().min
  const has_override = () => {
    const overrides = settings.instanceOverrides
    const key = instance_key(props.section_id, props.element_id)
    if (!overrides || !Object.hasOwn(overrides, key)) return false
    return is_instance_override_value(props.setting, overrides[key][props.setting])
  }
  const effective_value = createMemo(
    () => resolve_instance_settings(settings, props.section_id, props.element_id)[props.setting] ?? range().min
  )
  const report = (saved: boolean) => {
    if (!saved) showToast('Failed to save the value', 'error')
  }
  const field_edit = use_field_edit()
  const instance_field = () => `size:${instance_key(props.section_id, props.element_id)}:${props.setting}`
  const set_global = (value: number) => {
    let saved = true
    field_edit({ key: `size:global:${props.setting}`, label: changed_label('global', props.label) }, () => {
      saved = set_global_size(props.setting, value)
    })
    report(saved)
  }
  const set_instance = (value: number) => {
    let saved = true
    field_edit({ key: instance_field(), label: changed_label(element_label(props.element_id), props.label) }, () => {
      saved = set_instance_override(props.section_id, props.element_id, props.setting, value)
    })
    report(saved)
  }
  const reset_instance = () =>
    field_edit({ label: `Reset ${element_label(props.element_id).toLowerCase()} ${props.label.toLowerCase()}` }, () =>
      clear_instance_override(props.section_id, props.element_id, props.setting)
    )

  return (
    <Show when={allowed()}>
      <Show
        when={props.scope === 'instance'}
        fallback={
          <Slider
            label={props.label}
            value={global_value()}
            min={range().min}
            max={range().max}
            step={props.step ?? 1}
            unit={props.unit}
            onChange={set_global}
          />
        }
      >
        <InstanceSlider
          label={props.label}
          value={effective_value()}
          inherited={!has_override()}
          min={range().min}
          max={range().max}
          step={props.step}
          unit={props.unit}
          onChange={set_instance}
          onReset={reset_instance}
        />
      </Show>
    </Show>
  )
}

/** Controls without per-instance override, under the "Global" separator. */
export function GlobalGroup(props: { children: JSX.Element }) {
  return (
    <section class="flex flex-col gap-3 border-t border-border pt-3">
      <header>
        <h3 class="text-xs font-semibold uppercase text-text-muted">Global</h3>
        <p class="text-xs text-text-muted">Changes every instance</p>
      </header>
      {props.children}
    </section>
  )
}

/** Per-instance sizes of the post card; the card structure is edited in the layout view. */
export function PostCardControls(props: ElementControlsProps) {
  const used_ids = createMemo(() => {
    const layout = migrateCardLayout(settings.postCardLayout) ?? defaultSettings.postCardLayout
    return new Set(collectAllElementIds(layout))
  })

  return (
    <>
      <SizeSlider {...props} setting="thumbnailSizePx" label="Thumbnail size" unit="px" />
      <SizeSlider {...props} setting="cardPaddingPx" label="Card padding" unit="px" />
      <SizeSlider {...props} setting="cardBorderRadiusPx" label="Corner radius" unit="px" />
      <SizeSlider {...props} setting="titleSizePx" label="Title size" unit="px" />
      <Show when={used_ids().has('summary')}>
        <SizeSlider {...props} setting="summaryMaxLength" label="Summary length" unit="chars" />
      </Show>
      <Show when={used_ids().has('tags')}>
        <SizeSlider {...props} setting="maxTags" label="Max tags" />
      </Show>
    </>
  )
}

const NAV_ROW =
  'flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11'

interface PopoverNavButtonProps {
  label: string
  ref?: (element: HTMLButtonElement) => void
  onClick: () => void
}

export function EditLayoutButton(props: PopoverNavButtonProps) {
  return (
    <button
      type="button"
      ref={props.ref}
      onClick={() => props.onClick()}
      class={`${NAV_ROW} w-full border border-border text-text hover:bg-bg-secondary`}
    >
      <LayoutTemplate size={14} aria-hidden="true" class="shrink-0 text-text-muted" />
      <span class="min-w-0 flex-1 truncate">{props.label}</span>
      <ChevronRight size={14} aria-hidden="true" class="shrink-0 text-text-muted" />
    </button>
  )
}
