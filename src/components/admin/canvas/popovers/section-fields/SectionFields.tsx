// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// No lucide-solid here: it runs client-only code at import, which breaks the unit tests.
import { createUniqueId, For, Index, Show, type JSX } from 'solid-js'
import type {
  FieldDescriptor,
  GroupFieldDescriptor,
  ListFieldDescriptor,
} from '../../../../../shared/components/sections/registry-types'
import type { Locale } from '../../../../../lib/i18n'
import { BooleanField } from './BooleanField'
import { DateField } from './DateField'
import {
  can_add_item,
  child_path,
  empty_record,
  item_title,
  list_add,
  list_move,
  list_remove,
  list_update,
  list_value,
  record_value,
  record_with,
  string_value,
  type FieldChangeHandler,
  type FieldEdit,
  type FieldRecord,
} from './field-utils'
import { ImageField, type ImageFieldContext } from './ImageField'
import { MarkdownField } from './MarkdownField'
import { SelectField } from './SelectField'
import { TextareaField, TextField } from './TextField'
import { UrlField } from './UrlField'
import { ADD_BUTTON_CLASS, CARD_CLASS, HINT_CLASS, ICON_BUTTON_CLASS, LINK_BUTTON_CLASS } from './styles'

const NO_IMAGE_CONTEXT: ImageFieldContext = { can_upload: false }

export interface SectionFieldsProps {
  fields: readonly FieldDescriptor[]
  /** Object the field keys are read from (`section.content`, a list item or a group). */
  values: unknown
  /** Called with the top-level key of `fields` and its whole new value; undefined removes the key. */
  on_change: FieldChangeHandler
  /** Upload permission and recommended ratio for image fields. */
  image?: ImageFieldContext
  /** Site locale of the markdown preview. */
  locale?: Locale
  /** Dot path of `values` from the content root, used in `FieldEdit.path`. */
  path?: string
}

/** Generic Content tab editors built from the section's `FieldDescriptor`s. */
export function SectionFields(props: SectionFieldsProps) {
  return (
    <For each={props.fields}>
      {(field) => (
        <FieldEditor
          field={field}
          values={props.values}
          on_change={props.on_change}
          image={props.image}
          locale={props.locale}
          path={props.path ?? ''}
        />
      )}
    </For>
  )
}

function FieldEditor(props: {
  field: FieldDescriptor
  values: unknown
  on_change: FieldChangeHandler
  image: ImageFieldContext | undefined
  locale: Locale | undefined
  path: string
}): JSX.Element {
  const field = props.field
  const raw = () => record_value(props.values)?.[field.key]
  const text = () => string_value(raw())
  const edit = (value: unknown) =>
    props.on_change(field.key, value, { path: child_path(props.path, field.key), label: field.label, action: 'edit' })
  const field_path = () => child_path(props.path, field.key)

  switch (field.kind) {
    case 'text':
      return (
        <TextField
          label={field.label}
          value={text()}
          max_len={field.max_len}
          required={field.required}
          hint={field.hint}
          on_change={edit}
        />
      )
    case 'textarea':
      return (
        <TextareaField
          label={field.label}
          value={text()}
          max_len={field.max_len}
          required={field.required}
          hint={field.hint}
          on_change={edit}
        />
      )
    case 'markdown':
      return (
        <MarkdownField
          label={field.label}
          value={text()}
          max_bytes={field.max_bytes}
          required={field.required}
          hint={field.hint}
          locale={props.locale}
          on_change={edit}
        />
      )
    case 'url':
      return (
        <UrlField
          label={field.label}
          value={text()}
          allow_contact={field.allow_contact}
          required={field.required}
          hint={field.hint}
          on_change={edit}
        />
      )
    case 'image':
      return (
        <ImageField
          label={field.label}
          value={raw()}
          hint={field.hint}
          context={props.image ?? NO_IMAGE_CONTEXT}
          on_change={edit}
        />
      )
    case 'select':
      return (
        <SelectField
          label={field.label}
          value={text()}
          options={field.options}
          required={field.required}
          hint={field.hint}
          on_change={edit}
        />
      )
    case 'date':
      return (
        <DateField label={field.label} value={text()} required={field.required} hint={field.hint} on_change={edit} />
      )
    case 'boolean':
      return (
        <BooleanField
          label={field.label}
          value={raw() === true ? true : raw() === false ? false : undefined}
          required={field.required}
          hint={field.hint}
          on_change={edit}
        />
      )
    case 'list':
      return (
        <ListField
          field={field}
          value={raw()}
          path={field_path()}
          image={props.image}
          locale={props.locale}
          on_change={(value, list_edit) => props.on_change(field.key, value, list_edit)}
        />
      )
    case 'group':
      return (
        <GroupField
          field={field}
          value={raw()}
          path={field_path()}
          image={props.image}
          locale={props.locale}
          on_change={(value, group_edit) => props.on_change(field.key, value, group_edit)}
        />
      )
  }
}

function ChevronIcon(props: { direction: 'up' | 'down' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      class="size-4"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d={props.direction === 'up' ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      class="size-3.5"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export interface ListFieldProps {
  field: ListFieldDescriptor
  value: unknown
  /** Dot path of the list from the content root. */
  path: string
  image?: ImageFieldContext
  locale?: Locale
  on_change: (value: FieldRecord[] | undefined, edit: FieldEdit) => void
}

/** Array of objects: explicit add (blocked at `max`), remove and move; item fields render recursively. */
export function ListField(props: ListFieldProps) {
  const heading_id = `section-list-${createUniqueId()}`
  let container: HTMLElement | undefined
  const items = () => list_value(props.value)
  const full = () => !can_add_item(items(), props.field)
  const item_path = (index: number) => child_path(props.path, String(index))

  const focus_after = (target: 'last-item' | 'add') =>
    queueMicrotask(() => {
      const cards = container?.querySelectorAll<HTMLElement>('[data-list-item]') ?? []
      const last_input = [...cards].at(-1)?.querySelector<HTMLElement>('input, textarea, select')
      const add = container?.querySelector<HTMLButtonElement>('[data-list-add]')
      const el = target === 'add' && add && !add.disabled ? add : (last_input ?? add)
      el?.focus({ preventScroll: true })
    })

  const add = () => {
    const next = list_add(items(), props.field)
    if (!next) return
    props.on_change(next, { path: props.path, label: props.field.label, action: 'add' })
    focus_after('last-item')
  }
  const remove = (index: number) => {
    const next = list_remove(items(), index, props.field.required)
    if (next === null) return
    props.on_change(next, { path: item_path(index), label: item_title(props.field, index), action: 'remove' })
    focus_after('add')
  }
  const move = (index: number, step: -1 | 1) => {
    const next = list_move(items(), index, step)
    if (!next) return
    props.on_change(next, { path: item_path(index), label: item_title(props.field, index), action: 'move' })
  }
  const edit_item = (index: number, key: string, value: unknown, edit: FieldEdit) => {
    const current = items()
    const next = list_update(current, index, record_with(current[index], key, value))
    if (next) props.on_change(next, edit)
  }

  return (
    <section ref={container} aria-labelledby={heading_id} data-section-list="" class="flex min-w-0 flex-col gap-2">
      <div class="flex items-baseline justify-between gap-2">
        <h4 id={heading_id} class="text-xs font-semibold text-text">
          {props.field.label}
          <Show when={props.field.required}>
            <span class="font-normal text-text-muted"> (required)</span>
          </Show>
        </h4>
        <span class="text-xs tabular-nums text-text-muted">
          {items().length}/{props.field.max}
        </span>
      </div>
      <Show when={props.field.hint}>{(hint) => <p class={HINT_CLASS}>{hint()}</p>}</Show>
      <Index each={items()}>
        {(item, index) => {
          const title = () => item_title(props.field, index)
          return (
            <section aria-label={title()} data-list-item="" class={CARD_CLASS}>
              <div class="flex items-center justify-between gap-2">
                <h5 class="min-w-0 truncate text-xs font-semibold text-text">{title()}</h5>
                <div class="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    class={ICON_BUTTON_CLASS}
                    aria-label={`Move ${title()} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronIcon direction="up" />
                  </button>
                  <button
                    type="button"
                    class={ICON_BUTTON_CLASS}
                    aria-label={`Move ${title()} down`}
                    disabled={index === items().length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronIcon direction="down" />
                  </button>
                  <button
                    type="button"
                    class={LINK_BUTTON_CLASS}
                    aria-label={`Remove ${title()}`}
                    onClick={() => remove(index)}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <SectionFields
                fields={props.field.item_fields}
                values={item()}
                path={item_path(index)}
                image={props.image}
                locale={props.locale}
                on_change={(key, value, edit) => edit_item(index, key, value, edit)}
              />
            </section>
          )
        }}
      </Index>
      <button
        type="button"
        data-list-add=""
        class={ADD_BUTTON_CLASS}
        disabled={full()}
        aria-describedby={full() ? `${heading_id}-limit` : undefined}
        onClick={add}
      >
        <PlusIcon />
        Add {props.field.label.toLowerCase()} ({items().length}/{props.field.max})
      </button>
      <Show when={full()}>
        <p id={`${heading_id}-limit`} class={HINT_CLASS}>
          Limit reached ({props.field.max}/{props.field.max})
        </p>
      </Show>
    </section>
  )
}

export interface GroupFieldProps {
  field: GroupFieldDescriptor
  value: unknown
  path: string
  image?: ImageFieldContext
  locale?: Locale
  on_change: (value: FieldRecord | undefined, edit: FieldEdit) => void
}

/** Nested object; an optional group is added and removed as a whole. */
export function GroupField(props: GroupFieldProps) {
  const heading_id = `section-group-${createUniqueId()}`
  const group = () => record_value(props.value)
  const add = () =>
    props.on_change(empty_record(props.field.fields), { path: props.path, label: props.field.label, action: 'add' })
  const remove = () => props.on_change(undefined, { path: props.path, label: props.field.label, action: 'remove' })
  const edit_part = (key: string, value: unknown, edit: FieldEdit) =>
    props.on_change(record_with(group(), key, value), edit)

  return (
    <Show
      when={group() ?? (props.field.required ? {} : undefined)}
      fallback={
        <button type="button" data-group-add="" class={ADD_BUTTON_CLASS} onClick={add}>
          <PlusIcon />
          Add {props.field.label.toLowerCase()}
        </button>
      }
    >
      {(values) => (
        <section aria-labelledby={heading_id} data-section-group="" class={CARD_CLASS}>
          <div class="flex items-center justify-between gap-2">
            <h4 id={heading_id} class="min-w-0 truncate text-xs font-semibold text-text">
              {props.field.label}
            </h4>
            <Show when={!props.field.required}>
              <button
                type="button"
                class={LINK_BUTTON_CLASS}
                aria-label={`Remove ${props.field.label.toLowerCase()}`}
                onClick={remove}
              >
                Remove
              </button>
            </Show>
          </div>
          <Show when={props.field.hint}>{(hint) => <p class={HINT_CLASS}>{hint()}</p>}</Show>
          <SectionFields
            fields={props.field.fields}
            values={values()}
            path={props.path}
            image={props.image}
            locale={props.locale}
            on_change={edit_part}
          />
        </section>
      )}
    </Show>
  )
}
