// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { safe_link_url, type ImageRef } from '../../../../../lib/image-ref'
import {
  code_point_length,
  is_record,
  utf8_length,
  type FieldDescriptor,
  type ListFieldDescriptor,
} from '../../../../../shared/components/sections/registry-types'
import { clamp_chars, counter_tone, type CounterTone } from '../../../settings/SiteSettings'

export type CounterUnit = 'chars' | 'bytes'
export type FieldRecord = Record<string, unknown>

export interface FieldCounter {
  count: number
  max: number
  tone: CounterTone
  text: string
}

/** What one edit did, so the caller can label and coalesce its undo step. */
export interface FieldEdit {
  /** Dot path from the content root, e.g. `items.1.title`. */
  path: string
  label: string
  action: 'edit' | 'add' | 'remove' | 'move'
}

export type FieldChangeHandler = (key: string, value: unknown, edit: FieldEdit) => void

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** `42/90` counter in code points (`chars`) or UTF-8 bytes; amber from 90%, red at the limit. */
export function field_counter(value: string | undefined, max: number, unit: CounterUnit): FieldCounter {
  const text = value ?? ''
  const count = unit === 'bytes' ? utf8_length(text) : code_point_length(text)
  return { count, max, tone: counter_tone(count, max), text: `${count}/${max}` }
}

/** Value to store for typed text: char limits clamp, an emptied optional field is removed. */
export function text_input_value(raw: string, max: number, unit: CounterUnit, required: boolean): string | undefined {
  const value = unit === 'chars' ? clamp_chars(raw, max) : raw
  if (value === '' && !required) return undefined
  return value
}

/** Inline error of a link field (same gate as save validation), null while empty or valid. */
export function url_field_error(url: string, allow_contact: boolean): string | null {
  if (url.trim() === '' || safe_link_url(url, { allow_contact })) return null
  return allow_contact ? 'Use an https://, mailto: or tel: link.' : 'Use an https:// link.'
}

export function date_field_error(value: string): string | null {
  if (value === '' || DATE_PATTERN.test(value)) return null
  return 'Use a date in YYYY-MM-DD format.'
}

/** Stored value of an emptied input: required fields keep '', optional ones are removed. */
export function emptied(value: string, required: boolean | undefined): string | undefined {
  return value === '' && !required ? undefined : value
}

export function string_value(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function record_value(value: unknown): FieldRecord | undefined {
  return is_record(value) ? value : undefined
}

export function list_value(value: unknown): FieldRecord[] {
  return Array.isArray(value) ? value.map((item) => (is_record(item) ? item : {})) : []
}

/** Loose ImageRef view of stored content; ImageField itself flags a URL off the host allowlist. */
export function image_value(value: unknown): ImageRef | undefined {
  if (!is_record(value) || typeof value.url !== 'string') return undefined
  return value as unknown as ImageRef
}

/** Content of a freshly added list item or group: required fields start empty so save validation reports them. */
export function empty_record(fields: readonly FieldDescriptor[]): FieldRecord {
  const record: FieldRecord = {}
  for (const field of fields) {
    if (!field.required) continue
    const initial = initial_value(field)
    if (initial !== undefined) record[field.key] = initial
  }
  return record
}

function initial_value(field: FieldDescriptor): unknown {
  switch (field.kind) {
    case 'text':
    case 'textarea':
    case 'markdown':
    case 'url':
    case 'date':
      return ''
    case 'select':
      return field.options[0]?.value
    case 'boolean':
      return false
    case 'list':
      return []
    case 'group':
      return empty_record(field.fields)
    case 'image':
      return undefined
  }
}

export function can_add_item(list: readonly unknown[], field: Pick<ListFieldDescriptor, 'max'>): boolean {
  return list.length < field.max
}

/** List with one empty item appended; null at `max`. */
export function list_add(list: readonly FieldRecord[], field: ListFieldDescriptor): FieldRecord[] | null {
  if (!can_add_item(list, field)) return null
  return [...list, empty_record(field.item_fields)]
}

/** List without item `index`; an optional list left empty is removed (undefined). Null for a missing index. */
export function list_remove(
  list: readonly FieldRecord[],
  index: number,
  required: boolean | undefined
): FieldRecord[] | undefined | null {
  if (index < 0 || index >= list.length) return null
  const next = list.filter((_item, position) => position !== index)
  return next.length > 0 || required ? next : undefined
}

/** List with item `index` moved by `step`; null past either end. */
export function list_move(list: readonly FieldRecord[], index: number, step: -1 | 1): FieldRecord[] | null {
  const target = index + step
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return null
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** List with item `index` replaced by `item`; null for a missing index. */
export function list_update(list: readonly FieldRecord[], index: number, item: FieldRecord): FieldRecord[] | null {
  if (index < 0 || index >= list.length) return null
  const next = [...list]
  next[index] = item
  return next
}

/** Record with `key` set, or removed when `value` is undefined. */
export function record_with(record: FieldRecord | undefined, key: string, value: unknown): FieldRecord {
  const next: FieldRecord = { ...record }
  if (value === undefined) delete next[key]
  else next[key] = value
  return next
}

export function item_title(field: ListFieldDescriptor, index: number): string {
  return field.item_labels?.[index] ?? `${field.label} ${index + 1}`
}

export function child_path(parent: string, key: string): string {
  return parent ? `${parent}.${key}` : key
}
