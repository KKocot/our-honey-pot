// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { z } from 'zod'
import { ImageRefSchema } from '../../../../lib/image-ref'
import {
  COMMON_STYLE_DEFAULTS,
  SECTION_ALIGNS,
  SECTION_PLACEMENT_CONTAINERS,
  TEXT_SECTION_BGS,
  base_style_controls,
  common_style_shape,
  define_section,
  markdown_schema,
  pick_valid_list,
  style_enum,
  text_schema,
  type SectionDefinition,
  type SectionValueOf,
} from '../registry-types'

export const ABOUT_LAYOUTS = Object.freeze(['side', 'stacked'] as const)
export const ABOUT_IMAGE_SHAPES = Object.freeze(['circle', 'rounded'] as const)

export const ABOUT_STYLE_DEFAULTS = Object.freeze({
  layout: 'side',
  align: 'start',
  image_shape: 'circle',
} as const)

export const ABOUT_TEXT_LIMITS = Object.freeze({
  heading_chars: 90,
  body_bytes: 1500,
  facts: 6,
  fact_label_chars: 32,
  fact_value_chars: 64,
})

const ABOUT_LAYOUT_LABELS: Readonly<Record<(typeof ABOUT_LAYOUTS)[number], string>> = {
  side: 'Photo beside text',
  stacked: 'Photo above text',
}

// The heading is a default the owner may keep, so it is not a placeholder.
const DEFAULT_HEADING = 'About me'
const PLACEHOLDER_BODY =
  'Write a short bio: who you are, what you write about and why readers should follow. 2–4 sentences work best.'
// Labels are ready-made suggestions the owner may keep; only the values are placeholders.
const PLACEHOLDER_FACTS = Object.freeze([
  { label: 'Based in', value: 'Your city' },
  { label: 'Writing since', value: 'Year' },
  { label: 'Topics', value: 'Your main topics' },
])

const about_fact_schema = z.object({
  label: text_schema(1, ABOUT_TEXT_LIMITS.fact_label_chars),
  value: text_schema(1, ABOUT_TEXT_LIMITS.fact_value_chars),
})

const about_content_schema = z.object({
  heading: text_schema(1, ABOUT_TEXT_LIMITS.heading_chars),
  body_md: markdown_schema(ABOUT_TEXT_LIMITS.body_bytes).optional(),
  avatar: ImageRefSchema.optional(),
  facts: z.array(about_fact_schema).max(ABOUT_TEXT_LIMITS.facts).optional(),
})

const about_style_schema = z
  .object({
    ...common_style_shape,
    bg: style_enum(TEXT_SECTION_BGS, COMMON_STYLE_DEFAULTS.bg),
    layout: style_enum(ABOUT_LAYOUTS, ABOUT_STYLE_DEFAULTS.layout),
    align: style_enum(SECTION_ALIGNS, ABOUT_STYLE_DEFAULTS.align),
    image_shape: style_enum(ABOUT_IMAGE_SHAPES, ABOUT_STYLE_DEFAULTS.image_shape),
  })
  .default({})

export const about_definition: SectionDefinition<
  'about',
  typeof about_content_schema,
  typeof about_style_schema,
  typeof ABOUT_STYLE_DEFAULTS,
  typeof ABOUT_TEXT_LIMITS
> = define_section({
  type: 'about',
  label: 'About',
  description: 'Short bio with a photo and a few key facts.',
  content_schema: about_content_schema,
  style_schema: about_style_schema,
  style_defaults: ABOUT_STYLE_DEFAULTS,
  text_limits: ABOUT_TEXT_LIMITS,
  max_per_page: 1,
  placements: SECTION_PLACEMENT_CONTAINERS,
  required_content_keys: ['heading'],
  placeholder: {
    body_md: PLACEHOLDER_BODY,
    ...Object.fromEntries(PLACEHOLDER_FACTS.map((fact, index) => [`facts.${index}.value`, fact.value])),
  },
  style_options: { bg: TEXT_SECTION_BGS, image_shape: ABOUT_IMAGE_SHAPES },
  layout: {
    key: 'layout',
    options: ABOUT_LAYOUTS.map((value) => ({
      value,
      label: ABOUT_LAYOUT_LABELS[value],
      thumb: value === 'side' ? 'image-text' : 'image-above-text',
    })),
  },
  fields: [
    { kind: 'text', key: 'heading', label: 'Heading', max_len: ABOUT_TEXT_LIMITS.heading_chars, required: true },
    { kind: 'markdown', key: 'body_md', label: 'Bio', max_bytes: ABOUT_TEXT_LIMITS.body_bytes },
    {
      kind: 'image',
      key: 'avatar',
      label: 'Photo',
      hint: "Describe the photo, e.g. 'Portrait of Anna', or mark it decorative.",
    },
    {
      kind: 'list',
      key: 'facts',
      label: 'Key facts',
      max: ABOUT_TEXT_LIMITS.facts,
      item_fields: [
        { kind: 'text', key: 'label', label: 'Label', max_len: ABOUT_TEXT_LIMITS.fact_label_chars, required: true },
        { kind: 'text', key: 'value', label: 'Value', max_len: ABOUT_TEXT_LIMITS.fact_value_chars, required: true },
      ],
    },
  ],
  defaults: () => ({
    content: {
      heading: DEFAULT_HEADING,
      body_md: PLACEHOLDER_BODY,
      facts: PLACEHOLDER_FACTS.map((fact) => ({ ...fact })),
    },
    style: { ...COMMON_STYLE_DEFAULTS, ...ABOUT_STYLE_DEFAULTS },
  }),
  style_controls: (style) => [...base_style_controls(style, { layout: true }), 'align', 'image_shape'],
  image_recommendation: () => ({ ratio: 1, ratio_label: '1:1' }),
  prepare_content: (content) => {
    if (content.facts !== undefined) {
      content.facts = pick_valid_list(about_fact_schema, content.facts, ABOUT_TEXT_LIMITS.facts)
    }
  },
})

export type AboutSection = SectionValueOf<typeof about_definition>
