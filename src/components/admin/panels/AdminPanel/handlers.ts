// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal } from 'solid-js'
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
import { setHasUnsavedChanges } from '../../store'
import { flushPendingSettings, getSettingsSnapshot } from '../../queries'
import { configSource, is_community_mode } from '../../queries'
import { IDENTITY_KEYS, KNOWN_SETTINGS_KEYS } from '../../config-io'
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

export interface SaveUi {
  /** Claims the per-editor save slot; false while another save is running. */
  begin: () => boolean
  end: (result: 'saved' | 'kept_dirty' | 'failed') => void
  open_login: () => void
}

/**
 * Handle broadcast config to Hive blockchain
 */
export async function handle_broadcast_to_hive(
  user: AuthUser | null,
  blog: string,
  source: { account: string | null; error: string | null },
  ui: SaveUi
) {
  if (!user) {
    ui.open_login()
    return
  }
  if (!ui.begin()) return

  let result: 'saved' | 'kept_dirty' | 'failed' = 'failed'
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
        result = 'kept_dirty'
        showToast(
          `Sent to Hive, but the node has not confirmed it within ${CONFIRM_TIMEOUT_MS / 1000} seconds. Your edits are kept as unsaved; reopen the panel later to check that they were stored.`,
          'warning'
        )
        break
      case 'confirmed':
        if (outcome.edited_since_send) {
          result = 'kept_dirty'
          showToast('Config saved on Hive. Edits made while waiting for confirmation are not saved yet.', 'warning')
        } else {
          result = 'saved'
          setHasUnsavedChanges(false)
          showToast(`${outcome.is_update ? 'Updated' : 'Published'} config on Hive! View at: ${outcome.url}`, 'success')
        }
        break
    }
  } catch (error) {
    showToast(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
  } finally {
    ui.end(result)
  }
}

export type DiffEntry = { key: string; oldValue: unknown; newValue: unknown; type: 'changed' | 'added' | 'removed' }
export type DiffViewMode = 'diff' | 'old' | 'new'

/** JSON preview modal state for one editor instance. */
export function create_json_preview() {
  const [open, set_open] = createSignal(false)
  const [loading, set_loading] = createSignal(false)
  const [view_mode, set_view_mode] = createSignal<DiffViewMode>('diff')
  const [old_content, set_old_content] = createSignal<Record<string, unknown> | null>(null)
  const [new_content, set_new_content] = createSignal<Record<string, unknown> | null>(null)
  const [diff, set_diff] = createSignal<DiffEntry[]>([])

  const show = async (owner_username: string | undefined) => {
    if (!owner_username) return

    set_loading(true)
    set_open(true)
    set_view_mode('diff')

    try {
      const new_settings = settings_to_record(getSettingsSnapshot())
      set_new_content(new_settings)

      const stored = await load_stored_config(owner_username)
      const old_settings = stored.status === 'found' ? settings_to_record(stored.settings as SettingsData) : null
      set_old_content(old_settings)
      set_diff(
        old_settings
          ? calculate_diff(old_settings, new_settings)
          : Object.keys(new_settings).map((key) => ({
              key,
              oldValue: undefined,
              newValue: new_settings[key],
              type: 'added' as const,
            }))
      )
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load old config:', error)
      showToast('Failed to load old config from Hive', 'error')
    } finally {
      set_loading(false)
    }
  }

  return {
    open,
    loading,
    view_mode,
    set_view_mode,
    old_content,
    new_content,
    diff,
    show,
    close: () => set_open(false),
  }
}

/**
 * Calculate diff between two objects
 */
export function calculate_diff(
  old_obj: Record<string, unknown>,
  new_obj: Record<string, unknown>
): DiffEntry[] {
  const diff: DiffEntry[] = []
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

// Pre-2026-10 backups used one key for every blog; read only when its hiveUsername matches the current blog.
export const LEGACY_LOCAL_BACKUP_KEY = 'hive-blog-settings'
const LOCAL_BACKUP_PREFIX = 'hive-blog-settings:'
const IDENTITY_KEY_SET: ReadonlySet<string> = new Set(IDENTITY_KEYS)
const KNOWN_KEY_SET: ReadonlySet<string> = new Set(KNOWN_SETTINGS_KEYS)

interface LocalBackupEnvelope {
  blog: string
  settings: Record<string, unknown>
}

function normalize_blog(blog: string | null | undefined): string | null {
  const value = blog?.trim().toLowerCase()
  return value ? value : null
}

export function local_backup_key(blog: string): string {
  return `${LOCAL_BACKUP_PREFIX}${normalize_blog(blog) ?? ''}`
}

/** Blog the editor works on: the config account, falling back to hiveUsername from the loaded settings. */
function current_blog(): string | null {
  return normalize_blog(configSource().account) ?? normalize_blog(getSettingsSnapshot().hiveUsername)
}

export function build_local_backup(settings: object, blog: string): string {
  const stored: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(settings)) {
    if (KNOWN_KEY_SET.has(key) && !IDENTITY_KEY_SET.has(key)) stored[key] = value
  }
  const envelope: LocalBackupEnvelope = { blog: normalize_blog(blog) ?? '', settings: stored }
  return JSON.stringify(envelope)
}

/**
 * Save settings to browser local storage, under a key bound to the current blog
 */
export function handle_save_local_storage() {
  try {
    const blog = current_blog()
    if (!blog) throw new Error('the blog account is unknown')
    localStorage.setItem(local_backup_key(blog), build_local_backup(getSettingsSnapshot(), blog))
    showToast(`Settings saved to local storage for @${blog}`, 'success')
  } catch (error) {
    showToast(`Failed to save local backup: ${error instanceof Error ? error.message : 'storage unavailable'}`, 'error')
  }
}

export type LocalSettingsResult =
  | { kind: 'empty' }
  | { kind: 'invalid'; error: string }
  | { kind: 'foreign'; owner: string | null }
  | { kind: 'ok'; settings: Partial<SettingsData>; ignored: string[] }

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function is_envelope(value: Record<string, unknown>): value is Record<string, unknown> & LocalBackupEnvelope {
  return typeof value.blog === 'string' && is_record(value.settings)
}

/**
 * Parse a local backup for `blog`: a backup of another blog is `foreign`; identity and unknown keys are dropped
 * (reported in `ignored`), the rest goes through the same per-key schema validation as a config read from Hive.
 */
export function parse_local_settings(saved: string | null, community_mode: boolean, blog: string): LocalSettingsResult {
  if (!saved) return { kind: 'empty' }
  let parsed: unknown
  try {
    parsed = JSON.parse(saved)
  } catch (error) {
    return { kind: 'invalid', error: error instanceof Error ? error.message : 'Malformed JSON' }
  }
  if (!is_record(parsed)) {
    return { kind: 'invalid', error: 'Saved settings are not a JSON object' }
  }
  const expected = normalize_blog(blog)
  const owner = is_envelope(parsed)
    ? normalize_blog(parsed.blog)
    : normalize_blog(typeof parsed.hiveUsername === 'string' ? parsed.hiveUsername : null)
  if (!expected || owner !== expected) return { kind: 'foreign', owner }

  const raw = is_envelope(parsed) ? parsed.settings : parsed
  const allowed: Record<string, unknown> = {}
  const ignored: string[] = []
  for (const key of Object.keys(raw)) {
    if (KNOWN_KEY_SET.has(key) && !IDENTITY_KEY_SET.has(key)) allowed[key] = raw[key]
    else ignored.push(key)
  }
  const settings = extract_explicit_fields(allowed)
  return { kind: 'ok', settings: community_mode ? settings : strip_community_fields(settings), ignored }
}

function read_storage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Load the local backup of the current blog; `apply` commits it as one undoable editor step. */
export function handle_load_local_storage(apply: (patch: Partial<SettingsData>, label: string) => void) {
  const blog = current_blog()
  if (!blog) {
    showToast('Failed to load local backup: the blog account is unknown', 'error')
    return
  }
  const community = is_community_mode()
  let result = parse_local_settings(read_storage(local_backup_key(blog)), community, blog)
  let from_legacy = false
  if (result.kind === 'empty') {
    result = parse_local_settings(read_storage(LEGACY_LOCAL_BACKUP_KEY), community, blog)
    from_legacy = true
  }
  switch (result.kind) {
    case 'empty':
      showToast('No local settings found', 'error')
      return
    case 'invalid':
      showToast(`Failed to parse local settings: ${result.error}`, 'error')
      return
    case 'foreign':
      showToast(
        `Local backup ignored: it belongs to ${result.owner ? `@${result.owner}` : 'an unknown blog'}, not @${blog}`,
        'error'
      )
      return
    case 'ok': {
      apply(result.settings, 'Loaded local backup')
      const skipped = result.ignored.length ? ` (ignored: ${result.ignored.join(', ')})` : ''
      showToast(`Settings loaded from local storage${skipped}`, result.ignored.length ? 'warning' : 'success')
      if (from_legacy) migrate_legacy_backup(blog)
    }
  }
}

function migrate_legacy_backup(blog: string) {
  try {
    const legacy = localStorage.getItem(LEGACY_LOCAL_BACKUP_KEY)
    if (!legacy) return
    localStorage.setItem(local_backup_key(blog), build_local_backup(JSON.parse(legacy) as object, blog))
    localStorage.removeItem(LEGACY_LOCAL_BACKUP_KEY)
  } catch (error) {
    showToast(
      `Old local backup was loaded but not migrated: ${error instanceof Error ? error.message : 'storage unavailable'}`,
      'warning'
    )
  }
}

/**
 * Clear the current blog's backup from browser local storage (a legacy backup only when it belongs to this blog)
 */
export function handle_clear_local_storage() {
  const blog = current_blog()
  if (!blog) {
    showToast('Failed to clear local backup: the blog account is unknown', 'error')
    return
  }
  const key = local_backup_key(blog)
  const own_legacy = parse_local_settings(read_storage(LEGACY_LOCAL_BACKUP_KEY), true, blog).kind === 'ok'
  if (!read_storage(key) && !own_legacy) {
    showToast('No local settings to clear', 'error')
    return
  }
  try {
    localStorage.removeItem(key)
    if (own_legacy) localStorage.removeItem(LEGACY_LOCAL_BACKUP_KEY)
    showToast('Local settings cleared', 'success')
  } catch (error) {
    showToast(`Failed to clear local backup: ${error instanceof Error ? error.message : 'storage unavailable'}`, 'error')
  }
}
