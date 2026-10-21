// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { ZodIssue } from 'zod'
import {
  FOOTER_LIMITS,
  NAV_MAX_LINKS,
  PAGES_LIMITS,
  type FooterSettings,
  type NavSettings,
  type PageDef,
  type SettingsData,
} from '../../types/settings'
import { PageDefSchema, PagesSchema } from '../../types/settings-schema'
import { PAGE_SLUG_LENGTH, type Link } from '../../types/navigation'
import { withPageNavLinks } from '../../../../shared/components/navigation/utils'
import { withPageFooterLinks } from '../../../../shared/components/footer/utils'

const utf8_encoder = new TextEncoder()
const COUNTER_WARN_RATIO = 0.9
const KIB = 1024

const PL_TRANSLITERATION: Readonly<Record<string, string>> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
}

const FIELD_LABELS: Readonly<Record<string, string>> = {
  slug: 'Slug',
  title: 'Title',
  description: 'Description',
  body_md: 'Content',
  in_nav: 'Navigation',
  in_footer: 'Footer',
  footer_column: 'Footer column',
}

export function utf8_bytes(value: string): number {
  return utf8_encoder.encode(value).length
}

export function page_body_bytes(page: Pick<PageDef, 'body_md'>): number {
  return utf8_bytes(page.body_md ?? '')
}

export function pages_body_bytes(pages: ReadonlyArray<Pick<PageDef, 'body_md'>>): number {
  return pages.reduce((sum, page) => sum + page_body_bytes(page), 0)
}

/** `9318` -> `9.1`, `14336` -> `14`: one decimal, none when whole. */
export function format_kib(bytes: number): string {
  const value = Math.round((bytes / KIB) * 10) / 10
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export type BudgetTone = 'normal' | 'warn' | 'limit'

export interface BudgetStatus {
  tone: BudgetTone
  /** `9.1 / 14 KiB` */
  label: string
  /** Text carrier of the tone (colour is never the only signal); empty while far from the limit. */
  message: string
}

export function budget_status(bytes: number, max: number): BudgetStatus {
  const label = `${format_kib(bytes)} / ${format_kib(max)} KiB`
  if (bytes > max) {
    return { tone: 'limit', label, message: `Over the limit by ${bytes - max} B. Shorten the text to save.` }
  }
  if (bytes === max) return { tone: 'limit', label, message: 'Limit reached.' }
  if (bytes >= max * COUNTER_WARN_RATIO) return { tone: 'warn', label, message: 'Close to the limit.' }
  return { tone: 'normal', label, message: '' }
}

/** URL slug from a title: Polish letters transliterated, other diacritics stripped, a-z0-9 joined by single hyphens. */
export function slugify_title(title: string): string {
  const ascii = Array.from(title.toLowerCase())
    .map((char) => PL_TRANSLITERATION[char] ?? char)
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  return ascii
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PAGE_SLUG_LENGTH.max)
    .replace(/-+$/g, '')
}

/** Slug problem shown live under the field, or null; schema rules plus uniqueness against the other pages. */
export function slug_issue(slug: string, other_slugs: readonly string[]): string | null {
  if (slug === '') return 'Add a slug.'
  const parsed = PageDefSchema.shape.slug.safeParse(slug)
  if (!parsed.success) return describe_slug_issue(parsed.error.issues[0])
  if (other_slugs.includes(slug)) return 'Another page already uses this slug.'
  return null
}

function describe_slug_issue(issue: ZodIssue | undefined): string {
  if (!issue || issue.code === 'too_small' || issue.code === 'too_big') {
    return `Slug must be ${PAGE_SLUG_LENGTH.min}-${PAGE_SLUG_LENGTH.max} characters.`
  }
  return issue.message.endsWith('.') ? issue.message : `${issue.message}.`
}

/**
 * Slug for a page whose title is `title`: unique against `other_slugs` and never reserved (suffix `-2`, `-3`...).
 * Empty when the title yields no usable slug.
 */
export function auto_slug(title: string, other_slugs: readonly string[]): string {
  const base = slugify_title(title)
  if (base.length < PAGE_SLUG_LENGTH.min) return ''
  for (let suffix = 1; suffix <= PAGES_LIMITS.max_pages + 1; suffix++) {
    const tail = suffix === 1 ? '' : `-${suffix}`
    const candidate = `${base.slice(0, PAGE_SLUG_LENGTH.max - tail.length).replace(/-+$/g, '')}${tail}`
    if (slug_issue(candidate, other_slugs) === null) return candidate
  }
  return ''
}

/** Retitling keeps the slug following the title until the user has edited the slug by hand. */
export function slug_after_retitle(
  page: Pick<PageDef, 'title' | 'slug'>,
  title: string,
  other_slugs: readonly string[]
): string {
  const follows_title = page.slug === '' || page.slug === auto_slug(page.title, other_slugs)
  return follows_title ? auto_slug(title, other_slugs) : page.slug
}

/** Empty page; Save stays blocked until it has a title and a slug. */
export function create_page(): PageDef {
  return { slug: '', title: '', body_md: '', in_nav: false, in_footer: 'none', footer_column: 0 }
}

export function move_page<T>(pages: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) return [...pages]
  const next = [...pages]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function page_label(page: Pick<PageDef, 'title'>, index: number): string {
  const title = page.title.trim()
  return title ? `"${title}" (page ${index + 1})` : `Untitled page (page ${index + 1})`
}

export interface PageSaveError {
  page_index: number
  message: string
}

export function largest_page_index(pages: readonly PageDef[]): number {
  return pages.reduce((best, page, index) => (page_body_bytes(page) > page_body_bytes(pages[best]) ? index : best), 0)
}

function describe_field_issue(field: string, issue: ZodIssue, page: PageDef): string {
  if (field === 'slug') return `Slug: ${describe_slug_issue(issue).replace(/\.$/, '')}`
  if (field === 'title' && page.title.trim() === '') return 'Title: add a title'
  return `${FIELD_LABELS[field] ?? field}: ${issue.message}`
}

/** Pages problems that block Save, by the same PagesSchema the save gate uses; one entry per page in list order, then budget. */
export function page_save_errors(settings: Pick<SettingsData, 'pages'>): PageSaveError[] {
  const pages = settings.pages ?? []
  if (pages.length === 0) return []
  const parsed = PagesSchema.safeParse(pages)
  if (parsed.success) return []

  const per_page = new Map<number, string[]>()
  const aggregate: PageSaveError[] = []
  for (const issue of parsed.error.issues) {
    const [index, field] = issue.path
    if (typeof index === 'number' && index < pages.length) {
      const text =
        typeof field === 'string'
          ? field === 'slug' && issue.message.startsWith('Duplicate')
            ? 'Slug: another page already uses this slug'
            : describe_field_issue(field, issue, pages[index])
          : issue.message
      per_page.set(index, [...(per_page.get(index) ?? []), text])
      continue
    }
    if (issue.code === 'too_big') {
      aggregate.push({
        page_index: Math.min(PAGES_LIMITS.max_pages, pages.length - 1),
        message: `Pages: at most ${PAGES_LIMITS.max_pages} pages, delete ${pages.length - PAGES_LIMITS.max_pages}`,
      })
      continue
    }
    aggregate.push({
      page_index: largest_page_index(pages),
      message: `Pages: content is ${format_kib(pages_body_bytes(pages))} KiB, limit is ${format_kib(PAGES_LIMITS.total_body_bytes)} KiB`,
    })
  }

  const page_errors = [...per_page.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, issues]) => ({
      page_index: index,
      message: `${page_label(pages[index], index)}: ${[...new Set(issues)].join(', ')}`,
    }))
  return [...page_errors, ...aggregate]
}

type LinkSettings = { nav?: Pick<NavSettings, 'links'>; footer?: FooterSettings }

function owner_links(settings: LinkSettings): Link[] {
  const footer = settings.footer
  return [
    ...(settings.nav?.links ?? []),
    ...(footer?.columns ?? []).flatMap((column) => column.links),
    ...(footer?.legal_links ?? []),
    ...(footer?.privacy ? [footer.privacy] : []),
  ]
}

/** Owner nav/footer links (not `in_nav`/`in_footer` ones) that point at the page `slug`. */
export function page_link_count(settings: LinkSettings, slug: string): number {
  if (slug === '') return 0
  return owner_links(settings).filter((link) => link.kind === 'page' && link.target === slug).length
}

/**
 * Nav/footer patch that points every page link at `from` to `to`, or removes those links when `to` is null.
 * Null when no link points at `from`.
 */
export function retarget_page_links(
  settings: Required<Pick<SettingsData, 'nav' | 'footer'>>,
  from: string,
  to: string | null
): Pick<SettingsData, 'nav' | 'footer'> | null {
  if (page_link_count(settings, from) === 0) return null
  const hits = (link: Link) => link.kind === 'page' && link.target === from
  const remap = (links: readonly Link[]): Link[] =>
    to === null
      ? links.filter((link) => !hits(link))
      : links.map((link) => (hits(link) ? { ...link, target: to } : link))
  const { privacy, ...footer } = settings.footer
  const next_privacy = privacy && hits(privacy) ? (to === null ? undefined : { ...privacy, target: to }) : privacy
  return {
    nav: { ...settings.nav, links: remap(settings.nav.links) },
    footer: {
      ...footer,
      columns: settings.footer.columns.map((column) => ({ ...column, links: remap(column.links) })),
      legal_links: remap(settings.footer.legal_links),
      ...(next_privacy ? { privacy: next_privacy } : {}),
    },
  }
}

export interface LinkSlotStatus {
  used: number
  max: number
  /** The page link is rendered (from its own placement or an owner link to it). */
  shown: boolean
}

/** Menu slots after `in_nav` pages are appended; the renderer drops pages past NAV_MAX_LINKS. */
export function page_nav_slot(settings: Pick<SettingsData, 'nav' | 'pages'>, slug: string): LinkSlotStatus {
  const links = withPageNavLinks(settings.nav?.links, settings.pages) ?? []
  return {
    used: links.length,
    max: NAV_MAX_LINKS,
    shown: links.some((link) => link.kind === 'page' && link.target === slug),
  }
}

/** Slots of the footer place the page is set to (bottom row or its column); null when it is not in the footer. */
export function page_footer_slot(
  settings: Pick<SettingsData, 'footer' | 'pages'>,
  page: Pick<PageDef, 'slug' | 'in_footer' | 'footer_column'>
): LinkSlotStatus | null {
  if (page.in_footer !== 'legal' && page.in_footer !== 'column') return null
  const footer = withPageFooterLinks(settings.footer, settings.pages) ?? settings.footer
  const shown = footer ? page_link_count({ footer }, page.slug) > 0 : false
  if (page.in_footer === 'legal') {
    return { used: footer?.legal_links?.length ?? 0, max: FOOTER_LIMITS.legal_links, shown }
  }
  return {
    used: footer?.columns?.[page.footer_column]?.links?.length ?? 0,
    max: FOOTER_LIMITS.links_per_column,
    shown,
  }
}

export interface PageLinkSaveError {
  area: 'navigation' | 'footer'
  message: string
}

/** Nav/footer page links without a target page; the save gate rejects them (cross-field rule). */
export function page_link_save_errors(settings: Pick<SettingsData, 'nav' | 'footer' | 'pages'>): PageLinkSaveError[] {
  const slugs = new Set((settings.pages ?? []).map((page) => page.slug))
  const errors: PageLinkSaveError[] = []
  const check = (area: PageLinkSaveError['area'], name: string, link: Link | undefined) => {
    if (!link || link.kind !== 'page' || slugs.has(link.target)) return
    const problem = link.target === '' ? 'choose a page' : `page "${link.target}" not found`
    errors.push({ area, message: `${name}: ${problem}` })
  }
  const label = (link: Link) => (link.label.trim() ? ` "${link.label.trim()}"` : '')
  for (const link of settings.nav?.links ?? []) check('navigation', `Menu link${label(link)}`, link)
  for (const column of settings.footer?.columns ?? []) {
    for (const link of column.links) check('footer', `Footer link${label(link)}`, link)
  }
  for (const link of settings.footer?.legal_links ?? []) check('footer', `Footer link${label(link)}`, link)
  check('footer', 'Privacy policy link', settings.footer?.privacy)
  return errors
}
