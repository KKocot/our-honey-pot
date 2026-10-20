// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * "Now" list (nownownow.com) - HTML string output for Astro (set:html) and SolidJS (innerHTML).
 * Plain text items, no markdown; the date is formatted in UTC so SSR and the canvas print the same string.
 */

import { format_date, t } from '../../../../lib/i18n'
import { escape_html, escape_html_attr } from '../../../formatters/html'
import { SECTION_ALIGNS, type SectionValueOf } from '../registry-types'
import type { SectionRenderContext } from '../types'
import { clean_text, pick_enum, render_section_shell, section_dom_id } from '../utils'
import { now_definition, parse_iso_date } from './definition'

export type NowSection = SectionValueOf<typeof now_definition>

const DATE_FORMAT: Intl.DateTimeFormatOptions = Object.freeze({ dateStyle: 'long', timeZone: 'UTC' })

function item_texts(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  const { items: max_items, item_chars } = now_definition.text_limits
  const texts: string[] = []
  for (const item of items) {
    if (texts.length >= max_items) break
    const text = clean_text((item as { text?: unknown } | null)?.text, item_chars)
    if (text) texts.push(text)
  }
  return texts
}

function render_updated(value: unknown, ctx: SectionRenderContext): string {
  const time = parse_iso_date(value)
  if (time === null) return ''
  const label = format_date(ctx.locale, time, DATE_FORMAT)
  if (!label) return ''
  return `<p class="section-now-updated section-muted text-sm">${escape_html(t(ctx.locale, 'section.now.updated'))} <time datetime="${escape_html_attr(String(value))}">${escape_html(label)}</time></p>`
}

export function render_now(section: NowSection, ctx: SectionRenderContext): string {
  const content = section.content ?? {}
  const texts = item_texts(content.items)
  if (texts.length === 0) return ''

  const align = pick_enum(section.style?.align, SECTION_ALIGNS, now_definition.style_defaults.align)
  const list = texts.map((text) => `<li class="section-now-item wrap-anywhere">${escape_html(text)}</li>`).join('')
  const dom_id = section_dom_id(section.id)
  const title_id = dom_id ? `${dom_id}-title` : null
  const title = `<h2${title_id ? ` id="${title_id}"` : ''} class="text-heading-2 font-bold">${escape_html(t(ctx.locale, 'section.now.title'))}</h2>`

  return render_section_shell({
    id: section.id,
    type: 'now',
    style: section.style,
    ctx,
    inner: `<div class="section-now-body"><header class="section-now-head">${title}${render_updated(content.updated_at, ctx)}</header><ul class="section-now-list" role="list">${list}</ul></div>`,
    class_name: `section-align-${align}`,
    labelled_by: title_id,
  })
}
