// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createUniqueId, For, Show } from 'solid-js'
import { settings, updateSettings } from '../../queries'
import { pageElementLabels } from '../../types/layout'
import { PopoverShell, slot_label, type PopoverMoveControls } from './PopoverShell'

export interface CommunitySidebarPopoverProps {
  section_id: string
  element_id: string
  slot: string
  anchor: HTMLElement | undefined
  on_close: () => void
  move?: PopoverMoveControls
}

export type SidebarToggleKey =
  'community_show_description' | 'community_show_rules' | 'community_show_leadership' | 'community_show_language'

interface SidebarToggle {
  key: SidebarToggleKey
  label: string
  description: string
}

const TOGGLES: ReadonlyArray<SidebarToggle> = [
  { key: 'community_show_description', label: 'Description', description: 'Community description in the sidebar' },
  { key: 'community_show_rules', label: 'Rules', description: 'Community rules (flag text)' },
  { key: 'community_show_leadership', label: 'Team', description: 'Owners, admins and moderators' },
  { key: 'community_show_language', label: 'Language', description: 'Community language' },
]

/** Visibility flag of each standalone community block layout element. */
export const COMMUNITY_BLOCK_FLAGS: Readonly<Record<string, SidebarToggleKey>> = Object.freeze({
  communityDescription: 'community_show_description',
  communityRules: 'community_show_rules',
  communityTeam: 'community_show_leadership',
  communityLanguage: 'community_show_language',
})

/** Flag of a standalone block element, or null for the aggregate sidebar and other elements. */
export function community_block_flag(element_id: string): SidebarToggleKey | null {
  return Object.hasOwn(COMMUNITY_BLOCK_FLAGS, element_id) ? COMMUNITY_BLOCK_FLAGS[element_id] : null
}

// Missing values render as visible (matches CommunitySidebar defaults).
const is_enabled = (key: SidebarToggleKey) => settings[key] ?? true

export const BLOCK_VISIBILITY_NOTE = 'Global setting: hides or shows this block on every page.'

function ToggleRow(props: { toggle: SidebarToggle; label?: string; described_by?: string }) {
  return (
    <label class="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={is_enabled(props.toggle.key)}
        aria-describedby={props.described_by}
        onChange={(event) => updateSettings({ [props.toggle.key]: event.currentTarget.checked })}
        class="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary"
      />
      <span>
        <span class="block text-sm font-medium text-text">{props.label ?? props.toggle.label}</span>
        <span class="block text-xs text-text-muted">{props.toggle.description}</span>
      </span>
    </label>
  )
}

export function CommunitySidebarPopover(props: CommunitySidebarPopoverProps) {
  const uid = createUniqueId()
  const global_id = `community-sidebar-popover-global-${uid}`
  const note_id = `community-sidebar-popover-note-${uid}`
  const block_toggle = () => {
    const flag = community_block_flag(props.element_id)
    return flag ? (TOGGLES.find((toggle) => toggle.key === flag) ?? null) : null
  }

  return (
    <PopoverShell
      open
      anchor={props.anchor}
      onClose={props.on_close}
      element_label={pageElementLabels[props.element_id] ?? props.element_id}
      slot_label={slot_label(props.slot)}
      move={props.move}
    >
      <Show
        when={block_toggle()}
        fallback={
          <section aria-labelledby={global_id} class="flex flex-col gap-3">
            <div>
              <h3 id={global_id} class="text-xs font-semibold uppercase text-text-muted">
                Global
              </h3>
              <p class="text-xs text-text-muted">Changes every instance</p>
            </div>
            <For each={TOGGLES}>{(toggle) => <ToggleRow toggle={toggle} />}</For>
          </section>
        }
      >
        {(toggle) => (
          <div class="flex flex-col gap-2">
            <ToggleRow toggle={toggle()} label="Show this block" described_by={note_id} />
            <p id={note_id} class="text-xs text-text-muted">
              {BLOCK_VISIBILITY_NOTE}
            </p>
          </div>
        )}
      </Show>
    </PopoverShell>
  )
}
