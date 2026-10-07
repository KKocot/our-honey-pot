// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createMemo, createSignal, createUniqueId, For, Show } from 'solid-js'
import {
  clear_instance_override,
  set_global_size,
  set_instance_override,
  settings,
  updateSettings,
} from '../../queries'
import { pageElementLabels } from '../../types/layout'
import {
  INSTANCE_OVERRIDE_RANGES,
  defaultSettings,
  instance_key,
  instance_override_keys_for,
  is_instance_override_value,
  type InstanceOverrideKey,
} from '../../types/settings'
import { resolve_instance_settings } from '../../../../lib/instance-overrides'
import { Slider } from '../../../ui'
import { InstanceSlider } from './InstanceSlider'
import { PopoverShell, slot_label, type PopoverMoveControls, type PopoverScope } from './PopoverShell'

export interface CommunityProfilePopoverProps {
  section_id: string
  element_id: string
  slot: string
  anchor: HTMLElement | undefined
  on_close: () => void
  move?: PopoverMoveControls
}

const SIZE_LABELS: ReadonlyArray<{ key: InstanceOverrideKey; label: string }> = [
  { key: 'community_avatar_size_px', label: 'Avatar size' },
  { key: 'community_title_size_px', label: 'Title size' },
  { key: 'community_about_size_px', label: 'Description size' },
]

export function CommunityProfilePopover(props: CommunityProfilePopoverProps) {
  const global_id = `community-profile-popover-global-${createUniqueId()}`
  const [scope, set_scope] = createSignal<PopoverScope>('instance')

  const allowed_sizes = createMemo(() => {
    const allowed = new Set(instance_override_keys_for(props.element_id))
    return SIZE_LABELS.filter((size) => allowed.has(size.key))
  })
  const resolved = createMemo(() => resolve_instance_settings(settings, props.section_id, props.element_id))
  const overrides = () => settings.instanceOverrides?.[instance_key(props.section_id, props.element_id)]
  const has_override = (key: InstanceOverrideKey) => is_instance_override_value(key, overrides()?.[key])
  const has_any_override = () => allowed_sizes().some((size) => has_override(size.key))

  const value_of = (source: Partial<Record<InstanceOverrideKey, number>>, key: InstanceOverrideKey) =>
    source[key] ?? defaultSettings[key] ?? INSTANCE_OVERRIDE_RANGES[key].min

  return (
    <PopoverShell
      open
      anchor={props.anchor}
      onClose={props.on_close}
      element_label={pageElementLabels[props.element_id] ?? props.element_id}
      slot_label={slot_label(props.slot)}
      scope={scope()}
      onScopeChange={set_scope}
      onResetInstance={() => clear_instance_override(props.section_id, props.element_id)}
      has_instance_overrides={has_any_override()}
      move={props.move}
    >
      <For each={allowed_sizes()}>
        {(size) => (
          <Show
            when={scope() === 'instance'}
            fallback={
              <Slider
                label={size.label}
                unit="px"
                min={INSTANCE_OVERRIDE_RANGES[size.key].min}
                max={INSTANCE_OVERRIDE_RANGES[size.key].max}
                value={value_of(settings, size.key)}
                onChange={(value) => set_global_size(size.key, value)}
              />
            }
          >
            <InstanceSlider
              label={size.label}
              unit="px"
              min={INSTANCE_OVERRIDE_RANGES[size.key].min}
              max={INSTANCE_OVERRIDE_RANGES[size.key].max}
              value={value_of(resolved(), size.key)}
              inherited={!has_override(size.key)}
              onChange={(value) => set_instance_override(props.section_id, props.element_id, size.key, value)}
              onReset={() => clear_instance_override(props.section_id, props.element_id, size.key)}
            />
          </Show>
        )}
      </For>

      <section aria-labelledby={global_id} class="flex flex-col gap-3 border-t border-border pt-3">
        <div>
          <h3 id={global_id} class="text-xs font-semibold uppercase text-text-muted">
            Global
          </h3>
          <p class="text-xs text-text-muted">Changes every instance</p>
        </div>
        <label class="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={settings.community_show_subscribers ?? true}
            onChange={(event) => updateSettings({ community_show_subscribers: event.currentTarget.checked })}
            class="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary"
          />
          <span>
            <span class="block text-sm font-medium text-text">Subscriber count</span>
            <span class="block text-xs text-text-muted">Show the subscriber count in the profile</span>
          </span>
        </label>
      </section>
    </PopoverShell>
  )
}
