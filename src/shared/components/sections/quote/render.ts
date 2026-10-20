// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Pull quote - figure > blockquote + figcaption > cite. Static HTML only (CSP, ADR 6ac4a46763221e857a3b96fd);
 * the same output feeds the /admin canvas (ADR 6ac6089d63221e857a3bac13).
 */

import { safe_link_url } from '../../../../lib/image-ref'
import { escape_html, escape_html_attr } from '../../../formatters/html'
import type { SectionValueOf } from '../registry-types'
import type { SectionRenderContext } from '../types'
import { clean_text, pick_enum, render_anchor, render_section_shell } from '../utils'
import { QUOTE_STYLE_DEFAULTS, QUOTE_TEXT_LIMITS, QUOTE_VARIANTS, type quote_definition } from './definition'

export type QuoteSection = SectionValueOf<typeof quote_definition>

function render_caption(cite: string, href: string | null, ctx: SectionRenderContext): string {
  // No i18n key for a "Source" label yet: a bare source link is labelled with its host name.
  const label = cite || (href ? new URL(href).hostname : '')
  if (!label) return ''
  const cite_html = `<cite>${escape_html(label)}</cite>`
  const body = href ? render_anchor(href, cite_html, 'section-link', ctx.locale) : cite_html
  return `<figcaption class="section-quote-cite section-muted text-sm wrap-anywhere">${body}</figcaption>`
}

export function render_quote(section: QuoteSection, ctx: SectionRenderContext): string {
  const content = section.content ?? {}
  const text = clean_text(content.text, QUOTE_TEXT_LIMITS.text_chars)
  if (!text) return ''

  const variant = pick_enum(section.style?.variant, QUOTE_VARIANTS, QUOTE_STYLE_DEFAULTS.variant)
  const cite = clean_text(content.cite, QUOTE_TEXT_LIMITS.cite_chars)
  const href = safe_link_url(content.source_url)
  const cite_attr = href ? ` cite="${escape_html_attr(href)}"` : ''

  const inner = `<figure class="section-quote-figure">
    <blockquote class="section-quote-text text-heading-3 page-md:text-heading-2 whitespace-pre-line wrap-anywhere"${cite_attr}><p>${escape_html(text)}</p></blockquote>${render_caption(cite, href, ctx)}
  </figure>`

  return render_section_shell({
    id: section.id,
    type: 'quote',
    style: section.style,
    ctx,
    inner,
    class_name: `section-quote-${variant}`,
  })
}
