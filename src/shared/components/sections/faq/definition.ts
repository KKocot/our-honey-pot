// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { z } from 'zod'
import {
  COMMON_STYLE_DEFAULTS,
  SECTION_ALIGNS,
  type SECTION_BGS,
  SECTION_PLACEMENT_CONTAINERS,
  base_style_controls,
  common_style_shape,
  define_section,
  markdown_schema,
  pick_valid_list,
  style_enum,
  text_schema,
  utf8_length,
  type SectionDefinition,
  type SectionValueOf,
} from '../registry-types'

/** Answers are running text, which reads poorly over a photo, so the FAQ has no `image` background. */
export const FAQ_BGS = Object.freeze([
  'none',
  'bg',
  'bg-secondary',
  'card',
  'primary',
  'accent',
] as const) satisfies readonly (typeof SECTION_BGS)[number][]

export const FAQ_STYLE_DEFAULTS = Object.freeze({
  align: 'start',
} as const)

export const FAQ_TEXT_LIMITS = Object.freeze({
  items: 10,
  q_chars: 140,
  a_bytes: 800,
  // Keeps the on-chain config small: 10 full answers would take 8 KiB of the 64 KiB budget.
  answers_total_bytes: 4096,
})

export const FAQ_PLACEHOLDER_ITEMS: ReadonlyArray<{ readonly q: string; readonly a: string }> = Object.freeze([
  {
    q: 'What is this blog about?',
    a: 'Answer in 1–3 sentences. Markdown works: **bold**, [links](https://example.com).',
  },
  { q: 'How often do you publish?', a: 'Tell readers what to expect.' },
  { q: 'How can I support you?', a: 'Mention follows, votes, reblogs or a newsletter.' },
])

// Questions are ready-made suggestions the owner may keep; only the answers are placeholders.
const FAQ_PLACEHOLDER: Readonly<Record<string, string>> = Object.fromEntries(
  FAQ_PLACEHOLDER_ITEMS.map((item, index) => [`items.${index}.a`, item.a])
)

const ANSWERS_TOTAL_MESSAGE = `Answers must be at most ${FAQ_TEXT_LIMITS.answers_total_bytes} bytes (UTF-8) in total`

export const FaqItemSchema = z.object({
  q: text_schema(1, FAQ_TEXT_LIMITS.q_chars),
  // A question that opens nothing is a dead control, so an empty answer is invalid.
  a: markdown_schema(FAQ_TEXT_LIMITS.a_bytes).refine((value) => value.trim() !== '', {
    message: 'Answer must not be empty',
  }),
})

function answers_bytes(items: ReadonlyArray<{ a: string }>): number {
  return items.reduce((total, item) => total + utf8_length(item.a), 0)
}

const faq_content_schema = z.object({
  items: z
    .array(FaqItemSchema)
    .min(1)
    .max(FAQ_TEXT_LIMITS.items)
    .refine((items) => answers_bytes(items) <= FAQ_TEXT_LIMITS.answers_total_bytes, {
      message: ANSWERS_TOTAL_MESSAGE,
    }),
  open_first: z.boolean().optional(),
})

const faq_style_schema = z
  .object({
    ...common_style_shape,
    bg: style_enum(FAQ_BGS, COMMON_STYLE_DEFAULTS.bg),
    align: style_enum(SECTION_ALIGNS, FAQ_STYLE_DEFAULTS.align),
  })
  .default({})

// Tolerant read: answers past the total budget are dropped instead of failing the whole section.
function cap_answers_total<T extends { a: string }>(items: T[]): T[] {
  const kept: T[] = []
  let total = 0
  for (const item of items) {
    const size = utf8_length(item.a)
    if (total + size > FAQ_TEXT_LIMITS.answers_total_bytes) break
    total += size
    kept.push(item)
  }
  return kept
}

export const faq_definition: SectionDefinition<
  'faq',
  typeof faq_content_schema,
  typeof faq_style_schema,
  typeof FAQ_STYLE_DEFAULTS,
  typeof FAQ_TEXT_LIMITS
> = define_section({
  type: 'faq',
  label: 'FAQ',
  description: 'Questions readers often ask, with answers that expand on click.',
  content_schema: faq_content_schema,
  style_schema: faq_style_schema,
  style_defaults: FAQ_STYLE_DEFAULTS,
  text_limits: FAQ_TEXT_LIMITS,
  max_per_page: 1,
  placements: SECTION_PLACEMENT_CONTAINERS,
  required_content_keys: ['items'],
  placeholder: FAQ_PLACEHOLDER,
  style_options: { bg: FAQ_BGS },
  fields: [
    {
      kind: 'list',
      key: 'items',
      label: 'Questions',
      required: true,
      max: FAQ_TEXT_LIMITS.items,
      hint: `Up to ${FAQ_TEXT_LIMITS.items} questions. Keep answers short.`,
      item_fields: [
        { kind: 'text', key: 'q', label: 'Question', max_len: FAQ_TEXT_LIMITS.q_chars, required: true },
        {
          kind: 'markdown',
          key: 'a',
          label: 'Answer',
          max_bytes: FAQ_TEXT_LIMITS.a_bytes,
          required: true,
          hint: 'Markdown: **bold**, *italic*, [links](https://example.com) and lists.',
        },
      ],
    },
    {
      kind: 'boolean',
      key: 'open_first',
      label: 'Open the first answer',
      hint: 'The first question shows its answer when the page loads.',
    },
  ],
  defaults: () => ({
    content: { items: FAQ_PLACEHOLDER_ITEMS.map((item) => ({ q: item.q, a: item.a })) },
    style: { ...COMMON_STYLE_DEFAULTS, ...FAQ_STYLE_DEFAULTS },
  }),
  style_controls: (style) => [...base_style_controls(style, { layout: false }), 'align'],
  prepare_content: (content) => {
    content.items = cap_answers_total(pick_valid_list(FaqItemSchema, content.items, FAQ_TEXT_LIMITS.items))
    if (content.open_first !== undefined && typeof content.open_first !== 'boolean') delete content.open_first
  },
})

export type FaqSection = SectionValueOf<typeof faq_definition>
