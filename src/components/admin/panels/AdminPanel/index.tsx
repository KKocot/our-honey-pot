// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createEffect, createMemo, createSignal, For, Show, onMount, onCleanup, ErrorBoundary, on } from 'solid-js'
import { QueryClientProvider } from '@tanstack/solid-query'
import { Toast, Button, DialogBody, DialogContent, DialogHeader, DialogTitle, showToast } from '../../../ui'
import { currentUser, isAuthenticated, restoreSession } from '../../../auth'
import { CommunityModeration } from '../../settings/CommunityModeration'
import type { SettingsData } from '../../types/index'
import {
  queryClient,
  useSettingsQuery,
  syncSettingsToStore,
  setOwnerContext,
  getLastFetchError,
  configSource,
  setConfigSource,
  getSettingsSnapshot,
  is_community_mode,
} from '../../queries'
import { getHasUnsavedChanges, hasUnsavedChanges, setHasUnsavedChanges, settings, settingsVersion } from '../../store'
import { create_editor_state, type EditorState } from '../../editor-state'
import { create_admin_session } from '../../hooks'
import { EditorCanvas, resolve_canvas_zoom, resolve_device_width } from '../../canvas/EditorCanvas'
import { PopoverHost } from '../../canvas/PopoverHost'
import { use_canvas_data } from '../../canvas/use_canvas_data'
import { clear_selection, close_popover, is_popover_open } from '../../canvas/selection'
import type { CardStructure } from '../../canvas/popovers/PopoverShell'
import { apply_settings_patch, current_theme_colors, getCurrentColors } from '../../settings/ThemeSettings'
import { applyThemeColors, apply_layout_op } from '../../queries'
import type { HomeSectionOp } from '../../canvas/home-sections/HomeSectionsStack'
import { home_save_errors } from '../../canvas/home-sections/model'
import { open_element_settings } from '../../canvas/popovers/HomeSectionPopover'
import type { ConfigSizeAreaId } from '../../config-size'
import type { DesignImportResult } from '../../config-io'
import type { ThemeColors } from '../../types/theme'
import { LoginModal } from './LoginModal'
import { JsonPreviewModal } from './JsonPreviewModal'
import { EditorTopBar, type AdminTab } from './EditorTopBar'
import { SidePanel } from './SidePanel'
import { PresetsTab } from './tabs/PresetsTab'
import { StyleTab } from './tabs/StyleTab'
import { content_group_id } from './tabs/ContentTab'
import { reveal_card_structure } from './tabs/LayoutTab'
import { ImportExportDialog, type ImportExportMode } from './ImportExportDialog'
import type { DevToolsActions } from './DevToolsMenu'
import {
  create_json_preview,
  handle_broadcast_to_hive,
  handle_clear_local_storage,
  handle_download_config,
  handle_load_local_storage,
  handle_save_local_storage,
  save_block_message,
  save_block_reason,
  type SaveGate,
} from './handlers'
import { get_default_settings } from '../../types/index'
import { create_blog_role, is_staff_role } from '../../../auth/blog-role'
import { CircleAlert, RotateCw } from 'lucide-solid'
import { is_dev_mode } from '../../../../lib/dev-mode'

const TOAST_DURATION_MS = 5000
const TABLET_QUERY = '(max-width: 1023.98px)'
const ZOOM_SUPPORTED = typeof CSS !== 'undefined' && CSS.supports('zoom', '0.5')

/** Undo/redo restore: keys absent from the snapshot are cleared, since syncSettingsToStore only merges. */
function apply_snapshot(snapshot: SettingsData) {
  const patch: Record<string, unknown> = { ...snapshot }
  for (const key of Object.keys(getSettingsSnapshot())) {
    if (!(key in patch)) patch[key] = undefined
  }
  syncSettingsToStore(patch as unknown as SettingsData)
  applyThemeColors(getCurrentColors())
}

/** Tailwind color tokens resolve at :root, so a subtree preview has to override `--color-*` itself. */
function theme_color_vars(colors: ThemeColors): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [key, value] of Object.entries(colors)) {
    vars[`--color-${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`] = value
  }
  return vars
}

const SHORTCUTS: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: 'Ctrl/Cmd + Z', action: 'Undo' },
  { keys: 'Ctrl/Cmd + Shift + Z, Ctrl + Y', action: 'Redo' },
  { keys: 'Ctrl/Cmd + S', action: 'Save' },
  { keys: '+ / -', action: 'Zoom in / out' },
  { keys: 'Shift + 1', action: 'Zoom to fit' },
  { keys: 'Shift + 0', action: 'Zoom to 100%' },
  { keys: '1 / 2 / 3', action: 'Desktop / Tablet / Mobile preview' },
  { keys: '[', action: 'Show or hide the side panel' },
  { keys: 'Esc', action: 'Close popover or clear selection' },
  { keys: '?', action: 'Keyboard shortcuts' },
]

function ShortcutsDialog(props: { open: boolean; on_close: () => void }) {
  return (
    <DialogContent open={() => props.open} onClose={props.on_close} class="max-w-md">
      <DialogHeader>
        <DialogTitle>Keyboard shortcuts</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <dl class="divide-y divide-border text-sm">
          <For each={SHORTCUTS}>
            {(shortcut) => (
              <div class="flex items-center justify-between gap-4 py-2">
                <dt class="text-text">{shortcut.action}</dt>
                <dd>
                  <kbd class="rounded border border-border bg-bg-secondary px-1.5 py-0.5 text-xs text-text-muted">
                    {shortcut.keys}
                  </kbd>
                </dd>
              </div>
            )}
          </For>
        </dl>
      </DialogBody>
    </DialogContent>
  )
}

/** Canvas host width observed for the TopBar "Fit · N%" label (same formula as the canvas). */
function create_fit_percent(editor: EditorState, host: () => HTMLElement | undefined) {
  const [width, set_width] = createSignal(0)
  createEffect(() => {
    const element = host()
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => set_width(element.clientWidth))
    observer.observe(element)
    set_width(element.clientWidth)
    onCleanup(() => observer.disconnect())
  })
  return () => {
    if (!ZOOM_SUPPORTED || width() <= 0) return undefined
    const device_width = resolve_device_width(editor.device(), settings.contentWidthPx)
    return resolve_canvas_zoom('fit', device_width, width()) * 100
  }
}

interface AdminPanelContentProps {
  initialSettings?: SettingsData | null
  /** HIVE_USERNAME of the blog */
  ownerUsername?: string
  /** Account that stores the blog config (community owner or the personal account); only it may save */
  configAccount?: string | null
  /** SSR config read failure; Save stays blocked so defaults never overwrite the stored config */
  configError?: string | null
}

function AdminPanelContent(props: AdminPanelContentProps) {
  if (props.ownerUsername) {
    setOwnerContext(props.ownerUsername)
  }
  setConfigSource({ account: props.configAccount ?? null, error: props.configError ?? null })

  // Dev mode: SSR reads only the chain, so the client fetch has to run to pick up the local config
  const skip_initial = props.configError || (import.meta.env.DEV && is_dev_mode())
  const settingsQuery = useSettingsQuery(() => (skip_initial ? undefined : (props.initialSettings ?? undefined)))
  const editor = create_editor_state({
    read: getSettingsSnapshot,
    apply: apply_snapshot,
    version: settingsVersion,
    dirty: hasUnsavedChanges,
    set_dirty: setHasUnsavedChanges,
  })
  const session = create_admin_session()
  const json_preview = create_json_preview()
  const canvas_data = use_canvas_data()
  const [panel_open, set_panel_open] = createSignal(true)
  const [design_dialog, set_design_dialog] = createSignal<ImportExportMode | null>(null)
  const [shortcuts_open, set_shortcuts_open] = createSignal(false)
  const [preview_patch, set_preview_patch] = createSignal<Partial<SettingsData> | null>(null)
  const [canvas_host, set_canvas_host] = createSignal<HTMLElement>()
  const fit_percent = create_fit_percent(editor, canvas_host)

  const sync_from_server = (data: SettingsData) => {
    syncSettingsToStore(data, true)
    editor.mark_loaded()
  }

  /** Every panel/dialog edit with an intent label lands as exactly one history step. */
  const commit_patch = (patch: Partial<SettingsData>, label: string) => {
    set_preview_patch(null)
    editor.apply_edit(() => apply_settings_patch(patch), label)
  }

  // Sealed after each op: two quick canvas ops with the same label must stay two undo steps.
  const commit_canvas_op = (op: HomeSectionOp, label: string): boolean => {
    let applied = false
    editor.apply_edit(() => {
      applied = apply_layout_op(op)
    }, label)
    editor.history.seal()
    return applied
  }

  const undo_step = (step: number): boolean => {
    editor.record_edit()
    if (editor.history.undo_id() !== step) return false
    return editor.undo() !== null
  }

  const undo_toast = (message: string) =>
    showToast(message, 'success', {
      duration_ms: TOAST_DURATION_MS,
      action: { label: 'Undo', on_click: () => void editor.undo() },
    })

  const apply_import = (result: DesignImportResult) => {
    if (result.changed_keys.length === 0) return
    commit_patch(result.patch, result.scope === 'style' ? 'Imported style' : 'Imported design')
    undo_toast(result.scope === 'style' ? 'Imported style' : 'Imported design')
  }

  const preview_merged = createMemo(() => {
    const patch = preview_patch()
    return patch ? { ...getSettingsSnapshot(), ...patch } : null
  })
  const preview_color_vars = () => {
    const merged = preview_merged()
    return merged ? theme_color_vars(current_theme_colors(merged)) : undefined
  }

  const open_content_site = () => {
    clear_selection()
    set_panel_open(true)
    editor.set_panel_tab('content')
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.getElementById(content_group_id('site'))?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      )
    )
  }

  const open_size_area = (area: ConfigSizeAreaId) => {
    if (area === 'style') {
      clear_selection()
      set_panel_open(true)
      editor.set_panel_tab('style')
    } else if (area === 'navigation') {
      open_element_settings('navigation', open_content_site)
    } else if (area === 'footer') {
      open_element_settings('footer', open_content_site)
    } else if (area === 'sections') {
      const first = document.querySelector<HTMLElement>('[data-home-section]')
      first?.scrollIntoView({ block: 'start' })
      first?.focus({ preventScroll: true })
    }
  }

  const open_card_structure = (card: CardStructure) => {
    close_popover()
    set_panel_open(true)
    editor.set_panel_tab('layout')
    reveal_card_structure(card)
  }

  createEffect(
    on(is_popover_open, (open) => {
      if (open && window.matchMedia(TABLET_QUERY).matches) set_panel_open(false)
    })
  )

  const change_tab = (tab: AdminTab) => {
    clear_selection()
    set_preview_patch(null)
    editor.set_mode(tab)
  }

  const dev_tools: DevToolsActions = {
    on_compare: () => void json_preview.show(props.ownerUsername),
    on_download_config: handle_download_config,
    on_backup_save: handle_save_local_storage,
    on_backup_load: () => handle_load_local_storage(commit_patch),
    on_backup_clear: handle_clear_local_storage,
    on_import_design: () => set_design_dialog('import'),
    on_export_design: () => set_design_dialog('export'),
    dev_login_username: () => configSource().account,
    on_dev_login: session.handle_login_success,
  }

  // UI only: the save guard checks the config account
  const blog_role = create_blog_role(() => props.ownerUsername)
  const is_moderator = (): boolean => is_staff_role(blog_role())

  const save_gate = (): SaveGate => ({
    config_account: configSource().account,
    load_error: configSource().error,
    username: session.username(),
  })

  const isOwner = () => {
    const gate = save_gate()
    return gate.username !== null && gate.username === gate.config_account
  }

  /** Null when saving is allowed or the user only has to log in (Save then opens the login modal) */
  const save_blocked_message = (): string | null => {
    const gate = save_gate()
    const reason = save_block_reason(gate)
    return reason && reason !== 'not_authenticated' ? save_block_message(reason, gate) : null
  }

  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (getHasUnsavedChanges()) {
      e.preventDefault()
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
      return e.returnValue
    }
  }

  onMount(() => {
    // AuthHeader (which restores the session elsewhere) is not rendered on /admin
    restoreSession()
    if (props.initialSettings) {
      sync_from_server({
        ...props.initialSettings,
        hiveUsername: props.initialSettings.hiveUsername || props.ownerUsername || '',
      })
    } else if (props.ownerUsername) {
      sync_from_server({ ...get_default_settings(true), hiveUsername: props.ownerUsername })
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    if (new URLSearchParams(window.location.search).get('tab') === 'moderation') {
      editor.set_mode('moderation')
    }
  })

  onCleanup(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
  })

  createEffect(
    on(
      () => settingsQuery.data,
      (data) => {
        if (data) {
          const merged =
            !data.hiveUsername && props.ownerUsername ? { ...data, hiveUsername: props.ownerUsername } : data
          sync_from_server(merged)
        }
      }
    )
  )

  const handleSaveClick = () => {
    const section_errors = home_save_errors(settings)
    if (section_errors.length > 0) {
      showToast(`Can't save: ${section_errors.map((error) => error.message).join('; ')}`, 'error')
      return
    }
    if (!isAuthenticated()) {
      session.open_login()
      return
    }
    void handle_broadcast_to_hive(currentUser(), props.ownerUsername ?? '', configSource(), {
      begin: editor.begin_save,
      end: editor.end_save,
      open_login: session.open_login,
    })
  }

  return (
    <ErrorBoundary
      fallback={(err) => (
        <div class="p-8 text-center">
          <h2 class="text-xl font-bold text-error mb-4">Something went wrong</h2>
          <p class="text-muted mb-4">{err.message}</p>
          <button
            onClick={() => window.location.reload()}
            class="px-4 py-2 bg-primary text-primary-text rounded-lg hover:bg-primary-hover transition-colors"
          >
            Reload page
          </button>
        </div>
      )}
    >
      <div class="fixed inset-0 z-50 flex flex-col bg-bg text-text">
        <Toast />
        <EditorTopBar
          active_tab={editor.mode()}
          on_tab_change={change_tab}
          show_moderation={is_moderator()}
          canvas_data={canvas_data}
          is_owner={isOwner()}
          on_login={session.open_login}
          on_logout={session.handle_logout}
          editor={editor}
          fit_percent={fit_percent()}
          save={{
            on_save: handleSaveClick,
            blocked_message: save_blocked_message(),
            loading: settingsQuery.isLoading,
          }}
          dev_tools={dev_tools}
          on_show_shortcuts={() => set_shortcuts_open(true)}
          on_open_size_area={open_size_area}
        />

        <Show when={(session.reauth_session() && !isAuthenticated()) || settingsQuery.isError}>
          <div class="shrink-0 space-y-3 border-b border-border px-4 py-3">
            <Show when={session.reauth_session() && !isAuthenticated()}>
              <div role="alert" class="flex items-center gap-3 rounded-lg border border-warning bg-warning/10 p-3">
                <CircleAlert size={20} aria-hidden="true" class="shrink-0 text-warning" />
                <div class="flex-1">
                  <p class="text-sm font-medium text-warning">
                    Session expired for @{session.reauth_session()?.username}
                  </p>
                  <p class="mt-0.5 text-xs text-warning/70">Please enter your password again to continue.</p>
                </div>
                <Button variant="secondary" size="sm" onClick={session.open_login}>
                  Unlock
                </Button>
              </div>
            </Show>

            <Show when={settingsQuery.isError}>
              <div role="alert" class="flex items-start gap-3 rounded-lg border border-error bg-error/10 p-3">
                <CircleAlert size={20} aria-hidden="true" class="mt-0.5 shrink-0 text-error" />
                <div class="flex-1">
                  <h2 class="text-sm font-semibold text-error">Connection error</h2>
                  <p class="text-sm text-error/80">Failed to fetch configuration from Hive blockchain.</p>
                  <p class="mb-2 text-xs text-error/60">{getLastFetchError() || 'Unknown API connection error.'}</p>
                  <div class="flex items-center gap-3">
                    <Button variant="secondary" size="sm" onClick={() => void settingsQuery.refetch()}>
                      <span class="flex items-center gap-2">
                        <RotateCw size={14} aria-hidden="true" />
                        Retry
                      </span>
                    </Button>
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      class="text-sm text-error/80 underline-offset-2 hover:underline"
                    >
                      Reload page
                    </button>
                  </div>
                </div>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={editor.mode() === 'design'}>
          <div class="flex min-h-0 flex-1">
            <main
              ref={set_canvas_host}
              aria-label="Blog canvas"
              style={preview_color_vars()}
              class={`min-w-0 flex-1 overflow-auto max-md:pb-14 ${editor.device() === 'desktop' ? 'bg-bg' : 'bg-bg-secondary'}`}
            >
              <EditorCanvas
                canvas_data={canvas_data}
                loading={settingsQuery.isLoading}
                busy={editor.is_saving()}
                show_source_badge={false}
                zoom={editor.zoom()}
                device={editor.device()}
                preview_settings={preview_merged()}
                on_home_op={commit_canvas_op}
                on_undo_step={undo_step}
                undo_step_id={editor.history.undo_id}
              />
            </main>
            <SidePanel
              state={editor}
              open={panel_open()}
              on_open_change={set_panel_open}
              templates={
                <PresetsTab
                  settings={getSettingsSnapshot}
                  is_community={is_community_mode}
                  hive_username={() => settings.hiveUsername || props.ownerUsername || ''}
                  on_apply={commit_patch}
                  on_preview={set_preview_patch}
                  on_undo={() => void editor.undo()}
                />
              }
              style={<StyleTab settings={settings} on_change={commit_patch} />}
            />
          </div>
          <PopoverHost on_edit_site={open_content_site} on_edit_card_layout={open_card_structure} />
        </Show>

        <Show when={editor.mode() === 'moderation' && is_moderator()}>
          <main class="min-h-0 flex-1 overflow-auto">
            <div class="mx-auto max-w-7xl p-4">
              <CommunityModeration />
            </div>
          </main>
        </Show>
      </div>

      <JsonPreviewModal
        show={json_preview.open()}
        is_loading={json_preview.loading()}
        diff_view_mode={json_preview.view_mode()}
        json_old_content={json_preview.old_content()}
        json_new_content={json_preview.new_content()}
        json_diff={json_preview.diff()}
        onClose={json_preview.close}
        onChangeDiffMode={json_preview.set_view_mode}
      />

      <ImportExportDialog
        open={design_dialog() !== null}
        initial_mode={design_dialog() ?? 'import'}
        on_close={() => set_design_dialog(null)}
        read_settings={getSettingsSnapshot}
        on_apply={apply_import}
      />

      <ShortcutsDialog open={shortcuts_open()} on_close={() => set_shortcuts_open(false)} />

      <LoginModal
        show={session.login_open()}
        onClose={session.close_login}
        onSuccess={session.handle_login_success}
        dev_login_username={configSource().account}
      />
    </ErrorBoundary>
  )
}

export function AdminPanel(props: AdminPanelContentProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminPanelContent
        initialSettings={props.initialSettings}
        ownerUsername={props.ownerUsername}
        configAccount={props.configAccount}
        configError={props.configError}
      />
    </QueryClientProvider>
  )
}
