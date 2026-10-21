// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createEffect, createSignal, createUniqueId, For, on, onCleanup, onMount, Show, type JSX } from 'solid-js'
import {
  Ban,
  Check,
  ChevronDown,
  CircleAlert,
  FlaskConical,
  LoaderCircle,
  LogIn,
  LogOut,
  Monitor,
  Redo2,
  Smartphone,
  Tablet,
  TriangleAlert,
  Undo2,
} from 'lucide-solid'
import { Button, Popover } from '../../../ui'
import NodeSwitcher from '../../../ui/NodeSwitcher'
import { currentUser, isAuthenticated } from '../../../auth'
import { hive_avatar_url } from '../../../../lib/config'
import {
  DEVICE_WIDTHS,
  EDITOR_ZOOMS,
  type EditorDevice,
  type EditorMode,
  type EditorState,
  type EditorZoom,
  type SaveStatus,
} from '../../editor-state'
import type { CanvasDataState, CanvasMode, MockReason } from '../../canvas/use_canvas_data'
import { settings, settingsVersion } from '../../store'
import { configSource } from '../../queries'
import { build_config_body, encode_config_json } from '../../hive-broadcast'
import { prune_settings_instance_overrides } from '../../../../lib/instance-overrides'
import {
  config_size_breakdown,
  largest_size_area,
  measure_config_body,
  shows_size_breakdown,
  size_area_has_editor,
  type ConfigSize,
  type ConfigSizeArea,
  type ConfigSizeAreaId,
  type ConfigSizeLevel,
} from '../../config-size'
import type { SettingsData } from '../../types/settings'
import { home_save_errors } from '../../canvas/home-sections/model'
import { page_link_save_errors, page_save_errors } from '../../settings/PagesSettings/page-model'
import {
  DevToolsMenu,
  MENU_GROUP_LABEL_CLASS,
  MENU_ITEM_CLASS,
  MenuPopover,
  type DevToolsActions,
} from './DevToolsMenu'

export type AdminTab = EditorMode

export interface SaveControls {
  on_save: () => void
  /** Null when saving is allowed or the user only has to log in (Save then opens the login modal). */
  blocked_message: string | null
  loading?: boolean
}

interface EditorTopBarProps {
  active_tab: AdminTab
  on_tab_change: (tab: AdminTab) => void
  show_moderation: boolean
  canvas_data: CanvasDataState
  header_ref?: (element: HTMLElement) => void
  is_owner: boolean
  on_login: () => void
  on_logout: () => void
  /** Enables the View (zoom, device) and History groups plus their keyboard shortcuts. */
  editor?: EditorState
  /** Effective zoom of `Fit` in percent, shown as "Fit · 68%". */
  fit_percent?: number
  /** Defaults to `editor.undo` / `editor.redo`; override to add a toast. */
  on_undo?: () => void
  on_redo?: () => void
  save?: SaveControls
  dev_tools?: DevToolsActions
  on_show_shortcuts?: () => void
  /** Opens the editor of a config size area (link to the largest area in the size breakdown). */
  on_open_size_area?: (area: ConfigSizeAreaId) => void
  /** Opens the Pages editor on a page (Save issue list). */
  on_open_page?: (page_index: number) => void
}

export interface SaveIssue {
  message: string
  open: () => void
}

function focus_home_section(id: string) {
  const section = document.querySelector<HTMLElement>(`[data-home-section="${CSS.escape(id)}"]`)
  section?.scrollIntoView({ block: 'center' })
  section?.focus({ preventScroll: true })
}

const TAB_CLASS =
  'relative h-12 px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary'

const ICON_BUTTON_CLASS =
  'inline-flex size-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-text-muted max-md:size-11'

const MENU_TRIGGER_CLASS =
  'inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-text transition-colors hover:bg-bg-secondary focus-visible:outline-2 focus-visible:outline-primary aria-expanded:bg-bg-secondary max-md:min-h-11'

const DATA_OPTIONS: { value: CanvasMode; label: string }[] = [
  { value: 'live', label: 'Live data' },
  { value: 'mock', label: 'Sample data' },
]

const MOCK_REASON_TEXT: Readonly<Record<MockReason, string>> = {
  user_choice: 'Sample data selected',
  no_account: 'No Hive account configured',
  no_posts: 'The account has no posts yet',
  no_community: 'Community not found',
  error: 'Failed to load blog data from Hive',
}

const DEVICES: { value: EditorDevice; label: string; icon: typeof Monitor; class: string }[] = [
  { value: 'desktop', label: 'Desktop', icon: Monitor, class: 'max-lg:hidden' },
  { value: 'tablet', label: 'Tablet', icon: Tablet, class: '' },
  { value: 'mobile', label: 'Mobile', icon: Smartphone, class: '' },
]

const FIXED_ZOOMS = EDITOR_ZOOMS.filter((zoom): zoom is Exclude<EditorZoom, 'fit'> => zoom !== 'fit')
const LARGE_SCREEN_QUERY = '(min-width: 64rem)'

const percent = (value: number) => `${Math.round(value * 100)}%`

const CONFIG_SIZE_DEBOUNCE_MS = 300
const BYTES_PER_KB = 1024

const CONFIG_SIZE_TONE: Readonly<Record<ConfigSizeLevel, { text: string; bar: string }>> = {
  ok: { text: 'text-text-muted', bar: 'bg-text-muted' },
  warn: { text: 'text-warning', bar: 'bg-warning' },
  danger: { text: 'text-error', bar: 'bg-error' },
  blocked: { text: 'text-error', bar: 'bg-error' },
}

function format_kb(bytes: number): string {
  const kb = bytes / BYTES_PER_KB
  return Number.isInteger(kb) ? String(kb) : kb.toFixed(1)
}

/** `23.4 / 64 KB` (1 KB = 1024 B, the unit of the save limit). */
export function format_config_size(size: Pick<ConfigSize, 'bytes' | 'max'>): string {
  return `${(size.bytes / BYTES_PER_KB).toFixed(1)} / ${format_kb(size.max)} KB`
}

export function config_size_message(size: Pick<ConfigSize, 'level' | 'max'>): string {
  const limit = `${format_kb(size.max)} KB`
  switch (size.level) {
    case 'ok':
      return `Size of the config saved on Hive. The limit is ${limit}.`
    case 'warn':
      return `Config is getting large. The limit is ${limit}.`
    case 'danger':
      return `Config is almost full. Shorten pages or remove sections before it reaches ${limit}.`
    case 'blocked':
      return `Config exceeds ${limit}. Shorten pages or remove sections.`
  }
}

const CONFIG_SIZE_LABEL: Readonly<Record<ConfigSizeLevel, string>> = {
  ok: '',
  warn: 'Large',
  danger: 'Almost full',
  blocked: 'Too large',
}

/** Short visible state next to the meter, so the level is not carried by colour alone. */
export function config_size_label(level: ConfigSizeLevel): string {
  return CONFIG_SIZE_LABEL[level]
}

export function format_area_size(area: Pick<ConfigSizeArea, 'bytes'>): string {
  return `${(area.bytes / BYTES_PER_KB).toFixed(1)} KB`
}

export function config_size_tone(level: ConfigSizeLevel): { text: string; bar: string } {
  return CONFIG_SIZE_TONE[level]
}

/** The body `broadcastConfigToHive` sends, before validation; the timestamp has a fixed length. */
export function measure_settings_body(account: string, current: SettingsData): ConfigSize {
  const body = build_config_body(account, prune_settings_instance_overrides(current), new Date(0).toISOString())
  return measure_config_body(body)
}

/** Per-area split (Style, Navigation, Footer, Sections, Pages, Other) of the settings `measure_settings_body` measures. */
export function settings_size_breakdown(current: SettingsData, total_bytes: number): ConfigSizeArea[] {
  return config_size_breakdown(prune_settings_instance_overrides(current), total_bytes, encode_config_json)
}

function is_mac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
}

function is_editable_target(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Next fixed zoom level from the current effective zoom; `Fit` is only reachable directly. */
export function step_zoom(current: EditorZoom, fit_percent: number | undefined, direction: 1 | -1): EditorZoom {
  const value = current === 'fit' ? (fit_percent ?? 100) / 100 : current
  const epsilon = 0.001
  if (direction === 1) return FIXED_ZOOMS.find((zoom) => zoom > value + epsilon) ?? current
  return [...FIXED_ZOOMS].reverse().find((zoom) => zoom < value - epsilon) ?? current
}

export function save_status_text(input: {
  status: SaveStatus
  unsaved_count: number
  blocked_message: string | null
  loading: boolean
  authenticated: boolean
  is_owner: boolean
  size_blocked_message?: string | null
  section_error_count?: number
  page_error_count?: number
}): string {
  if (input.loading) return 'Loading settings...'
  if (input.blocked_message) {
    return input.authenticated && !input.is_owner ? 'Preview only' : `Can't save: ${input.blocked_message}`
  }
  if (input.size_blocked_message) return `Can't save: ${input.size_blocked_message}`
  const errors = input.section_error_count ?? 0
  const page_errors = input.page_error_count ?? 0
  if (errors > 0 && page_errors > 0) return `Can't save: ${errors + page_errors} issues to fix`
  if (errors > 0) return `Can't save: ${errors === 1 ? '1 section needs' : `${errors} sections need`} content`
  if (page_errors > 0) return `Can't save: ${page_errors === 1 ? '1 page issue' : `${page_errors} page issues`} to fix`
  switch (input.status) {
    case 'saving':
      return 'Saving...'
    case 'error':
      return 'Save failed'
    case 'dirty':
      if (input.unsaved_count === 0) return 'Unsaved changes'
      return input.unsaved_count === 1 ? '1 unsaved change' : `${input.unsaved_count} unsaved changes`
    case 'saved':
      return 'All changes saved'
  }
}

export function EditorTopBar(props: EditorTopBarProps) {
  const status_id = `save-status-${createUniqueId()}`
  const mod_key = is_mac() ? 'Cmd' : 'Ctrl'
  const [large_screen, set_large_screen] = createSignal(true)
  const [announcement, set_announcement] = createSignal('')

  const in_design = () => props.active_tab === 'design'
  const has_more_menu = () => props.dev_tools !== undefined
  const desktop_only = () => (has_more_menu() ? 'max-md:hidden' : '')

  const tabs = (): { value: AdminTab; label: string }[] => [
    { value: 'design', label: 'Edit' },
    ...(props.show_moderation ? [{ value: 'moderation' as const, label: 'Moderation' }] : []),
  ]

  const forced_mock = () =>
    props.canvas_data.mode === 'live' && props.canvas_data.source === 'mock' && !props.canvas_data.is_loading

  const zoom_label = (zoom: EditorZoom): string => {
    if (zoom !== 'fit') return percent(zoom)
    return props.fit_percent === undefined ? 'Fit' : `Fit · ${Math.round(props.fit_percent)}%`
  }

  const undo = () => {
    if (!props.editor?.history.can_undo()) return
    if (props.on_undo) props.on_undo()
    else props.editor.undo()
  }

  const redo = () => {
    if (!props.editor?.history.can_redo()) return
    if (props.on_redo) props.on_redo()
    else props.editor.redo()
  }

  const [config_size, set_config_size] = createSignal<ConfigSize | null>(null)
  const [config_areas, set_config_areas] = createSignal<ConfigSizeArea[] | null>(null)
  const size_blocked_message = (): string | null => {
    const size = config_size()
    return size?.level === 'blocked' ? config_size_message(size) : null
  }

  // Undo/redo and server loads replace the store without bumping settingsVersion, hence the history deps.
  createEffect(
    on(
      () => {
        const editor = props.editor
        if (!editor) return null
        return [
          settingsVersion(),
          editor.history.can_undo(),
          editor.history.can_redo(),
          editor.history.undo_label(),
          editor.save_status(),
        ]
      },
      (deps) => {
        if (!deps) return
        const timer = setTimeout(() => {
          const account = configSource().account ?? settings.hiveUsername ?? ''
          const current = settings as SettingsData
          const size = measure_settings_body(account, current)
          set_config_size(size)
          set_config_areas(shows_size_breakdown(size.level) ? settings_size_breakdown(current, size.bytes) : null)
        }, CONFIG_SIZE_DEBOUNCE_MS)
        onCleanup(() => clearTimeout(timer))
      }
    )
  )

  createEffect(
    on(
      () => config_size()?.level,
      (level, previous) => {
        const size = config_size()
        if (!size || previous === undefined || level === previous) return
        const largest = largest_size_area(config_areas() ?? [])
        const detail = largest ? ` Largest area: ${largest.label}, ${format_area_size(largest)}.` : ''
        set_announcement(`${config_size_message(size)}${detail}`)
      }
    )
  )

  const section_errors = () => home_save_errors(settings as SettingsData)
  const page_errors = () => page_save_errors(settings as SettingsData)
  const link_errors = () => page_link_save_errors(settings as SettingsData)
  const save_issues = (): SaveIssue[] => [
    ...section_errors().map((error) => ({
      message: error.message,
      open: () => focus_home_section(error.section_id),
    })),
    ...page_errors().map((error) => ({
      message: error.message,
      open: () => props.on_open_page?.(error.page_index),
    })),
    ...link_errors().map((error) => ({
      message: error.message,
      open: () => props.on_open_size_area?.(error.area),
    })),
  ]

  const save_disabled = (): boolean => {
    const save = props.save
    const editor = props.editor
    if (!save || !editor) return true
    const status = editor.save_status()
    return (
      Boolean(save.loading) ||
      save.blocked_message !== null ||
      size_blocked_message() !== null ||
      save_issues().length > 0 ||
      status === 'saving' ||
      status === 'saved'
    )
  }

  const save = () => {
    if (!save_disabled()) props.save?.on_save()
  }

  const select_device = (device: EditorDevice) => props.editor?.set_device(device)

  const handle_device_keydown = (event: KeyboardEvent) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']
    if (!keys.includes(event.key) || !props.editor) return
    event.preventDefault()
    const group = event.currentTarget as HTMLElement
    const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]')).filter(
      (radio) => radio.offsetParent !== null
    )
    const index = radios.indexOf(document.activeElement as HTMLElement)
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
    const next = radios[(index + step + radios.length) % radios.length]
    const value = next?.dataset.device as EditorDevice | undefined
    if (!next || !value) return
    select_device(value)
    next.focus()
  }

  const device_tab_index = (device: EditorDevice): number => {
    const current = props.editor?.device()
    if (current === device) return 0
    // Desktop is hidden below lg, so Tablet takes the tab stop.
    return current === 'desktop' && !large_screen() && device === 'tablet' ? 0 : -1
  }

  createEffect(
    on(
      () => props.editor?.zoom(),
      (zoom) => {
        if (zoom !== undefined) set_announcement(`Zoom ${zoom === 'fit' ? 'fit to width' : percent(zoom)}`)
      },
      { defer: true }
    )
  )

  createEffect(
    on(
      () => props.editor?.device(),
      (device) => {
        if (device) set_announcement(`Preview device ${device}, ${DEVICE_WIDTHS[device]} px`)
      },
      { defer: true }
    )
  )

  const handle_shortcut = (event: KeyboardEvent) => {
    const editor = props.editor
    if (!editor || event.defaultPrevented || is_editable_target(event.target)) return
    if (document.querySelector('[aria-modal="true"]')) return
    const mod = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()

    if (mod && !event.altKey) {
      if (key === 's') {
        event.preventDefault()
        save()
        return
      }
      if (!in_design()) return
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (key === 'y' && event.ctrlKey) {
        event.preventDefault()
        redo()
      }
      return
    }

    if (event.altKey || event.metaKey || event.ctrlKey) return
    if (event.key === '?') {
      if (props.on_show_shortcuts) {
        event.preventDefault()
        props.on_show_shortcuts()
      }
      return
    }
    if (!in_design()) return

    if (event.key === '+' || event.key === '=') {
      editor.set_zoom(step_zoom(editor.zoom(), props.fit_percent, 1))
    } else if (event.key === '-') {
      editor.set_zoom(step_zoom(editor.zoom(), props.fit_percent, -1))
    } else if (event.shiftKey && event.code === 'Digit1') {
      editor.set_zoom('fit')
    } else if (event.shiftKey && event.code === 'Digit0') {
      editor.set_zoom(1)
    } else if (!event.shiftKey && ['Digit1', 'Digit2', 'Digit3'].includes(event.code)) {
      editor.set_device(DEVICES[Number(event.code.slice(-1)) - 1].value)
    } else {
      return
    }
    event.preventDefault()
  }

  onMount(() => {
    const media = window.matchMedia(LARGE_SCREEN_QUERY)
    const sync = () => set_large_screen(media.matches)
    sync()
    media.addEventListener('change', sync)
    document.addEventListener('keydown', handle_shortcut)
    onCleanup(() => {
      media.removeEventListener('change', sync)
      document.removeEventListener('keydown', handle_shortcut)
    })
  })

  const data_items = (close: () => void): JSX.Element => (
    <div role="group" aria-label="Canvas data">
      <For each={DATA_OPTIONS}>
        {(option) => (
          <button
            type="button"
            role="menuitemradio"
            aria-checked={props.canvas_data.mode === option.value}
            onClick={() => {
              props.canvas_data.set_mode(option.value)
              close()
            }}
            class={MENU_ITEM_CLASS}
          >
            <DataIcon mode={option.value} />
            <span class="flex-1">{option.label}</span>
            <Show when={props.canvas_data.mode === option.value}>
              <Check size={16} aria-hidden="true" class="text-primary" />
            </Show>
          </button>
        )}
      </For>
      <Show when={forced_mock() && props.canvas_data.mock_reason}>
        {(reason) => (
          <p class="px-2.5 py-1.5 text-xs text-warning">Showing sample data: {MOCK_REASON_TEXT[reason()]}</p>
        )}
      </Show>
    </div>
  )

  const account_items = (close: () => void): JSX.Element => (
    <Show
      when={isAuthenticated()}
      fallback={
        <button
          type="button"
          role="menuitem"
          class={MENU_ITEM_CLASS}
          onClick={() => {
            close()
            props.on_login()
          }}
        >
          <LogIn size={16} aria-hidden="true" class="text-text-muted" />
          Log in
        </button>
      }
    >
      <div role="group" aria-label="Account">
        <p role="presentation" class={`${MENU_GROUP_LABEL_CLASS} flex items-center gap-2`}>
          <span class="truncate">@{currentUser()?.username}</span>
          <Show when={!props.is_owner}>
            <span class="rounded bg-warning/10 px-1.5 py-0.5 text-xs text-warning">Preview only</span>
          </Show>
        </p>
        <button
          type="button"
          role="menuitem"
          class={MENU_ITEM_CLASS}
          onClick={() => {
            close()
            props.on_logout()
          }}
        >
          <LogOut size={16} aria-hidden="true" class="text-text-muted" />
          Log out
        </button>
      </div>
    </Show>
  )

  // In-bar dropdowns outside the top layer (NodeSwitcher) must clear canvas chrome (z-10..z-30) and the
  // overlay SidePanel (z-40), yet stay below the Toast (z-50).
  return (
    <header
      ref={props.header_ref}
      class="relative z-45 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-bg-card px-2"
    >
      <nav aria-label="Admin sections" class="flex shrink-0">
        <For each={tabs()}>
          {(tab) => (
            <button
              type="button"
              aria-current={props.active_tab === tab.value ? 'page' : undefined}
              onClick={() => props.on_tab_change(tab.value)}
              class={`${TAB_CLASS} ${props.active_tab === tab.value ? 'text-text' : 'text-text-muted hover:text-text'}`}
            >
              {tab.label}
              <Show when={props.active_tab === tab.value}>
                <span class="absolute right-0 bottom-0 left-0 h-0.5 rounded-t-full bg-primary" />
              </Show>
            </button>
          )}
        </For>
      </nav>

      <div class="flex min-w-0 flex-1 items-center gap-1">
        <Show when={in_design()}>
          <Show when={props.editor}>
            {(editor) => (
              <div role="group" aria-label="View" class="flex items-center gap-1 max-md:hidden">
                <MenuPopover
                  label="Canvas zoom"
                  trigger_label={`Canvas zoom, ${zoom_label(editor().zoom())}`}
                  trigger_class={MENU_TRIGGER_CLASS}
                  placement="bottom-start"
                  trigger={
                    <>
                      <span class="tabular-nums">{zoom_label(editor().zoom())}</span>
                      <ChevronDown size={14} aria-hidden="true" class="text-text-muted" />
                    </>
                  }
                >
                  {(close) => (
                    <For each={EDITOR_ZOOMS}>
                      {(zoom) => (
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={editor().zoom() === zoom}
                          aria-keyshortcuts={zoom === 'fit' ? 'Shift+1' : zoom === 1 ? 'Shift+0' : undefined}
                          onClick={() => {
                            editor().set_zoom(zoom)
                            close()
                          }}
                          class={MENU_ITEM_CLASS}
                        >
                          <span class="flex-1 tabular-nums">{zoom_label(zoom)}</span>
                          <Show when={editor().zoom() === zoom}>
                            <Check size={16} aria-hidden="true" class="text-primary" />
                          </Show>
                        </button>
                      )}
                    </For>
                  )}
                </MenuPopover>

                <div
                  role="radiogroup"
                  aria-label="Preview device"
                  onKeyDown={handle_device_keydown}
                  class="flex rounded-md bg-bg-secondary p-0.5"
                >
                  <For each={DEVICES}>
                    {(device) => (
                      <button
                        type="button"
                        role="radio"
                        data-device={device.value}
                        aria-checked={editor().device() === device.value}
                        aria-label={`${device.label}, ${DEVICE_WIDTHS[device.value]} px`}
                        aria-keyshortcuts={String(DEVICES.indexOf(device) + 1)}
                        title={`${device.label}, ${DEVICE_WIDTHS[device.value]} px`}
                        tabindex={device_tab_index(device.value)}
                        onClick={() => select_device(device.value)}
                        class={`inline-flex size-7 items-center justify-center rounded transition-colors focus-visible:outline-2 focus-visible:outline-primary ${device.class} ${
                          editor().device() === device.value
                            ? 'bg-bg-card text-text shadow-sm'
                            : 'text-text-muted hover:text-text'
                        }`}
                      >
                        <device.icon size={16} aria-hidden="true" />
                      </button>
                    )}
                  </For>
                </div>
              </div>
            )}
          </Show>

          <div class={`flex items-center gap-1 ${desktop_only()}`}>
            <MenuPopover
              label="Canvas data"
              trigger_label={`Canvas data, ${props.canvas_data.mode === 'mock' ? 'Sample data' : 'Live data'}`}
              trigger_class={MENU_TRIGGER_CLASS}
              placement="bottom-start"
              trigger={
                <>
                  <DataIcon mode={props.canvas_data.mode} />
                  <span class="max-lg:sr-only">{props.canvas_data.mode === 'mock' ? 'Sample data' : 'Live data'}</span>
                  <ChevronDown size={14} aria-hidden="true" class="text-text-muted" />
                </>
              }
            >
              {data_items}
            </MenuPopover>
          </div>

          <Show when={forced_mock() && props.canvas_data.mock_reason}>
            {(reason) => (
              <span
                role="status"
                title={MOCK_REASON_TEXT[reason()]}
                class="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs text-warning"
              >
                <FlaskConical size={12} aria-hidden="true" />
                <span class="max-xl:sr-only">Showing sample data</span>
                <span class="sr-only">: {MOCK_REASON_TEXT[reason()]}</span>
              </span>
            )}
          </Show>

          <Show when={props.editor}>
            {(editor) => (
              <div
                role="group"
                aria-label="History"
                class="flex items-center md:ml-1 md:border-l md:border-border md:pl-2"
              >
                <button
                  type="button"
                  aria-disabled={!editor().history.can_undo()}
                  aria-label={
                    editor().history.can_undo() ? `Undo: ${editor().history.undo_label()}` : 'Undo, nothing to undo'
                  }
                  aria-keyshortcuts="Control+Z Meta+Z"
                  title={
                    editor().history.can_undo()
                      ? `Undo: ${editor().history.undo_label()} (${mod_key}+Z)`
                      : 'Nothing to undo'
                  }
                  onClick={undo}
                  class={ICON_BUTTON_CLASS}
                >
                  <Undo2 size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-disabled={!editor().history.can_redo()}
                  aria-label={
                    editor().history.can_redo() ? `Redo: ${editor().history.redo_label()}` : 'Redo, nothing to redo'
                  }
                  aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
                  title={
                    editor().history.can_redo()
                      ? `Redo: ${editor().history.redo_label()} (${mod_key}+Shift+Z)`
                      : 'Nothing to redo'
                  }
                  onClick={redo}
                  class={ICON_BUTTON_CLASS}
                >
                  <Redo2 size={18} aria-hidden="true" />
                </button>
              </div>
            )}
          </Show>
        </Show>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <Show when={props.save && props.editor ? { save: props.save, editor: props.editor } : null}>
          {(controls) => {
            const status = () => controls().editor.save_status()
            const blocked = () => controls().save.blocked_message
            const loading = () => Boolean(controls().save.loading)
            const text = () =>
              save_status_text({
                status: status(),
                unsaved_count: controls().editor.unsaved_count(),
                blocked_message: blocked(),
                loading: loading(),
                authenticated: isAuthenticated(),
                is_owner: props.is_owner,
                size_blocked_message: size_blocked_message(),
                section_error_count: section_errors().length,
                page_error_count: page_errors().length + link_errors().length,
              })
            return (
              <>
                <Show when={config_size()}>
                  {(size) => (
                    <ConfigSizeMeter size={size()} areas={config_areas()} on_open_area={props.on_open_size_area} />
                  )}
                </Show>
                <Show when={save_issues().length > 0}>
                  <SaveErrorList issues={save_issues()} />
                </Show>
                <span
                  id={status_id}
                  role="status"
                  title={text()}
                  class="inline-flex min-w-0 items-center gap-1.5 text-sm text-text-muted"
                >
                  <SaveStatusIcon status={status()} blocked={blocked() !== null} loading={loading()} />
                  <span class="truncate max-md:sr-only lg:max-w-64 md:max-w-40">{text()}</span>
                </span>
                <Show when={status() === 'error' && !blocked() && !loading()}>
                  <button
                    type="button"
                    onClick={save}
                    class="rounded px-1.5 py-1 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary max-md:hidden"
                  >
                    Retry
                  </button>
                </Show>
                {/* Disabled buttons get no pointer events in some browsers, so the tooltip sits on a wrapper. */}
                <span
                  class="inline-flex"
                  title={
                    blocked() ??
                    size_blocked_message() ??
                    (save_issues().length > 0
                      ? save_issues()
                          .map((issue) => issue.message)
                          .join('\n')
                      : null) ??
                    `Saving config to Hive costs Resource Credits (RC). (${mod_key}+S)`
                  }
                >
                  <Button
                    variant="primary"
                    size="sm"
                    loading={status() === 'saving'}
                    disabled={save_disabled()}
                    aria-describedby={status_id}
                    aria-keyshortcuts="Control+S Meta+S"
                    onClick={save}
                    class="max-md:min-h-11"
                  >
                    Save
                  </Button>
                </span>
              </>
            )
          }}
        </Show>

        <div class={desktop_only()}>
          <Show
            when={isAuthenticated()}
            fallback={
              <button
                type="button"
                onClick={() => props.on_login()}
                class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
              >
                <LogIn size={16} aria-hidden="true" />
                Login
              </button>
            }
          >
            <MenuPopover
              label="Account"
              trigger_label={`Account @${currentUser()?.username ?? ''}`}
              trigger_class={MENU_TRIGGER_CLASS}
              trigger={
                <>
                  <img src={hive_avatar_url(currentUser()?.username ?? '')} alt="" class="size-6 rounded-full" />
                  <span class="max-lg:sr-only">@{currentUser()?.username}</span>
                  <Show when={!props.is_owner}>
                    <span class="rounded bg-warning/10 px-1.5 py-0.5 text-xs text-warning max-lg:sr-only">
                      Preview only
                    </span>
                  </Show>
                  <ChevronDown size={14} aria-hidden="true" class="text-text-muted" />
                </>
              }
            >
              {account_items}
            </MenuPopover>
          </Show>
        </div>

        <NodeSwitcher placement="down" />

        <Show when={props.dev_tools}>
          {(actions) => (
            <DevToolsMenu
              actions={actions()}
              is_owner={props.is_owner}
              on_show_shortcuts={props.on_show_shortcuts}
              trigger_class={ICON_BUTTON_CLASS}
              compact_items={(close) => (
                <>
                  {account_items(close)}
                  <Show when={in_design()}>
                    <div class="mt-1 border-t border-border pt-1">{data_items(close)}</div>
                  </Show>
                </>
              )}
            />
          )}
        </Show>
      </div>

      <span aria-live="polite" class="sr-only">
        {announcement()}
      </span>
    </header>
  )
}

function DataIcon(props: { mode: CanvasMode }) {
  return (
    <Show
      when={props.mode === 'mock'}
      fallback={<span aria-hidden="true" class="inline-block size-2 rounded-full bg-success" />}
    >
      <FlaskConical size={14} aria-hidden="true" class="text-warning" />
    </Show>
  )
}

const DISCLOSURE_TRIGGER_CLASS =
  'inline-flex cursor-pointer items-center rounded px-1 py-0.5 text-xs focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11'

interface TopBarDisclosureProps {
  /** Accessible name of the panel. */
  label: string
  trigger: JSX.Element
  trigger_class: string
  trigger_title?: string
  trigger_describedby?: string
  panel_class: string
  children: (close: () => void) => JSX.Element
}

/** Top bar panel in the top layer (ADR 6ac6089e), so canvas chrome never paints over it. */
function TopBarDisclosure(props: TopBarDisclosureProps) {
  const id = `topbar-panel-${createUniqueId()}`
  const [open, set_open] = createSignal(false)
  const [anchor, set_anchor] = createSignal<HTMLButtonElement>()
  const close = () => set_open(false)

  return (
    <>
      <button
        ref={set_anchor}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open()}
        aria-controls={id}
        aria-describedby={props.trigger_describedby}
        title={props.trigger_title}
        onClick={() => set_open(!open())}
        class={`${DISCLOSURE_TRIGGER_CLASS} ${props.trigger_class}`}
      >
        {props.trigger}
      </button>
      <Popover
        id={id}
        open={open()}
        anchor={anchor()}
        onClose={close}
        label={props.label}
        placement="bottom-end"
        class={props.panel_class}
      >
        <div class="p-3 text-xs text-text">{props.children(close)}</div>
      </Popover>
    </>
  )
}

/** Save blockers from home sections (spec 5.1) and pages (spec 3); each entry opens what it is about. */
export function SaveErrorList(props: { issues: SaveIssue[] }) {
  const count = () => props.issues.length
  return (
    <TopBarDisclosure
      label="Fix before saving"
      trigger_class="shrink-0 gap-1 font-medium text-error"
      panel_class="md:w-72"
      trigger={
        <>
          <CircleAlert size={14} aria-hidden="true" class="shrink-0" />
          {count() === 1 ? '1 issue' : `${count()} issues`}
          <ChevronDown size={12} aria-hidden="true" class="shrink-0" />
        </>
      }
    >
      {(close) => (
        <>
          <p class="mb-2 font-medium">Fix before saving</p>
          <ul class="flex flex-col gap-1">
            <For each={props.issues}>
              {(issue) => (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      close()
                      issue.open()
                    }}
                    class="w-full rounded px-1 py-0.5 text-left text-text-muted hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
                  >
                    {issue.message}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </>
      )}
    </TopBarDisclosure>
  )
}

function ConfigSizeMeter(props: {
  size: ConfigSize
  areas: ConfigSizeArea[] | null
  on_open_area?: (area: ConfigSizeAreaId) => void
}) {
  const description_id = `config-size-${createUniqueId()}`
  const tone = () => config_size_tone(props.size.level)
  const message = () => config_size_message(props.size)
  const largest = () => largest_size_area(props.areas ?? [])
  const open_target = () => {
    const area = largest()
    return props.on_open_area && area && size_area_has_editor(area.id) ? area : null
  }

  return (
    <Show
      when={props.areas}
      fallback={
        <span
          title={message()}
          aria-describedby={description_id}
          class={`inline-flex shrink-0 items-center gap-1.5 text-xs ${tone().text}`}
        >
          <ConfigSizeMeterContent size={props.size} description_id={description_id} />
        </span>
      }
    >
      {(areas) => (
        <TopBarDisclosure
          label="Config size by area"
          trigger_title={message()}
          trigger_describedby={description_id}
          trigger_class={`shrink-0 gap-1.5 ${tone().text}`}
          panel_class="md:w-56"
          trigger={
            <>
              <ConfigSizeMeterContent size={props.size} description_id={description_id} />
              <ChevronDown size={12} aria-hidden="true" class="shrink-0" />
            </>
          }
        >
          {(close) => (
            <>
              <p class="mb-2 font-medium">Config size by area</p>
              <ul class="flex flex-col gap-1">
                <For each={areas()}>
                  {(area) => (
                    <li class="flex items-baseline justify-between gap-3">
                      <span class={area.id === largest()?.id ? 'font-medium' : 'text-text-muted'}>
                        {area.label}
                        <Show when={area.id === largest()?.id}>
                          <span class="text-text-muted"> (largest)</span>
                        </Show>
                      </span>
                      <span class="tabular-nums">{format_area_size(area)}</span>
                    </li>
                  )}
                </For>
              </ul>
              <Show when={open_target()}>
                {(area) => (
                  <button
                    type="button"
                    onClick={() => {
                      close()
                      props.on_open_area?.(area().id)
                    }}
                    class="mt-2 rounded px-1 py-0.5 font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    Open {area().label}
                  </button>
                )}
              </Show>
            </>
          )}
        </TopBarDisclosure>
      )}
    </Show>
  )
}

function ConfigSizeMeterContent(props: { size: ConfigSize; description_id: string }) {
  const tone = () => config_size_tone(props.size.level)
  return (
    <>
      <Show when={props.size.level === 'warn'}>
        <TriangleAlert size={14} aria-hidden="true" class="shrink-0" />
      </Show>
      <Show when={props.size.level === 'danger'}>
        <CircleAlert size={14} aria-hidden="true" class="shrink-0" />
      </Show>
      <Show when={props.size.level === 'blocked'}>
        <Ban size={14} aria-hidden="true" class="shrink-0" />
      </Show>
      <span aria-hidden="true" class="h-1 w-10 overflow-hidden rounded-full bg-bg-secondary max-lg:hidden">
        <span
          class={`block h-full origin-left rounded-full ${tone().bar}`}
          style={{ transform: `scaleX(${Math.min(props.size.ratio, 1)})` }}
        />
      </span>
      <span class="tabular-nums max-md:sr-only">
        <span class="max-xl:sr-only">Config size </span>
        {format_config_size(props.size)}
      </span>
      <Show when={config_size_label(props.size.level)}>
        {(label) => <span class="font-medium max-lg:sr-only">{label()}</span>}
      </Show>
      <span id={props.description_id} class="sr-only">
        {config_size_message(props.size)}
      </span>
    </>
  )
}

function SaveStatusIcon(props: { status: SaveStatus; blocked: boolean; loading: boolean }) {
  return (
    <Show
      when={!props.loading && !props.blocked}
      fallback={
        <Show when={props.loading} fallback={<CircleAlert size={16} aria-hidden="true" class="shrink-0 text-info" />}>
          <LoaderCircle size={16} aria-hidden="true" class="shrink-0 animate-spin motion-reduce:animate-none" />
        </Show>
      }
    >
      <Show when={props.status === 'saving'}>
        <LoaderCircle size={16} aria-hidden="true" class="shrink-0 animate-spin motion-reduce:animate-none" />
      </Show>
      <Show when={props.status === 'error'}>
        <CircleAlert size={16} aria-hidden="true" class="shrink-0 text-error" />
      </Show>
      <Show when={props.status === 'dirty'}>
        <span aria-hidden="true" class="inline-block size-2 shrink-0 rounded-full bg-warning" />
      </Show>
      <Show when={props.status === 'saved'}>
        <Check size={16} aria-hidden="true" class="shrink-0 text-success" />
      </Show>
    </Show>
  )
}
