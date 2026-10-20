// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createEffect, createSignal, createUniqueId, For, on, onMount, Show } from 'solid-js'
import { ArrowDown, ArrowUp, Plus, TriangleAlert, X } from 'lucide-solid'
import { settings, updateSettings } from '../../queries'
import { createLocalInput } from '../../hooks'
import { pageElementLabels } from '../../types/layout'
import {
  LINK_KINDS,
  LINK_LABEL_MAX_CHARS,
  type Cta,
  type Link,
  type LinkKind,
  type NavigationTab,
} from '../../types/navigation'
import { NAV_MAX_LINKS, type NavSettings } from '../../types/settings'
import { CtaSchema, LinkSchema } from '../../types/settings-schema'
import { PopoverShell, slot_label, type PopoverMoveControls } from './PopoverShell'
import { CreatePageProvider, PageLinkSelect, target_for_kind } from './PageLinkSelect'
import { changed_label, edited_label, use_field_edit } from './field-edit'

export interface NavigationPopoverProps {
  section_id: string
  element_id: string
  slot: string
  anchor: HTMLElement | undefined
  on_close: () => void
  move?: PopoverMoveControls
  /** Adds a page in the side panel Pages editor; enables "Create a page" in page links. */
  on_create_page?: () => void
}

const BUILT_IN_TAB_IDS: ReadonlySet<string> = new Set(['posts', 'threads', 'comments'])

const THREADS_HINT =
  'Create a post titled "My Threads" on your profile and write comments under it. They will be shown as threads (short posts with full content).'

const ICON_BUTTON =
  'inline-flex size-6 items-center justify-center rounded text-text-muted hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-30 max-md:size-11'

const TEXT_INPUT =
  'min-w-0 rounded border bg-bg px-2 py-1 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary'

function update_tab(tab_id: string, updates: Partial<NavigationTab>) {
  updateSettings({
    navigationTabs: settings.navigationTabs.map((tab) => (tab.id === tab_id ? { ...tab, ...updates } : tab)),
  })
}

function swap_tabs(index: number, other: number) {
  const tabs = [...settings.navigationTabs]
  if (index < 0 || other < 0 || index >= tabs.length || other >= tabs.length) return
  ;[tabs[index], tabs[other]] = [tabs[other], tabs[index]]
  updateSettings({ navigationTabs: tabs })
}

function add_category_tab(): string {
  const tab: NavigationTab = {
    id: `category-${(crypto.randomUUID?.() ?? Date.now().toString()).slice(0, 8)}`,
    label: 'Category',
    enabled: true,
    showCount: false,
    tag: '',
  }
  updateSettings({ navigationTabs: [...settings.navigationTabs, tab] })
  return tab.id
}

function remove_tab(tab_id: string) {
  if (BUILT_IN_TAB_IDS.has(tab_id)) return
  updateSettings({ navigationTabs: settings.navigationTabs.filter((tab) => tab.id !== tab_id) })
}

interface TabRowProps {
  tab: NavigationTab
  index: number
  total: number
  autofocus: boolean
  on_remove: (tab_id: string) => void
}

function TabRow(props: TabRowProps) {
  const row_id = createUniqueId()
  const label_id = `nav-tab-label-${row_id}`
  const tag_id = `nav-tab-tag-${row_id}`
  const tag_warning_id = `nav-tab-tag-warning-${row_id}`
  const is_built_in = () => BUILT_IN_TAB_IDS.has(props.tab.id)
  let label_input: HTMLInputElement | undefined
  const field_edit = use_field_edit()
  const edit_tab = (field: string, label: string, updates: Partial<NavigationTab>) =>
    field_edit({ key: `nav:tab:${props.tab.id}.${field}`, label }, () => update_tab(props.tab.id, updates))
  const move_tab = (other: number) => field_edit({ label: 'Moved navigation tab' }, () => swap_tabs(props.index, other))

  const [local_label, set_local_label, commit_label] = createLocalInput(
    () => props.tab.label,
    (value) => {
      if (!is_built_in() && !value.trim()) return false
      edit_tab('label', edited_label('navigation tab', 'label'), { label: value })
    }
  )
  const [local_tag, set_local_tag, commit_tag] = createLocalInput(
    () => props.tab.tag ?? '',
    (value) => {
      if (!is_built_in() && !value.trim()) return false
      edit_tab('tag', edited_label('navigation tab', 'tag'), { tag: value })
    }
  )

  onMount(() => {
    if (props.autofocus) label_input?.select()
  })

  return (
    <li class="flex flex-col gap-1.5 rounded-lg border border-border bg-bg p-2">
      <div class="flex items-center gap-2">
        <div class="flex flex-col">
          <button
            type="button"
            class={ICON_BUTTON}
            aria-label={`Move "${props.tab.label}" up`}
            disabled={props.index === 0}
            onClick={() => move_tab(props.index - 1)}
          >
            <ArrowUp size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            class={ICON_BUTTON}
            aria-label={`Move "${props.tab.label}" down`}
            disabled={props.index === props.total - 1}
            onClick={() => move_tab(props.index + 1)}
          >
            <ArrowDown size={12} aria-hidden="true" />
          </button>
        </div>
        <input
          type="checkbox"
          checked={props.tab.enabled}
          aria-label={`Show tab "${props.tab.label}"`}
          onChange={(event) => {
            const enabled = event.currentTarget.checked
            field_edit({ label: changed_label('navigation tab', 'visibility') }, () =>
              update_tab(props.tab.id, { enabled })
            )
          }}
          class="size-4 cursor-pointer rounded border-border text-primary focus:ring-primary"
        />
        <Show
          when={!is_built_in()}
          fallback={
            <span
              class={`min-w-0 flex-1 truncate text-sm font-medium ${props.tab.enabled ? 'text-text' : 'text-text-muted'}`}
            >
              {props.tab.label}
            </span>
          }
        >
          <label for={label_id} class="sr-only">
            Tab label
          </label>
          <input
            ref={label_input}
            id={label_id}
            type="text"
            value={local_label()}
            placeholder="Tab label"
            onInput={(event) => set_local_label(event.currentTarget.value)}
            onBlur={commit_label}
            class={`flex-1 border-border ${TEXT_INPUT}`}
          />
          <button
            type="button"
            class={`${ICON_BUTTON} text-error hover:bg-error/10 hover:text-error`}
            aria-label={`Remove tab "${props.tab.label}"`}
            onClick={() => props.on_remove(props.tab.id)}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </Show>
      </div>
      <Show when={props.tab.id === 'threads'}>
        <p class="text-xs text-text-muted">{THREADS_HINT}</p>
      </Show>
      <Show when={!is_built_in()}>
        <div class="flex items-center gap-1.5">
          <label for={tag_id} class="text-xs text-text-muted">
            Tag or community #
          </label>
          <input
            id={tag_id}
            type="text"
            value={local_tag()}
            placeholder="e.g. hive-123456"
            aria-invalid={!local_tag()}
            aria-describedby={local_tag() ? undefined : tag_warning_id}
            onInput={(event) => set_local_tag(event.currentTarget.value)}
            onBlur={commit_tag}
            class={`flex-1 ${TEXT_INPUT} ${local_tag() ? 'border-border' : 'border-warning'}`}
          />
        </div>
        <Show when={!local_tag()}>
          <p id={tag_warning_id} class="flex items-center gap-1 text-xs text-warning">
            <TriangleAlert size={12} aria-hidden="true" />
            An empty tag matches no posts
          </p>
        </Show>
      </Show>
    </li>
  )
}

const KIND_LABELS: Record<LinkKind, string> = { page: 'Page', tag: 'Tag', url: 'URL' }

const TARGET_FIELD: Record<LinkKind, { label: string; placeholder: string; error: string }> = {
  page: { label: 'Page', placeholder: '', error: 'Choose a page' },
  tag: { label: 'Tag', placeholder: 'e.g. photography', error: 'Tag: a-z, 0-9 and hyphens, up to 24 characters' },
  url: { label: 'URL', placeholder: 'https://', error: 'Use an https://, mailto: or tel: link (max 256 bytes)' },
}

const LABEL_ERROR = `Label: 1-${LINK_LABEL_MAX_CHARS} characters`
const CTA_URL_ERROR = TARGET_FIELD.url.error

const FIELD_ERROR_TEXT = 'text-xs text-error'

function nav_settings(): NavSettings {
  return settings.nav ?? { links: [] }
}

function update_nav(updates: Partial<NavSettings>) {
  const next: NavSettings = { ...nav_settings(), ...updates }
  if (!next.cta) delete next.cta
  updateSettings({ nav: next })
}

interface FieldErrors {
  label?: string
  target?: string
}

function validate_link(draft: Link): { link?: Link; errors: FieldErrors } {
  const result = LinkSchema.safeParse(draft)
  if (result.success) return { link: result.data, errors: {} }
  const errors: FieldErrors = {}
  for (const issue of result.error.issues) {
    if (issue.path[0] === 'label') errors.label = LABEL_ERROR
    else errors.target = TARGET_FIELD[draft.kind]?.error ?? TARGET_FIELD.url.error
  }
  return { errors }
}

function validate_cta(draft: Cta): { cta?: Cta; errors: FieldErrors } {
  const result = CtaSchema.safeParse(draft)
  if (result.success) return { cta: result.data, errors: {} }
  const errors: FieldErrors = {}
  for (const issue of result.error.issues) {
    if (issue.path[0] === 'label') errors.label = LABEL_ERROR
    else errors.target = CTA_URL_ERROR
  }
  return { errors }
}

function swap_links(index: number, other: number) {
  const links = [...nav_settings().links]
  if (index < 0 || other < 0 || index >= links.length || other >= links.length) return
  ;[links[index], links[other]] = [links[other], links[index]]
  update_nav({ links })
}

interface LinkFieldsProps {
  label: string
  kind: LinkKind
  target: string
  errors: FieldErrors
  on_label: (value: string) => void
  on_kind: (value: LinkKind) => void
  on_target: (value: string) => void
  on_commit?: () => void
}

function LinkFields(props: LinkFieldsProps) {
  const id = createUniqueId()
  const label_id = `nav-link-label-${id}`
  const kind_id = `nav-link-kind-${id}`
  const target_id = `nav-link-target-${id}`
  const label_error_id = `nav-link-label-error-${id}`
  const target_error_id = `nav-link-target-error-${id}`
  const field = () => TARGET_FIELD[props.kind]

  return (
    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <div class="flex items-center gap-1.5">
        <label for={label_id} class="w-14 shrink-0 text-xs text-text-muted">
          Label
        </label>
        <input
          id={label_id}
          type="text"
          value={props.label}
          aria-invalid={props.errors.label ? true : undefined}
          aria-describedby={props.errors.label ? label_error_id : undefined}
          onInput={(event) => props.on_label(event.currentTarget.value)}
          onBlur={() => props.on_commit?.()}
          class={`flex-1 ${TEXT_INPUT} ${props.errors.label ? 'border-error' : 'border-border'}`}
        />
      </div>
      <Show when={props.errors.label}>
        <p id={label_error_id} class={FIELD_ERROR_TEXT}>
          {props.errors.label}
        </p>
      </Show>
      <div class="flex items-center gap-1.5">
        <label for={kind_id} class="w-14 shrink-0 text-xs text-text-muted">
          Link to
        </label>
        <select
          id={kind_id}
          value={props.kind}
          onChange={(event) => {
            const kind = event.currentTarget.value as LinkKind
            const target = target_for_kind(kind, props.target, settings.pages)
            props.on_kind(kind)
            if (target !== props.target) props.on_target(target)
            props.on_commit?.()
          }}
          class={`flex-1 border-border ${TEXT_INPUT}`}
        >
          <For each={LINK_KINDS}>{(kind) => <option value={kind}>{KIND_LABELS[kind]}</option>}</For>
        </select>
      </div>
      <div class={`flex gap-1.5 ${props.kind === 'page' ? 'items-start' : 'items-center'}`}>
        <label for={target_id} class={`w-14 shrink-0 text-xs text-text-muted ${props.kind === 'page' ? 'pt-1.5' : ''}`}>
          {field().label}
        </label>
        <Show
          when={props.kind === 'page'}
          fallback={
            <input
              id={target_id}
              type={props.kind === 'url' ? 'url' : 'text'}
              value={props.target}
              placeholder={field().placeholder}
              aria-invalid={props.errors.target ? true : undefined}
              aria-describedby={props.errors.target ? target_error_id : undefined}
              onInput={(event) => props.on_target(event.currentTarget.value)}
              onBlur={() => props.on_commit?.()}
              class={`flex-1 ${TEXT_INPUT} ${props.errors.target ? 'border-error' : 'border-border'}`}
            />
          }
        >
          <PageLinkSelect
            id={target_id}
            value={props.target}
            pages={settings.pages}
            invalid={Boolean(props.errors.target)}
            described_by={props.errors.target ? target_error_id : undefined}
            on_change={(slug) => {
              props.on_target(slug)
              props.on_commit?.()
            }}
            class={`w-full ${TEXT_INPUT}`}
          />
        </Show>
      </div>
      <Show when={props.errors.target}>
        <p id={target_error_id} class={FIELD_ERROR_TEXT}>
          {props.errors.target}
        </p>
      </Show>
    </div>
  )
}

interface LinkRowProps {
  link: Link
  index: number
  total: number
  on_remove: (index: number) => void
}

function LinkRow(props: LinkRowProps) {
  const [label, set_label] = createSignal(props.link.label)
  const [kind, set_kind] = createSignal<LinkKind>(props.link.kind)
  const [target, set_target] = createSignal(props.link.target)
  const [errors, set_errors] = createSignal<FieldErrors>({})
  const field_edit = use_field_edit()

  createEffect(
    on(
      () => props.link,
      (link) => {
        set_label(link.label)
        set_kind(link.kind)
        set_target(link.target)
        set_errors({})
      },
      { defer: true }
    )
  )

  const commit = () => {
    const draft: Link = { label: label(), kind: kind(), target: target() }
    const current = props.link
    if (draft.label === current.label && draft.kind === current.kind && draft.target === current.target) {
      set_errors({})
      return
    }
    const { link, errors: next_errors } = validate_link(draft)
    set_errors(next_errors)
    if (!link) return
    const links = [...nav_settings().links]
    links[props.index] = link
    field_edit({ label: edited_label('navigation', 'link') }, () => update_nav({ links }))
  }
  const move_link = (other: number) =>
    field_edit({ label: 'Moved navigation link' }, () => swap_links(props.index, other))

  return (
    <li class="flex items-start gap-2 rounded-lg border border-border bg-bg p-2">
      <div class="flex flex-col">
        <button
          type="button"
          class={ICON_BUTTON}
          aria-label={`Move link "${props.link.label}" up`}
          disabled={props.index === 0}
          onClick={() => move_link(props.index - 1)}
        >
          <ArrowUp size={12} aria-hidden="true" />
        </button>
        <button
          type="button"
          class={ICON_BUTTON}
          aria-label={`Move link "${props.link.label}" down`}
          disabled={props.index === props.total - 1}
          onClick={() => move_link(props.index + 1)}
        >
          <ArrowDown size={12} aria-hidden="true" />
        </button>
      </div>
      <LinkFields
        label={label()}
        kind={kind()}
        target={target()}
        errors={errors()}
        on_label={set_label}
        on_kind={set_kind}
        on_target={set_target}
        on_commit={commit}
      />
      <button
        type="button"
        class={`${ICON_BUTTON} text-error hover:bg-error/10 hover:text-error`}
        aria-label={`Remove link "${props.link.label}"`}
        onClick={() => props.on_remove(props.index)}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </li>
  )
}

function NewLinkForm(props: { on_done: () => void }) {
  const [label, set_label] = createSignal('')
  const [kind, set_kind] = createSignal<LinkKind>('page')
  const [target, set_target] = createSignal('')
  const [errors, set_errors] = createSignal<FieldErrors>({})
  const field_edit = use_field_edit()

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    const { link, errors: next_errors } = validate_link({ label: label(), kind: kind(), target: target() })
    set_errors(next_errors)
    if (!link) return
    const links = nav_settings().links
    if (links.length >= NAV_MAX_LINKS) return
    field_edit({ label: 'Added navigation link' }, () => update_nav({ links: [...links, link] }))
    props.on_done()
  }

  return (
    <form onSubmit={submit} class="flex flex-col gap-2 rounded-lg border border-primary/30 bg-bg p-2">
      <LinkFields
        label={label()}
        kind={kind()}
        target={target()}
        errors={errors()}
        on_label={set_label}
        on_kind={set_kind}
        on_target={set_target}
      />
      <div class="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => props.on_done()}
          class="rounded px-3 py-1 text-sm text-text-muted hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="rounded bg-primary px-3 py-1 text-sm font-medium text-primary-text hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary max-md:min-h-11"
        >
          Add
        </button>
      </div>
    </form>
  )
}

function CtaEditor() {
  const id = createUniqueId()
  const label_id = `nav-cta-label-${id}`
  const url_id = `nav-cta-url-${id}`
  const label_error_id = `nav-cta-label-error-${id}`
  const url_error_id = `nav-cta-url-error-${id}`
  const current = () => nav_settings().cta
  const [label, set_label] = createSignal(current()?.label ?? '')
  const [url, set_url] = createSignal(current()?.url ?? '')
  const [errors, set_errors] = createSignal<FieldErrors>({})
  const field_edit = use_field_edit()

  createEffect(
    on(
      current,
      (cta) => {
        set_label(cta?.label ?? '')
        set_url(cta?.url ?? '')
        set_errors({})
      },
      { defer: true }
    )
  )

  const commit = () => {
    const saved = current()
    if (saved && saved.label === label() && saved.url === url()) {
      set_errors({})
      return
    }
    if (!saved && !label().trim() && !url().trim()) {
      set_errors({})
      return
    }
    const { cta, errors: next_errors } = validate_cta({ label: label(), url: url() })
    set_errors(next_errors)
    if (cta) field_edit({ label: edited_label('navigation', 'call to action') }, () => update_nav({ cta }))
  }

  const remove = () => {
    field_edit({ label: 'Removed navigation call to action' }, () => update_nav({ cta: undefined }))
    set_label('')
    set_url('')
    set_errors({})
  }

  return (
    <div class="flex flex-col gap-1.5 rounded-lg border border-border bg-bg p-2">
      <div class="flex items-center gap-1.5">
        <label for={label_id} class="w-14 shrink-0 text-xs text-text-muted">
          Label
        </label>
        <input
          id={label_id}
          type="text"
          value={label()}
          placeholder="e.g. Contact me"
          aria-invalid={errors().label ? true : undefined}
          aria-describedby={errors().label ? label_error_id : undefined}
          onInput={(event) => set_label(event.currentTarget.value)}
          onBlur={commit}
          class={`flex-1 ${TEXT_INPUT} ${errors().label ? 'border-error' : 'border-border'}`}
        />
      </div>
      <Show when={errors().label}>
        <p id={label_error_id} class={FIELD_ERROR_TEXT}>
          {errors().label}
        </p>
      </Show>
      <div class="flex items-center gap-1.5">
        <label for={url_id} class="w-14 shrink-0 text-xs text-text-muted">
          URL
        </label>
        <input
          id={url_id}
          type="url"
          value={url()}
          placeholder="https://"
          aria-invalid={errors().target ? true : undefined}
          aria-describedby={errors().target ? url_error_id : undefined}
          onInput={(event) => set_url(event.currentTarget.value)}
          onBlur={commit}
          class={`flex-1 ${TEXT_INPUT} ${errors().target ? 'border-error' : 'border-border'}`}
        />
      </div>
      <Show when={errors().target}>
        <p id={url_error_id} class={FIELD_ERROR_TEXT}>
          {errors().target}
        </p>
      </Show>
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs text-text-muted">
          {current() ? 'Shown as a button at the end of the menu' : 'Fill both fields to show a button'}
        </p>
        <Show when={current()}>
          <button
            type="button"
            onClick={remove}
            class="rounded px-2 py-1 text-xs text-error hover:bg-error/10 focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
          >
            Remove button
          </button>
        </Show>
      </div>
    </div>
  )
}

function OwnerLinksSection() {
  const links_id = `navigation-popover-links-${createUniqueId()}`
  const cta_id = `navigation-popover-cta-${createUniqueId()}`
  const [adding, set_adding] = createSignal(false)
  const links = () => nav_settings().links
  const at_limit = () => links().length >= NAV_MAX_LINKS
  let add_link_button: HTMLButtonElement | undefined
  const field_edit = use_field_edit()

  const remove_link = (index: number) => {
    field_edit({ label: 'Removed navigation link' }, () =>
      update_nav({ links: links().filter((_, position) => position !== index) })
    )
    add_link_button?.focus({ preventScroll: true })
  }

  const close_form = () => {
    set_adding(false)
    add_link_button?.focus({ preventScroll: true })
  }

  return (
    <>
      <section aria-labelledby={links_id} class="flex flex-col gap-2">
        <div>
          <h3 id={links_id} class="text-xs font-semibold uppercase text-text-muted">
            Links
          </h3>
          <p class="text-xs text-text-muted">
            Shown after the tabs. {links().length} / {NAV_MAX_LINKS}
          </p>
        </div>
        <Show when={links().length > 0}>
          <ul class="flex flex-col gap-1.5" aria-label="Navigation links">
            <For each={links()}>
              {(link, index) => <LinkRow link={link} index={index()} total={links().length} on_remove={remove_link} />}
            </For>
          </ul>
        </Show>
        <Show
          when={adding()}
          fallback={
            <button
              ref={add_link_button}
              type="button"
              disabled={at_limit()}
              onClick={() => set_adding(true)}
              class="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/30 p-2 text-sm text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-11"
            >
              <Plus size={14} aria-hidden="true" />
              {at_limit() ? `Limit of ${NAV_MAX_LINKS} links reached` : 'Add link'}
            </button>
          }
        >
          <NewLinkForm on_done={close_form} />
        </Show>
      </section>
      <section aria-labelledby={cta_id} class="flex flex-col gap-2">
        <h3 id={cta_id} class="text-xs font-semibold uppercase text-text-muted">
          Call to action
        </h3>
        <CtaEditor />
      </section>
    </>
  )
}

export function NavigationPopover(props: NavigationPopoverProps) {
  const global_id = `navigation-popover-global-${createUniqueId()}`
  const visible_count = () => settings.navigationTabs.filter((tab) => tab.enabled).length
  const [added_tab_id, set_added_tab_id] = createSignal<string>()
  let add_button: HTMLButtonElement | undefined
  const field_edit = use_field_edit()

  const handle_remove = (tab_id: string) => {
    field_edit({ label: 'Removed navigation tab' }, () => remove_tab(tab_id))
    add_button?.focus({ preventScroll: true })
  }
  const handle_add = () => {
    let added: string | undefined
    field_edit({ label: 'Added navigation tab' }, () => {
      added = add_category_tab()
    })
    set_added_tab_id(added)
  }

  return (
    <PopoverShell
      open
      anchor={props.anchor}
      onClose={props.on_close}
      element_label={pageElementLabels[props.element_id] ?? props.element_id}
      slot_label={slot_label(props.slot)}
      move={props.move}
    >
      <section aria-labelledby={global_id} class="flex flex-col gap-2">
        <div>
          <h3 id={global_id} class="text-xs font-semibold uppercase text-text-muted">
            Global
          </h3>
          <p class="text-xs text-text-muted">Changes every instance</p>
        </div>
        <ul class="flex flex-col gap-1.5" aria-label="Navigation tabs">
          <For each={settings.navigationTabs}>
            {(tab, index) => (
              <TabRow
                tab={tab}
                index={index()}
                total={settings.navigationTabs.length}
                autofocus={tab.id === added_tab_id()}
                on_remove={handle_remove}
              />
            )}
          </For>
        </ul>
        <button
          ref={add_button}
          type="button"
          onClick={handle_add}
          class="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/30 p-2 text-sm text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
        >
          <Plus size={14} aria-hidden="true" />
          Add category tab
        </button>
        <p class="text-xs text-text-muted">Visible tabs: {visible_count()}</p>
      </section>
      <CreatePageProvider value={props.on_create_page}>
        <OwnerLinksSection />
      </CreatePageProvider>
    </PopoverShell>
  )
}
