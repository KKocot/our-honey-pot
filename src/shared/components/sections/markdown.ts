// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Minimal markdown for text-media bodies (spec 2.3): paragraphs, **bold**, *italic*, links, lists.
 * Isomorphic (SSR + canvas): output is serialized from an allowlist of markdown-it tokens, never from
 * markdown-it's HTML renderer, so raw HTML, headings, images and embeds cannot reach the page.
 */

import MarkdownIt from 'markdown-it'
import { SECTION_TEXT_LIMITS } from '../../../components/admin/types/settings'
import { safe_link_url } from '../../../lib/image-ref'
import { escape_html, escape_html_attr } from '../../formatters/html'
import { new_tab_hint } from './utils'

type Token = ReturnType<MarkdownIt['parse']>[number]

// Bounds parse work for configs that bypass the 1200 B schema limit (chain is untrusted).
const MAX_INPUT_CHARS = SECTION_TEXT_LIMITS.text_media_body_bytes * 4
const MAX_NESTING = 12

let parser: MarkdownIt | null = null

function get_parser(): MarkdownIt {
  if (parser) return parser
  parser = new MarkdownIt('zero', { html: false, linkify: false, typographer: false, breaks: true })
  // maxNesting is a runtime option missing from @types/markdown-it
  Object.assign(parser.options, { maxNesting: MAX_NESTING })
  return parser.enable(['list', 'emphasis', 'link', 'newline', 'escape', 'entity'])
}

function render_inline(children: Token[] | null, locale: unknown): string {
  if (!children) return ''
  const closing_links: Array<string | null> = []
  let html = ''
  for (const token of children) {
    switch (token.type) {
      case 'text':
        html += escape_html(token.content)
        break
      case 'softbreak':
      case 'hardbreak':
        html += '<br />'
        break
      case 'strong_open':
        html += '<strong>'
        break
      case 'strong_close':
        html += '</strong>'
        break
      case 'em_open':
        html += '<em>'
        break
      case 'em_close':
        html += '</em>'
        break
      case 'link_open': {
        const href = safe_link_url(token.attrGet('href'), { allow_contact: true })
        if (!href) {
          closing_links.push(null)
          break
        }
        const external = href.startsWith('https:')
        const target = external ? ' target="_blank" rel="noopener noreferrer"' : ''
        html += `<a href="${escape_html_attr(href)}"${target} class="section-link">`
        closing_links.push(`${external ? new_tab_hint(locale) : ''}</a>`)
        break
      }
      case 'link_close':
        html += closing_links.pop() ?? ''
        break
      default:
        html += escape_html(token.content)
    }
  }
  return html
}

function list_start(token: Token): string {
  const start = Number(token.attrGet('start'))
  return Number.isInteger(start) && start > 1 && start < 1_000_000 ? ` start="${start}"` : ''
}

/** Safe HTML for a text-media body; '' for empty input. */
export function render_section_markdown(source: unknown, locale?: unknown): string {
  if (typeof source !== 'string' || !source.trim()) return ''
  const input = Array.from(source).slice(0, MAX_INPUT_CHARS).join('')
  let html = ''
  for (const token of get_parser().parse(input, {})) {
    switch (token.type) {
      case 'paragraph_open':
        if (!token.hidden) html += '<p>'
        break
      case 'paragraph_close':
        if (!token.hidden) html += '</p>'
        break
      case 'bullet_list_open':
        html += '<ul>'
        break
      case 'bullet_list_close':
        html += '</ul>'
        break
      case 'ordered_list_open':
        html += `<ol${list_start(token)}>`
        break
      case 'ordered_list_close':
        html += '</ol>'
        break
      case 'list_item_open':
        html += '<li>'
        break
      case 'list_item_close':
        html += '</li>'
        break
      case 'inline':
        html += render_inline(token.children, locale)
        break
      default:
        if (token.content) html += `<p>${escape_html(token.content)}</p>`
    }
  }
  return html
}
