// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Markdown for text-media bodies (spec 2.3) and static pages (spec 3). Isomorphic (SSR + canvas):
 * output is serialized from an allowlist of markdown-it tokens, never from markdown-it's HTML renderer,
 * so raw HTML and embeds cannot reach the page. Each mode has its own parser; text-media stays minimal.
 */

import MarkdownIt from 'markdown-it'
import { PAGES_LIMITS, SECTION_TEXT_LIMITS } from '../../../components/admin/types/settings'
import { safe_link_url } from '../../../lib/image-ref'
import type { Locale } from '../../../lib/i18n'
import { escape_html, escape_html_attr } from '../../formatters/html'
import { new_tab_hint, render_image } from './utils'

type Token = ReturnType<MarkdownIt['parse']>[number]
type ParserMode = 'section' | 'page'

// Bounds parse work for configs that bypass the schema byte limits (chain is untrusted).
const SECTION_MAX_INPUT_CHARS = SECTION_TEXT_LIMITS.text_media_body_bytes * 4
const PAGE_MAX_INPUT_CHARS = PAGES_LIMITS.body_bytes * 4
const MAX_NESTING = 12
const PAGE_IMAGE_WIDTH = 720
const PAGE_IMAGE_RATIO = [16, 9] as const

const SECTION_RULES = ['list', 'emphasis', 'link', 'newline', 'escape', 'entity']
const PAGE_RULES = [...SECTION_RULES, 'heading', 'lheading', 'blockquote', 'table', 'image']

const parsers = new Map<ParserMode, MarkdownIt>()

function get_parser(mode: ParserMode): MarkdownIt {
  const cached = parsers.get(mode)
  if (cached) return cached
  const parser = new MarkdownIt('zero', { html: false, linkify: false, typographer: false, breaks: true })
  // maxNesting is a runtime option missing from @types/markdown-it
  Object.assign(parser.options, { maxNesting: MAX_NESTING })
  parser.enable(mode === 'page' ? PAGE_RULES : SECTION_RULES)
  parsers.set(mode, parser)
  return parser
}

function plain_text(children: Token[] | null): string {
  if (!children) return ''
  return children.map((child) => (child.children ? plain_text(child.children) : child.content)).join('')
}

/** Allowlisted image through the proxy; an off-allowlist image degrades to its escaped alt text. */
function render_page_image(token: Token): string {
  const alt = plain_text(token.children)
  const html = render_image(
    { url: token.attrGet('src') ?? '', alt },
    { width: PAGE_IMAGE_WIDTH, ratio: PAGE_IMAGE_RATIO, class_name: 'page-prose-img' }
  )
  return html || escape_html(alt)
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
      case 'image':
        html += render_page_image(token)
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

/** H1 is the page title, so body headings start at h2; h5/h6 collapse into h4. */
function heading_tag(token: Token): string {
  const level = Number(token.tag.slice(1))
  return `h${Number.isInteger(level) ? Math.min(4, Math.max(2, level)) : 2}`
}

const CELL_ALIGN: Readonly<Record<string, string>> = Object.freeze({
  'text-align:left': ' class="page-prose-align-start"',
  'text-align:center': ' class="page-prose-align-center"',
  'text-align:right': ' class="page-prose-align-end"',
})

function cell_open(token: Token): string {
  const tag = token.type === 'th_open' ? 'th' : 'td'
  return `<${tag}${CELL_ALIGN[token.attrGet('style') ?? ''] ?? ''}>`
}

const FIXED_TAGS: Readonly<Record<string, string>> = Object.freeze({
  bullet_list_open: '<ul>',
  bullet_list_close: '</ul>',
  ordered_list_close: '</ol>',
  list_item_open: '<li>',
  list_item_close: '</li>',
  blockquote_open: '<blockquote>',
  blockquote_close: '</blockquote>',
  table_open: '<div class="page-prose-table" tabindex="0"><table>',
  table_close: '</table></div>',
  thead_open: '<thead>',
  thead_close: '</thead>',
  tbody_open: '<tbody>',
  tbody_close: '</tbody>',
  tr_open: '<tr>',
  tr_close: '</tr>',
  th_close: '</th>',
  td_close: '</td>',
})

function render_tokens(tokens: Token[], locale: unknown): string {
  let html = ''
  for (const token of tokens) {
    const fixed = Object.hasOwn(FIXED_TAGS, token.type) ? FIXED_TAGS[token.type] : undefined
    if (fixed !== undefined) {
      html += fixed
      continue
    }
    switch (token.type) {
      case 'paragraph_open':
        if (!token.hidden) html += '<p>'
        break
      case 'paragraph_close':
        if (!token.hidden) html += '</p>'
        break
      case 'ordered_list_open':
        html += `<ol${list_start(token)}>`
        break
      case 'heading_open':
        html += `<${heading_tag(token)}>`
        break
      case 'heading_close':
        html += `</${heading_tag(token)}>`
        break
      case 'th_open':
      case 'td_open':
        html += cell_open(token)
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

function clip(source: string, max_chars: number): string {
  return Array.from(source).slice(0, max_chars).join('')
}

/** Safe HTML for a text-media body; '' for empty input. */
export function render_section_markdown(source: unknown, locale?: unknown): string {
  if (typeof source !== 'string' || !source.trim()) return ''
  return render_tokens(get_parser('section').parse(clip(source, SECTION_MAX_INPUT_CHARS), {}), locale)
}

/** Safe HTML for a static page body (spec 3) wrapped in `.page-prose`; shared by /p/<slug> and the canvas preview. */
export function render_page_markdown(source: string, locale?: Locale): string {
  if (typeof source !== 'string' || !source.trim()) return ''
  const html = render_tokens(get_parser('page').parse(clip(source, PAGE_MAX_INPUT_CHARS), {}), locale)
  return html ? `<div class="page-prose">${html}</div>` : ''
}
