// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createMemo, createSignal, For, Show } from 'solid-js'
import { clear_instance_override, settings, updateSettings } from '../../queries'
import { collectAllElementIds, type CardLayout } from '../../types/layout'
import {
  defaultSettings,
  instance_key,
  instance_override_keys_for,
  is_instance_override_value,
  type InstanceOverrideKey,
  type SettingsData,
} from '../../types/settings'
import { GLOBAL_ONLY_SIZE_RANGES } from '../../../../lib/instance-overrides'
import { Slider } from '../../../ui'
import {
  PopoverShell,
  slot_label,
  type CardStructure,
  type PopoverMoveControls,
  type PopoverScope,
} from './PopoverShell'
import { BackToSection, EditLayoutButton, GlobalGroup, SizeSlider, element_label } from './PostCardPopover'

export interface AuthorProfilePopoverProps {
  section_id: string
  element_id: string
  slot: string
  anchor: HTMLElement | undefined
  on_close: () => void
  move?: PopoverMoveControls
  /** Opens the profile card structure in the side panel; the button is hidden without it. */
  on_edit_card_layout?: (card: CardStructure) => void
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

/** One card section: orientation ("h" | "v") followed by its element ids. */
type PresetRow = readonly ['h' | 'v', ...string[]]

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

/** Elements the profile card structure editor may add. */
export const AUTHOR_PROFILE_ELEMENT_IDS: ReadonlyArray<string> = [
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

function preset_layout(rows: ReadonlyArray<PresetRow>): CardLayout {
  return {
    sections: rows.map(([orientation, ...ids], index) => ({
      id: `sec-${index + 1}`,
      orientation: orientation === 'v' ? 'vertical' : 'horizontal',
      children: ids.map((id) => ({ type: 'element' as const, id })),
    })),
  }
}

const COVER: PresetRow = ['h', 'coverImage']
const ABOUT: PresetRow = ['v', 'about']
const META: PresetRow = ['h', 'location', 'website', 'joinDate']
const SOCIAL: PresetRow = ['h', 'followers', 'following', 'postCount']

const AUTHOR_PROFILE_PRESETS: ReadonlyArray<AuthorProfilePreset> = [
  {
    id: 'compact',
    label: 'Compact',
    description: 'One line: avatar, username and reputation',
    layout: preset_layout([['h', 'avatar', 'username', 'reputation'], SOCIAL]),
    sizes: { authorAvatarSizePx: 40, authorUsernameSizePx: 12, authorReputationSizePx: 10, authorStatsSizePx: 12 },
  },
  {
    id: 'card',
    label: 'Card',
    description: 'Default card with cover, identity and stats',
    layout: preset_layout([
      COVER,
      ['h', 'avatar', 'username', 'reputation'],
      ABOUT,
      META,
      ['h', 'followers', 'following', 'postCount', 'hpEarned'],
      ['h', 'votingPower', 'hiveBalance', 'hbdBalance'],
    ]),
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
    layout: preset_layout([
      COVER,
      ['h', 'avatar', 'displayName', 'reputation'],
      ABOUT,
      SOCIAL,
      ['h', 'hivePower', 'hpEarned'],
      ['h', 'hiveBalance', 'hbdBalance', 'votingPower'],
    ]),
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
    layout: preset_layout([['h', 'avatar', 'username'], ABOUT]),
    sizes: { authorAvatarSizePx: 48, authorUsernameSizePx: 13, authorAboutSizePx: 12 },
  },
  {
    id: 'full',
    label: 'Full',
    description: 'All elements, large cover and sizes',
    layout: preset_layout([
      COVER,
      ['h', 'avatar', 'displayName', 'username', 'reputation'],
      ABOUT,
      META,
      SOCIAL,
      ['h', 'hivePower', 'hpEarned'],
      ['h', 'votingPower', 'hiveBalance', 'hbdBalance'],
    ]),
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
  return a.size === b.size && [...a].every((item) => b.has(item))
}

// Presets define which elements are shown, not their arrangement: element sets and preset sizes are compared.
function detect_active_preset(layout: CardLayout, current: Pick<SettingsData, AuthorSizeKey>): string {
  const current_ids = new Set(collectAllElementIds(layout))
  const match = AUTHOR_PROFILE_PRESETS.find(
    (preset) =>
      sets_equal(current_ids, new Set(collectAllElementIds(preset.layout))) &&
      Object.entries(preset.sizes).every(([key, value]) => current[key as AuthorSizeKey] === value)
  )
  return match?.id ?? 'custom'
}

export function AuthorProfilePopover(props: AuthorProfilePopoverProps) {
  const [scope, set_scope] = createSignal<PopoverScope>('instance')

  // Without a layout every element counts as rendered, so no slider is hidden.
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
  const overrides = () => settings.instanceOverrides?.[instance_key(props.section_id, props.element_id)]
  const has_any_override = () =>
    instance_override_keys_for(props.element_id).some((key) => is_instance_override_value(key, overrides()?.[key]))

  const active_preset_id = createMemo(() => detect_active_preset(settings.authorProfileLayout2, settings))
  const active_preset = () => AUTHOR_PROFILE_PRESETS.find((preset) => preset.id === active_preset_id())

  return (
    <PopoverShell
      open
      anchor={props.anchor}
      onClose={props.on_close}
      element_label={element_label(props.element_id)}
      slot_label={slot_label(props.slot)}
      back={<BackToSection slot={props.slot} />}
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
          <SizeSlider
            section_id={props.section_id}
            element_id={props.element_id}
            scope={scope()}
            setting={control.key}
            label={control.label}
            unit="px"
          />
        )}
      </For>
      <GlobalGroup>
        <div>
          <p class="mb-1.5 text-sm font-medium text-text">Preset</p>
          <div role="group" aria-label="Profile presets" class="flex flex-wrap gap-1.5">
            <For each={AUTHOR_PROFILE_PRESETS}>
              {(preset) => (
                <button
                  type="button"
                  aria-pressed={active_preset_id() === preset.id}
                  onClick={() => updateSettings({ authorProfileLayout2: preset.layout, ...preset.sizes })}
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
        <Show when={props.on_edit_card_layout}>
          {(open_layout) => (
            <EditLayoutButton label="Edit profile card structure" onClick={() => open_layout()('profile')} />
          )}
        </Show>
      </GlobalGroup>
    </PopoverShell>
  )
}
