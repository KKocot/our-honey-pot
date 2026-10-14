// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Call-to-action band (spec 2.5) - HTML string output for Astro (set:html) and SolidJS (innerHTML).
 * A link to an external newsletter provider: no iframe, form or inline script (CSP, ADR 6ac4a46763221e857a3b96fd).
 * `checkbox` consent locks the button through CSS :has(), so it works without JS.
 */

import {
  CTA_BAND_VARIANTS,
  CTA_CONSENT_MODES,
  SECTION_ALIGNS,
  SECTION_STYLE_DEFAULTS,
  SECTION_TEXT_LIMITS,
} from '../../../../components/admin/types/settings'
import { LINK_LABEL_MAX_CHARS } from '../../../../components/admin/types/navigation'
import { t } from '../../../../lib/i18n'
import { escape_html } from '../../../formatters/html'
import { footer_link_href } from '../../footer/render'
import type { CtaBandSection, SectionRenderContext } from '../types'
import { clean_text, pick_enum, render_anchor, render_cta, render_section_shell, section_dom_id } from '../utils'

function render_consent_notice(section: CtaBandSection, ctx: SectionRenderContext): string {
  const consent =
    clean_text(section.content.consent_text, SECTION_TEXT_LIMITS.cta_band_consent_chars) ||
    t(ctx.locale, 'cta.consent_default')
  const privacy = ctx.settings.footer?.privacy
  const href = privacy ? footer_link_href(privacy, ctx.settings.navigationTabs ?? []) : null
  const privacy_link = href
    ? ` ${render_anchor(href, escape_html(t(ctx.locale, 'cta.privacy_link')), 'section-link', ctx.locale)}`
    : ''
  return `<p class="section-consent-text section-muted text-sm wrap-anywhere">${escape_html(consent)}${privacy_link}</p>`
}

function render_locked_actions(section: CtaBandSection, button: string, ctx: SectionRenderContext): string {
  const label = escape_html(clean_text(section.content.button.label, LINK_LABEL_MAX_CHARS))
  const dom_id = section_dom_id(section.id)
  const required_id = dom_id ? `${dom_id}-consent-required` : null
  const described = required_id ? ` aria-describedby="${required_id}"` : ''
  return `<label class="section-consent-check text-sm">
      <input type="checkbox" class="section-consent-input"${described} />
      <span>${escape_html(t(ctx.locale, 'cta.consent_checkbox'))}</span>
    </label>
    <div class="section-actions">
      <span class="section-consent-unlocked">${button}</span>
      <span class="section-consent-locked section-btn section-btn-primary" role="link" aria-disabled="true"${described}>${label}</span>
    </div>
    <p${required_id ? ` id="${required_id}"` : ''} class="section-consent-locked section-muted text-sm">${escape_html(t(ctx.locale, 'section.consent_required'))}</p>`
}

function render_actions(section: CtaBandSection, ctx: SectionRenderContext): string {
  // spec 2.5: the band button accepts https only (no mailto:/tel:)
  const button = render_cta(section.content.button, 'section-btn section-btn-primary', ctx.locale, {})
  if (!button) return ''
  const mode = pick_enum(section.content.consent_mode, CTA_CONSENT_MODES, 'notice')
  const notice = render_consent_notice(section, ctx)
  if (mode === 'checkbox') {
    return `<div class="section-consent">${notice}${render_locked_actions(section, button, ctx)}</div>`
  }
  return `<div class="section-consent"><div class="section-actions">${button}</div>${notice}</div>`
}

export function render_cta_band(section: CtaBandSection, ctx: SectionRenderContext): string {
  const content = section.content ?? {}
  const title = clean_text(content.title, SECTION_TEXT_LIMITS.cta_band_title_chars)
  if (!title) return ''

  const defaults = SECTION_STYLE_DEFAULTS['cta-band']
  const style = section.style
  const variant = pick_enum(style?.variant, CTA_BAND_VARIANTS, defaults.variant)
  const align = pick_enum(style?.align, SECTION_ALIGNS, defaults.align)
  const body = clean_text(content.body, SECTION_TEXT_LIMITS.cta_band_body_chars)

  const dom_id = section_dom_id(section.id)
  const title_id = dom_id ? `${dom_id}-title` : null
  const text = `<div class="section-cta-text">
    <h2${title_id ? ` id="${title_id}"` : ''} class="text-heading-2 font-bold wrap-anywhere">${escape_html(title)}</h2>${
      body ? `<p class="section-muted whitespace-pre-line wrap-anywhere">${escape_html(body)}</p>` : ''
    }
  </div>`

  return render_section_shell({
    id: section.id,
    type: 'cta-band',
    style,
    ctx,
    inner: `<div class="section-cta-body">${text}${render_actions(section, ctx)}</div>`,
    class_name: `section-cta-${variant} section-align-${align}`,
    labelled_by: title_id,
  })
}
