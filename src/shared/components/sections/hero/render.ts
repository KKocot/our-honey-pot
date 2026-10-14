// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Hero section (spec 2.2) - HTML string output for Astro (set:html) and SolidJS (innerHTML).
 * Sized for zero CLS; eager + fetchpriority=high only when `ctx.priority` marks it as the LCP candidate.
 */

import {
  HERO_HEIGHTS,
  HERO_VARIANTS,
  IMAGE_SIDES,
  SECTION_ALIGNS,
  SECTION_STYLE_DEFAULTS,
  SECTION_TEXT_LIMITS,
} from '../../../../components/admin/types/settings'
import { safe_image_url } from '../../../../lib/image-ref'
import { escape_html } from '../../../formatters/html'
import type { HeroSection, SectionRenderContext } from '../types'
import {
  clean_text,
  image_ratio,
  pick_enum,
  render_cta,
  render_image,
  render_section_shell,
  section_dom_id,
} from '../utils'

const SPLIT_RATIO = [4, 5] as const
const STACKED_RATIO = [16, 9] as const
const SPLIT_IMAGE_WIDTH = 640
const STACKED_IMAGE_WIDTH = 1280
// Overlay needs at least dark-50 behind the text (spec 2.2); light-50 keeps dark text readable.
export const HERO_OVERLAY_VARIANT_OVERLAYS: readonly string[] = Object.freeze(['dark-50', 'dark-70', 'light-50'])

function render_actions(section: HeroSection, locale: unknown): string {
  const ctas = Array.isArray(section.content.cta) ? section.content.cta.slice(0, SECTION_TEXT_LIMITS.hero_cta) : []
  const buttons = ctas
    .map((cta, index) =>
      render_cta(cta, index === 0 ? 'section-btn section-btn-primary' : 'section-btn section-btn-secondary', locale)
    )
    .filter(Boolean)
  return buttons.length ? `<div class="section-actions">${buttons.join('')}</div>` : ''
}

export function render_hero(section: HeroSection, ctx: SectionRenderContext): string {
  const content = section.content ?? {}
  const headline = clean_text(content.headline, SECTION_TEXT_LIMITS.hero_headline_chars)
  if (!headline) return ''

  const defaults = SECTION_STYLE_DEFAULTS.hero
  const style = section.style
  const has_image = safe_image_url(content.image?.url) !== null
  const requested = pick_enum(style?.variant, HERO_VARIANTS, defaults.variant)
  const variant = requested !== 'text-centric' && !has_image ? 'text-centric' : requested
  const align = variant === 'text-centric' ? 'center' : pick_enum(style?.align, SECTION_ALIGNS, defaults.align)
  const height = pick_enum(style?.height, HERO_HEIGHTS, defaults.height)
  const image_side = pick_enum(style?.image_side, IMAGE_SIDES, defaults.image_side)

  const dom_id = section_dom_id(section.id)
  const title_id = dom_id ? `${dom_id}-title` : null
  const title_id_attr = title_id ? ` id="${title_id}"` : ''
  const subheadline = clean_text(content.subheadline, SECTION_TEXT_LIMITS.hero_subheadline_chars)

  const text = `<div class="section-hero-text">
    <h1${title_id_attr} class="text-heading-1 font-bold wrap-anywhere">${escape_html(headline)}</h1>${
      subheadline ? `<p class="section-muted text-lg wrap-anywhere">${escape_html(subheadline)}</p>` : ''
    }${render_actions(section, ctx.locale)}
  </div>`

  let media = ''
  if (variant === 'split') {
    media = render_image(content.image, {
      width: SPLIT_IMAGE_WIDTH,
      ratio: image_ratio(content.image, SPLIT_RATIO),
      class_name: 'section-media-image section-shape-rounded',
      eager: ctx.priority,
    })
  } else if (variant === 'stacked') {
    media = render_image(content.image, {
      width: STACKED_IMAGE_WIDTH,
      ratio: image_ratio(content.image, STACKED_RATIO),
      class_name: 'section-media-image section-shape-rounded',
      eager: ctx.priority,
    })
  }
  const media_html = media ? `<div class="section-hero-media">${media}</div>` : ''
  const inner =
    variant === 'stacked'
      ? `<div class="section-hero-body">${media_html}${text}</div>`
      : `<div class="section-hero-body">${text}${media_html}</div>`

  const bg_has_image = style?.bg === 'image' && variant !== 'overlay'
  return render_section_shell({
    id: section.id,
    type: 'hero',
    style,
    ctx,
    inner,
    class_name: [
      `section-hero-${variant}`,
      `section-align-${align}`,
      `section-height-${height}`,
      variant === 'split' ? `section-media-${image_side}` : '',
    ]
      .filter(Boolean)
      .join(' '),
    backdrop: variant === 'overlay' ? content.image : undefined,
    backdrop_eager: ctx.priority && (variant === 'overlay' || (bg_has_image && !media)),
    overlays: variant === 'overlay' ? HERO_OVERLAY_VARIANT_OVERLAYS : undefined,
    labelled_by: title_id,
  })
}
