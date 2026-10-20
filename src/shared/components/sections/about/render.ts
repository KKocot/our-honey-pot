// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * About section - HTML string output for Astro (set:html) and SolidJS (innerHTML).
 * `side` + `align: center` renders stacked: a centered column cannot sit beside the photo.
 */

import { t } from '../../../../lib/i18n'
import { escape_html } from '../../../formatters/html'
import { render_section_markdown } from '../markdown'
import { SECTION_ALIGNS } from '../registry-types'
import type { SectionRenderContext } from '../types'
import { clean_text, pick_enum, render_image, render_section_shell, section_dom_id } from '../utils'
import {
  ABOUT_IMAGE_SHAPES,
  ABOUT_LAYOUTS,
  ABOUT_STYLE_DEFAULTS,
  ABOUT_TEXT_LIMITS,
  type AboutSection,
} from './definition'

const AVATAR_WIDTH = 160

function render_facts(facts: unknown, locale: unknown): string {
  if (!Array.isArray(facts)) return ''
  const items = facts
    .slice(0, ABOUT_TEXT_LIMITS.facts)
    .map((fact: { label?: unknown; value?: unknown } | null) => {
      const label = clean_text(fact?.label, ABOUT_TEXT_LIMITS.fact_label_chars)
      const value = clean_text(fact?.value, ABOUT_TEXT_LIMITS.fact_value_chars)
      if (!label || !value) return ''
      return `<div class="section-about-fact"><dt class="section-muted text-sm">${escape_html(label)}</dt><dd class="font-bold wrap-anywhere">${escape_html(value)}</dd></div>`
    })
    .join('')
  if (!items) return ''
  return `<h3 class="sr-only">${escape_html(t(locale, 'section.about.facts_label'))}</h3><dl class="section-about-facts">${items}</dl>`
}

export function render_about(section: AboutSection, ctx: SectionRenderContext): string {
  const content = section.content ?? {}
  const style = section.style
  const heading = clean_text(content.heading, ABOUT_TEXT_LIMITS.heading_chars)
  const body = render_section_markdown(content.body_md, ctx.locale)
  if (!heading && !body) return ''

  const align = pick_enum(style?.align, SECTION_ALIGNS, ABOUT_STYLE_DEFAULTS.align)
  const picked_layout = pick_enum(style?.layout, ABOUT_LAYOUTS, ABOUT_STYLE_DEFAULTS.layout)
  const layout = align === 'center' ? 'stacked' : picked_layout
  const shape = pick_enum(style?.image_shape, ABOUT_IMAGE_SHAPES, ABOUT_STYLE_DEFAULTS.image_shape)

  const avatar = render_image(content.avatar, {
    width: AVATAR_WIDTH,
    ratio: [1, 1],
    class_name: `section-media-image section-shape-${shape} section-about-avatar`,
  })
  const dom_id = section_dom_id(section.id)
  const title_id = heading && dom_id ? `${dom_id}-title` : null
  const heading_html = heading
    ? `<h2${title_id ? ` id="${title_id}"` : ''} class="text-heading-2 font-bold wrap-anywhere">${escape_html(heading)}</h2>`
    : ''
  const body_html = body ? `<div class="section-md wrap-anywhere">${body}</div>` : ''
  const media = avatar ? `<div class="section-about-media">${avatar}</div>` : ''
  const text = `<div class="section-about-text">${heading_html}${body_html}${render_facts(content.facts, ctx.locale)}</div>`

  return render_section_shell({
    id: section.id,
    type: 'about',
    style,
    ctx,
    inner: `<div class="section-about-body">${media}${text}</div>`,
    class_name: `section-about-${layout} section-align-${align}`,
    labelled_by: title_id,
  })
}
