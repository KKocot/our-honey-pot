// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { z } from 'zod'
import {
  COMMON_STYLE_DEFAULTS,
  SECTION_ALIGNS,
  TEXT_SECTION_BGS,
  base_style_controls,
  common_style_shape,
  define_section,
  pick_valid_list,
  style_enum,
  text_schema,
  type SectionDefinition,
} from '../registry-types'

const NOW_STYLE_DEFAULTS = Object.freeze({
  align: 'start',
} as const)

const NOW_TEXT_LIMITS = Object.freeze({
  items: 8,
  item_chars: 200,
})

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/

/** Epoch ms (UTC midnight) of a real calendar date `YYYY-MM-DD`; null for anything else (2026-02-30 included). */
export function parse_iso_date(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = ISO_DATE_REGEX.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const time = Date.UTC(year, month - 1, day)
  const date = new Date(time)
  const same_day = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return same_day ? time : null
}

export const NOW_PLACEHOLDER_ITEMS: readonly string[] = Object.freeze([
  'What are you working on right now?',
  'What are you reading or learning?',
  'Where are you based this month?',
  'Replace these with 3–5 short lines.',
])

const now_item_schema = z.object({
  text: text_schema(1, NOW_TEXT_LIMITS.item_chars),
})

const now_content_schema = z.object({
  updated_at: z
    .string()
    .refine((value) => parse_iso_date(value) !== null, { message: 'Date must be a valid YYYY-MM-DD' })
    .optional(),
  items: z.array(now_item_schema).min(1).max(NOW_TEXT_LIMITS.items),
})

const now_style_schema = z
  .object({
    ...common_style_shape,
    bg: style_enum(TEXT_SECTION_BGS, COMMON_STYLE_DEFAULTS.bg),
    align: style_enum(SECTION_ALIGNS, NOW_STYLE_DEFAULTS.align),
  })
  .default({})

export const now_definition: SectionDefinition<
  'now',
  typeof now_content_schema,
  typeof now_style_schema,
  typeof NOW_STYLE_DEFAULTS,
  typeof NOW_TEXT_LIMITS
> = define_section({
  type: 'now',
  label: 'Now',
  description: 'What you are doing right now, with the date of the last update.',
  content_schema: now_content_schema,
  style_schema: now_style_schema,
  style_defaults: NOW_STYLE_DEFAULTS,
  text_limits: NOW_TEXT_LIMITS,
  max_per_page: 1,
  required_content_keys: ['items'],
  placeholder: Object.fromEntries(NOW_PLACEHOLDER_ITEMS.map((text, index) => [`items.${index}.text`, text])),
  // A placeholder date would have to be "today", so a new section starts with an empty one instead.
  must_fill: ['updated_at'],
  style_options: { bg: TEXT_SECTION_BGS },
  fields: [
    { kind: 'date', key: 'updated_at', label: 'Last updated', required: true },
    {
      kind: 'list',
      key: 'items',
      label: 'Items',
      required: true,
      max: NOW_TEXT_LIMITS.items,
      hint: 'Short lines: what you are working on, reading or learning.',
      item_fields: [{ kind: 'text', key: 'text', label: 'Text', max_len: NOW_TEXT_LIMITS.item_chars, required: true }],
    },
  ],
  defaults: () => ({
    content: { updated_at: '', items: NOW_PLACEHOLDER_ITEMS.map((text) => ({ text })) },
    style: { ...COMMON_STYLE_DEFAULTS, ...NOW_STYLE_DEFAULTS },
  }),
  style_controls: (style) => [...base_style_controls(style, { layout: false }), 'align'],
  prepare_content: (content) => {
    content.items = pick_valid_list(now_item_schema, content.items, NOW_TEXT_LIMITS.items)
    if (content.updated_at !== undefined && parse_iso_date(content.updated_at) === null) delete content.updated_at
  },
})
