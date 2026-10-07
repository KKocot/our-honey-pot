// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createEffect, createSignal, Show, onMount, onCleanup, ErrorBoundary, on, untrack } from 'solid-js'
import { QueryClientProvider } from '@tanstack/solid-query'
import { Toast, showToast, Button } from '../../../ui'
import { currentUser, isAuthenticated, login, logout, needsReauth, type AuthUser } from '../../../auth'
import { CommunityModeration } from '../../settings/CommunityModeration'
import type { SettingsData } from '../../types/index'
import {
  queryClient,
  settings,
  useSettingsQuery,
  syncSettingsToStore,
  setOwnerContext,
  getLastFetchError,
  configSource,
  setConfigSource,
} from '../../queries'
import { getHasUnsavedChanges, hasUnsavedChanges, settingsVersion } from '../../store'
import { EditorCanvas } from '../../canvas/EditorCanvas'
import { PopoverHost } from '../../canvas/PopoverHost'
import { use_canvas_data } from '../../canvas/use_canvas_data'
import { clear_selection, is_popover_open } from '../../canvas/selection'
import { LoginModal } from './LoginModal'
import { JsonPreviewModal } from './JsonPreviewModal'
import { BottomBar } from './BottomBar'
import { EditorTopBar, type AdminTab } from './EditorTopBar'
import { SettingsDrawer, type DrawerSection } from './SettingsDrawer'
import {
  calculate_diff,
  handle_broadcast_to_hive,
  handle_preview_json,
  save_block_message,
  save_block_reason,
  type SaveGate,
} from './handlers'
import { get_default_settings } from '../../types/index'
import { create_blog_role, is_staff_role } from '../../../auth/blog-role'

const UNSAVED_COUNT_DEBOUNCE_MS = 300

function settings_record(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(settings)) as Record<string, unknown>
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

  const settingsQuery = useSettingsQuery(() => (props.configError ? undefined : (props.initialSettings ?? undefined)))
  const [showLoginModal, setShowLoginModal] = createSignal(false)
  const [isBroadcasting, setIsBroadcasting] = createSignal(false)
  const [reauthSession, setReauthSession] = createSignal<ReturnType<typeof needsReauth>>(null)
  const [showJsonPreview, setShowJsonPreview] = createSignal(false)
  const [jsonPreviewContent, setJsonPreviewContent] = createSignal('')
  const [jsonOldContent, setJsonOldContent] = createSignal<Record<string, unknown> | null>(null)
  const [jsonNewContent, setJsonNewContent] = createSignal<Record<string, unknown> | null>(null)
  const [jsonDiff, setJsonDiff] = createSignal<
    Array<{ key: string; oldValue: unknown; newValue: unknown; type: 'changed' | 'added' | 'removed' }>
  >([])
  const [diffViewMode, setDiffViewMode] = createSignal<'diff' | 'old' | 'new'>('diff')
  const [isLoadingDiff, setIsLoadingDiff] = createSignal(false)
  const [showMobileMenu, setShowMobileMenu] = createSignal(false)
  const [activeTab, setActiveTab] = createSignal<AdminTab>('design')
  const [drawerOpen, setDrawerOpen] = createSignal(false)
  const [drawerSection, setDrawerSection] = createSignal<DrawerSection | null>('theme')
  const [baseline, setBaseline] = createSignal<Record<string, unknown> | null>(null)
  const canvas_data = use_canvas_data()
  let settings_button: HTMLButtonElement | undefined
  let top_bar: HTMLElement | undefined

  const sync_from_server = (data: SettingsData) => {
    syncSettingsToStore(data, true)
    setBaseline(settings_record())
  }

  createEffect(
    on(hasUnsavedChanges, (dirty) => {
      if (!dirty) setBaseline(untrack(settings_record))
    })
  )

  const [unsaved_count, setUnsavedCount] = createSignal(0)

  createEffect(
    on([settingsVersion, hasUnsavedChanges, baseline], ([, dirty, base]) => {
      if (!dirty || !base) {
        setUnsavedCount(0)
        return
      }
      const timer = setTimeout(
        () => setUnsavedCount(calculate_diff(base, settings_record()).length),
        UNSAVED_COUNT_DEBOUNCE_MS
      )
      onCleanup(() => clearTimeout(timer))
    })
  )

  const open_drawer = (section?: DrawerSection) => {
    if (is_popover_open()) clear_selection()
    if (section) setDrawerSection(section)
    setDrawerOpen(true)
  }

  const close_drawer = () => {
    setDrawerOpen(false)
    settings_button?.focus()
  }

  createEffect(
    on(is_popover_open, (open) => {
      if (open) setDrawerOpen(false)
    })
  )

  const change_tab = (tab: AdminTab) => {
    clear_selection()
    setDrawerOpen(false)
    setActiveTab(tab)
  }

  createEffect(() => {
    if (isAuthenticated()) {
      setReauthSession(null)
    } else {
      setReauthSession(needsReauth())
    }
  })

  const logged_in_username = (): string | null => (isAuthenticated() ? (currentUser()?.username ?? null) : null)

  // UI only: the save guard checks the config account
  const blog_role = create_blog_role(() => props.ownerUsername)
  const is_moderator = (): boolean => is_staff_role(blog_role())

  const save_gate = (): SaveGate => ({
    config_account: configSource().account,
    load_error: configSource().error,
    username: logged_in_username(),
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
    if (props.initialSettings) {
      const settings_with_username = {
        ...props.initialSettings,
        hiveUsername: props.initialSettings.hiveUsername || props.ownerUsername || '',
      }
      sync_from_server(settings_with_username)
    } else if (props.ownerUsername) {
      const defaults = get_default_settings(true)
      const settings_with_username = {
        ...defaults,
        hiveUsername: props.ownerUsername,
      }
      sync_from_server(settings_with_username)
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Handle ?tab= URL parameter for direct navigation
    const url_params = new URLSearchParams(window.location.search)
    const tab_param = url_params.get('tab')
    if (tab_param === 'moderation') {
      setActiveTab(tab_param)
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

  const handleLoginSuccess = async (user: AuthUser) => {
    login(user)
    setShowLoginModal(false)
    setReauthSession(null)
    showToast(`Welcome, @${user.username}!`, 'success')
  }

  const handleLogout = () => {
    logout()
    showToast('Logged out successfully', 'success')
  }

  const handleSaveClick = () => {
    if (!isAuthenticated()) {
      setShowLoginModal(true)
      return
    }
    handle_broadcast_to_hive(
      currentUser(),
      props.ownerUsername ?? '',
      configSource(),
      setIsBroadcasting,
      setShowLoginModal
    )
  }

  const handlePreviewJsonClick = async () => {
    await handle_preview_json(
      props.ownerUsername,
      setIsLoadingDiff,
      setShowJsonPreview,
      setDiffViewMode,
      setJsonNewContent,
      setJsonOldContent,
      setJsonPreviewContent,
      setJsonDiff
    )
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
      <Toast />
      <EditorTopBar
        active_tab={activeTab()}
        on_tab_change={change_tab}
        show_moderation={is_moderator()}
        canvas_data={canvas_data}
        settings_open={drawerOpen()}
        on_toggle_settings={() => (drawerOpen() ? close_drawer() : open_drawer())}
        settings_button_ref={(element) => {
          settings_button = element
        }}
        header_ref={(element) => {
          top_bar = element
        }}
        is_owner={isOwner()}
        on_login={() => setShowLoginModal(true)}
        on_logout={handleLogout}
      />

      <JsonPreviewModal
        show={showJsonPreview()}
        is_loading={isLoadingDiff()}
        diff_view_mode={diffViewMode()}
        json_old_content={jsonOldContent()}
        json_new_content={jsonNewContent()}
        json_diff={jsonDiff()}
        onClose={() => setShowJsonPreview(false)}
        onChangeDiffMode={setDiffViewMode}
      />

      <LoginModal show={showLoginModal()} onClose={() => setShowLoginModal(false)} onSuccess={handleLoginSuccess} />

      {/* Session expired banner */}
      <Show when={reauthSession() && !isAuthenticated()}>
        <div class="bg-warning/10 border border-warning rounded-lg p-4 mb-4">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 text-warning flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div class="flex-1">
              <p class="text-sm text-warning font-medium">Session expired for @{reauthSession()?.username}</p>
              <p class="text-xs text-warning/70 mt-0.5">Please enter your password again to continue.</p>
            </div>
            <button
              onClick={() => setShowLoginModal(true)}
              class="px-3 py-1.5 bg-warning text-white text-sm font-medium rounded-lg hover:bg-warning/90 transition-colors"
            >
              Unlock
            </button>
          </div>
        </div>
      </Show>

      {/* Error state */}
      <Show when={settingsQuery.isError}>
        <div class="bg-error/10 border border-error rounded-lg p-6 mb-6">
          <div class="flex items-start gap-4">
            <svg class="w-6 h-6 text-error flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-error mb-2">Connection error</h3>
              <p class="text-error/80 mb-1">Failed to fetch configuration from Hive blockchain.</p>
              <p class="text-sm text-error/60 mb-4">{getLastFetchError() || 'Unknown API connection error.'}</p>
              <Button variant="secondary" size="sm" onClick={() => void settingsQuery.refetch()}>
                <span class="flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Retry
                </span>
              </Button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                class="ml-3 text-sm text-error/80 underline-offset-2 hover:underline"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={activeTab() === 'design'}>
        <EditorCanvas
          canvas_data={canvas_data}
          loading={settingsQuery.isLoading}
          busy={isBroadcasting()}
          show_source_badge={false}
        />
        <PopoverHost on_edit_site={() => open_drawer('site')} />
        <SettingsDrawer
          open={drawerOpen()}
          section={drawerSection()}
          on_section_change={setDrawerSection}
          on_close={close_drawer}
          top_anchor={() => top_bar}
        />
      </Show>

      <Show when={activeTab() === 'moderation' && is_moderator()}>
        <CommunityModeration />
      </Show>

      <div class="h-24" />

      <BottomBar
        is_owner={isOwner()}
        is_broadcasting={isBroadcasting()}
        unsaved_count={unsaved_count()}
        save_blocked_message={settingsQuery.isLoading ? 'Loading settings...' : save_blocked_message()}
        show_mobile_menu={showMobileMenu()}
        on_save_click={handleSaveClick}
        on_preview_json={handlePreviewJsonClick}
        on_toggle_mobile_menu={() => setShowMobileMenu(!showMobileMenu())}
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
