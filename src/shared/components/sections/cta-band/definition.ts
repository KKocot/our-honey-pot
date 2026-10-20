// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { z } from 'zod'
import { LINK_LABEL_MAX_CHARS } from '../../../../components/admin/types/navigation'
import { UrlSchema } from '../../../../lib/image-ref'
import {
  COMMON_STYLE_DEFAULTS,
  SECTION_ALIGNS,
  base_style_controls,
  common_style_shape,
  define_section,
  link_label_schema,
  style_enum,
  text_schema,
  type LayoutThumb,
  type SectionDefinition,
} from '../registry-types'

export const CTA_BAND_VARIANTS = Object.freeze(['band', 'card', 'split'] as const)
export const CTA_CONSENT_MODES = Object.freeze(['notice', 'checkbox'] as const)

const CTA_BAND_STYLE_DEFAULTS = Object.freeze({
  variant: 'band',
  align: 'center',
} as const)

const CTA_BAND_TEXT_LIMITS = Object.freeze({
  title_chars: 90,
  body_chars: 280,
  consent_chars: 240,
})

const CTA_BAND_LAYOUT_LABELS: Readonly<Record<(typeof CTA_BAND_VARIANTS)[number], string>> = {
  band: 'Band',
  card: 'Card',
  split: 'Split',
}

const CTA_BAND_LAYOUT_THUMBS: Readonly<Record<(typeof CTA_BAND_VARIANTS)[number], LayoutThumb>> = {
  band: 'centered-button',
  card: 'card-button',
  split: 'row-button',
}

const PLACEHOLDER_TITLE = 'Join the newsletter'
const PLACEHOLDER_BUTTON = 'Subscribe'

const PRIVACY_REQUIRED_ERROR =
  'footer.privacy: A privacy policy link is required when the home page has a newsletter (cta-band) section'

const cta_band_content_schema = z.object({
  title: text_schema(1, CTA_BAND_TEXT_LIMITS.title_chars),
  body: text_schema(0, CTA_BAND_TEXT_LIMITS.body_chars).optional(),
  // spec 2.5: the band button accepts https only (no mailto:/tel:)
  button: z.object({ label: link_label_schema, url: UrlSchema }),
  consent_text: text_schema(0, CTA_BAND_TEXT_LIMITS.consent_chars).optional(),
  consent_mode: z.enum(CTA_CONSENT_MODES).catch('notice').default('notice'),
})

const cta_band_style_schema = z
  .object({
    ...common_style_shape,
    variant: style_enum(CTA_BAND_VARIANTS, CTA_BAND_STYLE_DEFAULTS.variant),
    align: style_enum(SECTION_ALIGNS, CTA_BAND_STYLE_DEFAULTS.align),
  })
  .default({})

export const cta_band_definition: SectionDefinition<
  'cta-band',
  typeof cta_band_content_schema,
  typeof cta_band_style_schema,
  typeof CTA_BAND_STYLE_DEFAULTS,
  typeof CTA_BAND_TEXT_LIMITS
> = define_section({
  type: 'cta-band',
  label: 'Call to action',
  description: 'Newsletter or signup band with one button.',
  content_schema: cta_band_content_schema,
  style_schema: cta_band_style_schema,
  style_defaults: CTA_BAND_STYLE_DEFAULTS,
  text_limits: CTA_BAND_TEXT_LIMITS,
  max_per_page: 2,
  required_content_keys: ['title', 'button'],
  placeholder: { title: PLACEHOLDER_TITLE, 'button.label': PLACEHOLDER_BUTTON },
  // Empty button URL keeps the section unsaveable until the owner links a provider.
  must_fill: ['button.url'],
  requires_privacy_link: true,
  layout: {
    key: 'variant',
    options: CTA_BAND_VARIANTS.map((value) => ({
      value,
      label: CTA_BAND_LAYOUT_LABELS[value],
      thumb: CTA_BAND_LAYOUT_THUMBS[value],
    })),
  },
  fields: [
    { kind: 'text', key: 'title', label: 'Title', max_len: CTA_BAND_TEXT_LIMITS.title_chars, required: true },
    { kind: 'textarea', key: 'body', label: 'Text', max_len: CTA_BAND_TEXT_LIMITS.body_chars },
    {
      kind: 'group',
      key: 'button',
      label: 'Button',
      required: true,
      fields: [
        { kind: 'text', key: 'label', label: 'Label', max_len: LINK_LABEL_MAX_CHARS, required: true },
        { kind: 'url', key: 'url', label: 'URL', allow_contact: false, required: true },
      ],
    },
    {
      kind: 'select',
      key: 'consent_mode',
      label: 'Consent',
      required: true,
      options: [
        { value: 'notice', label: 'Notice' },
        { value: 'checkbox', label: 'Checkbox' },
      ],
    },
    { kind: 'textarea', key: 'consent_text', label: 'Consent text', max_len: CTA_BAND_TEXT_LIMITS.consent_chars },
  ],
  defaults: () => ({
    content: {
      title: PLACEHOLDER_TITLE,
      button: { label: PLACEHOLDER_BUTTON, url: '' },
      consent_mode: 'notice',
    },
    style: { ...COMMON_STYLE_DEFAULTS, ...CTA_BAND_STYLE_DEFAULTS },
  }),
  style_controls: (style) => [...base_style_controls(style, { layout: true }), 'align'],
  cross_field_errors: (_sections, settings) => (settings.footer?.privacy ? [] : [PRIVACY_REQUIRED_ERROR]),
})
