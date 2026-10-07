// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createEffect, createUniqueId, on, onCleanup, type JSX } from 'solid-js'
import { Portal } from 'solid-js/web'

export type PopoverPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'

export interface PopoverProps {
  open: boolean
  anchor: HTMLElement | undefined
  onClose: () => void
  label?: string
  labelledby?: string
  placement?: PopoverPlacement
  id?: string
  class?: string
  children: JSX.Element
}

const PLACEMENT_CLASS: Record<PopoverPlacement, string> = {
  'bottom-start': 'md:[position-area:bottom_span-right]',
  'bottom-end': 'md:[position-area:bottom_span-left]',
  'top-start': 'md:[position-area:top_span-right]',
  'top-end': 'md:[position-area:top_span-left]',
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const DESKTOP_QUERY = '(min-width: 48rem)'
const VIEWPORT_MARGIN_PX = 8
const ANCHOR_GAP_PX = 4
const EXIT_DURATION_MS = 150

function supports_anchor_positioning(): boolean {
  return typeof CSS !== 'undefined' && CSS.supports('anchor-name: --popover-probe')
}

function focusable_in(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
}

// Manual placement for browsers without CSS anchor positioning (Safari < 26, Firefox ESR).
function place_without_anchor(panel: HTMLElement, anchor: HTMLElement, placement: PopoverPlacement) {
  if (!window.matchMedia(DESKTOP_QUERY).matches) {
    panel.style.removeProperty('top')
    panel.style.removeProperty('left')
    return
  }
  const a = anchor.getBoundingClientRect()
  const p = panel.getBoundingClientRect()
  const below = a.bottom + ANCHOR_GAP_PX
  const above = a.top - ANCHOR_GAP_PX - p.height
  const fits_below = below + p.height <= window.innerHeight - VIEWPORT_MARGIN_PX
  const fits_above = above >= VIEWPORT_MARGIN_PX
  const prefer_top = placement.startsWith('top')
  const top = prefer_top ? (fits_above || !fits_below ? above : below) : fits_below || !fits_above ? below : above
  const raw_left = placement.endsWith('end') ? a.right - p.width : a.left
  const max_left = window.innerWidth - p.width - VIEWPORT_MARGIN_PX
  panel.style.top = `${Math.max(VIEWPORT_MARGIN_PX, top)}px`
  panel.style.left = `${Math.min(Math.max(VIEWPORT_MARGIN_PX, raw_left), Math.max(VIEWPORT_MARGIN_PX, max_left))}px`
}

/** Non-modal popover in the top layer, anchored to `anchor`; bottom sheet below the md breakpoint. */
export function Popover(props: PopoverProps) {
  const anchor_name = `--popover-${createUniqueId()}`
  let panel: HTMLDivElement | undefined

  const handle_panel_keydown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || !panel) return
    const items = focusable_in(panel)
    if (items.length === 0) {
      event.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  createEffect(
    on(
      () => [props.open, props.anchor] as const,
      ([open, anchor]) => {
        const el = panel
        if (!el || !open || !anchor) return

        anchor.style.setProperty('anchor-name', anchor_name)
        el.style.setProperty('position-anchor', anchor_name)
        const active = document.activeElement
        const return_focus = active instanceof HTMLElement && active !== document.body ? active : anchor
        el.showPopover()

        const anchored = supports_anchor_positioning()
        let frame = 0
        const reposition = () => {
          cancelAnimationFrame(frame)
          frame = requestAnimationFrame(() => place_without_anchor(el, anchor, props.placement ?? 'bottom-start'))
        }
        if (!anchored) {
          place_without_anchor(el, anchor, props.placement ?? 'bottom-start')
          window.addEventListener('scroll', reposition, true)
          window.addEventListener('resize', reposition)
        }

        const focus_frame = requestAnimationFrame(() => {
          const [first] = focusable_in(el)
          ;(first ?? el).focus()
        })

        let swallow_click = false
        const handle_pointer_down = (event: PointerEvent) => {
          const target = event.target
          if (!(target instanceof Node) || el.contains(target) || anchor.contains(target)) return
          // Below md the popover is a modal sheet; the tap on the scrim must not reach the canvas.
          swallow_click = !window.matchMedia(DESKTOP_QUERY).matches
          props.onClose()
        }
        const handle_click = (event: MouseEvent) => {
          if (!swallow_click) return
          swallow_click = false
          event.preventDefault()
          event.stopPropagation()
        }
        const handle_keydown = (event: KeyboardEvent) => {
          // dnd-kit sensors preventDefault Escape before this bubble listener, so Escape mid-drag only cancels the drag.
          if (event.key !== 'Escape' || event.defaultPrevented) return
          event.preventDefault()
          props.onClose()
        }
        document.addEventListener('pointerdown', handle_pointer_down, true)
        document.addEventListener('click', handle_click, true)
        document.addEventListener('keydown', handle_keydown)

        onCleanup(() => {
          cancelAnimationFrame(frame)
          cancelAnimationFrame(focus_frame)
          window.removeEventListener('scroll', reposition, true)
          window.removeEventListener('resize', reposition)
          document.removeEventListener('pointerdown', handle_pointer_down, true)
          document.removeEventListener('keydown', handle_keydown)
          // Deferred so a swallowed scrim click still sees the listener.
          setTimeout(() => document.removeEventListener('click', handle_click, true), 0)

          const focus_was_inside = el.contains(document.activeElement) || document.activeElement === document.body
          if (el.matches(':popover-open')) el.hidePopover()
          if (focus_was_inside && return_focus.isConnected) return_focus.focus()

          // Keep the anchor name until the exit transition ends, unless the same anchor reopened meanwhile.
          setTimeout(() => {
            if (props.open && props.anchor === anchor) return
            if (anchor.style.getPropertyValue('anchor-name') === anchor_name) anchor.style.removeProperty('anchor-name')
          }, EXIT_DURATION_MS)
        })
      }
    )
  )

  return (
    <Portal>
      <div
        ref={panel}
        id={props.id}
        popover="manual"
        role="dialog"
        aria-modal="false"
        aria-label={props.label}
        aria-labelledby={props.labelledby}
        tabindex="-1"
        onKeyDown={handle_panel_keydown}
        class={`m-0 inset-auto w-80 max-w-[calc(100vw-1rem)] max-h-[70vh] overflow-auto rounded-lg border border-border bg-bg-card p-0 text-text shadow-xl
          transition-[opacity,translate,scale,display,overlay] transition-discrete duration-150 ease-out
          starting:open:translate-y-1 starting:open:scale-98 starting:open:opacity-0
          not-open:translate-y-1 not-open:scale-98 not-open:opacity-0 not-open:duration-100 not-open:ease-in
          motion-reduce:transition-none
          md:my-1 md:[position-try-fallbacks:flip-block,flip-inline,flip-block_flip-inline] ${PLACEMENT_CLASS[props.placement ?? 'bottom-start']}
          max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:w-full max-md:max-w-none max-md:max-h-[75vh] max-md:rounded-t-xl max-md:rounded-b-none max-md:backdrop:bg-black/40
          ${props.class ?? ''}`}
      >
        <div aria-hidden="true" class="mx-auto mt-2 h-1 w-8 rounded-full bg-border md:hidden" />
        {props.children}
      </div>
    </Portal>
  )
}
