// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Navigation render functions - HTML output for both Astro and SolidJS
 */

import type { NavigationItem, NavigationSettings, OwnerNavItem } from './types'
import { buildNavigationItems, buildOwnerNavItems, createOwnerNavConfig, type NavSourceSettings } from './utils'
import { escape_html } from '../../formatters'
import { safe_url } from '../../utils/url_helpers'
import { t } from '../../../lib/i18n'

const DEFAULT_MENU_ID = 'site-nav-menu'

const OWNER_LINK_CLASSES = 'relative block px-4 py-3 text-sm font-medium transition-colors hover:bg-bg-card/50'

const MENU_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'

function external_attrs(item: OwnerNavItem): string {
  return item.external ? ' target="_blank" rel="noopener noreferrer"' : ''
}

/** Owner link; hrefs come only from resolveOwnerLink/resolveCta (validated), still escaped here. */
export function renderOwnerLink(item: OwnerNavItem, activeTab: string, activePage?: string): string {
  const is_active =
    (item.tabId !== undefined && item.tabId === activeTab) ||
    (item.pageSlug !== undefined && item.pageSlug === activePage)
  const tab_attr = item.tabId ? ` data-tab="${escape_html(item.tabId)}"` : ''
  return `<a href="${escape_html(item.href)}" class="${OWNER_LINK_CLASSES} ${is_active ? 'text-text' : 'text-text-muted hover:text-text'}" data-nav-link${tab_attr}${is_active ? ' aria-current="page"' : ''}${external_attrs(item)}>${escape_html(item.label)}${is_active ? '<span class="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full"></span>' : ''}</a>`
}

export function renderNavCta(item: OwnerNavItem): string {
  return `<a href="${escape_html(item.href)}" class="inline-flex min-h-11 items-center whitespace-nowrap rounded-token bg-primary px-4 text-sm font-medium text-primary-text transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" data-nav-cta${external_attrs(item)}>${escape_html(item.label)}</a>`
}

/**
 * Owner links + CTA. Desktop (page-md+): inline links; below page-md the links move into a
 * <details> menu (no JS, CSP) and the CTA stays visible next to its toggle.
 */
export function renderOwnerNav(settings: NavigationSettings): string {
  const { links, cta } = buildOwnerNavItems(settings)
  if (links.length === 0 && !cta) return ''

  const menu_id = escape_html(settings.menuId || DEFAULT_MENU_ID)
  const items = (item: OwnerNavItem) => `<li>${renderOwnerLink(item, settings.activeTab, settings.activePage)}</li>`

  const desktop = links.length
    ? `<ul class="hidden page-md:flex flex-wrap items-center" data-nav-links>${links.map(items).join('')}</ul>`
    : ''

  const mobile = links.length
    ? `<details class="group relative page-md:hidden" data-nav-menu>
        <summary class="inline-flex size-11 cursor-pointer list-none items-center justify-center rounded-token text-text-muted transition-colors hover:bg-bg-card/50 hover:text-text focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden" aria-controls="${menu_id}">
          <span class="sr-only group-open:hidden">${escape_html(t(settings.locale, 'nav.menu_open'))}</span>
          <span class="sr-only hidden group-open:inline">${escape_html(t(settings.locale, 'nav.menu_close'))}</span>
          ${MENU_ICON}
        </summary>
        <ul id="${menu_id}" class="absolute right-0 top-full z-20 mt-1 flex min-w-48 flex-col rounded-token border border-border bg-bg-card py-1 shadow-lg">${links.map(items).join('')}</ul>
      </details>`
    : ''

  const actions =
    mobile || cta
      ? `<div class="ml-auto flex items-center gap-2 px-2 py-1.5">${mobile}${cta ? renderNavCta(cta) : ''}</div>`
      : ''

  return `${desktop}${actions}`
}

function wrap_with_owner_nav(items_html: string, owner_html: string): string {
  return `
    <nav class="border-b border-border">
      <div class="flex flex-wrap items-center">${items_html}${owner_html}</div>
    </nav>
  `
}

/** Place of a tab in the bar; owner links follow the tabs, so the last tab is not the row's :last-child. */
export type NavTabPlace = 'first' | 'middle' | 'last'

const TOOLTIP_SIZE = 'w-max max-w-[min(16rem,100cqw)]'

// Without a known place (standalone render) the tooltip falls back to the structural selectors.
const TOOLTIP_POSITION_BY_PLACE: Record<NavTabPlace | 'unknown', string> = {
  first: `left-0 ${TOOLTIP_SIZE}`,
  middle: `left-1/2 -translate-x-1/2 ${TOOLTIP_SIZE}`,
  last: `right-0 ${TOOLTIP_SIZE}`,
  unknown: `left-1/2 -translate-x-1/2 ${TOOLTIP_SIZE} [:first-child>&]:left-0 [:first-child>&]:translate-x-0 [:last-child>&]:left-auto [:last-child>&]:right-0 [:last-child>&]:translate-x-0`,
}

// Centred over the tab; the first and last tab anchor to their outer edge so the tooltip stays inside the bar.
function tooltip_position(place: NavTabPlace | undefined): string {
  return TOOLTIP_POSITION_BY_PLACE[place ?? 'unknown']
}

function tab_place(index: number, count: number): NavTabPlace {
  if (index === 0) return 'first'
  return index === count - 1 ? 'last' : 'middle'
}

/**
 * Render a single navigation item
 * Note: Count badges are disabled - navigation shows only labels
 */
export function renderNavigationItem(item: NavigationItem, isActive: boolean, place?: NavTabPlace): string {
  const baseClasses = 'relative px-4 py-3 text-sm font-medium transition-colors'
  const activeIndicator = isActive
    ? '<span class="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full"></span>'
    : ''

  const safe_id = escape_html(item.id)
  const safe_label = escape_html(item.label)
  const safe_tooltip = item.tooltip ? escape_html(item.tooltip) : ''

  // Disabled item (like Threads WIP)
  if (item.disabled) {
    return `
      <div
        class="${baseClasses} text-text-muted/50 cursor-not-allowed group"
        data-tab="${safe_id}"
        ${safe_tooltip ? `title="${safe_tooltip}"` : ''}
      >
        <span class="flex items-center gap-2">
          ${safe_label}
        </span>
        ${
          safe_tooltip
            ? `
          <span class="absolute bottom-full ${tooltip_position(place)} mb-2 px-2 py-1 text-xs text-center wrap-break-word bg-bg-card border border-border rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            ${safe_tooltip}
          </span>
        `
            : ''
        }
      </div>
    `
  }

  // Internal link
  const safe_href = escape_html(safe_url(item.href, { allow_relative: true }) ?? '#')
  return `
    <a
      href="${safe_href}"
      class="${baseClasses} hover:bg-bg-card/50 ${isActive ? 'text-text' : 'text-text-muted hover:text-text'}"
      data-tab="${safe_id}"
    >
      <span class="flex items-center gap-2">
        ${safe_label}
      </span>
      ${activeIndicator}
    </a>
  `
}

/**
 * Get navigation item class names
 */
export function getNavigationItemClasses(isActive: boolean): string {
  const baseClasses = 'relative px-4 py-3 text-sm font-medium transition-colors'
  return `${baseClasses} ${isActive ? 'text-text' : 'text-text-muted hover:text-text'}`
}

/**
 * Render full navigation bar
 */
export function renderNavigation(settings: NavigationSettings): string {
  const items = buildNavigationItems(settings)

  const itemsHtml = items
    .map((item, index) => renderNavigationItem(item, item.id === settings.activeTab, tab_place(index, items.length)))
    .join('')
  const ownerHtml = renderOwnerNav(settings)
  if (ownerHtml) return wrap_with_owner_nav(itemsHtml, ownerHtml)

  return `
    <nav class="border-b border-border">
      <div class="flex flex-wrap">
        ${itemsHtml}
      </div>
    </nav>
  `
}

/**
 * Render navigation items only (for preview with custom wrapper)
 */
export function renderNavigationItems(settings: NavigationSettings): string {
  const items = buildNavigationItems(settings)

  return items
    .map((item, index) => renderNavigationItem(item, item.id === settings.activeTab, tab_place(index, items.length)))
    .join('')
}

/**
 * Render a single navigation button (for client-side SolidJS usage)
 * Buttons have data-tab attribute for event delegation
 */
export function renderNavigationButton(item: NavigationItem, isActive: boolean, place?: NavTabPlace): string {
  const baseClasses = 'relative px-4 py-3 text-sm font-medium transition-colors hover:bg-bg-card/50'

  const safe_id = escape_html(item.id)
  const safe_label = escape_html(item.label)
  const safe_tooltip = item.tooltip ? escape_html(item.tooltip) : ''

  if (item.disabled) {
    return `
      <button type="button" disabled
        class="${baseClasses} text-text-muted/50 cursor-not-allowed group"
        data-tab="${safe_id}"
        ${safe_tooltip ? `title="${safe_tooltip}"` : ''}
      >
        <span class="flex items-center gap-2">${safe_label}</span>
        ${safe_tooltip ? `<span class="absolute bottom-full ${tooltip_position(place)} mb-2 px-2 py-1 text-xs text-center wrap-break-word bg-bg-card border border-border rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">${safe_tooltip}</span>` : ''}
      </button>
    `
  }

  return `
    <button type="button"
      class="${baseClasses} ${isActive ? 'text-text' : 'text-text-muted hover:text-text'}"
      data-tab="${safe_id}"
    >
      <span class="flex items-center gap-2">${safe_label}</span>
      ${isActive ? '<span class="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full"></span>' : ''}
    </button>
  `
}

/**
 * Render navigation as buttons (for client-side SolidJS usage)
 * Buttons have data-tab attribute for event delegation
 * @returns Sanitized HTML string (uses escape_html for all user content)
 */
export function renderNavigationButtons(settings: NavigationSettings): string {
  const items = buildNavigationItems(settings)
  const itemsHtml = items
    .map((item, index) => renderNavigationButton(item, item.id === settings.activeTab, tab_place(index, items.length)))
    .join('')
  const ownerHtml = renderOwnerNav(settings)
  if (ownerHtml) return wrap_with_owner_nav(itemsHtml, ownerHtml)

  return `
    <nav class="border-b border-border">
      <div class="flex flex-wrap">${itemsHtml}</div>
    </nav>
  `
}

/** Outer box of the site top bar; `page-container` makes it the `page` container of its page-* variants. */
export const SITE_TOPBAR_CLASS = 'page-container border-b border-border bg-bg-card/80 backdrop-blur-sm'

/** Row inside the top bar, aligned with the page content column. */
export const SITE_TOPBAR_ROW_CLASS = 'mx-auto flex min-h-14 max-w-content items-center gap-2 px-4 py-1'

export interface SiteTopbarData {
  site_name: string
  /** Owner links, in_nav pages and CTA; without any of them the bar shows only the site name. */
  nav?: NavSourceSettings
  /** Slug of the current static page (/p/[slug]); its link gets aria-current. */
  active_page?: string
}

/**
 * Site name link + owner nav of the top bar (community mode: the posts sort tabs stay in CommunityContent).
 * SSR (Layout.astro) and the canvas (EditorCanvas.tsx) both render it from here.
 */
export function renderSiteTopbar(data: SiteTopbarData): string {
  const brand = `<a href="/" class="mr-auto min-w-0 truncate font-semibold text-text transition-colors hover:text-primary" data-site-brand>${escape_html(data.site_name)}</a>`
  if (!data.nav) return brand
  const owner_html = renderOwnerNav({
    tabs: [],
    activeTab: '',
    activePage: data.active_page,
    postsCount: 0,
    commentsCount: 0,
    ...createOwnerNavConfig(data.nav),
  })
  if (!owner_html) return brand
  return `${brand}<nav class="flex min-w-0 items-center" aria-label="${escape_html(t(data.nav.locale, 'nav.site_label'))}" data-site-nav>${owner_html}</nav>`
}
