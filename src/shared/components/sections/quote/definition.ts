// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { z } from 'zod'
import { UrlSchema } from '../../../../lib/image-ref'
import {
  COMMON_STYLE_DEFAULTS,
  SECTION_PLACEMENT_CONTAINERS,
  common_style_shape,
  define_section,
  style_enum,
  text_schema,
  type SectionDefinition,
} from '../registry-types'

export const QUOTE_VARIANTS = Object.freeze(['rule', 'centered'] as const)
export type QuoteVariant = (typeof QUOTE_VARIANTS)[number]

export const QUOTE_STYLE_DEFAULTS = Object.freeze({
  variant: 'rule',
} as const)

export const QUOTE_TEXT_LIMITS = Object.freeze({
  text_chars: 400,
  cite_chars: 120,
})

const QUOTE_LAYOUT_LABELS: Readonly<Record<QuoteVariant, string>> = {
  rule: 'Side rule',
  centered: 'Centered',
}

const PLACEHOLDER_TEXT = 'Paste a sentence that captures what this blog is about — your own line or a quote you love.'
const PLACEHOLDER_CITE = 'Author name, Source title'

const quote_content_schema = z.object({
  text: text_schema(1, QUOTE_TEXT_LIMITS.text_chars),
  cite: text_schema(0, QUOTE_TEXT_LIMITS.cite_chars).optional(),
  // https only: the URL also becomes the blockquote `cite` attribute
  source_url: UrlSchema.optional(),
})

const quote_style_schema = z
  .object({
    ...common_style_shape,
    variant: style_enum(QUOTE_VARIANTS, QUOTE_STYLE_DEFAULTS.variant),
  })
  .default({})

export const quote_definition: SectionDefinition<
  'quote',
  typeof quote_content_schema,
  typeof quote_style_schema,
  typeof QUOTE_STYLE_DEFAULTS,
  typeof QUOTE_TEXT_LIMITS
> = define_section({
  type: 'quote',
  label: 'Quote',
  description: 'Pull quote in the heading font with an optional attribution.',
  content_schema: quote_content_schema,
  style_schema: quote_style_schema,
  style_defaults: QUOTE_STYLE_DEFAULTS,
  text_limits: QUOTE_TEXT_LIMITS,
  max_per_page: 2,
  placements: SECTION_PLACEMENT_CONTAINERS,
  required_content_keys: ['text'],
  placeholder: { text: PLACEHOLDER_TEXT, cite: PLACEHOLDER_CITE },
  layout: {
    key: 'variant',
    options: QUOTE_VARIANTS.map((value) => ({ value, label: QUOTE_LAYOUT_LABELS[value], thumb: value })),
  },
  fields: [
    { kind: 'textarea', key: 'text', label: 'Quote', max_len: QUOTE_TEXT_LIMITS.text_chars, required: true },
    {
      kind: 'text',
      key: 'cite',
      label: 'Attribution',
      max_len: QUOTE_TEXT_LIMITS.cite_chars,
      hint: 'Author and source, e.g. "Ursula K. Le Guin, The Dispossessed"',
    },
    { kind: 'url', key: 'source_url', label: 'Source URL', allow_contact: false },
  ],
  defaults: () => ({
    content: { text: PLACEHOLDER_TEXT, cite: PLACEHOLDER_CITE },
    style: { ...COMMON_STYLE_DEFAULTS, ...QUOTE_STYLE_DEFAULTS },
  }),
})
