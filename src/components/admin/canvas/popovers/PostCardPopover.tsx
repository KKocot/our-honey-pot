// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createMemo, createSignal, Show, type JSX } from 'solid-js'
import { Slider, showToast } from '../../../ui'
import { clear_instance_override, set_global_size, set_instance_override, settings } from '../../queries'
import {
  collectAllElementIds,
  migrateCardLayout,
  pageElementLabels,
  postCardElementLabels,
} from '../../types/layout'
import {
  INSTANCE_OVERRIDE_RANGES,
  defaultSettings,
  instance_key,
  instance_override_keys_for,
  is_instance_override_value,
  type InstanceOverrideKey,
} from '../../types/settings'
import { resolve_instance_settings } from '../../../../lib/instance-overrides'
import { PostCard } from '../../../../shared/components/solid/PostCard'
import { create_mock_posts } from '../mocks'
import { CardLayoutDnd } from './CardLayoutDnd'
import { InstanceSlider } from './InstanceSlider'
import { PopoverShell, slot_label, type PopoverScope } from './PopoverShell'

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
            onChange={(value) => report(set_global_size(props.setting, value))}
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
          onChange={(value) => report(set_instance_override(props.section_id, props.element_id, props.setting, value))}
          onReset={() => clear_instance_override(props.section_id, props.element_id, props.setting)}
        />
      </Show>
    </Show>
  )
}

/** Controls without per-instance override, under the "Globalne" separator. */
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

export function PostCardControls(props: ElementControlsProps) {
  const layout = createMemo(() => migrateCardLayout(settings.postCardLayout) ?? defaultSettings.postCardLayout)
  const used_ids = createMemo(() => new Set(collectAllElementIds(layout())))
  const mock_post = create_mock_posts()[0]
  const preview_settings = createMemo(() =>
    props.scope === 'instance' ? resolve_instance_settings(settings, props.section_id, props.element_id) : undefined
  )

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
      <GlobalGroup>
        <CardLayoutDnd
          layout_key="postCardLayout"
          element_labels={postCardElementLabels}
          label="Post card layout"
          preview={
            <PostCard
              post={mock_post}
              forceVertical={settings.postsLayout !== 'list'}
              index={0}
              layout={layout()}
              settings={preview_settings()}
            />
          }
        />
      </GlobalGroup>
    </>
  )
}

export function PostCardPopover(props: ElementPopoverProps) {
  const [scope, set_scope] = createSignal<PopoverScope>('instance')

  return (
    <PopoverShell
      open
      anchor={props.anchor}
      onClose={props.on_close}
      element_label={`${element_label(props.element_id)} · card`}
      slot_label={slot_label(props.slot)}
      scope={scope()}
      onScopeChange={set_scope}
      onResetInstance={
        scope() === 'instance' ? () => clear_instance_override(props.section_id, props.element_id) : undefined
      }
      has_instance_overrides={has_instance_overrides(props.section_id, props.element_id)}
    >
      <PostCardControls section_id={props.section_id} element_id={props.element_id} scope={scope()} />
    </PopoverShell>
  )
}
