// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createEffect, createSignal, createUniqueId, For, Show, untrack, type JSX } from 'solid-js'
import { unwrap } from 'solid-js/store'
import { ArrowDown, ArrowUp, ExternalLink, Plus } from 'lucide-solid'
import { settings, updateSettings, updateSettingsImmediate } from '../../store'
import { flushPendingSettings } from '../../queries'
import { render_page_markdown } from '../../../../shared/components/sections'
import { char_count, counter_tone, type CounterTone } from '../SiteSettings'
import { PAGE_FOOTER_PLACEMENTS, PAGES_LIMITS, type PageDef, type SettingsData } from '../../types/settings'
import {
  auto_slug,
  budget_status,
  create_page,
  move_page,
  page_body_bytes,
  page_footer_slot,
  page_link_count,
  page_nav_slot,
  pages_body_bytes,
  retarget_page_links,
  slug_after_retitle,
  slug_issue,
  type BudgetTone,
  type LinkSlotStatus,
} from './page-model'

/** Open a page (Save issue list) or add a new one ("Create a page" in nav/footer links). */
export type PagesFocusRequest = { page_index: number } | { create: true }

export interface PagesSettingsProps {
  /** Consumed once via `on_focus_handled`. */
  focus_request?: () => PagesFocusRequest | null
  on_focus_handled?: () => void
  /** Records a structural edit (add, delete, move, placement) as its own undo step; without it the store is patched directly. */
  on_commit?: (patch: Partial<SettingsData>, label: string) => void
}

type PageFooterPlacement = (typeof PAGE_FOOTER_PLACEMENTS)[number]

const LABEL_CLASS = 'mb-1 block text-xs font-medium text-text'
const HINT_CLASS = 'text-xs text-text-muted'
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary aria-invalid:border-error max-md:min-h-11'
const SMALL_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-text transition-colors hover:bg-bg-secondary focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 max-md:min-h-11'
const ICON_BUTTON_CLASS =
  'inline-flex size-7 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-30 max-md:size-11'

const TONE_CLASS: Record<CounterTone | BudgetTone, string> = {
  normal: 'text-text-muted',
  warn: 'text-warning',
  limit: 'text-error',
}

const FOOTER_PLACEMENT_LABELS: Record<PageFooterPlacement, { label: string; hint: string }> = {
  none: { label: 'Not in footer', hint: 'The page is only reachable by its link.' },
  legal: { label: 'Bottom row', hint: 'Next to legal links such as Privacy.' },
  column: { label: 'Footer column', hint: 'Listed in one of the footer link columns.' },
}

function current_pages(): PageDef[] {
  return [...(unwrap(settings.pages) ?? [])]
}

function other_slugs(pages: readonly PageDef[], index: number): string[] {
  return pages.filter((_, i) => i !== index).map((page) => page.slug)
}

function scroll_behavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function Counter(props: { id: string; count: number; max: number }) {
  return (
    <span id={props.id} class={`text-xs tabular-nums ${TONE_CLASS[counter_tone(props.count, props.max)]}`}>
      {props.count}/{props.max}
    </span>
  )
}

function FieldHeader(props: { for: string; label: string; children?: JSX.Element }) {
  return (
    <div class="flex items-baseline justify-between gap-2">
      <label for={props.for} class={LABEL_CLASS}>
        {props.label}
      </label>
      {props.children}
    </div>
  )
}

function NavSlotStatus(props: { id: string; checked: boolean; has_title: boolean; slot: LinkSlotStatus }) {
  const hidden = () => props.checked && props.has_title && !props.slot.shown
  const full = () => !props.checked && props.slot.used >= props.slot.max
  return (
    <span id={props.id} class={`text-xs ${hidden() ? 'text-warning' : HINT_CLASS}`}>
      <span class="tabular-nums">
        Menu: {props.slot.used}/{props.slot.max} links.
      </span>
      <Show when={hidden()}>
        <span> The menu is full, so this page is not shown. Remove a menu link to make room.</span>
      </Show>
      <Show when={full()}>
        <span> The menu is full; this page would not be shown.</span>
      </Show>
    </span>
  )
}

function FooterSlotStatus(props: { id: string; placement: string; has_title: boolean; slot: LinkSlotStatus }) {
  const hidden = () => props.has_title && !props.slot.shown
  return (
    <p id={props.id} class={`text-xs ${hidden() ? 'text-warning' : HINT_CLASS}`}>
      <span class="tabular-nums">
        {props.placement}: {props.slot.used}/{props.slot.max} links.
      </span>
      <Show when={hidden()}>
        <span> It is full, so this page is not shown. Pick another place or remove a link there.</span>
      </Show>
    </p>
  )
}

/** Static pages editor (spec 3, 5.3); the preview uses the /p/<slug> renderer, so it matches the public page 1:1. */
export function PagesSettings(props: PagesSettingsProps) {
  const id = createUniqueId()
  const ids = {
    count: `pages-count-${id}`,
    budget: `pages-budget-${id}`,
    title: `page-title-${id}`,
    slug: `page-slug-${id}`,
    description: `page-description-${id}`,
    body: `page-body-${id}`,
    in_nav: `page-in-nav-${id}`,
    footer_column: `page-footer-column-${id}`,
    footer_slots: `page-footer-slots-${id}`,
  }
  const [selected, set_selected] = createSignal(0)
  const [previewing, set_previewing] = createSignal(false)
  const [confirming_delete, set_confirming_delete] = createSignal(false)
  let title_ref: HTMLInputElement | undefined
  let root_ref: HTMLDivElement | undefined
  let new_page_ref: HTMLButtonElement | undefined

  const pages = (): readonly PageDef[] => settings.pages ?? []
  const at_limit = () => pages().length >= PAGES_LIMITS.max_pages
  const selected_index = () => Math.min(selected(), Math.max(pages().length - 1, 0))
  const page = (): PageDef | undefined => pages()[selected_index()]
  const total = () => budget_status(pages_body_bytes(pages()), PAGES_LIMITS.total_body_bytes)
  const page_budget = () => budget_status(page_body_bytes(page() ?? { body_md: '' }), PAGES_LIMITS.body_bytes)
  const current_slug_issue = () => {
    const current = page()
    return current ? slug_issue(current.slug, other_slugs(pages(), selected_index())) : null
  }

  const linked_count = () => page_link_count(settings, page()?.slug ?? '')
  const nav_slot = () => page_nav_slot(settings, page()?.slug ?? '')
  const footer_slot = () => {
    const current = page()
    return current ? page_footer_slot(settings, current) : null
  }
  const has_title = () => (page()?.title.trim() ?? '') !== ''

  const select = (index: number) => {
    set_selected(index)
    set_confirming_delete(false)
  }

  /** Structural edits flush pending keystrokes first: `build` reads the store and a stale debounced write would undo it. */
  const commit = (build: () => Partial<SettingsData> | null, label: string) => {
    flushPendingSettings()
    const patch = build()
    if (!patch) return
    if (props.on_commit) props.on_commit(patch, label)
    else updateSettingsImmediate(patch)
  }

  /** Typing goes through the debounced store, so the history coalesces a run of keystrokes into one undo step. */
  const patch_page = (patch: Partial<PageDef>) => {
    const index = selected_index()
    const next = current_pages()
    if (!next[index]) return
    next[index] = { ...next[index], ...patch }
    updateSettings({ pages: next })
  }

  const commit_page = (patch: Partial<PageDef>, label: string) => {
    const index = selected_index()
    commit(() => {
      const next = current_pages()
      if (!next[index]) return null
      next[index] = { ...next[index], ...patch }
      return { pages: next }
    }, label)
  }

  /** A slug linked from the menu or footer stays put on retitling, so fixing a title typo never breaks a link. */
  const set_title = (title: string) => {
    const current = page()
    if (!current) return
    const slug =
      linked_count() > 0 ? current.slug : slug_after_retitle(current, title, other_slugs(pages(), selected_index()))
    patch_page({ title, slug })
  }

  /** Slug the menu/footer links point at during one edit of the slug field; links follow every usable value. */
  let links_slug: string | null = null

  const set_slug = (value: string) => {
    const current = page()
    if (!current) return
    const slug = value.toLowerCase().replace(/\s+/g, '-')
    const others = other_slugs(pages(), selected_index())
    const from = links_slug ?? current.slug
    const retarget = slug !== '' && slug !== from && !others.includes(slug) && !others.includes(from)
    if (!retarget) {
      patch_page({ slug })
      return
    }
    flushPendingSettings()
    const links = retarget_page_links(settings, from, slug)
    if (!links) {
      patch_page({ slug })
      return
    }
    links_slug = slug
    const next = current_pages()
    next[selected_index()] = { ...next[selected_index()], slug }
    updateSettings({ pages: next, ...links })
  }

  const add_page = (focus_options?: FocusOptions) => {
    if (at_limit()) return
    commit(() => ({ pages: [...current_pages(), create_page()] }), 'Added page')
    select(pages().length - 1)
    set_previewing(false)
    requestAnimationFrame(() => title_ref?.focus(focus_options))
  }

  createEffect(() => {
    const request = props.focus_request?.()
    if (request) untrack(() => handle_focus_request(request))
  })

  function handle_focus_request(request: PagesFocusRequest) {
    props.on_focus_handled?.()
    if ('create' in request && !at_limit()) {
      add_page({ preventScroll: true })
    } else if ('page_index' in request) {
      select(Math.min(request.page_index, Math.max(pages().length - 1, 0)))
      requestAnimationFrame(() => title_ref?.focus({ preventScroll: true }))
    } else {
      requestAnimationFrame(() => new_page_ref?.focus({ preventScroll: true }))
    }
    requestAnimationFrame(() => root_ref?.scrollIntoView({ block: 'start', behavior: scroll_behavior() }))
  }

  const delete_page = () => {
    const index = selected_index()
    commit(() => {
      const all = current_pages()
      const removed = all[index]
      if (!removed) return null
      const next = all.filter((_, i) => i !== index)
      const shared_slug = next.some((other) => other.slug === removed.slug)
      const links = shared_slug ? null : retarget_page_links(settings, removed.slug, null)
      return { pages: next.length > 0 ? next : undefined, ...links }
    }, 'Deleted page')
    select(Math.max(index - 1, 0))
    requestAnimationFrame(() => new_page_ref?.focus())
  }

  const move = (from: number, to: number) => {
    commit(() => ({ pages: move_page(current_pages(), from, to) }), 'Moved page')
    if (selected_index() === from) set_selected(to)
    else if (selected_index() === to) set_selected(from)
    // Rows are re-created after the move; keep keyboard focus on the moved page's button.
    const direction = to < from ? 'up' : 'down'
    requestAnimationFrame(() => {
      const target = root_ref?.querySelector<HTMLButtonElement>(`[data-page-move="${to}-${direction}"]`)
      const fallback = root_ref?.querySelector<HTMLButtonElement>(`[data-page-select="${to}"]`)
      ;(target && !target.disabled ? target : fallback)?.focus()
    })
  }

  return (
    <div ref={root_ref} class="flex scroll-mt-2 flex-col gap-3">
      <div class="flex items-center justify-between gap-2">
        <p id={ids.count} class={HINT_CLASS}>
          {pages().length}/{PAGES_LIMITS.max_pages} pages
          <Show when={at_limit()}>
            <span> (limit reached)</span>
          </Show>
        </p>
        <button
          ref={new_page_ref}
          type="button"
          onClick={() => add_page()}
          disabled={at_limit()}
          aria-describedby={ids.count}
          class={SMALL_BUTTON_CLASS}
        >
          <Plus size={14} aria-hidden="true" />
          New page
        </button>
      </div>

      <div id={ids.budget} aria-live="polite" class={`text-xs ${TONE_CLASS[total().tone]}`}>
        <span class="tabular-nums">Pages: {total().label}</span>
        <Show when={total().message}>
          <span> · {total().message}</span>
        </Show>
      </div>

      <Show
        when={pages().length > 0}
        fallback={<p class={HINT_CLASS}>No pages yet. Add an About or Privacy page with New page.</p>}
      >
        <ul class="flex flex-col gap-1" aria-label="Pages">
          <For each={pages()}>
            {(item, index) => (
              <li class="flex items-center gap-1">
                <button
                  type="button"
                  aria-current={index() === selected_index() ? 'true' : undefined}
                  data-page-select={index()}
                  onClick={() => select(index())}
                  class="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-sm text-text-muted hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-primary aria-[current=true]:bg-bg-secondary aria-[current=true]:font-medium aria-[current=true]:text-text max-md:min-h-11"
                >
                  {item.title.trim() || 'Untitled page'}
                </button>
                <button
                  type="button"
                  aria-label={`Move "${item.title.trim() || 'Untitled page'}" up`}
                  disabled={index() === 0}
                  data-page-move={`${index()}-up`}
                  onClick={() => move(index(), index() - 1)}
                  class={ICON_BUTTON_CLASS}
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Move "${item.title.trim() || 'Untitled page'}" down`}
                  disabled={index() === pages().length - 1}
                  data-page-move={`${index()}-down`}
                  onClick={() => move(index(), index() + 1)}
                  class={ICON_BUTTON_CLASS}
                >
                  <ArrowDown size={14} aria-hidden="true" />
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Show when={page()}>
        {(current) => (
          <div class="flex flex-col gap-3 border-t border-border/60 pt-3">
            <div>
              <FieldHeader for={ids.title} label="Title">
                <Counter
                  id={`${ids.title}-counter`}
                  count={char_count(current().title)}
                  max={PAGES_LIMITS.title_chars}
                />
              </FieldHeader>
              <input
                ref={title_ref}
                id={ids.title}
                type="text"
                value={current().title}
                placeholder="About me"
                aria-describedby={`${ids.title}-counter`}
                aria-invalid={
                  current().title.trim() === '' || char_count(current().title) > PAGES_LIMITS.title_chars
                    ? true
                    : undefined
                }
                onInput={(event) => set_title(event.currentTarget.value)}
                class={FIELD_CLASS}
              />
            </div>

            <div>
              <FieldHeader for={ids.slug} label="Slug" />
              <div class="flex items-center gap-1">
                <span class={HINT_CLASS} aria-hidden="true">
                  /p/
                </span>
                <input
                  id={ids.slug}
                  type="text"
                  value={current().slug}
                  placeholder={auto_slug(current().title, other_slugs(pages(), selected_index())) || 'about-me'}
                  autocapitalize="off"
                  spellcheck={false}
                  aria-describedby={`${ids.slug}-hint${linked_count() > 0 ? ` ${ids.slug}-links` : ''}`}
                  aria-invalid={current_slug_issue() ? true : undefined}
                  onInput={(event) => set_slug(event.currentTarget.value)}
                  onFocus={() => (links_slug = null)}
                  onBlur={() => (links_slug = null)}
                  class={`${FIELD_CLASS} font-mono`}
                />
              </div>
              <p
                id={`${ids.slug}-hint`}
                class={`mt-1 text-xs ${current_slug_issue() ? 'text-error' : 'text-text-muted'}`}
              >
                {current_slug_issue() ??
                  (linked_count() > 0
                    ? 'Lowercase letters, digits and hyphens.'
                    : 'Made from the title. Lowercase letters, digits and hyphens.')}
              </p>
              <Show when={linked_count() > 0}>
                <p id={`${ids.slug}-links`} class={`mt-1 ${HINT_CLASS}`}>
                  Used by {plural(linked_count(), 'menu or footer link')}. The slug no longer follows the title; editing
                  it updates those links.
                </p>
              </Show>
              <Show when={!current_slug_issue()}>
                <a
                  href={`/p/${current().slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  View page
                  <ExternalLink size={12} aria-hidden="true" />
                  <span class="sr-only">(opens in a new tab, shows the last saved version)</span>
                </a>
              </Show>
            </div>

            <div>
              <FieldHeader for={ids.description} label="Description">
                <Counter
                  id={`${ids.description}-counter`}
                  count={char_count(current().description ?? '')}
                  max={PAGES_LIMITS.description_chars}
                />
              </FieldHeader>
              <textarea
                id={ids.description}
                rows={2}
                value={current().description ?? ''}
                placeholder={settings.seo?.description || 'Shown in search results'}
                aria-describedby={`${ids.description}-counter ${ids.description}-hint`}
                aria-invalid={
                  char_count(current().description ?? '') > PAGES_LIMITS.description_chars ? true : undefined
                }
                onInput={(event) => {
                  const value = event.currentTarget.value
                  patch_page({ description: value === '' ? undefined : value })
                }}
                class={`${FIELD_CLASS} resize-y`}
              />
              <p id={`${ids.description}-hint`} class={`mt-1 ${HINT_CLASS}`}>
                Shown in search results. Empty uses the site search description.
              </p>
            </div>

            <div>
              <div class="mb-1 flex items-center justify-between gap-2">
                <label for={ids.body} class="text-xs font-medium text-text">
                  Content
                </label>
                <div class="flex rounded-md border border-border p-0.5" role="group" aria-label="Content view">
                  <button
                    type="button"
                    aria-pressed={!previewing()}
                    onClick={() => set_previewing(false)}
                    class="rounded px-2 py-0.5 text-xs text-text-muted aria-pressed:bg-bg-secondary aria-pressed:text-text focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    aria-pressed={previewing()}
                    onClick={() => set_previewing(true)}
                    class="rounded px-2 py-0.5 text-xs text-text-muted aria-pressed:bg-bg-secondary aria-pressed:text-text focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
                  >
                    Preview
                  </button>
                </div>
              </div>
              <Show
                when={previewing()}
                fallback={
                  <textarea
                    id={ids.body}
                    rows={18}
                    value={current().body_md}
                    placeholder={'## Heading\n\nWrite in Markdown: headings, lists, links, images, quotes and tables.'}
                    aria-describedby={`${ids.body}-counter ${ids.budget}`}
                    aria-invalid={page_body_bytes(current()) > PAGES_LIMITS.body_bytes ? true : undefined}
                    onInput={(event) => patch_page({ body_md: event.currentTarget.value })}
                    class={`${FIELD_CLASS} min-h-96 resize-y font-mono`}
                  />
                }
              >
                <div
                  id={ids.body}
                  tabIndex={0}
                  aria-label="Content preview"
                  class="min-h-96 overflow-auto rounded-lg border border-border bg-bg p-3 focus-visible:outline-2 focus-visible:outline-primary"
                  innerHTML={
                    render_page_markdown(current().body_md, settings.locale) ||
                    '<p class="text-sm text-text-muted">Nothing to preview yet.</p>'
                  }
                />
              </Show>
              <p id={`${ids.body}-counter`} class={`mt-1 text-xs ${TONE_CLASS[page_budget().tone]}`}>
                <span class="tabular-nums">This page: {page_budget().label}</span>
                <Show when={page_budget().message}>
                  <span> · {page_budget().message}</span>
                </Show>
              </p>
            </div>

            <div class="flex items-start gap-2">
              <input
                id={ids.in_nav}
                type="checkbox"
                checked={current().in_nav}
                aria-describedby={`${ids.in_nav}-hint ${ids.in_nav}-slots`}
                onChange={(event) =>
                  commit_page(
                    { in_nav: event.currentTarget.checked },
                    event.currentTarget.checked ? 'Added page to menu' : 'Removed page from menu'
                  )
                }
                class="mt-0.5 size-4 cursor-pointer rounded border-border text-primary focus:ring-primary"
              />
              <div class="flex flex-col">
                <label for={ids.in_nav} class="cursor-pointer text-sm text-text">
                  Show in navigation
                </label>
                <span id={`${ids.in_nav}-hint`} class={HINT_CLASS}>
                  Added at the end of the menu; counts toward its link limit.
                </span>
                <NavSlotStatus
                  id={`${ids.in_nav}-slots`}
                  checked={current().in_nav}
                  has_title={has_title()}
                  slot={nav_slot()}
                />
              </div>
            </div>

            <fieldset class="flex flex-col gap-1.5">
              <legend class={LABEL_CLASS}>Footer</legend>
              <For each={PAGE_FOOTER_PLACEMENTS}>
                {(placement) => {
                  const option_id = `${id}-footer-${placement}`
                  return (
                    <div class="flex items-start gap-2">
                      <input
                        id={option_id}
                        type="radio"
                        name={`page-footer-${id}`}
                        value={placement}
                        checked={current().in_footer === placement}
                        aria-describedby={`${option_id}-hint${current().in_footer === placement && footer_slot() ? ` ${ids.footer_slots}` : ''}`}
                        onChange={() => commit_page({ in_footer: placement }, 'Changed page footer placement')}
                        class="mt-0.5 size-4 cursor-pointer border-border text-primary focus:ring-primary"
                      />
                      <div class="flex flex-col">
                        <label for={option_id} class="cursor-pointer text-sm text-text">
                          {FOOTER_PLACEMENT_LABELS[placement].label}
                        </label>
                        <span id={`${option_id}-hint`} class={HINT_CLASS}>
                          {FOOTER_PLACEMENT_LABELS[placement].hint}
                        </span>
                      </div>
                    </div>
                  )
                }}
              </For>
              <Show when={current().in_footer === 'column'}>
                <div class="ml-6">
                  <label for={ids.footer_column} class={LABEL_CLASS}>
                    Column
                  </label>
                  <select
                    id={ids.footer_column}
                    value={String(current().footer_column)}
                    aria-describedby={ids.footer_slots}
                    onChange={(event) =>
                      commit_page({ footer_column: Number(event.currentTarget.value) }, 'Changed page footer column')
                    }
                    class={FIELD_CLASS}
                  >
                    <For each={Array.from({ length: PAGES_LIMITS.footer_columns }, (_, column) => column)}>
                      {(column) => <option value={String(column)}>Column {column + 1}</option>}
                    </For>
                  </select>
                </div>
              </Show>
              <Show when={footer_slot()}>
                {(slot) => (
                  <FooterSlotStatus
                    id={ids.footer_slots}
                    placement={current().in_footer === 'legal' ? 'Bottom row' : `Column ${current().footer_column + 1}`}
                    has_title={has_title()}
                    slot={slot()}
                  />
                )}
              </Show>
            </fieldset>

            <div class="border-t border-border/60 pt-3">
              <Show
                when={confirming_delete()}
                fallback={
                  <button
                    type="button"
                    onClick={() => set_confirming_delete(true)}
                    class={`${SMALL_BUTTON_CLASS} text-error`}
                  >
                    Delete page
                  </button>
                }
              >
                <div role="group" aria-labelledby={`${id}-delete-question`} class="flex flex-col gap-2">
                  <p id={`${id}-delete-question`} class="text-xs text-text">
                    Delete "{current().title.trim() || 'Untitled page'}" and its content?
                    <Show when={linked_count() > 0}>
                      {' '}
                      {plural(linked_count(), 'menu or footer link')} to it will be removed.
                    </Show>
                    <Show when={current().slug !== ''}> Links to /p/{current().slug} from elsewhere stop working.</Show>
                  </p>
                  <div class="flex gap-2">
                    <button
                      type="button"
                      onClick={delete_page}
                      ref={(element) => requestAnimationFrame(() => element.focus())}
                      class="inline-flex items-center rounded-md bg-error px-2 py-1 text-xs font-medium text-white hover:bg-error/90 focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
                    >
                      Delete
                    </button>
                    <button type="button" onClick={() => set_confirming_delete(false)} class={SMALL_BUTTON_CLASS}>
                      Cancel
                    </button>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
