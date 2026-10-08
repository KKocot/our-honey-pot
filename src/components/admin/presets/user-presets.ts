// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { SettingsData } from '../types/settings'
import { pageLayoutConfigToLegacy } from '../types/layout'
import { parse_settings_graceful } from '../types/settings-schema'
import { is_custom_colors } from '../types/layout-shape'
import { PRESET_LAYOUT_KEYS, PRESET_STYLE_KEYS, pick_settings } from './keys'
import { apply_preset_parts, type PresetApplyResult, type PresetParts } from './apply'

export const USER_PRESETS_LIMIT = 12
export const USER_PRESET_NAME_MAX_LENGTH = 40
export const USER_PRESETS_STORAGE_PREFIX = 'ohp-user-presets:'
const STORAGE_VERSION = 1
const USER_PRESET_ID_REGEX = /^[a-z0-9-]{1,64}$/

// pageLayout is derived from pageLayoutConfig on apply, so the stored copy can never disagree with it.
const STORED_LAYOUT_KEYS = PRESET_LAYOUT_KEYS.filter((key) => key !== 'pageLayout')

/** Catalog presets leave page width and type scale alone; a saved look of the user keeps them. */
export const USER_PRESET_STYLE_KEYS: ReadonlyArray<keyof SettingsData> = Object.freeze([
  ...PRESET_STYLE_KEYS,
  'contentWidthPx',
  'baseFontSizePx',
  'headingScale',
])

/** Saved in this browser only (decision A, brief 4.5); never part of the config on Hive. */
export interface UserPreset {
  id: string
  name: string
  created_at: number
  layout: Partial<SettingsData>
  style: Partial<SettingsData>
}

export type PresetStorage = Pick<Storage, 'getItem' | 'setItem'>

export type UserPresetError = 'invalid-name' | 'limit' | 'not-found' | 'storage'

export type UserPresetResult =
  { ok: true; presets: UserPreset[]; preset: UserPreset; index: number } | { ok: false; error: UserPresetError }

export interface SaveOptions {
  storage?: PresetStorage | null
  now?: number
  id?: string
}

function browser_storage(): PresetStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function resolve_storage(storage: PresetStorage | null | undefined): PresetStorage | null {
  return storage === undefined ? browser_storage() : storage
}

export function user_presets_storage_key(hive_username: string): string {
  return `${USER_PRESETS_STORAGE_PREFIX}${hive_username.trim().toLowerCase()}`
}

/** Trimmed name of 1..40 characters, or null. */
export function normalize_preset_name(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  return trimmed.length > 0 && trimmed.length <= USER_PRESET_NAME_MAX_LENGTH ? trimmed : null
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Allowed keys only, each validated by settings_schema; loose schema fields get an extra shape check. */
function sanitize_parts(raw: unknown, keys: ReadonlyArray<keyof SettingsData>): Partial<SettingsData> {
  if (!is_record(raw)) return {}
  const allowed: Record<string, unknown> = {}
  for (const key of keys) {
    if (Object.hasOwn(raw, key)) allowed[key] = raw[key]
  }
  const parsed = parse_settings_graceful(allowed)
  if ('customColors' in parsed && !is_custom_colors(parsed.customColors)) {
    delete parsed.customColors
  }
  if (
    'postCardLayout' in parsed &&
    !(is_record(parsed.postCardLayout) && Array.isArray(parsed.postCardLayout.sections))
  ) {
    delete parsed.postCardLayout
  }
  // Safe: every remaining key is one of `keys` and passed its settings_schema field
  return parsed as Partial<SettingsData>
}

function sanitize_preset(raw: unknown): UserPreset | null {
  if (!is_record(raw)) return null
  const name = normalize_preset_name(raw.name)
  if (typeof raw.id !== 'string' || !USER_PRESET_ID_REGEX.test(raw.id) || name === null) return null
  const created_at = typeof raw.created_at === 'number' && Number.isFinite(raw.created_at) ? raw.created_at : 0
  return {
    id: raw.id,
    name,
    created_at,
    layout: sanitize_parts(raw.layout, STORED_LAYOUT_KEYS),
    style: sanitize_parts(raw.style, USER_PRESET_STYLE_KEYS),
  }
}

/** `unavailable`: no readable storage; `corrupt`: the stored data, or some presets in it, could not be read. */
export type UserPresetsReadError = 'unavailable' | 'corrupt'

export interface UserPresetsRead {
  presets: UserPreset[]
  error: UserPresetsReadError | null
}

function parse_user_presets_checked(raw: string | null): { presets: UserPreset[]; corrupt: boolean } {
  if (!raw) return { presets: [], corrupt: false }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { presets: [], corrupt: true }
  }
  if (!is_record(data) || data.version !== STORAGE_VERSION || !Array.isArray(data.presets)) {
    return { presets: [], corrupt: true }
  }
  const presets: UserPreset[] = []
  const seen = new Set<string>()
  let corrupt = false
  for (const entry of data.presets) {
    if (presets.length >= USER_PRESETS_LIMIT) break
    const preset = sanitize_preset(entry)
    if (!preset) {
      corrupt = true
      continue
    }
    if (seen.has(preset.id)) continue
    seen.add(preset.id)
    presets.push(preset)
  }
  return { presets, corrupt }
}

/** Corrupted storage yields [] or the valid subset; never throws. */
export function parse_user_presets(raw: string | null): UserPreset[] {
  return parse_user_presets_checked(raw).presets
}

/** Presets plus the reason when storage could not be read in full, so the UI can say so (ADR: explicit errors). */
export function read_user_presets(hive_username: string, storage?: PresetStorage | null): UserPresetsRead {
  const target = resolve_storage(storage)
  if (!target) return { presets: [], error: 'unavailable' }
  let raw: string | null
  try {
    raw = target.getItem(user_presets_storage_key(hive_username))
  } catch {
    return { presets: [], error: 'unavailable' }
  }
  const { presets, corrupt } = parse_user_presets_checked(raw)
  return { presets, error: corrupt ? 'corrupt' : null }
}

export function load_user_presets(hive_username: string, storage?: PresetStorage | null): UserPreset[] {
  return read_user_presets(hive_username, storage).presets
}

function write_user_presets(hive_username: string, presets: UserPreset[], storage: PresetStorage | null): boolean {
  if (!storage) return false
  try {
    storage.setItem(
      user_presets_storage_key(hive_username),
      JSON.stringify({ version: STORAGE_VERSION, presets: presets.slice(0, USER_PRESETS_LIMIT) })
    )
    return true
  } catch {
    return false
  }
}

function new_preset_id(now: number): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  return `user-${now.toString(36)}-${random}`.toLowerCase().slice(0, 64)
}

/** Snapshot of the layout and style keys of `settings`; instanceOverrides and identity are never captured. */
export function capture_user_preset(name: string, settings: SettingsData, now: number, id: string): UserPreset {
  return {
    id,
    name,
    created_at: now,
    layout: pick_settings(settings, STORED_LAYOUT_KEYS),
    style: pick_settings(settings, USER_PRESET_STYLE_KEYS),
  }
}

export function save_user_preset(
  hive_username: string,
  name: string,
  settings: SettingsData,
  options: SaveOptions = {}
): UserPresetResult {
  const clean_name = normalize_preset_name(name)
  if (clean_name === null) return { ok: false, error: 'invalid-name' }
  const storage = resolve_storage(options.storage)
  const presets = load_user_presets(hive_username, storage)
  if (presets.length >= USER_PRESETS_LIMIT) return { ok: false, error: 'limit' }
  const now = options.now ?? Date.now()
  const preset = capture_user_preset(clean_name, settings, now, options.id ?? new_preset_id(now))
  const next = [...presets, preset]
  if (!write_user_presets(hive_username, next, storage)) return { ok: false, error: 'storage' }
  return { ok: true, presets: next, preset, index: next.length - 1 }
}

export function rename_user_preset(
  hive_username: string,
  id: string,
  name: string,
  storage?: PresetStorage | null
): UserPresetResult {
  const clean_name = normalize_preset_name(name)
  if (clean_name === null) return { ok: false, error: 'invalid-name' }
  const target = resolve_storage(storage)
  const presets = load_user_presets(hive_username, target)
  const index = presets.findIndex((p) => p.id === id)
  if (index < 0) return { ok: false, error: 'not-found' }
  const preset = { ...presets[index], name: clean_name }
  const next = presets.with(index, preset)
  if (!write_user_presets(hive_username, next, target)) return { ok: false, error: 'storage' }
  return { ok: true, presets: next, preset, index }
}

/** Returns the removed preset and its index so the Delete toast can undo through restore_user_preset. */
export function delete_user_preset(
  hive_username: string,
  id: string,
  storage?: PresetStorage | null
): UserPresetResult {
  const target = resolve_storage(storage)
  const presets = load_user_presets(hive_username, target)
  const index = presets.findIndex((p) => p.id === id)
  if (index < 0) return { ok: false, error: 'not-found' }
  const next = presets.toSpliced(index, 1)
  if (!write_user_presets(hive_username, next, target)) return { ok: false, error: 'storage' }
  return { ok: true, presets: next, preset: presets[index], index }
}

export function restore_user_preset(
  hive_username: string,
  preset: UserPreset,
  index: number,
  storage?: PresetStorage | null
): UserPresetResult {
  const clean = sanitize_preset(preset)
  if (!clean) return { ok: false, error: 'invalid-name' }
  const target = resolve_storage(storage)
  const presets = load_user_presets(hive_username, target).filter((p) => p.id !== clean.id)
  if (presets.length >= USER_PRESETS_LIMIT) return { ok: false, error: 'limit' }
  const at = Math.min(Math.max(0, index), presets.length)
  const next = presets.toSpliced(at, 0, clean)
  if (!write_user_presets(hive_username, next, target)) return { ok: false, error: 'storage' }
  return { ok: true, presets: next, preset: clean, index: at }
}

export function user_preset_parts(preset: UserPreset): PresetParts {
  const layout = structuredClone(preset.layout)
  if (layout.pageLayoutConfig) layout.pageLayout = pageLayoutConfigToLegacy(layout.pageLayoutConfig)
  return { name: preset.name, layout, style: structuredClone(preset.style) }
}

/** User presets offer Apply and Apply style only (brief 4.5). */
export function apply_user_preset(
  preset: UserPreset,
  current: SettingsData,
  scope: 'full' | 'style',
  is_community: boolean
): PresetApplyResult {
  return apply_preset_parts(user_preset_parts(preset), current, scope, is_community)
}
