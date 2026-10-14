// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createContext, createUniqueId, For, Show, useContext } from 'solid-js'
import { TriangleAlert } from 'lucide-solid'
import type { LinkKind } from '../../types/navigation'
import type { PageDef } from '../../types/settings'

export type PageRef = Pick<PageDef, 'slug' | 'title'>

export interface PageOption {
  value: string
  label: string
  disabled: boolean
}

export const NO_PAGES_LABEL = 'No pages yet'
export const CHOOSE_PAGE_LABEL = 'Choose a page'
export const PAGE_NOT_FOUND = 'Page not found'

export function is_missing_page(target: string, pages: readonly PageRef[] | undefined): boolean {
  return target !== '' && !(pages ?? []).some((page) => page.slug === target)
}

/** Select options: a missing target stays visible (so the select shows the real value), empty target gets a placeholder. */
export function page_link_options(target: string, pages: readonly PageRef[] | undefined): PageOption[] {
  const list = pages ?? []
  const options: PageOption[] = []
  if (is_missing_page(target, list)) {
    options.push({ value: target, label: `${target} (${PAGE_NOT_FOUND.toLowerCase()})`, disabled: true })
  } else if (target === '') {
    options.push({ value: '', label: list.length > 0 ? CHOOSE_PAGE_LABEL : NO_PAGES_LABEL, disabled: true })
  }
  for (const page of list) options.push({ value: page.slug, label: page.title, disabled: false })
  return options
}

/** Target after a kind change: switching to `page` keeps an existing slug, else empty ("Choose a page", blocks Save). */
export function target_for_kind(kind: LinkKind, target: string, pages: readonly PageRef[] | undefined): string {
  if (kind !== 'page') return target
  return (pages ?? []).some((page) => page.slug === target) ? target : ''
}

const CreatePageContext = createContext<(() => void) | undefined>()

/** Supplies the "Create a page" action (adds a page in the side panel and focuses it) to every PageLinkSelect below it. */
export const CreatePageProvider = CreatePageContext.Provider

export interface PageLinkSelectProps {
  id: string
  value: string
  pages: readonly PageRef[] | undefined
  on_change: (slug: string) => void
  on_blur?: () => void
  invalid?: boolean
  /** Ids of the caller's own messages (e.g. validation error). */
  described_by?: string
  class?: string
}

export function PageLinkSelect(props: PageLinkSelectProps) {
  const uid = createUniqueId()
  const warning_id = `page-link-missing-${uid}`
  const empty_id = `page-link-empty-${uid}`
  const create_page = useContext(CreatePageContext)
  const options = () => page_link_options(props.value, props.pages)
  const missing = () => is_missing_page(props.value, props.pages)
  const empty = () => (props.pages ?? []).length === 0
  const described_by = () =>
    [props.described_by, missing() ? warning_id : undefined, empty() ? empty_id : undefined]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <select
        id={props.id}
        value={props.value}
        aria-invalid={props.invalid || missing() ? true : undefined}
        aria-describedby={described_by()}
        onChange={(event) => props.on_change(event.currentTarget.value)}
        onBlur={() => props.on_blur?.()}
        class={`${props.class ?? ''} ${props.invalid || missing() ? 'border-error' : 'border-border'}`}
      >
        <For each={options()}>
          {(option) => (
            <option value={option.value} disabled={option.disabled} selected={option.value === props.value}>
              {option.label}
            </option>
          )}
        </For>
      </select>
      <Show when={missing()}>
        <p id={warning_id} class="flex items-center gap-1 text-xs text-warning">
          <TriangleAlert size={12} aria-hidden="true" />
          {PAGE_NOT_FOUND}: the link will block saving
        </p>
      </Show>
      <Show when={empty()}>
        <p id={empty_id} class="flex flex-wrap items-center gap-1 text-xs text-text-muted">
          {NO_PAGES_LABEL}.
          <Show when={create_page}>
            <button
              type="button"
              onClick={() => create_page?.()}
              class="rounded font-medium text-primary underline hover:no-underline focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
            >
              Create a page
            </button>
          </Show>
        </p>
      </Show>
    </div>
  )
}
