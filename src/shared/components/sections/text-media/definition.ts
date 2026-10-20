// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { z } from 'zod'
import { LINK_LABEL_MAX_CHARS } from '../../../../components/admin/types/navigation'
import { ImageRefSchema } from '../../../../lib/image-ref'
import {
  COMMON_STYLE_DEFAULTS,
  CtaSchema,
  IMAGE_SIDES,
  base_style_controls,
  common_style_shape,
  define_section,
  markdown_schema,
  style_enum,
  text_schema,
  type SectionDefinition,
} from '../registry-types'

export const TEXT_MEDIA_RATIOS = Object.freeze(['1:1', '4:5', '3:2', '16:9'] as const)
export const IMAGE_SHAPES = Object.freeze(['rect', 'rounded', 'circle'] as const)

const TEXT_MEDIA_STYLE_DEFAULTS = Object.freeze({
  image_side: 'start',
  ratio: '4:5',
  image_shape: 'rounded',
} as const)

const TEXT_MEDIA_TEXT_LIMITS = Object.freeze({
  title_chars: 90,
  body_bytes: 1200,
})

const PLACEHOLDER_TITLE = 'Section title'
const PLACEHOLDER_BODY = 'Write a few sentences here.'

const text_media_content_schema = z
  .object({
    title: text_schema(0, TEXT_MEDIA_TEXT_LIMITS.title_chars).optional(),
    body_md: markdown_schema(TEXT_MEDIA_TEXT_LIMITS.body_bytes).optional(),
    image: ImageRefSchema.optional(),
    cta: CtaSchema.optional(),
  })
  .default({})

const text_media_style_schema = z
  .object({
    ...common_style_shape,
    image_side: style_enum(IMAGE_SIDES, TEXT_MEDIA_STYLE_DEFAULTS.image_side),
    ratio: style_enum(TEXT_MEDIA_RATIOS, TEXT_MEDIA_STYLE_DEFAULTS.ratio),
    image_shape: style_enum(IMAGE_SHAPES, TEXT_MEDIA_STYLE_DEFAULTS.image_shape),
  })
  .default({})

function ratio_value(ratio: string): number {
  const [w, h] = ratio.split(':').map(Number)
  return w > 0 && h > 0 ? w / h : 1
}

export const text_media_definition: SectionDefinition<
  'text-media',
  typeof text_media_content_schema,
  typeof text_media_style_schema,
  typeof TEXT_MEDIA_STYLE_DEFAULTS,
  typeof TEXT_MEDIA_TEXT_LIMITS
> = define_section({
  type: 'text-media',
  label: 'Text + media',
  description: 'Text with an image, e.g. an about section.',
  content_schema: text_media_content_schema,
  style_schema: text_media_style_schema,
  style_defaults: TEXT_MEDIA_STYLE_DEFAULTS,
  text_limits: TEXT_MEDIA_TEXT_LIMITS,
  max_per_page: 4,
  placeholder: { title: PLACEHOLDER_TITLE, body_md: PLACEHOLDER_BODY },
  layout: {
    key: 'image_side',
    options: IMAGE_SIDES.map((value) =>
      value === 'start'
        ? { value, label: 'Image left', thumb: 'image-text' }
        : { value, label: 'Image right', thumb: 'text-image' }
    ),
  },
  fields: [
    { kind: 'text', key: 'title', label: 'Title', max_len: TEXT_MEDIA_TEXT_LIMITS.title_chars },
    { kind: 'markdown', key: 'body_md', label: 'Body', max_bytes: TEXT_MEDIA_TEXT_LIMITS.body_bytes },
    { kind: 'image', key: 'image', label: 'Image' },
    {
      kind: 'group',
      key: 'cta',
      label: 'Button',
      fields: [
        { kind: 'text', key: 'label', label: 'Label', max_len: LINK_LABEL_MAX_CHARS, required: true },
        { kind: 'url', key: 'url', label: 'URL', allow_contact: true, required: true },
      ],
    },
  ],
  defaults: () => ({
    content: { title: PLACEHOLDER_TITLE, body_md: PLACEHOLDER_BODY },
    style: { ...COMMON_STYLE_DEFAULTS, ...TEXT_MEDIA_STYLE_DEFAULTS },
  }),
  style_controls: (style) => [...base_style_controls(style, { layout: true }), 'ratio', 'image_shape'],
  image_recommendation: (section) => ({ ratio: ratio_value(section.style.ratio), ratio_label: section.style.ratio }),
})
