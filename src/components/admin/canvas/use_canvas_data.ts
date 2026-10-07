// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { createQuery } from '@tanstack/solid-query'
import { settings, is_community_mode, useHivePreviewQuery, type CommunityPreviewData, type HiveData } from '../queries'
import { fetch_community } from '../../../lib/queries'
import { resolve_main_posts_settings } from '../../../lib/instance-overrides'
import type { SettingsData } from '../types/settings'
import { create_mock_canvas_data, type CanvasData, type CanvasKind } from './mocks'

export type CanvasMode = 'live' | 'mock'
export type CanvasSource = 'live' | 'mock'
export type MockReason = 'user_choice' | 'no_account' | 'no_posts' | 'no_community' | 'error'

export interface CanvasQueryState {
  status: 'pending' | 'error' | 'success'
  data: HiveData | CommunityPreviewData | null | undefined
  error: unknown
}

export interface CanvasSourceInput {
  mode: CanvasMode
  kind: CanvasKind
  account: string | undefined
  query: CanvasQueryState
}

export interface CanvasSourceResolution {
  source: CanvasSource
  mock_reason: MockReason | null
  is_loading: boolean
  error: string | null
}

export const CANVAS_FETCH_ERROR = 'Failed to load blog data from Hive'

function error_message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : CANVAS_FETCH_ERROR
}

function is_community_preview(data: HiveData | CommunityPreviewData): data is CommunityPreviewData {
  return 'community' in data
}

/**
 * Pure source decision: mocks only on user choice or a real lack of data; fetch failures stay visible as `error`.
 * Community posts are not part of it: CommunityContent fetches them for the main slot and shows its own empty state.
 */
export function resolve_canvas_source(input: CanvasSourceInput): CanvasSourceResolution {
  const mock = (mock_reason: MockReason, error: string | null = null): CanvasSourceResolution => ({
    source: 'mock',
    mock_reason,
    is_loading: false,
    error,
  })

  if (input.mode === 'mock') return mock('user_choice')
  if (!input.account?.trim()) return mock('no_account')

  const { status, data, error } = input.query
  if (status === 'pending') return { source: 'live', mock_reason: null, is_loading: true, error: null }
  if (status === 'error') return mock('error', error_message(error))
  // Fetch failures reject the query; null only comes from an empty account name.
  if (!data) return mock('no_account')

  const live: CanvasSourceResolution = { source: 'live', mock_reason: null, is_loading: false, error: null }
  if (input.kind === 'community') {
    return is_community_preview(data) && data.community ? live : mock('no_community')
  }
  return data.posts.length === 0 ? mock('no_posts') : live
}

/** Posts fetched for the canvas: the main posts instance value, same as the SSR query of the public page. */
export function canvas_posts_limit(current: SettingsData): number {
  return resolve_main_posts_settings(current).postsPerPage || 20
}

const ACCOUNT_DEBOUNCE_MS = 500

function create_debounced<T>(source: () => T, delay_ms: number): () => T {
  const [value, set_value] = createSignal<T>(source())
  createEffect(() => {
    const next = source()
    const timer = setTimeout(() => set_value(() => next), delay_ms)
    onCleanup(() => clearTimeout(timer))
  })
  return value
}

/** Live community preview without posts: the canvas renders the community main slot with CommunityContent, which fetches them. */
export async function fetch_canvas_community(name: string): Promise<CommunityPreviewData> {
  return { community: await fetch_community(name), posts: [] }
}

function use_canvas_community_query(name: () => string | undefined, enabled: () => boolean) {
  const debounced_name = create_debounced(name, ACCOUNT_DEBOUNCE_MS)
  return createQuery(() => ({
    queryKey: ['canvas-community', debounced_name()] as const,
    queryFn: () => fetch_canvas_community(debounced_name() || ''),
    enabled: enabled() && !!debounced_name(),
    staleTime: 1000 * 60 * 2,
    retry: 1,
  }))
}

export interface CanvasDataOptions {
  initial_mode?: CanvasMode
}

export interface CanvasDataState {
  readonly data: CanvasData | null
  readonly source: CanvasSource
  readonly mode: CanvasMode
  readonly mock_reason: MockReason | null
  readonly is_loading: boolean
  readonly error: string | null
  retry: () => void
  set_mode: (mode: CanvasMode) => void
}

/** Canvas data source: live preview queries, or fresh sample data that never enters the query cache. */
export function use_canvas_data(options: CanvasDataOptions = {}): CanvasDataState {
  const [mode, set_mode] = createSignal<CanvasMode>(options.initial_mode ?? 'live')

  const kind = createMemo<CanvasKind>(() => (is_community_mode() ? 'community' : 'user'))
  const posts_per_page = () => canvas_posts_limit(settings)

  const hive_query = useHivePreviewQuery(
    () => settings.hiveUsername,
    posts_per_page,
    () => mode() === 'live' && kind() === 'user'
  )
  const community_query = use_canvas_community_query(
    () => settings.hiveUsername,
    () => mode() === 'live' && kind() === 'community'
  )

  const active_query = () => (kind() === 'community' ? community_query : hive_query)

  const resolution = createMemo(() => {
    const query = active_query()
    return resolve_canvas_source({
      mode: mode(),
      kind: kind(),
      account: settings.hiveUsername,
      query: { status: query.status, data: query.data, error: query.error },
    })
  })

  const mock_data = createMemo(() =>
    resolution().source === 'mock' ? create_mock_canvas_data(kind(), settings.hiveUsername) : null
  )

  const live_data = (): CanvasData | null => {
    if (kind() === 'community') return { hive: null, community: community_query.data ?? null }
    return { hive: hive_query.data ?? null, community: null }
  }

  return {
    get data() {
      const current = resolution()
      if (current.source === 'mock') return mock_data()
      return current.is_loading ? null : live_data()
    },
    get source() {
      return resolution().source
    },
    get mode() {
      return mode()
    },
    get mock_reason() {
      return resolution().mock_reason
    },
    get is_loading() {
      return resolution().is_loading
    },
    get error() {
      return resolution().error
    },
    retry: () => {
      void active_query().refetch()
    },
    set_mode,
  }
}
