// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { AuthUser } from '../../../auth'
import { showToast } from '../../../ui'
import {
  broadcastConfigToHive,
  extract_explicit_fields,
  getConfigUrlSync,
  load_stored_config,
  type StoredConfig,
} from '../../hive-broadcast'
import { settings_to_record, strip_community_fields } from '../../types/index'
import { setHasUnsavedChanges, syncSettingsToStore } from '../../store'
import { flushPendingSettings, getSettingsSnapshot } from '../../queries'
import { is_community_mode } from '../../queries'
import type { SettingsData } from '../../types/index'

export type SaveBlockReason = 'config_error' | 'no_config_account' | 'not_authenticated' | 'not_owner'

export interface SaveGate {
  /** Account that stores the blog config (only it may save) */
  config_account: string | null
  /** Config read failure from SSR or the client query */
  load_error: string | null
  /** Logged-in user, null when nobody is logged in */
  username: string | null
}

/** Why saving is not allowed right now, or null when the user may save. */
export function save_block_reason(gate: SaveGate): SaveBlockReason | null {
  if (gate.load_error) return 'config_error'
  if (!gate.config_account) return 'no_config_account'
  if (!gate.username) return 'not_authenticated'
  if (gate.username !== gate.config_account) return 'not_owner'
  return null
}

export function save_block_message(reason: SaveBlockReason, gate: SaveGate): string {
  switch (reason) {
    case 'config_error':
      return `Saving is disabled: the current configuration could not be read, so saving would overwrite it with defaults. ${gate.load_error ?? ''}`.trim()
    case 'no_config_account':
      return 'Saving is disabled: the account that stores this blog configuration is unknown.'
    case 'not_authenticated':
      return 'Log in to save changes.'
    case 'not_owner':
      return `Only @${gate.config_account} can publish changes. You are viewing the configuration in preview mode.`
  }
}

function sort_keys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort_keys)
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sort_keys((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

/** Settings as they read back from the chain: same Zod field validation as load_stored_config, key order ignored. */
export function normalize_config(settings: SettingsData | Partial<SettingsData>): string {
  const record = JSON.parse(JSON.stringify(settings)) as Record<string, unknown>
  return JSON.stringify(sort_keys(extract_explicit_fields(record)))
}

export const CONFIRM_TIMEOUT_MS = 30_000
const CONFIRM_FIRST_DELAY_MS = 1_000
const CONFIRM_MAX_DELAY_MS = 8_000

export interface ConfirmDeps {
  load: (blog: string) => Promise<StoredConfig>
  sleep: (ms: number) => Promise<void>
}

/** Poll the stored config with backoff until it equals `expected`; read errors count as "not yet". */
export async function wait_for_stored_config(
  blog: string,
  expected: SettingsData,
  deps: ConfirmDeps,
  timeout_ms: number = CONFIRM_TIMEOUT_MS
): Promise<boolean> {
  const wanted = normalize_config(expected)
  let waited = 0
  let delay = CONFIRM_FIRST_DELAY_MS
  while (waited < timeout_ms) {
    const step = Math.min(delay, timeout_ms - waited)
    await deps.sleep(step)
    waited += step
    try {
      const stored = await deps.load(blog)
      if (stored.status === 'found' && normalize_config(stored.settings) === wanted) return true
    } catch {
      // node lag or a transient read error: retry until the timeout
    }
    delay = Math.min(delay * 2, CONFIRM_MAX_DELAY_MS)
  }
  return false
}

type BroadcastResult = Awaited<ReturnType<typeof broadcastConfigToHive>>

export interface SaveDeps extends ConfirmDeps {
  flush: () => void
  snapshot: () => SettingsData
  broadcast: (settings: SettingsData, username: string, private_key: string) => Promise<BroadcastResult>
  on_sent?: () => void
}

export type SaveOutcome =
  | { kind: 'blocked'; reason: SaveBlockReason; message: string }
  | { kind: 'failed'; error: string }
  | { kind: 'confirmed'; is_update: boolean; url: string; edited_since_send: boolean }
  | { kind: 'unconfirmed' }

export interface SaveRequest {
  blog: string
  gate: SaveGate
  private_key: string
}

/** Save flow without UI: gate -> flush debounced edits -> snapshot -> broadcast -> wait until the chain returns the snapshot. */
export async function execute_save(request: SaveRequest, deps: SaveDeps): Promise<SaveOutcome> {
  const reason = save_block_reason(request.gate)
  if (reason) return { kind: 'blocked', reason, message: save_block_message(reason, request.gate) }
  const username = request.gate.username as string

  deps.flush()
  const snapshot = deps.snapshot()
  const result = await deps.broadcast(snapshot, username, request.private_key)
  if (!result.success || !result.permlink) {
    return { kind: 'failed', error: result.error ?? 'Broadcast failed' }
  }

  deps.on_sent?.()
  const confirmed = await wait_for_stored_config(request.blog, snapshot, deps)
  if (!confirmed) return { kind: 'unconfirmed' }
  deps.flush()
  return {
    kind: 'confirmed',
    is_update: result.isUpdate === true,
    url: getConfigUrlSync(username, result.permlink),
    edited_since_send: normalize_config(deps.snapshot()) !== normalize_config(snapshot),
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

let save_in_flight = false

/**
 * Handle broadcast config to Hive blockchain
 */
export async function handle_broadcast_to_hive(
  user: AuthUser | null,
  blog: string,
  source: { account: string | null; error: string | null },
  setBroadcasting: (val: boolean) => void,
  setShowLoginModal: (val: boolean) => void
) {
  if (!user) {
    setShowLoginModal(true)
    return
  }
  if (save_in_flight) return

  save_in_flight = true
  setBroadcasting(true)
  try {
    const outcome = await execute_save(
      {
        blog,
        gate: { config_account: source.account, load_error: source.error, username: user.username },
        private_key: user.privateKey,
      },
      {
        flush: flushPendingSettings,
        snapshot: getSettingsSnapshot,
        broadcast: broadcastConfigToHive,
        load: load_stored_config,
        sleep,
        on_sent: () => showToast('Broadcast sent, waiting for confirmation from Hive...', 'success'),
      }
    )
    switch (outcome.kind) {
      case 'blocked':
        showToast(outcome.message, 'error')
        break
      case 'failed':
        showToast(`Failed: ${outcome.error}`, 'error')
        break
      case 'unconfirmed':
        showToast(
          `Sent to Hive, but the node has not confirmed it within ${CONFIRM_TIMEOUT_MS / 1000} seconds. Your edits are kept as unsaved; reopen the panel later to check that they were stored.`,
          'warning'
        )
        break
      case 'confirmed':
        if (outcome.edited_since_send) {
          showToast('Config saved on Hive. Edits made while waiting for confirmation are not saved yet.', 'warning')
        } else {
          setHasUnsavedChanges(false)
          showToast(`${outcome.is_update ? 'Updated' : 'Published'} config on Hive! View at: ${outcome.url}`, 'success')
        }
        break
    }
  } catch (error) {
    showToast(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
  } finally {
    save_in_flight = false
    setBroadcasting(false)
  }
}

/**
 * Handle JSON preview with diff calculation
 */
export async function handle_preview_json(
  owner_username: string | undefined,
  setLoading: (val: boolean) => void,
  setShowPreview: (val: boolean) => void,
  setDiffViewMode: (mode: 'diff' | 'old' | 'new') => void,
  setJsonNewContent: (content: Record<string, unknown> | null) => void,
  setJsonOldContent: (content: Record<string, unknown> | null) => void,
  setJsonPreviewContent: (content: string) => void,
  setJsonDiff: (
    diff: Array<{ key: string; oldValue: unknown; newValue: unknown; type: 'changed' | 'added' | 'removed' }>
  ) => void
) {
  if (!owner_username) return

  setLoading(true)
  setShowPreview(true)
  setDiffViewMode('diff')

  try {
    const snapshot = getSettingsSnapshot()
    const new_settings = settings_to_record(snapshot)
    setJsonNewContent(new_settings)
    setJsonPreviewContent(JSON.stringify(new_settings, null, 2))

    const stored = await load_stored_config(owner_username)
    const old_settings = stored.status === 'found' ? settings_to_record(stored.settings as SettingsData) : null
    setJsonOldContent(old_settings)

    if (old_settings) {
      const diff = calculate_diff(old_settings, new_settings)
      setJsonDiff(diff)
    } else {
      const diff = Object.keys(new_settings).map((key) => ({
        key,
        oldValue: undefined,
        newValue: new_settings[key],
        type: 'added' as const,
      }))
      setJsonDiff(diff)
    }
  } catch (error) {
    if (import.meta.env.DEV) console.error('Failed to load old config:', error)
    showToast('Failed to load old config from Hive', 'error')
  } finally {
    setLoading(false)
  }
}

/**
 * Calculate diff between two objects
 */
export function calculate_diff(
  old_obj: Record<string, unknown>,
  new_obj: Record<string, unknown>
): Array<{ key: string; oldValue: unknown; newValue: unknown; type: 'changed' | 'added' | 'removed' }> {
  const diff: Array<{ key: string; oldValue: unknown; newValue: unknown; type: 'changed' | 'added' | 'removed' }> = []
  const all_keys = new Set([...Object.keys(old_obj), ...Object.keys(new_obj)])

  for (const key of all_keys) {
    const old_val = old_obj[key]
    const new_val = new_obj[key]
    const old_str = JSON.stringify(old_val)
    const new_str = JSON.stringify(new_val)

    if (old_str !== new_str) {
      if (old_val === undefined) {
        diff.push({ key, oldValue: undefined, newValue: new_val, type: 'added' })
      } else if (new_val === undefined) {
        diff.push({ key, oldValue: old_val, newValue: undefined, type: 'removed' })
      } else {
        diff.push({ key, oldValue: old_val, newValue: new_val, type: 'changed' })
      }
    }
  }

  return diff.sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * Download config as JSON file
 */
export function handle_download_config() {
  try {
    const snapshot = getSettingsSnapshot()
    const json_str = JSON.stringify(snapshot, null, 2)
    const blob = new Blob([json_str], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `hive-blog-config-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    showToast('Config downloaded successfully', 'success')
  } catch (error) {
    showToast('Failed to download config', 'error')
  }
}

/**
 * Save settings to browser local storage
 */
export function handle_save_local_storage() {
  const snapshot = getSettingsSnapshot()
  localStorage.setItem('hive-blog-settings', JSON.stringify(snapshot))
  showToast('Settings saved to local storage', 'success')
}

export type LocalSettingsResult =
  { kind: 'empty' } | { kind: 'invalid'; error: string } | { kind: 'ok'; settings: Partial<SettingsData> }

/** Parse the localStorage settings JSON with the same per-key schema validation as a config read from Hive. */
export function parse_local_settings(saved: string | null, community_mode: boolean): LocalSettingsResult {
  if (!saved) return { kind: 'empty' }
  let parsed: unknown
  try {
    parsed = JSON.parse(saved)
  } catch (error) {
    return { kind: 'invalid', error: error instanceof Error ? error.message : 'Malformed JSON' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { kind: 'invalid', error: 'Saved settings are not a JSON object' }
  }
  const settings = extract_explicit_fields(parsed as Record<string, unknown>)
  return { kind: 'ok', settings: community_mode ? settings : strip_community_fields(settings) }
}

/**
 * Load settings from browser local storage
 */
export function handle_load_local_storage() {
  const result = parse_local_settings(localStorage.getItem('hive-blog-settings'), is_community_mode())
  switch (result.kind) {
    case 'empty':
      showToast('No local settings found', 'error')
      return
    case 'invalid':
      showToast(`Failed to parse local settings: ${result.error}`, 'error')
      return
    case 'ok':
      syncSettingsToStore({ ...getSettingsSnapshot(), ...result.settings }, true)
      setHasUnsavedChanges(true)
      showToast('Settings loaded from local storage', 'success')
  }
}

/**
 * Clear settings from browser local storage
 */
export function handle_clear_local_storage() {
  const saved = localStorage.getItem('hive-blog-settings')
  if (!saved) {
    showToast('No local settings to clear', 'error')
    return
  }
  localStorage.removeItem('hive-blog-settings')
  showToast('Local settings cleared', 'success')
}
