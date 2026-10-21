// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Import/export of the blog design as a JSON file ({ format: 'ohp-design', version: 1, scope, settings }).
// Import never passes unknown data through: every top-level key is whitelisted and parsed by settings_schema.

import {
  INSTANCE_OVERRIDE_KEY_REGEX,
  MAX_INSTANCE_OVERRIDES,
  instance_override_keys_for,
  is_instance_override_value,
  type InstanceOverrides,
  type InstanceSizeOverrides,
  type SettingsData,
} from './types/settings'
import { sanitize_instance_overrides, settings_schema } from './types/settings-schema'
import { parse_structured_setting } from './types/layout-shape'

export const DESIGN_FORMAT = 'ohp-design'
export const DESIGN_VERSION = 1
export const MAX_DESIGN_FILE_BYTES = 256 * 1024

export const DESIGN_SCOPES = Object.freeze(['full', 'style'] as const)
export type DesignScope = (typeof DESIGN_SCOPES)[number]

type SettingsKey = keyof SettingsData

/** Bound to the blog account (hiveUsername, bare permlinks of its own posts): never exported, ignored on import. */
export const IDENTITY_KEYS: ReadonlyArray<SettingsKey> = Object.freeze(['hiveUsername', 'pinnedPostPermlinks'])

/** Scope 'style': palette, fonts, shape/spacing tokens and motion. */
export const STYLE_KEYS: ReadonlyArray<SettingsKey> = Object.freeze([
  'siteTheme',
  'customColors',
  'fontHeading',
  'fontBody',
  'radiusPx',
  'density',
  'contentWidthPx',
  'baseFontSizePx',
  'headingScale',
  'presetId',
  'cardHoverEffect',
  'cardTransitionDuration',
  'cardHoverScale',
  'cardHoverShadow',
  'cardHoverBrightness',
  'scrollAnimationEnabled',
  'scrollAnimationType',
  'scrollAnimationDuration',
  'scrollAnimationDelay',
])

/** Every SettingsData key the schema can parse; anything else in an imported file is rejected. */
export const KNOWN_SETTINGS_KEYS: ReadonlyArray<SettingsKey> = Object.freeze(
  Object.keys(settings_schema.shape) as SettingsKey[]
)

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])
const KNOWN_KEY_SET: ReadonlySet<string> = new Set(KNOWN_SETTINGS_KEYS)
const IDENTITY_KEY_SET: ReadonlySet<string> = new Set(IDENTITY_KEYS)
const STYLE_KEY_SET: ReadonlySet<string> = new Set(STYLE_KEYS)

export interface DesignFile {
  format: typeof DESIGN_FORMAT
  version: typeof DESIGN_VERSION
  scope: DesignScope
  settings: Partial<SettingsData>
}

export type DesignImportErrorCode =
  'too_large' | 'invalid_json' | 'invalid_format' | 'unsupported_version' | 'invalid_scope' | 'invalid_settings'

export class DesignImportError extends Error {
  readonly code: DesignImportErrorCode

  constructor(code: DesignImportErrorCode, message: string) {
    super(message)
    this.name = 'DesignImportError'
    this.code = code
  }
}

export type SkipReason =
  'unknown_key' | 'forbidden_key' | 'identity' | 'out_of_scope' | 'invalid_value' | 'limit_exceeded'

export interface SkippedValue {
  /** Settings key; nested paths use dots, e.g. `instanceOverrides.page-sec-main:posts.gridColumns`. */
  key: string
  reason: SkipReason
}

export interface DesignImportResult {
  scope: DesignScope
  /** Only keys whose value differs from `current`. */
  patch: Partial<SettingsData>
  changed_keys: SettingsKey[]
  skipped: SkippedValue[]
}

function keys_for_scope(scope: DesignScope): ReadonlyArray<SettingsKey> {
  return scope === 'style' ? STYLE_KEYS : KNOWN_SETTINGS_KEYS.filter((key) => !IDENTITY_KEY_SET.has(key))
}

/** Export payload: settings of the scope without identity fields, deep-copied so the file never aliases the store. */
export function build_design_file(settings: SettingsData, scope: DesignScope = 'full'): DesignFile {
  const exported: Record<string, unknown> = {}
  for (const key of keys_for_scope(scope)) {
    const value = settings[key]
    if (value !== undefined) exported[key] = structuredClone(value)
  }
  return { format: DESIGN_FORMAT, version: DESIGN_VERSION, scope, settings: exported as Partial<SettingsData> }
}

export function serialize_design_file(settings: SettingsData, scope: DesignScope = 'full'): string {
  return JSON.stringify(build_design_file(settings, scope), null, 2)
}

/** `<site>-design.json` with the site name slugified; falls back to `blog-design.json`. */
export function design_file_name(site_name: string): string {
  const slug = site_name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return `${slug || 'blog'}-design.json`
}

function too_large_error(bytes: number): DesignImportError {
  return new DesignImportError(
    'too_large',
    `Design file is ${Math.ceil(bytes / 1024)} KB, the limit is ${MAX_DESIGN_FILE_BYTES / 1024} KB.`
  )
}

/** Throws DesignImportError('too_large') before the file is read into memory. */
export function assert_design_file_size(bytes: number): void {
  if (bytes > MAX_DESIGN_FILE_BYTES) throw too_large_error(bytes)
}

function is_plain_object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parse_json_without_forbidden_keys(text: string, stripped: string[]): unknown {
  try {
    return JSON.parse(text, function (key, value) {
      if (FORBIDDEN_KEYS.has(key)) {
        stripped.push(key)
        return undefined
      }
      return value
    })
  } catch {
    throw new DesignImportError('invalid_json', 'Design file is not valid JSON.')
  }
}

function json_equal(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => json_equal(item, b[index]))
  }
  if (!is_plain_object(a) || !is_plain_object(b)) return false
  const a_keys = Object.keys(a).filter((key) => a[key] !== undefined)
  const b_keys = Object.keys(b).filter((key) => b[key] !== undefined)
  if (a_keys.length !== b_keys.length) return false
  return a_keys.every((key) => Object.hasOwn(b, key) && json_equal(a[key], b[key]))
}

function parse_instance_overrides(raw: unknown, skipped: SkippedValue[]): InstanceOverrides | undefined {
  if (!is_plain_object(raw)) {
    skipped.push({ key: 'instanceOverrides', reason: 'invalid_value' })
    return undefined
  }
  const overrides: InstanceOverrides = {}
  let count = 0
  for (const [instance, raw_entry] of Object.entries(raw)) {
    const path = `instanceOverrides.${instance}`
    if (count >= MAX_INSTANCE_OVERRIDES) {
      skipped.push({ key: path, reason: 'limit_exceeded' })
      continue
    }
    if (!INSTANCE_OVERRIDE_KEY_REGEX.test(instance) || !is_plain_object(raw_entry)) {
      skipped.push({ key: path, reason: 'invalid_value' })
      continue
    }
    const element_id = instance.slice(instance.indexOf(':') + 1)
    const allowed: ReadonlySet<string> = new Set(instance_override_keys_for(element_id))
    const entry: InstanceSizeOverrides = {}
    for (const [setting, value] of Object.entries(raw_entry)) {
      if (!allowed.has(setting)) {
        skipped.push({ key: `${path}.${setting}`, reason: 'unknown_key' })
        continue
      }
      const override_key = setting as keyof InstanceSizeOverrides
      if (is_instance_override_value(override_key, value)) entry[override_key] = value
      else skipped.push({ key: `${path}.${setting}`, reason: 'invalid_value' })
    }
    if (Object.keys(entry).length === 0) continue
    overrides[instance] = entry
    count += 1
  }
  return sanitize_instance_overrides(overrides)
}

function parse_setting(
  key: SettingsKey,
  raw: unknown,
  skipped: SkippedValue[]
): { ok: true; value: unknown } | { ok: false } {
  if (key === 'instanceOverrides') {
    const value = parse_instance_overrides(raw, skipped)
    return value === undefined ? { ok: false } : { ok: true, value }
  }
  const structured = parse_structured_setting(key, raw)
  if (structured !== null) {
    if (!structured.ok) skipped.push({ key, reason: 'invalid_value' })
    return structured
  }
  const parsed = settings_schema.shape[key].safeParse(raw)
  if (!parsed.success || parsed.data === undefined) {
    skipped.push({ key, reason: 'invalid_value' })
    return { ok: false }
  }
  return { ok: true, value: parsed.data }
}

function parse_envelope(data: unknown): { scope: DesignScope; settings: Record<string, unknown> } {
  if (!is_plain_object(data) || data.format !== DESIGN_FORMAT) {
    throw new DesignImportError('invalid_format', 'This is not an Our Honey Pot design file.')
  }
  if (data.version !== DESIGN_VERSION) {
    throw new DesignImportError(
      'unsupported_version',
      `Design file version ${String(data.version)} is not supported (expected ${DESIGN_VERSION}).`
    )
  }
  const scope = data.scope
  if (typeof scope !== 'string' || !(DESIGN_SCOPES as ReadonlyArray<string>).includes(scope)) {
    throw new DesignImportError('invalid_scope', `Design file scope must be one of: ${DESIGN_SCOPES.join(', ')}.`)
  }
  if (!is_plain_object(data.settings)) {
    throw new DesignImportError('invalid_settings', 'Design file has no settings object.')
  }
  return { scope: scope as DesignScope, settings: data.settings }
}

/**
 * Validates a design file against `current` settings. Throws DesignImportError for a file that cannot be used at all;
 * single bad values are reported in `skipped` and never reach `patch`.
 */
export function parse_design_file(text: string, current: SettingsData): DesignImportResult {
  // UTF-16 length never exceeds the UTF-8 byte count, so the cheap check rejects huge strings before encoding.
  if (text.length > MAX_DESIGN_FILE_BYTES) throw too_large_error(text.length)
  assert_design_file_size(new TextEncoder().encode(text).length)

  const stripped: string[] = []
  const { scope, settings } = parse_envelope(parse_json_without_forbidden_keys(text, stripped))

  const skipped: SkippedValue[] = stripped.map((key) => ({ key, reason: 'forbidden_key' }))
  const patch: Record<string, unknown> = {}
  const changed_keys: SettingsKey[] = []

  for (const [raw_key, raw_value] of Object.entries(settings)) {
    if (!KNOWN_KEY_SET.has(raw_key)) {
      skipped.push({ key: raw_key, reason: 'unknown_key' })
      continue
    }
    if (IDENTITY_KEY_SET.has(raw_key)) {
      skipped.push({ key: raw_key, reason: 'identity' })
      continue
    }
    if (scope === 'style' && !STYLE_KEY_SET.has(raw_key)) {
      skipped.push({ key: raw_key, reason: 'out_of_scope' })
      continue
    }
    const key = raw_key as SettingsKey
    const parsed = parse_setting(key, raw_value, skipped)
    if (!parsed.ok || json_equal(parsed.value, current[key])) continue
    patch[key] = parsed.value
    changed_keys.push(key)
  }

  return { scope, patch: patch as Partial<SettingsData>, changed_keys, skipped }
}

/** Reads a dropped/picked file; the size limit is enforced before the content is loaded. */
export async function read_design_file(file: Blob, current: SettingsData): Promise<DesignImportResult> {
  assert_design_file_size(file.size)
  return parse_design_file(await file.text(), current)
}
