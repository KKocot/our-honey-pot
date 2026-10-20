// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { z } from 'zod'
import { LINK_LABEL_MAX_CHARS } from '../../../../components/admin/types/navigation'
import {
  COMMON_STYLE_DEFAULTS,
  CtaSchema,
  SECTION_ALIGNS,
  type SECTION_BGS,
  base_style_controls,
  common_style_shape,
  define_section,
  style_enum,
  text_schema,
  type SectionDefinition,
} from '../registry-types'

export const CALLOUT_TONES = Object.freeze(['info', 'accent', 'warn'] as const)
export type CalloutTone = (typeof CALLOUT_TONES)[number]

/** Long notice text over a photo reads poorly, so the callout has no `image` background. */
export const CALLOUT_BGS = Object.freeze([
  'none',
  'bg',
  'bg-secondary',
  'card',
  'primary',
  'accent',
] as const) satisfies readonly (typeof SECTION_BGS)[number][]

export const CALLOUT_DEFAULT_TONE: CalloutTone = 'info'

export const CALLOUT_STYLE_DEFAULTS = Object.freeze({
  align: 'start',
} as const)

export const CALLOUT_TEXT_LIMITS = Object.freeze({
  title_chars: 90,
  body_chars: 280,
})

const PLACEHOLDER_TITLE = 'Write a short notice title'
const PLACEHOLDER_BODY =
  'One or two sentences readers should not miss — a new series, a break in posting or an announcement.'

const TONE_LABELS: Readonly<Record<CalloutTone, string>> = {
  info: 'Info',
  accent: 'Highlight',
  warn: 'Warning',
}

const callout_content_schema = z.object({
  tone: z.enum(CALLOUT_TONES).catch(CALLOUT_DEFAULT_TONE).default(CALLOUT_DEFAULT_TONE),
  title: text_schema(1, CALLOUT_TEXT_LIMITS.title_chars),
  body: text_schema(0, CALLOUT_TEXT_LIMITS.body_chars).optional(),
  cta: CtaSchema.optional(),
})

const callout_style_schema = z
  .object({
    ...common_style_shape,
    bg: style_enum(CALLOUT_BGS, COMMON_STYLE_DEFAULTS.bg),
    align: style_enum(SECTION_ALIGNS, CALLOUT_STYLE_DEFAULTS.align),
  })
  .default({})

export const callout_definition: SectionDefinition<
  'callout',
  typeof callout_content_schema,
  typeof callout_style_schema,
  typeof CALLOUT_STYLE_DEFAULTS,
  typeof CALLOUT_TEXT_LIMITS
> = define_section({
  type: 'callout',
  label: 'Callout',
  description: 'Highlighted notice with a title, short text and an optional link.',
  content_schema: callout_content_schema,
  style_schema: callout_style_schema,
  style_defaults: CALLOUT_STYLE_DEFAULTS,
  text_limits: CALLOUT_TEXT_LIMITS,
  max_per_page: 2,
  required_content_keys: ['title'],
  placeholder: { title: PLACEHOLDER_TITLE, body: PLACEHOLDER_BODY },
  style_options: { bg: CALLOUT_BGS },
  fields: [
    {
      kind: 'select',
      key: 'tone',
      label: 'Tone',
      required: true,
      options: CALLOUT_TONES.map((value) => ({ value, label: TONE_LABELS[value] })),
    },
    { kind: 'text', key: 'title', label: 'Title', max_len: CALLOUT_TEXT_LIMITS.title_chars, required: true },
    { kind: 'textarea', key: 'body', label: 'Text', max_len: CALLOUT_TEXT_LIMITS.body_chars },
    {
      kind: 'group',
      key: 'cta',
      label: 'Link',
      fields: [
        { kind: 'text', key: 'label', label: 'Label', max_len: LINK_LABEL_MAX_CHARS, required: true },
        { kind: 'url', key: 'url', label: 'URL', allow_contact: true, required: true },
      ],
    },
  ],
  defaults: () => ({
    content: { tone: CALLOUT_DEFAULT_TONE, title: PLACEHOLDER_TITLE, body: PLACEHOLDER_BODY },
    style: { ...COMMON_STYLE_DEFAULTS, ...CALLOUT_STYLE_DEFAULTS },
  }),
  style_controls: (style) => [...base_style_controls(style, { layout: false }), 'align'],
})
