// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { QueryClient, createQuery } from '@tanstack/solid-query'
import { createStore, produce } from 'solid-js/store'
import { createSignal, createEffect, onCleanup } from 'solid-js'
import {
  get_default_settings,
  is_instance_override_value,
  themePresets,
  type InstanceOverrideKey,
  type SettingsData,
  type LayoutSection,
  type ThemeColors,
} from './types/index'
import { with_instance_override, without_instance_override } from './canvas/layout-ops'
import { load_config_with_status } from '../../lib/config-pipeline'
import { config_error_message } from './hive-broadcast'

// Import from store.ts to avoid circular dependency with AdminPanel
// Note: setHasUnsavedChanges is defined in store.ts and re-exported here
import { setHasUnsavedChanges } from './store'
import {
  DataProvider,
  getWax,
  withRetry,
  formatJoinDate,
  calculateEffectiveHP,
  type IProfile,
  type IDatabaseAccount,
  type IGlobalProperties,
  type BridgePost,
  type NaiAsset,
} from '@hiveio/workerbee/blog-logic'
import { get_hive_username } from '../../lib/config'
import { ensure_endpoints_configured } from '../../lib/queries'
import { hive_assertion_message } from '../../lib/config-account'
import type { HiveCommunity } from '../../lib/types/community'
import { is_dark_color } from '../../shared/utils/color'

import { formatCompactNumber } from '../../shared/formatters'

// ============================================
// Apply theme colors to CSS variables
// ============================================

export function applyThemeColors(colors: ThemeColors) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.style.setProperty('--theme-bg', colors.bg)
  root.style.setProperty('--theme-bg-secondary', colors.bgSecondary)
  root.style.setProperty('--theme-bg-card', colors.bgCard)
  root.style.setProperty('--theme-text', colors.text)
  root.style.setProperty('--theme-text-muted', colors.textMuted)
  root.style.setProperty('--theme-primary', colors.primary)
  root.style.setProperty('--theme-primary-hover', colors.primaryHover)
  root.style.setProperty('--theme-primary-text', colors.primaryText)
  root.style.setProperty('--theme-accent', colors.accent)
  root.style.setProperty('--theme-border', colors.border)
  root.style.setProperty('--theme-success', colors.success)
  root.style.setProperty('--theme-error', colors.error)
  root.style.setProperty('--theme-warning', colors.warning)
  root.style.setProperty('--theme-info', colors.info)

  // Set data-theme-mode for CSS selectors (syntax highlighting, etc.)
  root.dataset.themeMode = is_dark_color(colors.bg) ? 'dark' : 'light'
}

function getThemeColors(data: SettingsData): ThemeColors {
  if (data.customColors) {
    return data.customColors
  }
  const preset = themePresets.find((p) => p.id === data.siteTheme)
  return preset?.colors || themePresets[0].colors
}

// ============================================
// Query Client
// ============================================

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

// ============================================
// Local Store for UI State
// ============================================

// Init with community defaults. AdminPanel onMount overwrites
// the store with SSR-provided settings.
const [settings, setSettings] = createStore<SettingsData>(get_default_settings(true))

export { settings }

/** Plain copy of the store (proxies may not serialize); applies debounced edits first so the latest change is included (K6). */
export function getSettingsSnapshot(): SettingsData {
  flushPendingSettings()
  return JSON.parse(JSON.stringify(settings)) as SettingsData
}

/**
 * Debounce manager using closure pattern to prevent race conditions
 * Each call merges updates and schedules a single batch commit
 */
const createUpdateDebouncer = () => {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: Partial<SettingsData> = {}

  const debounce = (partial: Partial<SettingsData>) => {
    // Merge pending updates
    pending = { ...pending, ...partial }

    if (timer) {
      clearTimeout(timer)
    }

    timer = setTimeout(() => {
      const toApply = pending
      pending = {}
      timer = null

      setSettings(
        produce((s) => {
          Object.assign(s, toApply)
        })
      )
      setHasUnsavedChanges(true)
    }, 16) // ~1 frame (60fps)
  }

  debounce.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
    pending = {}
  }

  debounce.flush = () => {
    if (!timer) return
    clearTimeout(timer)
    const toApply = pending
    pending = {}
    timer = null

    setSettings(
      produce((s) => {
        Object.assign(s, toApply)
      })
    )
    setHasUnsavedChanges(true)
  }

  return debounce
}

const debouncedUpdate = createUpdateDebouncer()

/**
 * Update settings with debouncing to prevent race conditions when multiple
 * components update settings simultaneously.
 * Batches updates within ~16ms (1 frame at 60fps).
 */
export function updateSettings(partial: Partial<SettingsData>) {
  debouncedUpdate(partial)
}

/** Apply debounced edits that have not been committed yet (no-op when none are pending). */
export function flushPendingSettings(): void {
  debouncedUpdate.flush()
}

/**
 * Update settings immediately without debouncing.
 * Use for blur-commit inputs where the store must be in sync
 * before createEffect re-syncs the local input value.
 */
export function updateSettingsImmediate(partial: Partial<SettingsData>) {
  setSettings(
    produce((s) => {
      Object.assign(s, partial)
    })
  )
  setHasUnsavedChanges(true)
}

// Dedicated setter for customColors to ensure SolidJS reactivity
export function setCustomColors(colors: ThemeColors | null) {
  setSettings('customColors', colors)
  if (colors) {
    applyThemeColors(colors)
  }
  setHasUnsavedChanges(true)
}

export function updateLayoutSection(sectionId: string, updates: Partial<LayoutSection>) {
  setSettings(
    produce((s) => {
      const section = s.layoutSections.find((sec) => sec.id === sectionId)
      if (section) {
        Object.assign(section, updates)
      }
    })
  )
  setHasUnsavedChanges(true)
}

export function setLayoutSections(sections: LayoutSection[]) {
  setSettings('layoutSections', sections)
  setHasUnsavedChanges(true)
}

// Override and layout edits flush pending debounced edits first: they replace whole objects computed from the store,
// so a stale debounced write of the same field would otherwise undo them.

/** False when the element may not override `key` or the value is out of range (store unchanged). */
export function set_instance_override(
  section_id: string,
  element_id: string,
  key: InstanceOverrideKey,
  value: number
): boolean {
  flushPendingSettings()
  const next_overrides = with_instance_override(settings.instanceOverrides, section_id, element_id, key, value)
  if (!next_overrides) return false
  updateSettingsImmediate({ instanceOverrides: next_overrides })
  return true
}

/** Removes one override of the instance, or all of them when `key` is omitted. */
export function clear_instance_override(section_id: string, element_id: string, key?: InstanceOverrideKey): void {
  flushPendingSettings()
  updateSettingsImmediate({
    instanceOverrides: without_instance_override(settings.instanceOverrides, section_id, element_id, key),
  })
}

/** Global value of a size that instances may override; false when out of range (store unchanged). */
export function set_global_size(key: InstanceOverrideKey, value: number): boolean {
  if (!is_instance_override_value(key, value)) return false
  updateSettings({ [key]: value })
  return true
}

/** Applies a pure layout op to a plain snapshot of the settings; `null` from `op` means rejected (store unchanged). */
export function apply_layout_op(op: (current: SettingsData) => Partial<SettingsData> | null): boolean {
  const changes = op(getSettingsSnapshot())
  if (!changes) return false
  updateSettingsImmediate(changes)
  return true
}

// ============================================
// Owner context for correct community mode detection client-side
// ============================================
// Owner context signal — receives the community username from AdminPanel props.

const [ownerContext, setOwnerContextInternal] = createSignal<string>('')

/** Set the blog owner username (called once from AdminPanel onMount) */
export function setOwnerContext(username: string): void {
  setOwnerContextInternal(username)
}

/** Detect community mode from owner context (always true for our-honey-pot) */
export function is_community_mode(): boolean {
  return true
}

// ============================================
// Config source: account that stores the blog config, or why it could not be read
// ============================================

export interface ConfigSource {
  /** Account allowed to save the config; null when it could not be determined */
  account: string | null
  /** Read failure; while set, saving must stay blocked so defaults never overwrite the stored config (K8) */
  error: string | null
}

const [configSource, setConfigSource] = createSignal<ConfigSource>({ account: null, error: null })

export { configSource, setConfigSource }

// ============================================
// API Functions
// ============================================

// Track if we had API error
let lastFetchError: string | null = null

export function getLastFetchError(): string | null {
  return lastFetchError
}

/** Config of the blog (HIVE_USERNAME -> config account), independent of who is logged in (K7/A6). */
async function fetchSettings(): Promise<SettingsData> {
  lastFetchError = null

  const blog = ownerContext() || get_hive_username()
  const result = await load_config_with_status(blog, is_community_mode())
  if (result.status === 'error') {
    lastFetchError = config_error_message(result.error)
    setConfigSource({ account: null, error: lastFetchError })
    throw new Error(lastFetchError)
  }
  setConfigSource({ account: result.config_account, error: null })
  return result.settings
}

// ============================================
// Query Keys
// ============================================

export const queryKeys = {
  settings: ['settings'] as const,
}

// ============================================
// Hooks
// ============================================

/** `initial`: config already read by SSR; skips the first client fetch. */
export function useSettingsQuery(initial?: () => SettingsData | undefined) {
  return createQuery(() => ({
    queryKey: queryKeys.settings,
    queryFn: fetchSettings,
    initialData: initial?.(),
    staleTime: 1000 * 60 * 5, // 5 minutes
    // A background refetch would overwrite unsaved edits in the store
    refetchOnWindowFocus: false,
  }))
}

// ============================================
// Sync settings to store when query succeeds
// ============================================

export function syncSettingsToStore(data: SettingsData, fromServer: boolean = false) {
  setSettings(
    produce((s) => {
      Object.assign(s, data)
    })
  )

  // Only apply theme colors if data came from server (not default init)
  // This prevents overwriting SSR theme with default light theme
  if (fromServer) {
    applyThemeColors(getThemeColors(data))
  }
}

// ============================================
// Hive Preview Data Types (using blog-logic)
// ============================================

// Re-export blog-logic types with legacy names for backwards compatibility
export type HiveBridgeProfile = IProfile
export type HiveDatabaseAccount = IDatabaseAccount
export type HiveGlobalProps = IGlobalProperties
export type HivePost = BridgePost

export interface HiveData {
  profile: IProfile | null
  dbAccount: IDatabaseAccount | null
  globalProps: IGlobalProperties | null
  posts: BridgePost[]
  comments: BridgePost[]
  threads: BridgePost[]
}

// Re-export utilities from blog-logic for convenience
export { formatCompactNumber, formatJoinDate }

// Calculate effective HP using blog-logic
// Accepts NaiAsset values (from IDatabaseAccount and IGlobalProperties)
export function calculateEffectiveHivePower(
  vestingShares: NaiAsset,
  delegatedVestingShares: NaiAsset,
  receivedVestingShares: NaiAsset,
  globalProps: IGlobalProperties
): number {
  return calculateEffectiveHP(vestingShares, delegatedVestingShares, receivedVestingShares, globalProps)
}

// ============================================
// Hive Preview Data Fetcher (using blog-logic DataProvider)
// ============================================

async function fetchHivePreviewData(username: string, postsPerPage: number): Promise<HiveData | null> {
  if (!username) return null

  ensure_endpoints_configured()
  // Initialize Blog Logic DataProvider
  const chain = await getWax()
  const dataProvider = new DataProvider(chain)

  // Fetch account object first (needed for profile)
  const account = await dataProvider.bloggingPlatform.getAccount(username)

  // Fetch profile, database account, global props, posts, comments, and threads in parallel
  const [profile, dbAccount, globalProps, posts, comments, threadsDiscussion] = await Promise.all([
    account.getProfile(),
    dataProvider.getDatabaseAccount(username),
    dataProvider.getGlobalProperties(),
    dataProvider.bloggingPlatform.enumAccountPosts(
      { sort: 'blog', account: username },
      { page: 1, pageSize: postsPerPage }
    ),
    // Fetch user's comments using sort='comments'
    dataProvider.bloggingPlatform.enumAccountPosts(
      { sort: 'comments', account: username },
      { page: 1, pageSize: 20 }
    ),
    // Fetch threads: comments under {username}/my-threads post
    withRetry((waxChain) =>
      waxChain.api.bridge.get_discussion({ author: username, permlink: 'my-threads', observer: '' })
    ).catch((error: unknown) => {
      // A blog without the my-threads post is a Hive assertion; network errors still fail the preview.
      if (hive_assertion_message(error)) return null
      throw error
    }),
  ])

  // Convert posts iterator to array of BridgePost
  const postsArray: BridgePost[] = []
  for (const post of posts) {
    const postData = dataProvider.getComment({ author: post.author, permlink: post.permlink })
    if (postData) {
      postsArray.push(postData)
    }
  }

  // Convert comments iterator to array of BridgePost
  const commentsArray: BridgePost[] = []
  for (const comment of comments) {
    const commentData = dataProvider.getComment({ author: comment.author, permlink: comment.permlink })
    if (commentData) {
      commentsArray.push(commentData)
    }
  }

  // Extract direct replies from threads discussion (comments under my-threads post)
  const threadsArray: BridgePost[] = []
  if (threadsDiscussion) {
    const rootKey = `${username}/my-threads`
    for (const [key, entry] of Object.entries(threadsDiscussion)) {
      if (key === rootKey) continue
      const post = entry as BridgePost
      // Only include direct replies to the root post (not nested replies)
      if (post.parent_author === username && post.parent_permlink === 'my-threads') {
        threadsArray.push(post)
      }
    }
    // Sort newest first
    threadsArray.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
  }

  return {
    profile,
    dbAccount,
    globalProps,
    posts: postsArray,
    comments: commentsArray,
    threads: threadsArray,
  }
}

// ============================================
// Hive Preview Query Hook
// ============================================

export function useHivePreviewQuery(
  username: () => string | undefined,
  postsPerPage: () => number,
  enabled: () => boolean
) {
  // Debounce username changes to avoid fetching on every keystroke
  const [debouncedUsername, setDebouncedUsername] = createSignal(username())
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  // Watch for username changes and debounce
  createEffect(() => {
    const newUsername = username()
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      setDebouncedUsername(newUsername)
    }, 500) // 500ms debounce

    onCleanup(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
    })
  })

  return createQuery(() => ({
    queryKey: ['hive-preview', debouncedUsername(), postsPerPage()] as const,
    queryFn: () => fetchHivePreviewData(debouncedUsername() || '', postsPerPage()),
    enabled: enabled() && !!debouncedUsername(),
    staleTime: 1000 * 60 * 2, // 2 minutes
    retry: 1,
  }))
}

// ============================================
// Community Preview Data
// ============================================

export interface CommunityPreviewData {
  community: HiveCommunity | null
  posts: BridgePost[]
}
