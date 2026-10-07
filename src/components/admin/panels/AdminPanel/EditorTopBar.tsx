// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For, Show } from 'solid-js'
import { FlaskConical, LogIn, Settings2 } from 'lucide-solid'
import { currentUser, isAuthenticated } from '../../../auth'
import { hive_avatar_url } from '../../../../lib/config'
import type { CanvasDataState, CanvasMode, MockReason } from '../../canvas/use_canvas_data'

export type AdminTab = 'design' | 'moderation'

interface EditorTopBarProps {
  active_tab: AdminTab
  on_tab_change: (tab: AdminTab) => void
  show_moderation: boolean
  canvas_data: CanvasDataState
  settings_open: boolean
  on_toggle_settings: () => void
  settings_button_ref: (element: HTMLButtonElement) => void
  header_ref: (element: HTMLElement) => void
  is_owner: boolean
  on_login: () => void
  on_logout: () => void
}

const TAB_CLASS =
  'relative h-12 px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary'

const MODE_OPTIONS: { value: CanvasMode; label: string }[] = [
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

export function EditorTopBar(props: EditorTopBarProps) {
  const tabs = (): { value: AdminTab; label: string }[] => [
    { value: 'design', label: 'Edit' },
    ...(props.show_moderation ? [{ value: 'moderation' as const, label: 'Moderation' }] : []),
  ]

  const forced_mock = () =>
    props.canvas_data.mode === 'live' && props.canvas_data.source === 'mock' && !props.canvas_data.is_loading

  return (
    <header
      ref={props.header_ref}
      class="sticky top-0 z-40 mb-4 flex h-12 items-center gap-3 border-b border-border bg-bg-card/95 px-2 backdrop-blur-sm">
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

      <div class="flex min-w-0 flex-1 items-center justify-center gap-2">
        <Show when={props.active_tab === 'design'}>
          <div role="group" aria-label="Canvas data" class="flex rounded-lg bg-bg-secondary p-0.5 text-xs">
            <For each={MODE_OPTIONS}>
              {(option) => (
                <button
                  type="button"
                  aria-pressed={props.canvas_data.mode === option.value}
                  onClick={() => props.canvas_data.set_mode(option.value)}
                  class={`flex items-center gap-1 rounded-md px-2 py-1 font-medium focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11 ${
                    props.canvas_data.mode === option.value
                      ? 'bg-bg-card text-text shadow-sm'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  <Show
                    when={option.value === 'mock'}
                    fallback={
                      <span aria-hidden="true" class="text-success">
                        ●
                      </span>
                    }
                  >
                    <FlaskConical size={12} aria-hidden="true" class="text-warning" />
                  </Show>
                  <span class="max-sm:sr-only">{option.label}</span>
                </button>
              )}
            </For>
          </div>
          <Show when={forced_mock() && props.canvas_data.mock_reason}>
            {(reason) => (
              <span
                role="status"
                title={MOCK_REASON_TEXT[reason()]}
                class="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs text-warning"
              >
                <FlaskConical size={12} aria-hidden="true" />
                <span class="max-md:sr-only">Showing sample data</span>
                <span class="sr-only">: {MOCK_REASON_TEXT[reason()]}</span>
              </span>
            )}
          </Show>
        </Show>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <Show when={props.active_tab === 'design'}>
          <button
            ref={props.settings_button_ref}
            type="button"
            aria-expanded={props.settings_open}
            aria-controls="admin-settings-drawer"
            onClick={() => props.on_toggle_settings()}
            class={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11 ${
              props.settings_open
                ? 'bg-bg-secondary text-text'
                : 'text-text-muted hover:bg-bg-secondary hover:text-text'
            }`}
          >
            <Settings2 size={16} aria-hidden="true" />
            <span class="max-sm:sr-only">Settings</span>
          </button>
        </Show>

        <Show
          when={isAuthenticated()}
          fallback={
            <button
              type="button"
              onClick={() => props.on_login()}
              class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-bg-secondary hover:text-text"
            >
              <LogIn size={16} aria-hidden="true" />
              Login
            </button>
          }
        >
          <div class="flex items-center gap-2">
            <img
              src={hive_avatar_url(currentUser()?.username ?? '')}
              alt={currentUser()?.username}
              class="h-6 w-6 rounded-full"
            />
            <span class="text-sm text-text max-md:sr-only">@{currentUser()?.username}</span>
            <Show when={!props.is_owner}>
              <span class="rounded bg-warning/10 px-2 py-0.5 text-xs text-warning">Preview only</span>
            </Show>
            <button
              type="button"
              onClick={() => props.on_logout()}
              class="rounded px-2 py-1 text-sm text-text-muted transition-colors hover:bg-bg-secondary hover:text-text"
            >
              Logout
            </button>
          </div>
        </Show>
      </div>
    </header>
  )
}
