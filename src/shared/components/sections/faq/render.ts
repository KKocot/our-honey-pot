// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * FAQ - question rows on native <details>/<summary>, answers through the markdown allowlist
 * (ADR 6acfb92e63221e857a3c63f1). Zero JS (CSP, ADR 6ac4a46763221e857a3b96fd); the same output feeds
 * the /admin canvas (ADR 6ac6089d63221e857a3bac13).
 */

import { escape_html } from '../../../formatters/html'
import { render_section_markdown } from '../markdown'
import { SECTION_ALIGNS, is_record } from '../registry-types'
import type { SectionRenderContext } from '../types'
import { clean_text, pick_enum, render_section_shell } from '../utils'
import { FAQ_STYLE_DEFAULTS, FAQ_TEXT_LIMITS, type FaqSection } from './definition'

// lucide: chevron-down
const CHEVRON =
  '<svg class="section-faq-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>'

function render_item(raw: unknown, open: boolean, locale: unknown): string {
  if (!is_record(raw)) return ''
  const question = clean_text(raw.q, FAQ_TEXT_LIMITS.q_chars)
  // Clipping to a_bytes code points bounds parse work for configs that bypassed the byte limit.
  const answer = render_section_markdown(clean_text(raw.a, FAQ_TEXT_LIMITS.a_bytes), locale)
  // A question that opens nothing is a dead control.
  if (!question || !answer) return ''
  return `<details class="section-faq-item"${open ? ' open' : ''}>
      <summary class="section-faq-q"><span class="wrap-anywhere">${escape_html(question)}</span>${CHEVRON}</summary>
      <div class="section-faq-a section-md wrap-anywhere">${answer}</div>
    </details>`
}

export function render_faq(section: FaqSection, ctx: SectionRenderContext): string {
  const content = section.content ?? {}
  const raw_items: unknown[] = Array.isArray(content.items) ? content.items.slice(0, FAQ_TEXT_LIMITS.items) : []
  const open_first = content.open_first === true

  const rendered: string[] = []
  for (const raw of raw_items) {
    const html = render_item(raw, open_first && rendered.length === 0, ctx.locale)
    if (html) rendered.push(html)
  }
  if (rendered.length === 0) return ''

  const align = pick_enum(section.style?.align, SECTION_ALIGNS, FAQ_STYLE_DEFAULTS.align)
  return render_section_shell({
    id: section.id,
    type: 'faq',
    style: section.style,
    ctx,
    inner: `<div class="section-faq-list">${rendered.join('')}</div>`,
    class_name: `section-align-${align}`,
  })
}
