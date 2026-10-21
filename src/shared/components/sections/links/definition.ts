// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { z } from 'zod'
import { LINK_LABEL_MAX_CHARS } from '../../../../components/admin/types/navigation'
import { ContactUrlSchema } from '../../../../lib/image-ref'
import {
  COMMON_STYLE_DEFAULTS,
  SECTION_ALIGNS,
  SECTION_PLACEMENT_CONTAINERS,
  base_style_controls,
  common_style_shape,
  define_section,
  is_record,
  link_label_schema,
  pick_valid_list,
  style_enum,
  type SectionDefinition,
  type SectionValueOf,
  type StyleValues,
} from '../registry-types'

export const LINKS_LAYOUTS = Object.freeze(['list', 'grid'] as const)

export const LINKS_STYLE_DEFAULTS = Object.freeze({
  layout: 'list',
  align: 'center',
} as const)

export const LINKS_TEXT_LIMITS = Object.freeze({
  items: 12,
  label_chars: LINK_LABEL_MAX_CHARS,
  highlight: 2,
})

const LINKS_LAYOUT_LABELS: Readonly<Record<(typeof LINKS_LAYOUTS)[number], string>> = {
  list: 'List',
  grid: 'Grid',
}

const PLACEHOLDER_URL = 'https://example.com'
const PLACEHOLDER_ITEMS = Object.freeze([
  { label: 'Your newsletter', highlight: true },
  { label: 'Your social profile' },
  { label: 'Your portfolio' },
  { label: 'A link readers need' },
])
const LINKS_PLACEHOLDER: Readonly<Record<string, string>> = Object.fromEntries(
  PLACEHOLDER_ITEMS.flatMap((item, index) => [
    [`items.${index}.label`, item.label],
    [`items.${index}.url`, PLACEHOLDER_URL],
  ])
)

const HIGHLIGHT_LIMIT_MESSAGE = `At most ${LINKS_TEXT_LIMITS.highlight} links can be highlighted`

export const LinksItemSchema = z.object({
  label: link_label_schema,
  url: ContactUrlSchema,
  highlight: z.boolean().optional(),
})

function highlighted_count(items: ReadonlyArray<{ highlight?: boolean }>): number {
  return items.filter((item) => item.highlight === true).length
}

const links_content_schema = z.object({
  items: z
    .array(LinksItemSchema)
    .max(LINKS_TEXT_LIMITS.items)
    .refine((items) => highlighted_count(items) <= LINKS_TEXT_LIMITS.highlight, { message: HIGHLIGHT_LIMIT_MESSAGE })
    .default([]),
})

const links_style_schema = z
  .object({
    ...common_style_shape,
    layout: style_enum(LINKS_LAYOUTS, LINKS_STYLE_DEFAULTS.layout),
    align: style_enum(SECTION_ALIGNS, LINKS_STYLE_DEFAULTS.align),
  })
  .default({})

// Highlights past the limit are dropped instead of failing the whole section on read.
function cap_highlights(items: unknown[]): void {
  let kept = 0
  for (const item of items) {
    if (!is_record(item) || item.highlight !== true) continue
    if (kept < LINKS_TEXT_LIMITS.highlight) kept += 1
    else delete item.highlight
  }
}

export const links_definition: SectionDefinition<
  'links',
  typeof links_content_schema,
  typeof links_style_schema,
  typeof LINKS_STYLE_DEFAULTS,
  typeof LINKS_TEXT_LIMITS
> = define_section({
  type: 'links',
  label: 'Links',
  description: 'A list of links readers should visit, e.g. newsletter and profiles.',
  content_schema: links_content_schema,
  style_schema: links_style_schema,
  style_defaults: LINKS_STYLE_DEFAULTS,
  text_limits: LINKS_TEXT_LIMITS,
  max_per_page: 1,
  placements: SECTION_PLACEMENT_CONTAINERS,
  placeholder: LINKS_PLACEHOLDER,
  layout: {
    key: 'layout',
    options: LINKS_LAYOUTS.map((value) => ({ value, label: LINKS_LAYOUT_LABELS[value], thumb: value })),
  },
  fields: [
    {
      kind: 'list',
      key: 'items',
      label: 'Links',
      max: LINKS_TEXT_LIMITS.items,
      item_fields: [
        { kind: 'text', key: 'label', label: 'Label', max_len: LINKS_TEXT_LIMITS.label_chars, required: true },
        { kind: 'url', key: 'url', label: 'URL', allow_contact: true, required: true },
        {
          kind: 'boolean',
          key: 'highlight',
          label: 'Highlight',
          hint: `Filled button. At most ${LINKS_TEXT_LIMITS.highlight} links.`,
        },
      ],
    },
  ],
  defaults: () => ({
    content: { items: PLACEHOLDER_ITEMS.map((item) => ({ ...item, url: PLACEHOLDER_URL })) },
    style: { ...COMMON_STYLE_DEFAULTS, ...LINKS_STYLE_DEFAULTS },
  }),
  // Alignment only positions the single-column list; the grid always fills the row.
  style_controls: (style: StyleValues) => {
    const controls = base_style_controls(style, { layout: true })
    if (style.layout !== 'grid') controls.push('align')
    return controls
  },
  prepare_content: (content) => {
    if (content.items === undefined) return
    const items = pick_valid_list(LinksItemSchema, content.items, LINKS_TEXT_LIMITS.items)
    cap_highlights(items)
    content.items = items
  },
})

export type LinksSection = SectionValueOf<typeof links_definition>
