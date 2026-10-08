// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, createUniqueId, Show, type JSX } from 'solid-js'
import {
  Ellipsis,
  FileDown,
  FileBraces,
  FileUp,
  GitCompareArrows,
  HardDriveDownload,
  HardDriveUpload,
  Keyboard,
  Trash2,
} from 'lucide-solid'
import { Popover, type PopoverPlacement } from '../../../ui'

const MENU_ITEM_SELECTOR = '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled])'

export const MENU_ITEM_CLASS =
  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-text transition-colors hover:bg-bg-secondary focus-visible:bg-bg-secondary focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-11'

export const MENU_GROUP_LABEL_CLASS = 'px-2.5 pt-2 pb-1 text-xs font-medium text-text-muted'

/** Arrow / Home / End navigation between enabled menu items of the focused menu (WAI-ARIA menu pattern). */
export function handle_menu_keydown(event: KeyboardEvent) {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
  if (!keys.includes(event.key)) return
  const menu = event.currentTarget as HTMLElement
  const items = Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)).filter(
    (item) => item.offsetParent !== null
  )
  if (items.length === 0) return
  event.preventDefault()
  const index = items.indexOf(document.activeElement as HTMLElement)
  const last = items.length - 1
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? last
        : event.key === 'ArrowDown'
          ? index >= last
            ? 0
            : index + 1
          : index <= 0
            ? last
            : index - 1
  items[next].focus()
}

interface MenuPopoverProps {
  /** Accessible name of the menu. */
  label: string
  trigger: JSX.Element
  trigger_class: string
  /** Needed when the trigger has no visible text. */
  trigger_label?: string
  trigger_title?: string
  placement?: PopoverPlacement
  children: (close: () => void) => JSX.Element
  on_close?: () => void
}

/** Menu button backed by the native Popover API (ADR 6ac6089e); `children` receives `close`. */
export function MenuPopover(props: MenuPopoverProps) {
  const id = `menu-${createUniqueId()}`
  const [open, set_open] = createSignal(false)
  const [anchor, set_anchor] = createSignal<HTMLButtonElement>()

  const close = () => {
    set_open(false)
    props.on_close?.()
  }

  return (
    <>
      <button
        ref={set_anchor}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open()}
        aria-controls={id}
        aria-label={props.trigger_label}
        title={props.trigger_title}
        onClick={() => (open() ? close() : set_open(true))}
        class={props.trigger_class}
      >
        {props.trigger}
      </button>
      <Popover
        id={id}
        open={open()}
        anchor={anchor()}
        onClose={close}
        label={props.label}
        placement={props.placement ?? 'bottom-end'}
        class="md:w-64"
      >
        <div role="menu" aria-label={props.label} onKeyDown={handle_menu_keydown} class="p-1">
          {props.children(close)}
        </div>
      </Popover>
    </>
  )
}

export interface DevToolsActions {
  on_compare: () => void
  on_download_config: () => void
  on_backup_save: () => void
  on_backup_load: () => void
  on_backup_clear: () => void
  on_import_design: () => void
  on_export_design: () => void
}

interface DevToolsMenuProps {
  actions: DevToolsActions
  /** Dev tools (JSON compare, raw config, local backup) are owner-only. */
  is_owner: boolean
  on_show_shortcuts?: () => void
  /** Groups moved here from the compact (< md) top bar, e.g. account and data source; rendered only below md. */
  compact_items?: (close: () => void) => JSX.Element
  trigger_class: string
}

export function DevToolsMenu(props: DevToolsMenuProps) {
  const [confirming_clear, set_confirming_clear] = createSignal(false)
  const clear_title_id = `clear-backup-${createUniqueId()}`
  const group_label_id = `dev-tools-${createUniqueId()}`
  const focus_on_mount = (element: HTMLElement) => queueMicrotask(() => element.focus())

  const run = (close: () => void, action: () => void) => () => {
    close()
    action()
  }

  return (
    <MenuPopover
      label="More actions"
      trigger_label="More actions"
      trigger_title="More actions"
      trigger={<Ellipsis size={18} aria-hidden="true" />}
      trigger_class={props.trigger_class}
      on_close={() => set_confirming_clear(false)}
    >
      {(close) => (
        <Show
          when={!confirming_clear()}
          fallback={
            <div role="group" aria-labelledby={clear_title_id} class="space-y-3 p-2">
              <p id={clear_title_id} class="text-sm text-text">
                Clear the local backup? This can't be undone.
              </p>
              <div class="flex justify-end gap-2">
                <button
                  ref={focus_on_mount}
                  type="button"
                  role="menuitem"
                  onClick={() => set_confirming_clear(false)}
                  class="rounded-md px-3 py-1.5 text-sm text-text hover:bg-bg-secondary focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={run(close, props.actions.on_backup_clear)}
                  class="rounded-md bg-error px-3 py-1.5 text-sm font-medium text-white hover:bg-error/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary max-md:min-h-11"
                >
                  Clear backup
                </button>
              </div>
            </div>
          }
        >
          <Show when={props.compact_items}>
            {(items) => <div class="border-b border-border pb-1 mb-1 md:hidden">{items()(close)}</div>}
          </Show>

          <div role="group" aria-label="Design file">
            <button
              type="button"
              role="menuitem"
              class={MENU_ITEM_CLASS}
              onClick={run(close, props.actions.on_import_design)}
            >
              <FileUp size={16} aria-hidden="true" class="text-text-muted" />
              Import design
            </button>
            <button
              type="button"
              role="menuitem"
              class={MENU_ITEM_CLASS}
              onClick={run(close, props.actions.on_export_design)}
            >
              <FileDown size={16} aria-hidden="true" class="text-text-muted" />
              Export design
            </button>
          </div>

          <Show when={props.is_owner}>
            <div role="group" aria-labelledby={group_label_id} class="mt-1 border-t border-border pt-1">
              <p id={group_label_id} role="presentation" class={MENU_GROUP_LABEL_CLASS}>
                Dev tools
              </p>
              <button
                type="button"
                role="menuitem"
                class={MENU_ITEM_CLASS}
                onClick={run(close, props.actions.on_compare)}
              >
                <GitCompareArrows size={16} aria-hidden="true" class="text-text-muted" />
                Compare with saved (JSON)
              </button>
              <button
                type="button"
                role="menuitem"
                class={MENU_ITEM_CLASS}
                onClick={run(close, props.actions.on_download_config)}
              >
                <FileBraces size={16} aria-hidden="true" class="text-text-muted" />
                Download config JSON
              </button>
              <button
                type="button"
                role="menuitem"
                class={MENU_ITEM_CLASS}
                onClick={run(close, props.actions.on_backup_save)}
              >
                <HardDriveDownload size={16} aria-hidden="true" class="text-text-muted" />
                Local backup: Save
              </button>
              <button
                type="button"
                role="menuitem"
                class={MENU_ITEM_CLASS}
                onClick={run(close, props.actions.on_backup_load)}
              >
                <HardDriveUpload size={16} aria-hidden="true" class="text-text-muted" />
                Local backup: Load
              </button>
              <button
                type="button"
                role="menuitem"
                aria-haspopup="true"
                class={`${MENU_ITEM_CLASS} text-error`}
                onClick={() => set_confirming_clear(true)}
              >
                <Trash2 size={16} aria-hidden="true" />
                Local backup: Clear...
              </button>
            </div>
          </Show>

          <Show when={props.on_show_shortcuts}>
            {(show) => (
              <div class="mt-1 border-t border-border pt-1">
                <button
                  type="button"
                  role="menuitem"
                  aria-keyshortcuts="?"
                  class={MENU_ITEM_CLASS}
                  onClick={run(close, show())}
                >
                  <Keyboard size={16} aria-hidden="true" class="text-text-muted" />
                  <span class="flex-1">Keyboard shortcuts</span>
                  <kbd class="text-xs text-text-muted">?</kbd>
                </button>
              </div>
            )}
          </Show>
        </Show>
      )}
    </MenuPopover>
  )
}
