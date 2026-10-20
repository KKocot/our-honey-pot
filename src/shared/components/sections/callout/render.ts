// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Callout - tinted notice box with a tone rule, title, short text and an optional text link.
 * Static HTML only (CSP, ADR 6ac4a46763221e857a3b96fd); the same output feeds the /admin canvas (ADR 6ac6089d63221e857a3bac13).
 */

import { t } from '../../../../lib/i18n'
import { escape_html } from '../../../formatters/html'
import { SECTION_ALIGNS, type SectionValueOf } from '../registry-types'
import type { SectionRenderContext } from '../types'
import { clean_text, pick_enum, render_cta, render_section_shell, section_dom_id } from '../utils'
import {
  CALLOUT_DEFAULT_TONE,
  CALLOUT_STYLE_DEFAULTS,
  CALLOUT_TEXT_LIMITS,
  CALLOUT_TONES,
  type CalloutTone,
  type callout_definition,
} from './definition'

export type CalloutSection = SectionValueOf<typeof callout_definition>

const SVG_ATTRS =
  'class="section-callout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"'

// lucide: info, sparkles, triangle-alert - icon shape differs per tone, so tone is not conveyed by color alone
const TONE_ICONS: Readonly<Record<CalloutTone, string>> = {
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  accent:
    '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
  warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
}

export function render_callout(section: CalloutSection, ctx: SectionRenderContext): string {
  const content = section.content ?? {}
  const title = clean_text(content.title, CALLOUT_TEXT_LIMITS.title_chars)
  if (!title) return ''

  const tone = pick_enum(content.tone, CALLOUT_TONES, CALLOUT_DEFAULT_TONE)
  const align = pick_enum(section.style?.align, SECTION_ALIGNS, CALLOUT_STYLE_DEFAULTS.align)
  const body = clean_text(content.body, CALLOUT_TEXT_LIMITS.body_chars)
  const cta = render_cta(content.cta, 'section-link section-callout-cta', ctx.locale)

  const dom_id = section_dom_id(section.id)
  const title_id = dom_id ? `${dom_id}-title` : null
  const inner = `<div class="section-callout-box">
    <svg ${SVG_ATTRS}>${TONE_ICONS[tone]}</svg>
    <div class="section-callout-text">
      <h2${title_id ? ` id="${title_id}"` : ''} class="section-callout-title text-heading-4 font-bold wrap-anywhere"><span class="sr-only">${escape_html(t(ctx.locale, `section.callout.${tone}`))}: </span>${escape_html(title)}</h2>${
        body ? `<p class="whitespace-pre-line wrap-anywhere">${escape_html(body)}</p>` : ''
      }${cta ? `<div class="section-actions">${cta}</div>` : ''}
    </div>
  </div>`

  return render_section_shell({
    id: section.id,
    type: 'callout',
    style: section.style,
    ctx,
    inner,
    class_name: `section-callout-${tone} section-align-${align}`,
    labelled_by: title_id,
  })
}
