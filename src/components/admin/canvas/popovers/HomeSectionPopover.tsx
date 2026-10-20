// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createMemo, createSignal, createUniqueId, For, Match, Show, Switch } from 'solid-js'
import { apply_layout_op, configSource, settings } from '../../queries'
import { currentUser, isAuthenticated } from '../../../auth/auth-store'
import {
  HERO_HEIGHTS,
  HOME_SECTION_ID_REGEX,
  IMAGE_SHAPES,
  IMAGE_SIDES,
  SECTION_ALIGNS,
  SECTION_BGS,
  SECTION_OVERLAYS,
  SECTION_SPACINGS,
  SECTION_WIDTHS,
  TEXT_MEDIA_RATIOS,
  type HomeSection,
  type HomeSectionType,
  type SettingsData,
} from '../../types/settings'
import { get_section_definition } from '../../../../shared/components/sections/registry'
import {
  COMMON_STYLE_DEFAULTS,
  type AnySectionDefinition,
  type FieldDescriptor,
  type LayoutThumb as LayoutThumbKind,
  type StyleControl,
  type StyleValues,
} from '../../../../shared/components/sections/registry-types'
import type { ImageRef } from '../../../../lib/image-ref'
import { can_write_config } from '../../settings/SiteSettings'
import { GROUP_LABEL, Segmented, type SegmentOption } from '../../settings/ThemeSettings/controls'
import {
  home_section_popover_key,
  home_sections_of,
  update_home_section,
  type HomeSectionPatch,
} from '../home-section-ops'
import { HOME_SECTION_LABELS } from '../home-sections/model'
import { CONTAINER_NAMES, CONTAINER_SECTION_IDS, CONTAINER_SLOTS } from '../layout-ops'
import { find_instance_anchor, select_instance } from '../selection'
import { cancel_privacy_focus, request_privacy_focus } from './FooterPopover'
import { ImageField } from './ImageField'
import { PopoverShell } from './PopoverShell'
import { added_label, changed_label, edited_label, removed_label, use_field_edit } from './field-edit'
import { SectionFields, type FieldEdit } from './section-fields'
import { item_title } from './section-fields/field-utils'
import { HINT_CLASS, LINK_BUTTON_CLASS } from './section-fields/styles'

export interface HomeSectionPopoverProps {
  section_id: string
  anchor: HTMLElement | undefined
  on_close: () => void
  /** Fallback target of the privacy warning when the footer is not on the page. */
  on_edit_site?: () => void
}

type SectionOf<T extends HomeSectionType> = Extract<HomeSection, { type: T }>
export type HomeSectionTab = 'content' | 'style'

export const HOME_SECTION_TABS: ReadonlyArray<{ value: HomeSectionTab; label: string }> = [
  { value: 'content', label: 'Content' },
  { value: 'style', label: 'Style' },
]

export const PRIVACY_WARNING = 'Add a privacy policy link in Footer - required for call-to-action consent'
export const POSTS_CONTENT_NOTE = 'Posts, sorting and card layout are edited in the Posts element popover.'
export const UNKNOWN_TYPE_NOTE = 'This section type cannot be edited here.'

const HOME_SECTION_KEY_PREFIX = home_section_popover_key('')

/** Home section id of a popover key `home-section:<id>`, or null for any other key. */
export function home_section_id_of_key(key: string | null | undefined): string | null {
  if (!key?.startsWith(HOME_SECTION_KEY_PREFIX)) return null
  const id = key.slice(HOME_SECTION_KEY_PREFIX.length)
  return HOME_SECTION_ID_REGEX.test(id) ? id : null
}

/** Warning of spec 2.5: a section collecting consent (`requires_privacy_link`) needs `footer.privacy`. */
export function needs_privacy_warning(type: HomeSectionType, current: Pick<SettingsData, 'footer'>): boolean {
  return get_section_definition(type)?.requires_privacy_link === true && !current.footer?.privacy
}

/** Undo coalescing key of one field of one home section, so typing in another field starts a new step. */
export function home_field_key(id: string, field: string): string {
  return `home:${id}:${field}`
}

const STYLE_FIELD_LABELS: Readonly<Record<string, string>> = {
  variant: 'layout',
  bg: 'background',
  bg_image: 'background image',
  image_side: 'image side',
  image_shape: 'image shape',
  ratio: 'image ratio',
  align: 'alignment',
}

export function style_field_label(key: string): string {
  return STYLE_FIELD_LABELS[key] ?? key.replace(/_/g, ' ')
}

export function find_home_section(current: Pick<SettingsData, 'home'>, id: string): HomeSection | null {
  return home_sections_of(current).find((section) => section.id === id) ?? null
}

/** Applies a patch built from the current (plain) section through `update_home_section`; false when rejected. */
export function commit_home_section<T extends HomeSectionType>(
  id: string,
  type: T,
  build: (section: SectionOf<T>) => HomeSectionPatch<T> | null
): boolean {
  return apply_layout_op((current) => {
    const section = find_home_section(current, id)
    if (!section || section.type !== type) return null
    const patch = build(section as SectionOf<T>)
    return patch ? update_home_section(current, id, type, patch) : null
  })
}

/** Style value used while a section (e.g. the virtual posts one) has no stored one: type default, then common. */
export function definition_style_default(definition: AnySectionDefinition, key: string): string {
  return definition.style_defaults[key] ?? (COMMON_STYLE_DEFAULTS as Readonly<Record<string, string>>)[key] ?? ''
}

/** Values of a style key the definition offers in the Style tab; null = every value of its enum. */
export function allowed_style_values(definition: AnySectionDefinition, key: string): readonly string[] | null {
  return Object.hasOwn(definition.style_options, key) ? definition.style_options[key] : null
}

/** Options of a style control narrowed to `allowed_style_values`. */
export function style_options_for<T extends string, O extends { value: T }>(
  definition: AnySectionDefinition,
  key: string,
  options: readonly O[]
): O[] {
  const allowed = allowed_style_values(definition, key)
  return allowed ? options.filter((option) => allowed.includes(option.value)) : [...options]
}

/** Overlay shown as selected: the stored value when the renderer accepts it, else its fallback. */
export function effective_overlay(allowed: readonly string[], value: string): string {
  return allowed.includes(value) ? value : (allowed[0] ?? value)
}

export interface FieldEditTarget {
  /** Titles from the outermost field down to the edited one, e.g. `['Primary button', 'Label']`. */
  names: string[]
  /** Descriptor of the edited value; undefined for a path outside `fields`. */
  leaf: FieldDescriptor | undefined
}

/** Resolves an edit path (`cta.0.label`) against the descriptors, for its undo label and coalescing. */
export function field_edit_target(fields: readonly FieldDescriptor[], path: string): FieldEditTarget {
  const names: string[] = []
  const parts = path.split('.')
  let level: readonly FieldDescriptor[] = fields
  let leaf: FieldDescriptor | undefined
  for (let index = 0; index < parts.length; index += 1) {
    leaf = level.find((field) => field.key === parts[index])
    if (!leaf) break
    if (leaf.kind === 'list' && /^\d+$/.test(parts[index + 1] ?? '')) {
      index += 1
      names.push(item_title(leaf, Number(parts[index])))
      level = leaf.item_fields
      continue
    }
    names.push(leaf.label)
    if (leaf.kind !== 'group') break
    level = leaf.fields
  }
  return { names, leaf }
}

const DISCRETE_KINDS: ReadonlySet<FieldDescriptor['kind']> = new Set(['image', 'select', 'boolean'])

/** History step of a Content tab edit: typed text coalesces per field path, picks and list ops are discrete steps. */
export function content_edit_step(
  definition: AnySectionDefinition,
  section_id: string,
  edit: FieldEdit
): { key?: string; label: string } {
  const scope = definition.label
  if (edit.action === 'add') return { label: added_label(scope, edit.label) }
  if (edit.action === 'remove') return { label: removed_label(scope, edit.label) }
  if (edit.action === 'move') return { label: changed_label(scope, edit.label) }
  const { names, leaf } = field_edit_target(definition.fields, edit.path)
  const field = names.at(-1) ?? edit.label
  const owner = [scope, ...names.slice(0, -1)].join(' ')
  if (leaf && DISCRETE_KINDS.has(leaf.kind)) return { label: changed_label(owner, field) }
  return { key: home_field_key(section_id, edit.path), label: edited_label(owner, field) }
}

// JSON round-trip: edited values may hold Solid store proxies, which must not be written back into the store.
function plain_value(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

const BACKGROUND_IMAGE_RECOMMENDATION = { ratio: 16 / 9, ratio_label: '16:9' }

const OPTION_CARD_CLASS =
  'flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-border p-1.5 text-xs text-text-muted transition-colors hover:text-text has-checked:border-primary has-checked:text-primary has-focus-visible:outline-2 has-focus-visible:outline-primary motion-reduce:transition-none'

const WIDTH_OPTIONS: SegmentOption<(typeof SECTION_WIDTHS)[number]>[] = [
  { value: 'content', label: 'Content' },
  { value: 'full', label: 'Full' },
]
const SPACING_OPTIONS: SegmentOption<(typeof SECTION_SPACINGS)[number]>[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
]
const HEIGHT_OPTIONS: SegmentOption<(typeof HERO_HEIGHTS)[number]>[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
]
const ALIGN_OPTIONS: SegmentOption<(typeof SECTION_ALIGNS)[number]>[] = [
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Center' },
]
const IMAGE_SIDE_OPTIONS: SegmentOption<(typeof IMAGE_SIDES)[number]>[] = [
  { value: 'start', label: 'Left' },
  { value: 'end', label: 'Right' },
]
const RATIO_OPTIONS: SegmentOption<(typeof TEXT_MEDIA_RATIOS)[number]>[] = TEXT_MEDIA_RATIOS.map((value) => ({
  value,
  label: value,
}))
const SHAPE_OPTIONS: SegmentOption<(typeof IMAGE_SHAPES)[number]>[] = [
  { value: 'rect', label: 'Square' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'circle', label: 'Circle' },
]
const OVERLAY_OPTIONS: SegmentOption<(typeof SECTION_OVERLAYS)[number]>[] = [
  { value: 'none', label: 'None' },
  { value: 'dark-30', label: 'Dark', hint: '30%' },
  { value: 'dark-50', label: 'Dark', hint: '50%' },
  { value: 'dark-70', label: 'Dark', hint: '70%' },
  { value: 'light-50', label: 'Light', hint: '50%' },
]

type SectionBg = (typeof SECTION_BGS)[number]

const BG_SWATCHES: Readonly<Record<SectionBg, { label: string; class: string }>> = {
  none: {
    label: 'None',
    class:
      'bg-transparent bg-[repeating-linear-gradient(45deg,transparent_0_0.25rem,var(--color-border)_0.25rem_0.3rem)]',
  },
  bg: { label: 'Page', class: 'bg-bg' },
  'bg-secondary': { label: 'Subtle', class: 'bg-bg-secondary' },
  card: { label: 'Card', class: 'bg-bg-card' },
  primary: { label: 'Primary', class: 'bg-primary' },
  accent: { label: 'Accent', class: 'bg-accent' },
  image: { label: 'Image', class: 'bg-bg-secondary' },
}

function can_upload(): boolean {
  return can_write_config({
    username: isAuthenticated() ? (currentUser()?.username ?? null) : null,
    config_account: configSource().account,
    load_error: configSource().error,
  })
}

/** Popover of a page element when it is on the page; otherwise `fallback` (site settings). */
export function open_element_settings(element_id: string, fallback: (() => void) | undefined): void {
  for (const name of CONTAINER_NAMES) {
    const elements = settings.pageLayoutConfig?.containers?.[name]?.elements ?? []
    if (!elements.some((element) => element.id === element_id)) continue
    const anchor_el = find_instance_anchor(CONTAINER_SECTION_IDS[name], element_id)
    if (!anchor_el) break
    // Chrome hides an anchored popover whose anchor is scrolled out (position-visibility: anchors-visible).
    anchor_el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    select_instance({
      section_id: CONTAINER_SECTION_IDS[name],
      element_id,
      slot: CONTAINER_SLOTS[name],
      anchor_el,
    })
    return
  }
  fallback?.()
}

function open_footer_settings(on_edit_site: (() => void) | undefined): void {
  request_privacy_focus()
  open_element_settings('footer', () => {
    cancel_privacy_focus()
    on_edit_site?.()
  })
}

/** Layout miniature drawn from `LayoutOption.thumb` of the section definition. */
function LayoutThumb(props: { thumb: LayoutThumbKind }) {
  const line = 'h-1 rounded-full bg-current opacity-60'
  const image = 'rounded-sm bg-current opacity-25'
  const button = 'h-1.5 w-3 rounded-sm bg-current'
  const lines = (class_name = '') => (
    <div class={`flex flex-col gap-0.5 ${class_name}`}>
      <div class={`${line} w-full`} />
      <div class={`${line} w-3/4`} />
    </div>
  )
  return (
    <div aria-hidden="true" class="flex h-10 w-full overflow-hidden rounded border border-current/30 p-1">
      <Switch>
        <Match when={props.thumb === 'centered-button' || props.thumb === 'card-button'}>
          <div
            class={`flex w-full flex-col items-center justify-center gap-1 ${
              props.thumb === 'card-button' ? 'mx-1.5 rounded-sm border border-current/40' : ''
            }`}
          >
            {lines('w-2/3 items-center')}
            <div class={button} />
          </div>
        </Match>
        <Match when={props.thumb === 'row-button'}>
          <div class="flex w-full items-center gap-1">
            {lines('flex-1')}
            <div class={button} />
          </div>
        </Match>
        <Match when={props.thumb === 'text-image' || props.thumb === 'image-text'}>
          <div class={`flex w-full gap-1 ${props.thumb === 'text-image' ? 'flex-row-reverse' : ''}`}>
            <div class={`${image} w-1/3`} />
            {lines('flex-1 justify-center')}
          </div>
        </Match>
        <Match when={props.thumb === 'overlay'}>
          <div class="flex w-full items-center justify-center rounded-sm bg-current/25">
            <div class="flex w-2/3 flex-col gap-0.5 opacity-60">
              <div class="h-1 w-full rounded-full bg-bg-card" />
              <div class="h-1 w-3/4 rounded-full bg-bg-card" />
            </div>
          </div>
        </Match>
        <Match when={props.thumb === 'text-above-image' || props.thumb === 'image-above-text'}>
          <div class={`flex w-full gap-0.5 ${props.thumb === 'image-above-text' ? 'flex-col-reverse' : 'flex-col'}`}>
            {lines('w-2/3')}
            <div class={`${image} flex-1`} />
          </div>
        </Match>
        <Match when={props.thumb === 'list'}>
          <div class="flex w-full flex-col items-center justify-center gap-0.5">
            <div class={`${button} w-1/2`} />
            <div class={`${button} w-1/2 opacity-40`} />
            <div class={`${button} w-1/2 opacity-40`} />
          </div>
        </Match>
        <Match when={props.thumb === 'grid'}>
          <div class="grid w-full grid-cols-2 content-center gap-0.5">
            <div class={`${button} w-full`} />
            <div class={`${button} w-full opacity-40`} />
            <div class={`${button} w-full opacity-40`} />
            <div class={`${button} w-full opacity-40`} />
          </div>
        </Match>
        <Match when={props.thumb === 'rule'}>
          <div class="flex w-full items-center gap-1">
            <div class="h-full w-0.5 rounded-full bg-current" />
            {lines('flex-1')}
          </div>
        </Match>
        <Match when={props.thumb === 'centered'}>
          <div class="flex w-full flex-col items-center justify-center">{lines('w-2/3 items-center')}</div>
        </Match>
      </Switch>
    </div>
  )
}

function LayoutRadios(props: { definition: AnySectionDefinition; value: string; on_change: (value: string) => void }) {
  const name = `home-layout-${createUniqueId()}`
  const columns = () => (props.definition.layout_options.length === 3 ? 'grid-cols-3' : 'grid-cols-2')
  return (
    <fieldset>
      <legend class={GROUP_LABEL}>Layout</legend>
      <div class={`grid gap-1.5 ${columns()}`}>
        <For each={props.definition.layout_options}>
          {(option) => (
            <label class={OPTION_CARD_CLASS}>
              <input
                type="radio"
                class="sr-only"
                name={name}
                value={option.value}
                checked={props.value === option.value}
                onChange={() => props.on_change(option.value)}
              />
              <LayoutThumb thumb={option.thumb} />
              <span>{option.label}</span>
            </label>
          )}
        </For>
      </div>
    </fieldset>
  )
}

function BackgroundRadios(props: {
  options: readonly SectionBg[]
  value: string
  on_change: (value: SectionBg) => void
}) {
  const name = `home-bg-${createUniqueId()}`
  return (
    <fieldset>
      <legend class={GROUP_LABEL}>Background</legend>
      <div class="grid grid-cols-4 gap-1.5">
        <For each={props.options}>
          {(bg) => (
            <label class={OPTION_CARD_CLASS}>
              <input
                type="radio"
                class="sr-only"
                name={name}
                value={bg}
                checked={props.value === bg}
                onChange={() => props.on_change(bg)}
              />
              <span
                aria-hidden="true"
                class={`flex size-6 items-center justify-center rounded-full border border-border text-[0.625rem] text-text-muted ${BG_SWATCHES[bg].class}`}
              >
                {bg === 'image' ? 'Img' : ''}
              </span>
              <span>{BG_SWATCHES[bg].label}</span>
            </label>
          )}
        </For>
      </div>
    </fieldset>
  )
}

function Tabs(props: {
  active: HomeSectionTab
  on_change: (tab: HomeSectionTab) => void
  panel_id: string
  tab_id: (tab: HomeSectionTab) => string
}) {
  const refs: Partial<Record<HomeSectionTab, HTMLButtonElement>> = {}
  const on_key = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const next = HOME_SECTION_TABS[(index + step + HOME_SECTION_TABS.length) % HOME_SECTION_TABS.length].value
    props.on_change(next)
    refs[next]?.focus({ preventScroll: true })
  }
  return (
    <div role="tablist" aria-label="Section settings" class="flex rounded-lg bg-bg-secondary p-0.5 text-xs">
      <For each={HOME_SECTION_TABS}>
        {(tab, index) => (
          <button
            ref={(el) => (refs[tab.value] = el)}
            type="button"
            role="tab"
            id={props.tab_id(tab.value)}
            aria-selected={props.active === tab.value}
            aria-controls={props.panel_id}
            tabIndex={props.active === tab.value ? 0 : -1}
            onClick={() => props.on_change(tab.value)}
            onKeyDown={(event) => on_key(event, index())}
            class={`flex-1 rounded-md px-2 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11 ${
              props.active === tab.value ? 'bg-bg-card text-text shadow-sm' : 'text-text-muted hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        )}
      </For>
    </div>
  )
}

export interface HomeSectionTabProps {
  section: HomeSection
  definition: AnySectionDefinition
}

/** Content tab: the definition's `fields` through the generic `SectionFields` editors. */
export function HomeSectionContentTab(props: HomeSectionTabProps & { on_edit_site?: () => void }) {
  const field_edit = use_field_edit()
  const on_change = (key: string, value: unknown, edit: FieldEdit) => {
    const id = props.section.id
    const type = props.section.type
    const content = { [key]: plain_value(value) }
    field_edit(content_edit_step(props.definition, id, edit), () =>
      commit_home_section(id, type, () => ({ content }) as HomeSectionPatch<typeof type>)
    )
  }
  const image = () => ({
    can_upload: can_upload(),
    recommended: props.definition.image_recommendation?.(props.section as never),
  })

  return (
    <>
      <Show when={needs_privacy_warning(props.section.type, settings)}>
        <div
          role="note"
          class="flex flex-col gap-1 rounded-lg border border-warning bg-warning/10 p-2 text-xs text-text"
        >
          <p>{PRIVACY_WARNING}</p>
          <button
            type="button"
            class={`${LINK_BUTTON_CLASS} self-start`}
            onClick={() => open_footer_settings(props.on_edit_site)}
          >
            Open footer settings
          </button>
        </div>
      </Show>

      <SectionFields
        fields={props.definition.fields}
        values={props.section.content}
        on_change={on_change}
        image={image()}
        locale={settings.locale}
      />

      <Show when={props.section.type === 'posts'}>
        <p class={HINT_CLASS}>{POSTS_CONTENT_NOTE}</p>
      </Show>
    </>
  )
}

/** Style tab: controls from the definition's `style_controls`, layout radio from `layout_key`/`layout_options`. */
export function HomeSectionStyleTab(props: HomeSectionTabProps) {
  const style = () => props.section.style as Record<string, string | ImageRef | undefined>
  // A stored value the definition no longer offers shows as the value the renderer falls back to.
  const enum_value = (key: string): string => {
    const value = style()[key]
    const fallback = definition_style_default(props.definition, key)
    const allowed = allowed_style_values(props.definition, key)
    if (typeof value !== 'string') return fallback
    return !allowed || allowed.includes(value) ? value : fallback
  }
  const bg_options = () => {
    const allowed = allowed_style_values(props.definition, 'bg')
    return allowed ? SECTION_BGS.filter((bg) => allowed.includes(bg)) : SECTION_BGS
  }
  const options = <T extends string, O extends { value: T }>(key: string, list: readonly O[]): O[] =>
    style_options_for(props.definition, key, list)
  const style_values = (): StyleValues => ({ ...style(), bg: enum_value('bg') })
  const field_edit = use_field_edit()
  const set_style = (patch: Record<string, unknown>) => {
    const type = props.section.type
    const label = changed_label(props.definition.label, style_field_label(Object.keys(patch).join(' ')))
    field_edit({ label }, () =>
      commit_home_section(props.section.id, type, () => ({ style: patch }) as HomeSectionPatch<typeof type>)
    )
  }
  const controls = createMemo(() => props.definition.style_controls(style_values()))
  const has = (control: StyleControl) => controls().includes(control)
  const overlay_allowed = createMemo(() => props.definition.overlay_values(style_values()))
  const overlay_options = () => OVERLAY_OPTIONS.filter((option) => overlay_allowed().includes(option.value))

  return (
    <>
      <Show when={has('layout') && props.definition.layout_key}>
        {(layout_key) => (
          <LayoutRadios
            definition={props.definition}
            value={enum_value(layout_key())}
            on_change={(value) => set_style({ [layout_key()]: value })}
          />
        )}
      </Show>

      <BackgroundRadios options={bg_options()} value={enum_value('bg')} on_change={(bg) => set_style({ bg })} />

      <Show when={has('bg_image')}>
        <ImageField
          label="Background image"
          value={props.section.style.bg_image}
          on_change={(bg_image) => set_style({ bg_image })}
          can_upload={can_upload()}
          allow_decorative
          recommended={BACKGROUND_IMAGE_RECOMMENDATION}
        />
      </Show>
      <Show when={has('overlay')}>
        <Segmented
          label="Overlay"
          options={overlay_options()}
          value={effective_overlay(overlay_allowed(), enum_value('overlay'))}
          on_change={(overlay) => set_style({ overlay })}
        />
      </Show>

      <Segmented
        label="Width"
        options={options('width', WIDTH_OPTIONS)}
        value={enum_value('width')}
        on_change={(width) => set_style({ width })}
      />
      <Segmented
        label="Spacing"
        options={options('spacing', SPACING_OPTIONS)}
        value={enum_value('spacing')}
        on_change={(spacing) => set_style({ spacing })}
      />
      <Show when={has('height')}>
        <Segmented
          label="Height"
          options={options('height', HEIGHT_OPTIONS)}
          value={enum_value('height')}
          on_change={(height) => set_style({ height })}
        />
      </Show>
      <Show when={has('align')}>
        <Segmented
          label="Alignment"
          options={options('align', ALIGN_OPTIONS)}
          value={enum_value('align')}
          on_change={(align) => set_style({ align })}
        />
      </Show>
      <Show when={has('image_side')}>
        <Segmented
          label="Image side"
          options={options('image_side', IMAGE_SIDE_OPTIONS)}
          value={enum_value('image_side')}
          on_change={(image_side) => set_style({ image_side })}
        />
      </Show>
      <Show when={has('ratio')}>
        <Segmented
          label="Image ratio"
          options={options('ratio', RATIO_OPTIONS)}
          value={enum_value('ratio')}
          on_change={(ratio) => set_style({ ratio })}
        />
      </Show>
      <Show when={has('image_shape')}>
        <Segmented
          label="Image shape"
          options={options('image_shape', SHAPE_OPTIONS)}
          value={enum_value('image_shape')}
          on_change={(image_shape) => set_style({ image_shape })}
        />
      </Show>
    </>
  )
}

/** Gear popover of a home section: Content / Style tabs; every change goes through `update_home_section` (canvas 1:1). */
export function HomeSectionPopover(props: HomeSectionPopoverProps) {
  const uid = createUniqueId()
  const panel_id = `home-section-panel-${uid}`
  const tab_id = (tab: HomeSectionTab) => `home-section-tab-${tab}-${uid}`
  const [tab, set_tab] = createSignal<HomeSectionTab>('content')
  const section = createMemo(() => find_home_section(settings, props.section_id))
  const definition = createMemo(() => get_section_definition(section()?.type))

  return (
    <PopoverShell
      open
      anchor={props.anchor}
      onClose={props.on_close}
      element_label={section() ? (HOME_SECTION_LABELS[section()!.type] ?? 'Section') : 'Section'}
      slot_label="Home section"
    >
      <Show when={section()} fallback={<p class={HINT_CLASS}>This section no longer exists.</p>}>
        {(current) => (
          <Show when={definition()} fallback={<p class={HINT_CLASS}>{UNKNOWN_TYPE_NOTE}</p>}>
            {(current_definition) => (
              <>
                <Tabs active={tab()} on_change={set_tab} panel_id={panel_id} tab_id={tab_id} />
                <div id={panel_id} role="tabpanel" aria-labelledby={tab_id(tab())} class="flex flex-col gap-4">
                  <Show
                    when={tab() === 'content'}
                    fallback={<HomeSectionStyleTab section={current()} definition={current_definition()} />}
                  >
                    <HomeSectionContentTab
                      section={current()}
                      definition={current_definition()}
                      on_edit_site={props.on_edit_site}
                    />
                  </Show>
                </div>
              </>
            )}
          </Show>
        )}
      </Show>
    </PopoverShell>
  )
}
