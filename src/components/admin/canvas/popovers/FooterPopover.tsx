// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createEffect, createSignal, createUniqueId, For, Index, on, onMount, Show, type JSX } from 'solid-js'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-solid'
import { flushPendingSettings, settings, updateSettings } from '../../queries'
import { createLocalInput } from '../../hooks'
import { pageElementLabels } from '../../types/layout'
import { LINK_KINDS, LINK_LABEL_MAX_CHARS, type Link, type LinkKind } from '../../types/navigation'
import {
  FOOTER_LIMITS,
  FOOTER_VARIANTS,
  defaultSettings,
  type FooterColumn,
  type FooterSettings,
  type FooterVariant,
} from '../../types/settings'
import { LinkSchema } from '../../types/settings-schema'
import { PopoverShell, slot_label, type PopoverMoveControls } from './PopoverShell'
import { BackToSection } from './PostCardPopover'
import { CHOOSE_PAGE_LABEL, CreatePageProvider, PageLinkSelect, target_for_kind } from './PageLinkSelect'
import { changed_label, edited_label, use_field_edit, type EditedField } from './field-edit'

export interface FooterPopoverProps {
  section_id: string
  element_id: string
  slot: string
  anchor: HTMLElement | undefined
  on_close: () => void
  move?: PopoverMoveControls
  /** Adds a page in the side panel Pages editor; enables "Create a page" in page links. */
  on_create_page?: () => void
}

let privacy_focus_pending = false

/** Next FooterPopover mount focuses the privacy policy field (CTA band warning). */
export function request_privacy_focus(): void {
  privacy_focus_pending = true
}

export function cancel_privacy_focus(): void {
  privacy_focus_pending = false
}

function take_privacy_focus(): boolean {
  const pending = privacy_focus_pending
  privacy_focus_pending = false
  return pending
}

const PRIVACY_FOCUS_TARGET = 'input:not([disabled]), select:not([disabled]), button:not([disabled])'

/** Focus without page scroll (popover scroll fix); only the popover panel scrolls to the field. */
function focus_privacy_field(group: HTMLElement | undefined) {
  const target = group?.querySelector<HTMLElement>(PRIVACY_FOCUS_TARGET)
  if (!group || !target) return
  target.focus({ preventScroll: true })
  const panel = group.closest<HTMLElement>('[popover]')
  if (!panel) return
  const offset = group.getBoundingClientRect().top - panel.getBoundingClientRect().top
  panel.scrollTo({ top: panel.scrollTop + offset - 8 })
}

const FOOTER_TEXT_MAX_LENGTH = 500

const ICON_BUTTON =
  'inline-flex size-6 items-center justify-center rounded text-text-muted hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-30 max-md:size-11'

const REMOVE_BUTTON = `${ICON_BUTTON} text-error hover:bg-error/10 hover:text-error`

const TEXT_INPUT =
  'w-full min-w-0 rounded border border-border bg-bg px-2 py-1 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary aria-[invalid=true]:border-error'

const ADD_BUTTON =
  'flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/30 p-2 text-sm text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 max-md:min-h-11'

const SECTION_HEADING = 'text-xs font-semibold uppercase text-text-muted'

const VARIANT_LABELS: Record<FooterVariant, string> = {
  mast: 'Mast (name + columns)',
  inline: 'Inline (single row)',
}

const KIND_LABELS: Record<LinkKind, string> = {
  url: 'URL',
  tag: 'Tag',
  page: 'Page',
}

const TARGET_PLACEHOLDERS: Record<LinkKind, string> = {
  url: 'https://… or mailto:',
  tag: 'e.g. photography',
  page: '',
}

function current_footer(): FooterSettings {
  return settings.footer ?? defaultSettings.footer
}

function clone_link(link: Link): Link {
  return { label: link.label, kind: link.kind, target: link.target }
}

function clone_footer(footer: FooterSettings): FooterSettings {
  const next: FooterSettings = {
    variant: footer.variant,
    columns: footer.columns.map((column) => ({ title: column.title, links: column.links.map(clone_link) })),
    legal_links: footer.legal_links.map(clone_link),
    show_social: footer.show_social,
  }
  if (footer.copyright) next.copyright = footer.copyright
  if (footer.company) next.company = footer.company
  if (footer.privacy) next.privacy = clone_link(footer.privacy)
  return next
}

/** Reads after flushing pending edits so two quick mutations never overwrite each other. */
function mutate_footer(mutate: (footer: FooterSettings) => void) {
  flushPendingSettings()
  const next = clone_footer(current_footer())
  mutate(next)
  updateSettings({ footer: next })
}

type FooterEdit = (field: EditedField, mutate: (footer: FooterSettings) => void) => void

/** `mutate_footer` recorded as an undo step of `field`; keys get the `footer:` prefix. Call during component setup. */
function use_footer_edit(): FooterEdit {
  const field_edit = use_field_edit()
  return (field, mutate) =>
    field_edit({ ...field, key: field.key === undefined ? undefined : `footer:${field.key}` }, () =>
      mutate_footer(mutate)
    )
}

function swap<T>(items: T[], index: number, other: number): boolean {
  if (index < 0 || other < 0 || index >= items.length || other >= items.length) return false
  ;[items[index], items[other]] = [items[other], items[index]]
  return true
}

function code_points(value: string): number {
  return Array.from(value).length
}

function parse_link(draft: Link): Link | null {
  const result = LinkSchema.safeParse(draft)
  return result.success ? result.data : null
}

function link_error(draft: Link): string | null {
  if (!draft.label.trim()) return 'Label is required'
  if (code_points(draft.label.trim()) > LINK_LABEL_MAX_CHARS) return `Label max ${LINK_LABEL_MAX_CHARS} characters`
  if (parse_link(draft)) return null
  if (draft.kind === 'url') return 'Use https://, mailto: or tel:'
  if (draft.kind === 'tag') return 'Tag: lowercase letters, digits, hyphens (max 24)'
  return CHOOSE_PAGE_LABEL
}

function same_link(a: Link, b: Link): boolean {
  return a.label === b.label && a.kind === b.kind && a.target === b.target
}

const EMPTY_LINK: Link = { label: '', kind: 'url', target: '' }

interface LinkFieldsProps {
  draft: Link
  on_draft: (draft: Link) => void
  on_commit?: () => void
  show_error: boolean
  autofocus?: boolean
}

function LinkFields(props: LinkFieldsProps) {
  const id = createUniqueId()
  const error = () => (props.show_error ? link_error(props.draft) : null)
  const error_id = `footer-link-error-${id}`
  let label_input: HTMLInputElement | undefined

  createEffect(() => {
    if (props.autofocus) label_input?.focus({ preventScroll: true })
  })

  return (
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex gap-1">
        <label for={`footer-link-label-${id}`} class="sr-only">
          Link label
        </label>
        <input
          ref={label_input}
          id={`footer-link-label-${id}`}
          type="text"
          value={props.draft.label}
          placeholder="Label"
          maxlength={LINK_LABEL_MAX_CHARS}
          aria-invalid={Boolean(error())}
          aria-describedby={error() ? error_id : undefined}
          onInput={(event) => props.on_draft({ ...props.draft, label: event.currentTarget.value })}
          onBlur={() => props.on_commit?.()}
          class={TEXT_INPUT}
        />
        <label for={`footer-link-kind-${id}`} class="sr-only">
          Link type
        </label>
        <select
          id={`footer-link-kind-${id}`}
          value={props.draft.kind}
          onChange={(event) => {
            const kind = event.currentTarget.value as LinkKind
            props.on_draft({ ...props.draft, kind, target: target_for_kind(kind, props.draft.target, settings.pages) })
            props.on_commit?.()
          }}
          class="shrink-0 rounded border border-border bg-bg px-1 py-1 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <For each={LINK_KINDS}>{(kind) => <option value={kind}>{KIND_LABELS[kind]}</option>}</For>
        </select>
      </div>
      <label for={`footer-link-target-${id}`} class="sr-only">
        Link target
      </label>
      <Show
        when={props.draft.kind === 'page'}
        fallback={
          <input
            id={`footer-link-target-${id}`}
            type="text"
            value={props.draft.target}
            placeholder={TARGET_PLACEHOLDERS[props.draft.kind]}
            aria-invalid={Boolean(error())}
            aria-describedby={error() ? error_id : undefined}
            onInput={(event) => props.on_draft({ ...props.draft, target: event.currentTarget.value.trim() })}
            onBlur={() => props.on_commit?.()}
            class={TEXT_INPUT}
          />
        }
      >
        <PageLinkSelect
          id={`footer-link-target-${id}`}
          value={props.draft.target}
          pages={settings.pages}
          invalid={Boolean(error())}
          described_by={error() ? error_id : undefined}
          on_change={(slug) => {
            props.on_draft({ ...props.draft, target: slug })
            props.on_commit?.()
          }}
          class={TEXT_INPUT}
        />
      </Show>
      <Show when={error()}>
        <p id={error_id} class="text-xs text-error">
          {error()}
        </p>
      </Show>
    </div>
  )
}

interface LinkRowProps {
  link: Link
  index: number
  total: number
  on_change: (link: Link) => void
  on_move: (index: number, other: number) => void
  on_remove: (index: number) => void
}

function LinkRow(props: LinkRowProps) {
  const [draft, set_draft] = createSignal<Link>(clone_link(props.link))
  createEffect(
    on(
      () => props.link,
      (link) => set_draft(clone_link(link)),
      { defer: true }
    )
  )

  const commit = () => {
    const parsed = parse_link(draft())
    if (parsed && !same_link(parsed, props.link)) props.on_change(parsed)
  }

  return (
    <li class="flex items-start gap-1.5 rounded-lg border border-border bg-bg p-2">
      <div class="flex flex-col">
        <button
          type="button"
          class={ICON_BUTTON}
          aria-label={`Move "${props.link.label}" up`}
          disabled={props.index === 0}
          onClick={() => props.on_move(props.index, props.index - 1)}
        >
          <ArrowUp size={12} aria-hidden="true" />
        </button>
        <button
          type="button"
          class={ICON_BUTTON}
          aria-label={`Move "${props.link.label}" down`}
          disabled={props.index === props.total - 1}
          onClick={() => props.on_move(props.index, props.index + 1)}
        >
          <ArrowDown size={12} aria-hidden="true" />
        </button>
      </div>
      <LinkFields draft={draft()} on_draft={set_draft} on_commit={commit} show_error />
      <button
        type="button"
        class={REMOVE_BUTTON}
        aria-label={`Remove link "${props.link.label}"`}
        onClick={() => props.on_remove(props.index)}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </li>
  )
}

interface LinkListEditorProps {
  links: Link[]
  max: number
  list_label: string
  add_label: string
  on_change: (links: Link[]) => void
}

function LinkListEditor(props: LinkListEditorProps) {
  const [adding, set_adding] = createSignal(false)
  const [draft, set_draft] = createSignal<Link>({ ...EMPTY_LINK })
  const [touched, set_touched] = createSignal(false)
  let add_button: HTMLButtonElement | undefined

  const replace = (index: number, link: Link) =>
    props.on_change(props.links.map((item, i) => (i === index ? link : clone_link(item))))
  const move = (index: number, other: number) => {
    const next = props.links.map(clone_link)
    if (swap(next, index, other)) props.on_change(next)
  }
  const remove = (index: number) => {
    props.on_change(props.links.filter((_, i) => i !== index).map(clone_link))
    add_button?.focus({ preventScroll: true })
  }
  const cancel = () => {
    set_adding(false)
    set_touched(false)
    set_draft({ ...EMPTY_LINK })
  }
  const submit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = (event) => {
    event.preventDefault()
    set_touched(true)
    const parsed = parse_link(draft())
    if (!parsed || props.links.length >= props.max) return
    props.on_change([...props.links.map(clone_link), parsed])
    cancel()
  }

  return (
    <div class="flex flex-col gap-1.5">
      <Show when={props.links.length > 0}>
        <ul class="flex flex-col gap-1.5" aria-label={props.list_label}>
          <Index each={props.links}>
            {(link, index) => (
              <LinkRow
                link={link()}
                index={index}
                total={props.links.length}
                on_change={(next) => replace(index, next)}
                on_move={move}
                on_remove={remove}
              />
            )}
          </Index>
        </ul>
      </Show>
      <Show
        when={adding()}
        fallback={
          <button
            ref={add_button}
            type="button"
            disabled={props.links.length >= props.max}
            onClick={() => set_adding(true)}
            class={ADD_BUTTON}
          >
            <Plus size={14} aria-hidden="true" />
            {props.add_label} ({props.links.length}/{props.max})
          </button>
        }
      >
        <form onSubmit={submit} class="flex flex-col gap-1.5 rounded-lg border border-primary/30 bg-bg p-2">
          <LinkFields draft={draft()} on_draft={set_draft} show_error={touched()} autofocus />
          <div class="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={cancel}
              class="rounded px-2 py-1 text-sm text-text-muted hover:bg-bg-secondary focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="rounded bg-primary px-2 py-1 text-sm font-medium text-primary-text hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
            >
              Add
            </button>
          </div>
        </form>
      </Show>
    </div>
  )
}

interface ColumnEditorProps {
  column: FooterColumn
  index: number
  total: number
}

function ColumnEditor(props: ColumnEditorProps) {
  const id = createUniqueId()
  const title_id = `footer-column-title-${id}`
  const heading = () => props.column.title.trim() || `Column ${props.index + 1}`
  const footer_edit = use_footer_edit()
  const move_column = (other: number) =>
    footer_edit({ label: 'Moved footer column' }, (footer) => swap(footer.columns, props.index, other))

  const [local_title, set_local_title, commit_title] = createLocalInput(
    () => props.column.title,
    (value) => {
      const title = value.trim()
      if (code_points(title) > FOOTER_LIMITS.column_title_chars) return false
      footer_edit({ key: `column${props.index}.title`, label: edited_label('footer', 'column title') }, (footer) => {
        const column = footer.columns[props.index]
        if (column) column.title = title
      })
    }
  )

  return (
    <li class="flex flex-col gap-2 rounded-lg border border-border bg-bg-secondary p-2">
      <div class="flex items-center gap-1.5">
        <div class="flex">
          <button
            type="button"
            class={ICON_BUTTON}
            aria-label={`Move "${heading()}" up`}
            disabled={props.index === 0}
            onClick={() => move_column(props.index - 1)}
          >
            <ArrowUp size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            class={ICON_BUTTON}
            aria-label={`Move "${heading()}" down`}
            disabled={props.index === props.total - 1}
            onClick={() => move_column(props.index + 1)}
          >
            <ArrowDown size={12} aria-hidden="true" />
          </button>
        </div>
        <label for={title_id} class="sr-only">
          Column title
        </label>
        <input
          id={title_id}
          type="text"
          value={local_title()}
          placeholder="Column title (optional)"
          maxlength={FOOTER_LIMITS.column_title_chars}
          onInput={(event) => set_local_title(event.currentTarget.value)}
          onBlur={commit_title}
          class={TEXT_INPUT}
        />
        <button
          type="button"
          class={REMOVE_BUTTON}
          aria-label={`Remove "${heading()}"`}
          onClick={() =>
            footer_edit({ label: 'Removed footer column' }, (footer) => footer.columns.splice(props.index, 1))
          }
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <LinkListEditor
        links={props.column.links}
        max={FOOTER_LIMITS.links_per_column}
        list_label={`Links in ${heading()}`}
        add_label="Add link"
        on_change={(links) =>
          footer_edit({ label: changed_label('footer', 'column links') }, (footer) => {
            const column = footer.columns[props.index]
            if (column) column.links = links
          })
        }
      />
    </li>
  )
}

interface FooterTextFieldProps {
  label: string
  max: number
  placeholder: string
  hint: string
  value: () => string
  on_commit: (value: string) => void
}

function FooterTextField(props: FooterTextFieldProps) {
  const id = createUniqueId()
  const input_id = `footer-text-${id}`
  const hint_id = `footer-text-hint-${id}`
  const counter_id = `footer-text-counter-${id}`
  const [local, set_local, commit] = createLocalInput(props.value, (value) => {
    const trimmed = value.trim()
    if (code_points(trimmed) > props.max) return false
    props.on_commit(trimmed)
  })

  return (
    <div>
      <label for={input_id} class="mb-1 block text-sm font-medium text-text">
        {props.label}
      </label>
      <input
        id={input_id}
        type="text"
        value={local()}
        placeholder={props.placeholder}
        maxlength={props.max}
        aria-describedby={`${hint_id} ${counter_id}`}
        onInput={(event) => set_local(event.currentTarget.value)}
        onBlur={commit}
        class={TEXT_INPUT}
      />
      <div class="mt-1 flex items-start justify-between gap-2 text-xs text-text-muted">
        <p id={hint_id}>{props.hint}</p>
        <p id={counter_id} class="shrink-0 tabular-nums" aria-live="polite">
          {code_points(local())}/{props.max}
        </p>
      </div>
    </div>
  )
}

export function FooterPopover(props: FooterPopoverProps) {
  const id = createUniqueId()
  const layout_id = `footer-popover-layout-${id}`
  const columns_id = `footer-popover-columns-${id}`
  const legal_id = `footer-popover-legal-${id}`
  const credit_id = `footer-popover-credit-${id}`
  const social_id = `footer-popover-social-${id}`
  const social_hint_id = `footer-popover-social-hint-${id}`
  const text_id = `footer-popover-text-${id}`
  const hint_id = `footer-popover-hint-${id}`
  const counter_id = `footer-popover-counter-${id}`
  const footer_text = () => settings.footer_text ?? ''
  const footer = current_footer
  const footer_edit = use_footer_edit()
  const field_edit = use_field_edit()
  const has_social_links = () => (settings.socialLinks ?? []).length > 0
  const privacy_id = `footer-popover-privacy-${id}`
  const privacy_hint_id = `footer-popover-privacy-hint-${id}`
  let privacy_group: HTMLDivElement | undefined

  onMount(() => {
    if (!take_privacy_focus()) return
    // Two frames: the popover focus trap moves focus to its first element one frame after opening.
    requestAnimationFrame(() => requestAnimationFrame(() => focus_privacy_field(privacy_group)))
  })

  return (
    <PopoverShell
      open
      anchor={props.anchor}
      onClose={props.on_close}
      element_label={pageElementLabels[props.element_id] ?? props.element_id}
      slot_label={slot_label(props.slot)}
      back={<BackToSection slot={props.slot} />}
      move={props.move}
    >
      <CreatePageProvider value={props.on_create_page}>
        <div class="flex flex-col gap-4">
          <div>
            <h3 class={SECTION_HEADING}>Global</h3>
            <p class="text-xs text-text-muted">Changes every instance</p>
          </div>

          <fieldset aria-labelledby={layout_id} class="flex flex-col gap-1.5">
            <legend id={layout_id} class="mb-1 text-sm font-medium text-text">
              Layout
            </legend>
            <For each={FOOTER_VARIANTS}>
              {(variant) => (
                <label class="flex cursor-pointer items-center gap-2 text-sm text-text">
                  <input
                    type="radio"
                    name={`footer-variant-${id}`}
                    value={variant}
                    checked={footer().variant === variant}
                    onChange={() =>
                      footer_edit({ label: changed_label('footer', 'layout') }, (next) => {
                        next.variant = variant
                      })
                    }
                    class="size-4 text-primary focus:ring-primary"
                  />
                  {VARIANT_LABELS[variant]}
                </label>
              )}
            </For>
            <Show when={footer().variant === 'inline'}>
              <p class="text-xs text-text-muted">Inline shows column links in one row, without titles.</p>
            </Show>
          </fieldset>

          <section aria-labelledby={columns_id} class="flex flex-col gap-1.5">
            <h4 id={columns_id} class="text-sm font-medium text-text">
              Link columns
            </h4>
            <Show when={footer().columns.length > 0}>
              <ul class="flex flex-col gap-2" aria-label="Footer columns">
                <Index each={footer().columns}>
                  {(column, index) => <ColumnEditor column={column()} index={index} total={footer().columns.length} />}
                </Index>
              </ul>
            </Show>
            <button
              type="button"
              disabled={footer().columns.length >= FOOTER_LIMITS.columns}
              onClick={() =>
                footer_edit({ label: 'Added footer column' }, (next) => next.columns.push({ title: '', links: [] }))
              }
              class={ADD_BUTTON}
            >
              <Plus size={14} aria-hidden="true" />
              Add column ({footer().columns.length}/{FOOTER_LIMITS.columns})
            </button>
          </section>

          <section aria-labelledby={legal_id} class="flex flex-col gap-3">
            <h4 id={legal_id} class="text-sm font-medium text-text">
              Bottom row
            </h4>
            <FooterTextField
              label="Copyright"
              max={FOOTER_LIMITS.copyright_chars}
              placeholder={`© ${new Date().getFullYear()} ${settings.siteName || 'Site name'}`}
              hint="Empty = © year + site name."
              value={() => footer().copyright ?? ''}
              on_commit={(value) =>
                footer_edit({ key: 'copyright', label: edited_label('footer', 'copyright') }, (next) => {
                  if (value) next.copyright = value
                  else delete next.copyright
                })
              }
            />
            <FooterTextField
              label="Company details"
              max={FOOTER_LIMITS.company_chars}
              placeholder="Company name, address, tax ID"
              hint="Legal entity data, shown under the copyright."
              value={() => footer().company ?? ''}
              on_commit={(value) =>
                footer_edit({ key: 'company', label: edited_label('footer', 'company details') }, (next) => {
                  if (value) next.company = value
                  else delete next.company
                })
              }
            />
            <div
              ref={privacy_group}
              role="group"
              aria-labelledby={privacy_id}
              aria-describedby={privacy_hint_id}
              class="flex flex-col gap-1"
            >
              <p id={privacy_id} class="text-sm font-medium text-text">
                Privacy policy
              </p>
              <p id={privacy_hint_id} class="text-xs text-text-muted">
                Required when the page has a CTA band.
              </p>
              <LinkListEditor
                links={footer().privacy ? [footer().privacy as Link] : []}
                max={1}
                list_label="Privacy policy link"
                add_label="Set privacy link"
                on_change={(links) =>
                  footer_edit({ label: changed_label('footer', 'privacy link') }, (next) => {
                    if (links[0]) next.privacy = links[0]
                    else delete next.privacy
                  })
                }
              />
            </div>
            <div class="flex flex-col gap-1">
              <p class="text-sm font-medium text-text">Legal links</p>
              <p class="text-xs text-text-muted">Terms, cookies and similar. Shown next to the copyright.</p>
              <LinkListEditor
                links={footer().legal_links}
                max={FOOTER_LIMITS.legal_links}
                list_label="Legal links"
                add_label="Add legal link"
                on_change={(links) =>
                  footer_edit({ label: changed_label('footer', 'legal links') }, (next) => {
                    next.legal_links = links
                  })
                }
              />
            </div>
            <div>
              <label for={social_id} class="flex cursor-pointer items-center gap-2 text-sm text-text">
                <input
                  id={social_id}
                  type="checkbox"
                  checked={footer().show_social}
                  aria-describedby={social_hint_id}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked
                    footer_edit({ label: changed_label('footer', 'social icons') }, (next) => {
                      next.show_social = checked
                    })
                  }}
                  class="size-4 cursor-pointer rounded border-border text-primary focus:ring-primary"
                />
                Show social icons
              </label>
              <p id={social_hint_id} class="mt-1 text-xs text-text-muted">
                {has_social_links()
                  ? 'Uses the social links from your profile.'
                  : 'Add social links in the profile first.'}
              </p>
            </div>
          </section>

          <section aria-labelledby={credit_id} class="flex flex-col gap-1">
            <h4 id={credit_id} class="text-sm font-medium text-text">
              Credit line
            </h4>
            <label for={text_id} class="block text-sm text-text">
              Footer text
            </label>
            <textarea
              id={text_id}
              value={footer_text()}
              onInput={(event) => {
                const footer_text = event.currentTarget.value
                field_edit({ key: 'footer_text', label: edited_label('footer', 'text') }, () =>
                  updateSettings({ footer_text })
                )
              }}
              placeholder="Empty = default footer"
              rows={3}
              maxlength={FOOTER_TEXT_MAX_LENGTH}
              aria-describedby={`${hint_id} ${counter_id}`}
              class="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div class="mt-1 flex items-start justify-between gap-2 text-xs text-text-muted">
              <p id={hint_id}>Leave empty to use the default text.</p>
              <p id={counter_id} class="shrink-0 tabular-nums" aria-live="polite">
                {footer_text().length}/{FOOTER_TEXT_MAX_LENGTH}
              </p>
            </div>
          </section>
        </div>
      </CreatePageProvider>
    </PopoverShell>
  )
}
