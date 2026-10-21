// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Text + media section (spec 2.3) - HTML string output for Astro (set:html) and SolidJS (innerHTML).
 * Below page-md and in a sidebar container the image sits above the text regardless of `image_side`.
 */

import {
  IMAGE_SHAPES,
  IMAGE_SIDES,
  SECTION_STYLE_DEFAULTS,
  SECTION_TEXT_LIMITS,
  TEXT_MEDIA_RATIOS,
} from '../../../../components/admin/types/settings'
import { escape_html } from '../../../formatters/html'
import { render_section_markdown } from '../markdown'
import type { SectionRenderContext, TextMediaSection } from '../types'
import {
  clean_text,
  is_sidebar_container,
  pick_enum,
  render_cta,
  render_image,
  render_section_shell,
  section_dom_id,
} from '../utils'

const RATIOS: Readonly<Record<(typeof TEXT_MEDIA_RATIOS)[number], readonly [number, number]>> = {
  '1:1': [1, 1],
  '4:5': [4, 5],
  '3:2': [3, 2],
  '16:9': [16, 9],
}
const IMAGE_WIDTH = 640

export function render_text_media(section: TextMediaSection, ctx: SectionRenderContext): string {
  const content = section.content ?? {}
  const defaults = SECTION_STYLE_DEFAULTS['text-media']
  const style = section.style
  const shape = pick_enum(style?.image_shape, IMAGE_SHAPES, defaults.image_shape)
  const ratio = shape === 'circle' ? RATIOS['1:1'] : RATIOS[pick_enum(style?.ratio, TEXT_MEDIA_RATIOS, defaults.ratio)]
  const image_side = pick_enum(style?.image_side, IMAGE_SIDES, defaults.image_side)

  const title = clean_text(content.title, SECTION_TEXT_LIMITS.text_media_title_chars)
  const body = render_section_markdown(content.body_md, ctx.locale)
  const cta = render_cta(content.cta, 'section-btn section-btn-primary', ctx.locale)
  const image = render_image(content.image, {
    width: IMAGE_WIDTH,
    ratio,
    class_name: `section-media-image section-shape-${shape}`,
  })
  if (!title && !body && !cta && !image) return ''

  const dom_id = section_dom_id(section.id)
  const title_id = title && dom_id ? `${dom_id}-title` : null
  const heading = title
    ? `<h2${title_id ? ` id="${title_id}"` : ''} class="text-heading-2 font-bold wrap-anywhere">${escape_html(title)}</h2>`
    : ''
  const text = `<div class="section-tm-text">${heading}${body ? `<div class="section-md wrap-anywhere">${body}</div>` : ''}${
    cta ? `<div class="section-actions">${cta}</div>` : ''
  }</div>`
  const media = image ? `<div class="section-tm-media">${image}</div>` : ''
  // A sidebar is too narrow for the side-by-side grid of `section-tm-has-media`: the image stays above the text.
  const media_class = is_sidebar_container(ctx.container)
    ? 'section-tm-stacked'
    : `section-tm-has-media section-media-${image_side}`

  return render_section_shell({
    id: section.id,
    type: 'text-media',
    style,
    ctx,
    inner: `<div class="section-tm-body">${media}${text}</div>`,
    class_name: image ? media_class : 'section-tm-text-only',
    labelled_by: title_id,
  })
}
