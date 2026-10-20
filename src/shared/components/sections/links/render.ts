// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Links section - HTML string output for Astro (set:html) and SolidJS (innerHTML), same markup in the
 * /admin canvas and on the blog (ADR 6ac6089d63221e857a3bac13). Every href passes `safe_link_url`.
 */

import { SECTION_ALIGNS } from '../registry-types'
import { t } from '../../../../lib/i18n'
import { safe_link_url } from '../../../../lib/image-ref'
import { escape_html, escape_html_attr } from '../../../formatters/html'
import type { SectionRenderContext } from '../types'
import { clean_text, pick_enum, render_anchor, render_section_shell } from '../utils'
import { LINKS_LAYOUTS, LINKS_STYLE_DEFAULTS, LINKS_TEXT_LIMITS, type LinksSection } from './definition'

const ICON_ATTRS =
  'class="section-links-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"'
const ICON_EXTERNAL = `<svg ${ICON_ATTRS}><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>`
const ICON_INTERNAL = `<svg ${ICON_ATTRS}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`

interface LinkItem {
  label?: unknown
  url?: unknown
  highlight?: unknown
}

function render_items(items: unknown, locale: SectionRenderContext['locale']): string[] {
  if (!Array.isArray(items)) return []
  const rendered: string[] = []
  let highlighted = 0
  for (const raw of items.slice(0, LINKS_TEXT_LIMITS.items) as LinkItem[]) {
    if (!raw || typeof raw !== 'object') continue
    const label = clean_text(raw.label, LINKS_TEXT_LIMITS.label_chars)
    const href = safe_link_url(raw.url, { allow_contact: true })
    if (!label || !href) continue
    const highlight = raw.highlight === true && highlighted < LINKS_TEXT_LIMITS.highlight
    if (highlight) highlighted += 1
    const icon = href.startsWith('https:') ? ICON_EXTERNAL : ICON_INTERNAL
    const class_name = highlight ? 'section-links-item section-links-item-highlight' : 'section-links-item'
    const label_html = `<span class="section-links-label wrap-anywhere">${escape_html(label)}</span>${icon}`
    rendered.push(`<li>${render_anchor(href, label_html, class_name, locale)}</li>`)
  }
  return rendered
}

export function render_links(section: LinksSection, ctx: SectionRenderContext): string {
  const content = section.content ?? {}
  const items = render_items(content.items, ctx.locale)
  if (items.length === 0) return ''

  const style = section.style
  const layout = pick_enum(style?.layout, LINKS_LAYOUTS, LINKS_STYLE_DEFAULTS.layout)
  const align = pick_enum(style?.align, SECTION_ALIGNS, LINKS_STYLE_DEFAULTS.align)
  const list = `<ul class="section-links-list" role="list" aria-label="${escape_html_attr(t(ctx.locale, 'section.links.label'))}">${items.join('')}</ul>`

  return render_section_shell({
    id: section.id,
    type: 'links',
    style,
    ctx,
    inner: `<div class="section-links-body">${list}</div>`,
    // `section-links-list` already names the <ul>, so the layout modifier carries a `layout-` infix.
    class_name: `section-links-layout-${layout} section-align-${align}`,
  })
}
