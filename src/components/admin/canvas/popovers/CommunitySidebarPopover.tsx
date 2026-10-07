// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createUniqueId, For } from 'solid-js'
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

type SidebarToggleKey = 'community_show_description' | 'community_show_rules' | 'community_show_leadership'

interface SidebarToggle {
  key: SidebarToggleKey
  label: string
  description: string
}

const TOGGLES: ReadonlyArray<SidebarToggle> = [
  { key: 'community_show_description', label: 'Description', description: 'Community description in the sidebar' },
  { key: 'community_show_rules', label: 'Rules', description: 'Community rules (flag text)' },
  { key: 'community_show_leadership', label: 'Team', description: 'Owners, admins and moderators' },
]

// Missing values render as visible (matches CommunitySidebar defaults).
const is_enabled = (key: SidebarToggleKey) => settings[key] ?? true

export function CommunitySidebarPopover(props: CommunitySidebarPopoverProps) {
  const global_id = `community-sidebar-popover-global-${createUniqueId()}`

  return (
    <PopoverShell
      open
      anchor={props.anchor}
      onClose={props.on_close}
      element_label={pageElementLabels[props.element_id] ?? props.element_id}
      slot_label={slot_label(props.slot)}
      move={props.move}
    >
      <section aria-labelledby={global_id} class="flex flex-col gap-3">
        <div>
          <h3 id={global_id} class="text-xs font-semibold uppercase text-text-muted">
            Global
          </h3>
          <p class="text-xs text-text-muted">Changes every instance</p>
        </div>
        <For each={TOGGLES}>
          {(toggle) => (
            <label class="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={is_enabled(toggle.key)}
                onChange={(event) => updateSettings({ [toggle.key]: event.currentTarget.checked })}
                class="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary"
              />
              <span>
                <span class="block text-sm font-medium text-text">{toggle.label}</span>
                <span class="block text-xs text-text-muted">{toggle.description}</span>
              </span>
            </label>
          )}
        </For>
      </section>
    </PopoverShell>
  )
}
