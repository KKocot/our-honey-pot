// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { z } from 'zod'
import { LINK_LABEL_MAX_CHARS } from '../../../../components/admin/types/navigation'
import { ImageRefSchema } from '../../../../lib/image-ref'
import {
  COMMON_STYLE_DEFAULTS,
  CtaSchema,
  IMAGE_BG_OVERLAYS,
  IMAGE_SIDES,
  SECTION_ALIGNS,
  base_style_controls,
  common_style_shape,
  define_section,
  pick_valid_list,
  style_enum,
  text_schema,
  type LayoutThumb,
  type SectionDefinition,
  type StyleValues,
} from '../registry-types'

export const HERO_VARIANTS = Object.freeze(['text-centric', 'split', 'overlay', 'stacked'] as const)
export const HERO_HEIGHTS = Object.freeze(['auto', 'md', 'lg'] as const)
// Same values as HERO_OVERLAY_VARIANT_OVERLAYS in ./render (render modules stay out of this import graph).
const OVERLAY_VARIANT_OVERLAYS: readonly string[] = Object.freeze(['dark-50', 'dark-70', 'light-50'])

const HERO_STYLE_DEFAULTS = Object.freeze({
  variant: 'split',
  height: 'auto',
  align: 'start',
  image_side: 'end',
} as const)

const HERO_TEXT_LIMITS = Object.freeze({
  headline_chars: 90,
  subheadline_chars: 200,
  cta: 2,
})

const HERO_LAYOUT_LABELS: Readonly<Record<(typeof HERO_VARIANTS)[number], string>> = {
  'text-centric': 'Text only',
  split: 'Split',
  overlay: 'Overlay',
  stacked: 'Stacked',
}

const HERO_LAYOUT_THUMBS: Readonly<Record<(typeof HERO_VARIANTS)[number], LayoutThumb>> = {
  'text-centric': 'centered-button',
  split: 'text-image',
  overlay: 'overlay',
  stacked: 'text-above-image',
}

const PLACEHOLDER_HEADLINE = 'Your headline'

const hero_content_schema = z.object({
  headline: text_schema(1, HERO_TEXT_LIMITS.headline_chars),
  subheadline: text_schema(0, HERO_TEXT_LIMITS.subheadline_chars).optional(),
  cta: z.array(CtaSchema).max(HERO_TEXT_LIMITS.cta).optional(),
  image: ImageRefSchema.optional(),
})

const hero_style_schema = z
  .object({
    ...common_style_shape,
    variant: style_enum(HERO_VARIANTS, HERO_STYLE_DEFAULTS.variant),
    height: style_enum(HERO_HEIGHTS, HERO_STYLE_DEFAULTS.height),
    align: style_enum(SECTION_ALIGNS, HERO_STYLE_DEFAULTS.align),
    image_side: style_enum(IMAGE_SIDES, HERO_STYLE_DEFAULTS.image_side),
  })
  .default({})

function variant_of(style: StyleValues): unknown {
  return style.variant ?? HERO_STYLE_DEFAULTS.variant
}

export const hero_definition: SectionDefinition<
  'hero',
  typeof hero_content_schema,
  typeof hero_style_schema,
  typeof HERO_STYLE_DEFAULTS,
  typeof HERO_TEXT_LIMITS
> = define_section({
  type: 'hero',
  label: 'Hero',
  description: 'Headline, intro and call to action at the top.',
  content_schema: hero_content_schema,
  style_schema: hero_style_schema,
  style_defaults: HERO_STYLE_DEFAULTS,
  text_limits: HERO_TEXT_LIMITS,
  max_per_page: 1,
  required_content_keys: ['headline'],
  placeholder: { headline: PLACEHOLDER_HEADLINE },
  layout: {
    key: 'variant',
    options: HERO_VARIANTS.map((value) => ({
      value,
      label: HERO_LAYOUT_LABELS[value],
      thumb: HERO_LAYOUT_THUMBS[value],
    })),
  },
  fields: [
    { kind: 'text', key: 'headline', label: 'Headline', max_len: HERO_TEXT_LIMITS.headline_chars, required: true },
    { kind: 'textarea', key: 'subheadline', label: 'Subheadline', max_len: HERO_TEXT_LIMITS.subheadline_chars },
    {
      kind: 'list',
      key: 'cta',
      label: 'Buttons',
      max: HERO_TEXT_LIMITS.cta,
      item_labels: ['Primary button', 'Secondary link'],
      item_fields: [
        { kind: 'text', key: 'label', label: 'Label', max_len: LINK_LABEL_MAX_CHARS, required: true },
        { kind: 'url', key: 'url', label: 'URL', allow_contact: true, required: true },
      ],
    },
    { kind: 'image', key: 'image', label: 'Image' },
  ],
  defaults: () => ({
    content: { headline: PLACEHOLDER_HEADLINE },
    style: { ...COMMON_STYLE_DEFAULTS, ...HERO_STYLE_DEFAULTS },
  }),
  style_controls: (style) => {
    const variant = variant_of(style)
    const controls = base_style_controls(style, { layout: true, text_on_image: variant === 'overlay' })
    controls.push('height', 'align')
    if (variant === 'split') controls.push('image_side')
    return controls
  },
  overlay_values: (style) => (variant_of(style) === 'overlay' ? OVERLAY_VARIANT_OVERLAYS : IMAGE_BG_OVERLAYS),
  image_recommendation: (section) =>
    section.style.variant === 'split' ? { ratio: 4 / 5, ratio_label: '4:5' } : { ratio: 16 / 9, ratio_label: '16:9' },
  prepare_content: (content) => {
    if (content.cta !== undefined) content.cta = pick_valid_list(CtaSchema, content.cta, HERO_TEXT_LIMITS.cta)
  },
})
