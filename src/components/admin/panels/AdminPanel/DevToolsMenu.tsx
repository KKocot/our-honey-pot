// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, createUniqueId, Match, Show, Switch, type JSX } from 'solid-js'
import {
  Ellipsis,
  FlaskConical,
  RotateCcw,
  UserRoundCog,
  FileDown,
  FileBraces,
  FileUp,
  GitCompareArrows,
  HardDriveDownload,
  HardDriveUpload,
  Keyboard,
  Trash2,
} from 'lucide-solid'
import { Popover, showToast, type PopoverPlacement } from '../../../ui'
import { currentUser, logout, type AuthUser } from '../../../auth/auth-store'
import { DevLoginForm } from '../../../dev/DevLoginForm'
import { get_hive_username } from '../../../../lib/config'
import { release_dev_config_on_server, release_failure_message } from '../../../../lib/dev-config-store'
import {
  is_dev_mode,
  is_dev_mode_available,
  read_dev_ops,
  reset_dev_storage,
  set_dev_mode_enabled,
} from '../../../../lib/dev-mode'

const RELEASE_FAILURE_TOAST_MS = 30_000

const MENU_ITEM_SELECTOR =
  '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])'

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
  /** Set while the popover shows a form: the content becomes a labelled group without menu arrow-key handling. */
  form_label?: string
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
        <div
          role={props.form_label ? 'group' : 'menu'}
          aria-label={props.form_label ?? props.label}
          onKeyDown={(event) => {
            if (!props.form_label) handle_menu_keydown(event)
          }}
          class="p-1"
        >
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
  /** Dev mode: prefilled "Log in as" username (blog config account), null when unknown. */
  dev_login_username: () => string | null
  /** Dev mode: completes a keyless dev login (throws outside dev mode). */
  on_dev_login: (user: AuthUser) => void
}

type MenuView = 'menu' | 'confirm_clear' | 'dev_login' | 'confirm_reset'

const CONFIRM_CANCEL_CLASS =
  'rounded-md px-3 py-1.5 text-sm text-text hover:bg-bg-secondary focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11'
const CONFIRM_DANGER_CLASS =
  'rounded-md bg-error px-3 py-1.5 text-sm font-medium text-white hover:bg-error/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary max-md:min-h-11'

const focus_on_mount = (element: HTMLElement) => queueMicrotask(() => element.focus({ preventScroll: true }))

function logout_dev_user() {
  if (currentUser()?.loginType === 'dev') logout()
}

// Modules read the flag per call, but the query cache and auth state were built under the old mode, so reload
async function toggle_dev_mode() {
  const next = !is_dev_mode()
  if (!set_dev_mode_enabled(next)) {
    showToast('Could not change dev mode: localStorage is unavailable', 'error')
    return
  }
  if (next) {
    window.location.reload()
    return
  }
  logout_dev_user()
  await release_and_reload()
}

// Page loads never drop the dev server config (plan_dev_config_sync), so dev mode off / reset do it explicitly
async function reset_local_data() {
  reset_dev_storage()
  logout_dev_user()
  await release_and_reload()
}

// On failure the reload waits for the user, otherwise it would hide the toast explaining the 409 / error
async function release_and_reload() {
  const message = release_failure_message(await release_dev_config_on_server(get_hive_username()))
  if (!message) {
    window.location.reload()
    return
  }
  showToast(message, 'error', {
    duration_ms: RELEASE_FAILURE_TOAST_MS,
    action: { label: 'Reload', on_click: () => window.location.reload() },
  })
}

interface DevModeGroupProps {
  on_log_in_as: () => void
  on_reset: () => void
}

function DevModeGroupImpl(props: DevModeGroupProps) {
  const label_id = `dev-mode-${createUniqueId()}`
  const enabled = is_dev_mode()

  return (
    <Show when={is_dev_mode_available()}>
      <div role="group" aria-labelledby={label_id} class="mt-1 border-t border-border pt-1">
        <p id={label_id} role="presentation" class={MENU_GROUP_LABEL_CLASS}>
          Developer mode
        </p>
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={enabled}
          class={MENU_ITEM_CLASS}
          onClick={() => void toggle_dev_mode()}
        >
          <FlaskConical size={16} aria-hidden="true" class="text-text-muted" />
          <span class="flex-1">Dev mode (local writes)</span>
          <span class={`text-xs ${enabled ? 'font-medium text-warning' : 'text-text-muted'}`}>
            {enabled ? 'On' : 'Off'}
          </span>
        </button>
        <Show when={enabled}>
          <button type="button" role="menuitem" class={MENU_ITEM_CLASS} onClick={props.on_log_in_as}>
            <UserRoundCog size={16} aria-hidden="true" class="text-text-muted" />
            Log in as...
          </button>
        </Show>
        <button type="button" role="menuitem" class={`${MENU_ITEM_CLASS} text-error`} onClick={props.on_reset}>
          <RotateCcw size={16} aria-hidden="true" />
          Reset local data...
        </button>
      </div>
    </Show>
  )
}

const DevModeGroup = import.meta.env.DEV ? DevModeGroupImpl : () => null

function ResetLocalDataConfirmImpl(props: { on_cancel: () => void }) {
  const title_id = `reset-dev-${createUniqueId()}`
  const ops_count = read_dev_ops().length

  return (
    <div role="group" aria-labelledby={title_id} class="space-y-3 p-2">
      <p id={title_id} class="text-sm text-text">
        Reset local data? Removes the dev config, {ops_count} logged {ops_count === 1 ? 'operation' : 'operations'} and
        the dev login, then reloads the page.
      </p>
      <div class="flex justify-end gap-2">
        <button
          ref={focus_on_mount}
          type="button"
          role="menuitem"
          onClick={props.on_cancel}
          class={CONFIRM_CANCEL_CLASS}
        >
          Cancel
        </button>
        <button type="button" role="menuitem" onClick={() => void reset_local_data()} class={CONFIRM_DANGER_CLASS}>
          Reset local data
        </button>
      </div>
    </div>
  )
}

const ResetLocalDataConfirm = import.meta.env.DEV ? ResetLocalDataConfirmImpl : () => null

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
  const [view, set_view] = createSignal<MenuView>('menu')
  const clear_title_id = `clear-backup-${createUniqueId()}`
  const group_label_id = `dev-tools-${createUniqueId()}`

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
      on_close={() => set_view('menu')}
      form_label={import.meta.env.DEV && view() === 'dev_login' ? 'Dev login' : undefined}
    >
      {(close) => (
        <Switch>
          <Match when={view() === 'confirm_clear'}>
            <div role="group" aria-labelledby={clear_title_id} class="space-y-3 p-2">
              <p id={clear_title_id} class="text-sm text-text">
                Clear the local backup? This can't be undone.
              </p>
              <div class="flex justify-end gap-2">
                <button
                  ref={focus_on_mount}
                  type="button"
                  role="menuitem"
                  onClick={() => set_view('menu')}
                  class={CONFIRM_CANCEL_CLASS}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={run(close, props.actions.on_backup_clear)}
                  class={CONFIRM_DANGER_CLASS}
                >
                  Clear backup
                </button>
              </div>
            </div>
          </Match>
          <Match when={view() === 'confirm_reset'}>
            <ResetLocalDataConfirm on_cancel={() => set_view('menu')} />
          </Match>
          <Match when={view() === 'dev_login'}>
            <div class="p-2">
              <DevLoginForm
                default_username={props.actions.dev_login_username()}
                on_login={(user) => {
                  props.actions.on_dev_login(user)
                  close()
                }}
                on_cancel={() => set_view('menu')}
                autofocus
              />
            </div>
          </Match>
          <Match when={view() === 'menu'}>
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
                  onClick={() => set_view('confirm_clear')}
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

            <DevModeGroup on_log_in_as={() => set_view('dev_login')} on_reset={() => set_view('confirm_reset')} />
          </Match>
        </Switch>
      )}
    </MenuPopover>
  )
}
