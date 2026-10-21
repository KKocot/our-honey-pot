// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createUniqueId } from 'solid-js'
import { pageElementLabels } from '../../types/layout'
import { SiteIdentitySettings } from '../../settings/SiteSettings/SiteIdentity'
import { PopoverShell, slot_label, type PopoverMoveControls } from './PopoverShell'

export interface HeaderPopoverProps {
  section_id: string
  element_id: string
  slot: string
  anchor: HTMLElement | undefined
  on_close: () => void
  move?: PopoverMoveControls
}

export function HeaderPopover(props: HeaderPopoverProps) {
  const global_id = `header-popover-global-${createUniqueId()}`

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
        <SiteIdentitySettings />
      </section>
    </PopoverShell>
  )
}
