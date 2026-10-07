// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createMemo, createSignal, createUniqueId, For, Show } from 'solid-js'
import { ChevronDown } from 'lucide-solid'
import {
  clear_instance_override,
  set_global_size,
  set_instance_override,
  settings,
  updateSettings,
} from '../../queries'
import {
  authorProfileElementLabels,
  collectAllElementIds,
  pageElementLabels,
  type CardLayout,
} from '../../types/layout'
import {
  INSTANCE_OVERRIDE_RANGES,
  defaultSettings,
  instance_key,
  instance_override_keys_for,
  is_instance_override_value,
  type InstanceOverrideKey,
  type SettingsData,
} from '../../types/settings'
import { GLOBAL_ONLY_SIZE_RANGES, resolve_instance_settings } from '../../../../lib/instance-overrides'
import { Slider } from '../../../ui'
import { CardLayoutDnd } from './CardLayoutDnd'
import { InstanceSlider } from './InstanceSlider'
import { PopoverShell, slot_label, type PopoverMoveControls, type PopoverScope } from './PopoverShell'

export interface AuthorProfilePopoverProps {
  section_id: string
  element_id: string
  slot: string
  anchor: HTMLElement | undefined
  on_close: () => void
  move?: PopoverMoveControls
}

type AuthorSizeKey =
  | 'authorAvatarSizePx'
  | 'authorCoverHeightPx'
  | 'authorUsernameSizePx'
  | 'authorDisplayNameSizePx'
  | 'authorAboutSizePx'
  | 'authorReputationSizePx'
  | 'authorStatsSizePx'
  | 'authorMetaSizePx'

interface AuthorProfilePreset {
  id: string
  label: string
  description: string
  layout: CardLayout
  sizes: Partial<Pick<SettingsData, AuthorSizeKey>>
}

interface AuthorSizeControl {
  key: InstanceOverrideKey
  label: string
  /** Slider is shown only when at least one of these layout elements is rendered. */
  elements: ReadonlyArray<string>
}

const AUTHOR_PROFILE_ELEMENT_IDS = [
  'coverImage',
  'avatar',
  'username',
  'displayName',
  'reputation',
  'about',
  'location',
  'website',
  'joinDate',
  'followers',
  'following',
  'postCount',
  'hivePower',
  'hpEarned',
  'hiveBalance',
  'hbdBalance',
]

const STATS_ELEMENTS = ['followers', 'following', 'postCount', 'hivePower', 'hpEarned', 'hiveBalance', 'hbdBalance']

const SIZE_CONTROLS: ReadonlyArray<AuthorSizeControl> = [
  { key: 'authorAvatarSizePx', label: 'Avatar size', elements: ['avatar'] },
  { key: 'authorCoverHeightPx', label: 'Cover height', elements: ['coverImage'] },
  { key: 'authorUsernameSizePx', label: 'Username size', elements: ['username'] },
  { key: 'authorDisplayNameSizePx', label: 'Display name size', elements: ['displayName'] },
  { key: 'authorAboutSizePx', label: 'About size', elements: ['about'] },
  { key: 'authorStatsSizePx', label: 'Stats size', elements: STATS_ELEMENTS },
  { key: 'authorMetaSizePx', label: 'Metadata size', elements: ['location', 'website', 'joinDate'] },
]

const AUTHOR_PROFILE_PRESETS: ReadonlyArray<AuthorProfilePreset> = [
  {
    id: 'compact',
    label: 'Compact',
    description: 'One line: avatar, username and reputation',
    layout: {
      sections: [
        {
          id: 'sec-1',
          orientation: 'horizontal',
          children: [
            { type: 'element', id: 'avatar' },
            { type: 'element', id: 'username' },
            { type: 'element', id: 'reputation' },
          ],
        },
        {
          id: 'sec-2',
          orientation: 'horizontal',
          children: [
            { type: 'element', id: 'followers' },
            { type: 'element', id: 'following' },
            { type: 'element', id: 'postCount' },
          ],
        },
      ],
    },
    sizes: {
      authorAvatarSizePx: 40,
      authorUsernameSizePx: 12,
      authorReputationSizePx: 10,
      authorStatsSizePx: 12,
    },
  },
  {
    id: 'card',
    label: 'Card',
    description: 'Default card with cover, identity and stats',
    layout: {
      sections: [
        { id: 'sec-1', orientation: 'horizontal', children: [{ type: 'element', id: 'coverImage' }] },
        {
          id: 'sec-2',
          orientation: 'horizontal',
          children: [
            { type: 'element', id: 'avatar' },
            { type: 'element', id: 'username' },
            { type: 'element', id: 'reputation' },
          ],
        },
        { id: 'sec-3', orientation: 'vertical', children: [{ type: 'element', id: 'about' }] },
        {
          id: 'sec-4',
          orientation: 'horizontal',
          children: [
            { type: 'element', id: 'location' },
            { type: 'element', id: 'website' },
            { type: 'element', id: 'joinDate' },
          ],
        },
        {
          id: 'sec-5',
          orientation: 'horizontal',
          children: [
            { type: 'element', id: 'followers' },
            { type: 'element', id: 'following' },
            { type: 'element', id: 'postCount' },
            { type: 'element', id: 'hpEarned' },
          ],
        },
        {
          id: 'sec-6',
          orientation: 'horizontal',
          children: [
            { type: 'element', id: 'votingPower' },
            { type: 'element', id: 'hiveBalance' },
            { type: 'element', id: 'hbdBalance' },
          ],
        },
      ],
    },
    sizes: {
      authorAvatarSizePx: 64,
      authorCoverHeightPx: 64,
      authorUsernameSizePx: 14,
      authorDisplayNameSizePx: 18,
      authorAboutSizePx: 14,
      authorReputationSizePx: 12,
      authorStatsSizePx: 14,
      authorMetaSizePx: 12,
    },
  },
  {
    id: 'stats-heavy',
    label: 'Stats Heavy',
    description: 'Stats first, larger cover and detailed numbers',
    layout: {
      sections: [
        { id: 'sec-1', orientation: 'horizontal', children: [{ type: 'element', id: 'coverImage' }] },
        {
          id: 'sec-2',
          orientation: 'horizontal',
          children: [
            { type: 'element', id: 'avatar' },
            { type: 'element', id: 'displayName' },
            { type: 'element', id: 'reputation' },
          ],
        },
        { id: 'sec-3', orientation: 'vertical', children: [{ type: 'element', id: 'about' }] },
        {
          id: 'sec-4',
          orientation: 'horizontal',
          children: [
            { type: 'element', id: 'followers' },
            { type: 'element', id: 'following' },
            { type: 'element', id: 'postCount' },
          ],
        },
        {
          id: 'sec-5',
          orientation: 'horizontal',
          children: [
            { type: 'element', id: 'hivePower' },
            { type: 'element', id: 'hpEarned' },
          ],
        },
        {
          id: 'sec-6',
          orientation: 'horizontal',
          children: [
            { type: 'element', id: 'hiveBalance' },
            { type: 'element', id: 'hbdBalance' },
            { type: 'element', id: 'votingPower' },
          ],
        },
      ],
    },
    sizes: {
      authorAvatarSizePx: 72,
      authorCoverHeightPx: 120,
      authorDisplayNameSizePx: 20,
      authorAboutSizePx: 14,
      authorReputationSizePx: 12,
      authorStatsSizePx: 16,
    },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Avatar, username and bio only',
    layout: {
      sections: [
        {
          id: 'sec-1',
          orientation: 'horizontal',
          children: [
            { type: 'element', id: 'avatar' },
            { type: 'element', id: 'username' },
          ],
        },
        { id: 'sec-2', orientation: 'vertical', children: [{ type: 'element', id: 'about' }] },
      ],
    },
    sizes: {
      authorAvatarSizePx: 48,
      authorUsernameSizePx: 13,
      authorAboutSizePx: 12,
    },
  },
  {
    id: 'full',
    label: 'Full',
    description: 'All elements, large cover and sizes',
    layout: {
      sections: [
        { id: 'sec-1', orientation: 'horizontal', children: [{ type: 'element', id: 'coverImage' }] },
        {
          id: 'sec-2',
          orientation: 'horizontal',
          children: [
            { type: 'element', id: 'avatar' },
            { type: 'element', id: 'displayName' },
            { type: 'element', id: 'username' },
            { type: 'element', id: 'reputation' },
          ],
        },
        { id: 'sec-3', orientation: 'vertical', children: [{ type: 'element', id: 'about' }] },
        {
          id: 'sec-4',
          orientation: 'horizontal',
          children: [
            { type: 'element', id: 'location' },
            { type: 'element', id: 'website' },
            { type: 'element', id: 'joinDate' },
          ],
        },
        {
          id: 'sec-5',
          orientation: 'horizontal',
          children: [
            { type: 'element', id: 'followers' },
            { type: 'element', id: 'following' },
            { type: 'element', id: 'postCount' },
          ],
        },
        {
          id: 'sec-6',
          orientation: 'horizontal',
          children: [
            { type: 'element', id: 'hivePower' },
            { type: 'element', id: 'hpEarned' },
          ],
        },
        {
          id: 'sec-7',
          orientation: 'horizontal',
          children: [
            { type: 'element', id: 'votingPower' },
            { type: 'element', id: 'hiveBalance' },
            { type: 'element', id: 'hbdBalance' },
          ],
        },
      ],
    },
    sizes: {
      authorAvatarSizePx: 96,
      authorCoverHeightPx: 160,
      authorUsernameSizePx: 16,
      authorDisplayNameSizePx: 24,
      authorAboutSizePx: 16,
      authorReputationSizePx: 14,
      authorStatsSizePx: 16,
      authorMetaSizePx: 14,
    },
  },
]

function sets_equal(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) if (!b.has(item)) return false
  return true
}

// Presets define which elements are shown, not their arrangement: element sets and preset sizes are compared.
function detect_active_preset(layout: CardLayout, current: Partial<Record<AuthorSizeKey, number>>): string {
  const current_ids = new Set(collectAllElementIds(layout))
  const match = AUTHOR_PROFILE_PRESETS.find(
    (preset) =>
      sets_equal(current_ids, new Set(collectAllElementIds(preset.layout))) &&
      Object.entries(preset.sizes).every(([key, value]) => current[key as AuthorSizeKey] === value)
  )
  return match?.id ?? 'custom'
}

export function AuthorProfilePopover(props: AuthorProfilePopoverProps) {
  const id = createUniqueId()
  const global_id = `author-profile-popover-global-${id}`
  const layout_panel_id = `author-profile-popover-layout-${id}`
  const [scope, set_scope] = createSignal<PopoverScope>('instance')
  const [layout_open, set_layout_open] = createSignal(false)

  // Without a layout every element counts as rendered, so no slider is hidden (as in the former settings view).
  const layout_ids = createMemo(() => {
    const layout = settings.authorProfileLayout2
    return layout?.sections ? new Set(collectAllElementIds(layout)) : null
  })
  const in_layout = (elements: ReadonlyArray<string>) => {
    const ids = layout_ids()
    return !ids || elements.some((element) => ids.has(element))
  }

  const visible_sizes = createMemo(() => {
    const allowed = new Set(instance_override_keys_for(props.element_id))
    return SIZE_CONTROLS.filter((control) => allowed.has(control.key) && in_layout(control.elements))
  })
  const resolved = createMemo(() => resolve_instance_settings(settings, props.section_id, props.element_id))
  const overrides = () => settings.instanceOverrides?.[instance_key(props.section_id, props.element_id)]
  const has_override = (key: InstanceOverrideKey) => is_instance_override_value(key, overrides()?.[key])
  const has_any_override = () => instance_override_keys_for(props.element_id).some((key) => has_override(key))

  const value_of = (source: Partial<Record<InstanceOverrideKey, number>>, key: InstanceOverrideKey) =>
    source[key] ?? defaultSettings[key] ?? INSTANCE_OVERRIDE_RANGES[key].min

  const active_preset_id = createMemo(() =>
    detect_active_preset(settings.authorProfileLayout2, {
      authorAvatarSizePx: settings.authorAvatarSizePx,
      authorCoverHeightPx: settings.authorCoverHeightPx,
      authorUsernameSizePx: settings.authorUsernameSizePx,
      authorDisplayNameSizePx: settings.authorDisplayNameSizePx,
      authorAboutSizePx: settings.authorAboutSizePx,
      authorReputationSizePx: settings.authorReputationSizePx,
      authorStatsSizePx: settings.authorStatsSizePx,
      authorMetaSizePx: settings.authorMetaSizePx,
    })
  )
  const active_preset = () => AUTHOR_PROFILE_PRESETS.find((preset) => preset.id === active_preset_id())

  const apply_preset = (preset: AuthorProfilePreset) => {
    updateSettings({ authorProfileLayout2: preset.layout, ...preset.sizes })
  }

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
      <Show when={visible_sizes().length === 0}>
        <p class="text-xs text-text-muted">No element with an adjustable size is in the profile layout.</p>
      </Show>
      <For each={visible_sizes()}>
        {(control) => (
          <Show
            when={scope() === 'instance'}
            fallback={
              <Slider
                label={control.label}
                unit="px"
                min={INSTANCE_OVERRIDE_RANGES[control.key].min}
                max={INSTANCE_OVERRIDE_RANGES[control.key].max}
                value={value_of(settings, control.key)}
                onChange={(value) => set_global_size(control.key, value)}
              />
            }
          >
            <InstanceSlider
              label={control.label}
              unit="px"
              min={INSTANCE_OVERRIDE_RANGES[control.key].min}
              max={INSTANCE_OVERRIDE_RANGES[control.key].max}
              value={value_of(resolved(), control.key)}
              inherited={!has_override(control.key)}
              onChange={(value) => set_instance_override(props.section_id, props.element_id, control.key, value)}
              onReset={() => clear_instance_override(props.section_id, props.element_id, control.key)}
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

        <div>
          <p class="mb-1.5 text-sm font-medium text-text">Preset</p>
          <div role="group" aria-label="Profile presets" class="flex flex-wrap gap-1.5">
            <For each={AUTHOR_PROFILE_PRESETS}>
              {(preset) => (
                <button
                  type="button"
                  aria-pressed={active_preset_id() === preset.id}
                  onClick={() => apply_preset(preset)}
                  class={`rounded-lg px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11 ${
                    active_preset_id() === preset.id
                      ? 'bg-accent/10 text-accent ring-2 ring-accent'
                      : 'border border-border text-primary hover:border-accent/50'
                  }`}
                >
                  {preset.label}
                </button>
              )}
            </For>
            <Show when={active_preset_id() === 'custom'}>
              <span class="rounded-lg bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent ring-2 ring-accent">
                Custom
              </span>
            </Show>
          </div>
          <Show when={active_preset()}>
            {(preset) => <p class="mt-1.5 text-xs text-text-muted">{preset().description}</p>}
          </Show>
        </div>

        <Show when={in_layout(['reputation'])}>
          <Slider
            label="Reputation size"
            unit="px"
            min={GLOBAL_ONLY_SIZE_RANGES.authorReputationSizePx.min}
            max={GLOBAL_ONLY_SIZE_RANGES.authorReputationSizePx.max}
            value={settings.authorReputationSizePx ?? defaultSettings.authorReputationSizePx}
            onChange={(value) => updateSettings({ authorReputationSizePx: value })}
          />
        </Show>

        <div>
          <button
            type="button"
            aria-expanded={layout_open()}
            aria-controls={layout_panel_id}
            onClick={() => set_layout_open(!layout_open())}
            class="flex w-full items-center justify-between rounded text-left text-sm font-medium text-text focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
          >
            Profile layout
            <ChevronDown
              size={16}
              aria-hidden="true"
              class={`text-text-muted transition-transform duration-200 ease-out motion-reduce:transition-none ${layout_open() ? 'rotate-180' : ''}`}
            />
          </button>
          <Show when={layout_open()}>
            <div id={layout_panel_id} class="mt-2">
              <CardLayoutDnd
                layout_key="authorProfileLayout2"
                element_labels={authorProfileElementLabels}
                element_ids={AUTHOR_PROFILE_ELEMENT_IDS}
                label="Profile layout"
              />
            </div>
          </Show>
        </div>
      </section>
    </PopoverShell>
  )
}
