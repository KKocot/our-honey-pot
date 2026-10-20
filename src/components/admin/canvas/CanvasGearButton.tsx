// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { splitProps, type JSX } from 'solid-js'
import { Settings } from 'lucide-solid'

export interface CanvasGearButtonProps extends Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'children' | 'onClick' | 'aria-label' | 'aria-haspopup' | 'aria-expanded'
> {
  label: string
  /** Popover of this gear is open: the icon gets the pressed look and `aria-expanded`. */
  expanded: boolean
  on_toggle: () => void
}

/** Settings button of a canvas element or section; the only pointer trigger of its popover. */
export function CanvasGearButton(props: CanvasGearButtonProps) {
  const [local, rest] = splitProps(props, ['label', 'expanded', 'on_toggle', 'ref', 'class'])
  return (
    <button
      {...rest}
      type="button"
      ref={local.ref}
      aria-label={local.label}
      aria-haspopup="dialog"
      aria-expanded={local.expanded}
      onClick={() => local.on_toggle()}
      class={`group/gear inline-flex size-8 shrink-0 items-center justify-center rounded p-1 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary max-md:size-11 max-md:p-2.5 ${local.class ?? ''}`}
    >
      <span
        class={`inline-flex size-6 items-center justify-center rounded border transition-colors duration-100 ease-out motion-reduce:transition-none ${
          local.expanded
            ? 'border-primary bg-primary text-primary-text'
            : 'border-border bg-bg-card text-text-muted group-hover/gear:text-text'
        }`}
      >
        <Settings size={14} aria-hidden="true" />
      </span>
    </button>
  )
}
