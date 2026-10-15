// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createMemo, createSignal, createUniqueId, For, Index, Match, Show, Switch, type JSX } from 'solid-js'
import { Plus } from 'lucide-solid'
import { apply_layout_op, configSource, settings } from '../../queries'
import { currentUser, isAuthenticated } from '../../../auth/auth-store'
import { LINK_LABEL_MAX_CHARS, type Cta } from '../../types/navigation'
import {
  CTA_BAND_VARIANTS,
  CTA_CONSENT_MODES,
  HERO_HEIGHTS,
  HERO_VARIANTS,
  HOME_SECTION_ID_REGEX,
  IMAGE_SHAPES,
  IMAGE_SIDES,
  SECTION_ALIGNS,
  SECTION_BGS,
  SECTION_OVERLAYS,
  SECTION_SPACINGS,
  SECTION_STYLE_DEFAULTS,
  SECTION_TEXT_LIMITS,
  SECTION_WIDTHS,
  TEXT_MEDIA_RATIOS,
  type HomeSection,
  type HomeSectionType,
  type SettingsData,
} from '../../types/settings'
import { render_section_markdown } from '../../../../shared/components/sections/markdown'
import { HERO_OVERLAY_VARIANT_OVERLAYS } from '../../../../shared/components/sections/hero/render'
import { BG_IMAGE_OVERLAYS } from '../../../../shared/components/sections/utils'
import { safe_link_url, type ImageRef } from '../../../../lib/image-ref'
import { can_write_config, char_count, clamp_chars, counter_tone, type CounterTone } from '../../settings/SiteSettings'
import { Segmented, type SegmentOption } from '../../settings/ThemeSettings/controls'
import {
  home_section_popover_key,
  home_sections_of,
  update_home_section,
  type HomeSectionPatch,
} from '../home-section-ops'
import { CONTAINER_NAMES, CONTAINER_SECTION_IDS, CONTAINER_SLOTS } from '../layout-ops'
import { find_instance_anchor, select_instance } from '../selection'
import { cancel_privacy_focus, request_privacy_focus } from './FooterPopover'
import { ImageField, type ImageRecommendation } from './ImageField'
import { PopoverShell } from './PopoverShell'
import { added_label, changed_label, edited_label, removed_label, use_field_edit } from './field-edit'

export interface HomeSectionPopoverProps {
  section_id: string
  anchor: HTMLElement | undefined
  on_close: () => void
  /** Fallback target of the privacy warning when the footer is not on the page. */
  on_edit_site?: () => void
}

type SectionOf<T extends HomeSectionType> = Extract<HomeSection, { type: T }>
type CtaType = Extract<HomeSectionType, 'hero' | 'text-media'>
export type HomeSectionTab = 'content' | 'style'
export type CounterUnit = 'chars' | 'bytes'

export interface TextFieldSpec {
  key: string
  label: string
  max: number
  unit: CounterUnit
  required: boolean
  multiline: boolean
}

export type StyleControl =
  | 'layout'
  | 'background'
  | 'bg_image'
  | 'overlay'
  | 'width'
  | 'spacing'
  | 'height'
  | 'align'
  | 'image_side'
  | 'ratio'
  | 'image_shape'

export const HOME_SECTION_LABELS: Readonly<Record<HomeSectionType, string>> = Object.freeze({
  hero: 'Hero',
  'text-media': 'Text + media',
  posts: 'Posts',
  'cta-band': 'Call to action',
})

export const HOME_SECTION_TABS: ReadonlyArray<{ value: HomeSectionTab; label: string }> = [
  { value: 'content', label: 'Content' },
  { value: 'style', label: 'Style' },
]

export const PRIVACY_WARNING = 'Add a privacy policy link in Footer - required for call-to-action consent'
export const POSTS_CONTENT_NOTE = 'Posts, sorting and card layout are edited in the Posts element popover.'

const limits = SECTION_TEXT_LIMITS

function text_field(key: string, label: string, max: number, options: Partial<TextFieldSpec> = {}): TextFieldSpec {
  return { key, label, max, unit: 'chars', required: false, multiline: false, ...options }
}

/** Plain text fields of the Content tab, per section type; limits come from SECTION_TEXT_LIMITS. */
export const CONTENT_TEXT_FIELDS: Readonly<Record<HomeSectionType, readonly TextFieldSpec[]>> = Object.freeze({
  hero: [
    text_field('headline', 'Headline', limits.hero_headline_chars, { required: true }),
    text_field('subheadline', 'Subheadline', limits.hero_subheadline_chars, { multiline: true }),
  ],
  'text-media': [
    text_field('title', 'Title', limits.text_media_title_chars),
    text_field('body_md', 'Body', limits.text_media_body_bytes, { unit: 'bytes', multiline: true }),
  ],
  posts: [text_field('title', 'Title', limits.posts_title_chars)],
  'cta-band': [
    text_field('title', 'Title', limits.cta_band_title_chars, { required: true }),
    text_field('body', 'Text', limits.cta_band_body_chars, { multiline: true }),
    text_field('consent_text', 'Consent text', limits.cta_band_consent_chars, { multiline: true }),
  ],
})

const HAS_LAYOUT: ReadonlySet<HomeSectionType> = new Set(['hero', 'text-media', 'cta-band'])

function is_hero_overlay(type: HomeSectionType, variant: string | undefined): boolean {
  return type === 'hero' && (variant ?? SECTION_STYLE_DEFAULTS.hero.variant) === 'overlay'
}

/**
 * Controls of the Style tab. Overlay with an image background (spec 2.1) or text on the hero image
 * (`overlay` variant, which ignores `bg_image`); Image side only for a split hero.
 */
export function style_controls_of(type: HomeSectionType, style: { bg?: string; variant?: string }): StyleControl[] {
  const controls: StyleControl[] = []
  const hero_overlay = is_hero_overlay(type, style.variant)
  if (HAS_LAYOUT.has(type)) controls.push('layout')
  controls.push('background')
  if (style.bg === 'image' && !hero_overlay) controls.push('bg_image')
  if (style.bg === 'image' || hero_overlay) controls.push('overlay')
  controls.push('width', 'spacing')
  if (type === 'hero') controls.push('height', 'align')
  if (type === 'hero' && (style.variant ?? SECTION_STYLE_DEFAULTS.hero.variant) === 'split') controls.push('image_side')
  if (type === 'text-media') controls.push('ratio', 'image_shape')
  if (type === 'cta-band') controls.push('align')
  return controls
}

const encoder = new TextEncoder()

export function measure_text(value: string, unit: CounterUnit): number {
  return unit === 'bytes' ? encoder.encode(value).length : char_count(value)
}

export interface TextCounter {
  count: number
  max: number
  tone: CounterTone
  text: string
}

/** `42/90` counter; amber from 90%, red at the limit (same thresholds as Site settings). */
export function text_counter(value: string | undefined, field: Pick<TextFieldSpec, 'max' | 'unit'>): TextCounter {
  const count = measure_text(value ?? '', field.unit)
  return { count, max: field.max, tone: counter_tone(count, field.max), text: `${count}/${field.max}` }
}

/** Value to store for a typed text: char limits clamp, an empty optional field is removed. */
export function text_field_value(field: TextFieldSpec, raw: string): string | undefined {
  const value = field.unit === 'chars' ? clamp_chars(raw, field.max) : raw
  if (value === '' && !field.required) return undefined
  return value
}

const HOME_SECTION_KEY_PREFIX = home_section_popover_key('')

/** Home section id of a popover key `home-section:<id>`, or null for any other key. */
export function home_section_id_of_key(key: string | null | undefined): string | null {
  if (!key?.startsWith(HOME_SECTION_KEY_PREFIX)) return null
  const id = key.slice(HOME_SECTION_KEY_PREFIX.length)
  return HOME_SECTION_ID_REGEX.test(id) ? id : null
}

/** Warning of spec 2.5: a call-to-action needs `footer.privacy`. */
export function needs_privacy_warning(type: HomeSectionType, current: Pick<SettingsData, 'footer'>): boolean {
  return type === 'cta-band' && !current.footer?.privacy
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

export const HERO_CTA_MAX = SECTION_TEXT_LIMITS.hero_cta

/** Title of a hero CTA by position; the first one renders as the primary button. */
export const HERO_CTA_TITLES: readonly string[] = Object.freeze(['Primary button', 'Secondary link'])

function plain_ctas(current: readonly Cta[] | undefined): Cta[] {
  return (current ?? []).map((cta) => ({ label: cta.label, url: cta.url }))
}

/**
 * Hero CTAs are optional (0..2) and added explicitly: an added entry starts empty and stays until removed,
 * so the save validation reports it; null when the limit is reached.
 */
export function hero_cta_add(current: readonly Cta[] | undefined): Cta[] | null {
  const list = plain_ctas(current)
  if (list.length >= HERO_CTA_MAX) return null
  return [...list, { label: '', url: '' }]
}

/** Typed change of one added CTA; null for an index that does not exist. */
export function hero_cta_update(current: readonly Cta[] | undefined, index: number, patch: Partial<Cta>): Cta[] | null {
  const list = plain_ctas(current)
  if (!list[index]) return null
  list[index] = { ...list[index], ...patch }
  return list
}

/** Removes one CTA (the secondary moves up to primary); undefined clears the field when none is left. */
export function hero_cta_remove(current: readonly Cta[] | undefined, index: number): Cta[] | undefined {
  const list = plain_ctas(current).filter((_cta, position) => position !== index)
  return list.length > 0 ? list : undefined
}

/** Optional text-media button, added explicitly like hero CTAs; null when one already exists. */
export function text_media_cta_add(current: Cta | undefined): Cta | null {
  return current ? null : { label: '', url: '' }
}

/** Typed change of the added button; it stays (also when cleared) until removed. Null without a button. */
export function text_media_cta_update(current: Cta | undefined, patch: Partial<Cta>): Cta | null {
  return current ? { label: current.label, url: current.url, ...patch } : null
}

/** Inline URL error, empty while the field is empty. */
export function cta_url_error(url: string, allow_contact: boolean): string | null {
  if (url.trim() === '' || safe_link_url(url, { allow_contact })) return null
  return allow_contact ? 'Use an https://, mailto: or tel: link.' : 'Use an https:// link.'
}

/** Recommended image proportions; the ImageField warning is non-blocking. */
export function image_recommendation(section: HomeSection): ImageRecommendation | undefined {
  if (section.type === 'text-media')
    return { ratio: ratio_value(section.style.ratio), ratio_label: section.style.ratio }
  if (section.type === 'hero' && section.style.variant === 'split') return { ratio: 4 / 5, ratio_label: '4:5' }
  if (section.type === 'hero') return { ratio: 16 / 9, ratio_label: '16:9' }
  return undefined
}

function ratio_value(ratio: string): number {
  const [w, h] = ratio.split(':').map(Number)
  return w > 0 && h > 0 ? w / h : 1
}

/** Schema default of a style field, used while a section (e.g. the virtual posts one) has no stored value. */
export function style_default(type: HomeSectionType, key: string): string {
  const typed = type === 'posts' ? {} : (SECTION_STYLE_DEFAULTS[type] as Record<string, string>)
  return typed[key] ?? (SECTION_STYLE_DEFAULTS.common as Record<string, string>)[key] ?? ''
}

const BACKGROUND_IMAGE_RECOMMENDATION: ImageRecommendation = { ratio: 16 / 9, ratio_label: '16:9' }

const LABEL_CLASS = 'block text-xs font-medium text-text'
const HINT_CLASS = 'text-xs text-text-muted'
const GROUP_LABEL_CLASS = 'mb-1.5 block text-sm font-medium text-text'
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary aria-invalid:border-error max-md:min-h-11'
const LINK_BUTTON_CLASS =
  'rounded text-xs font-medium text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-primary'
const COUNTER_TONE_CLASS: Record<CounterTone, string> = {
  normal: 'text-text-muted',
  warn: 'text-warning',
  limit: 'text-error',
}
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

/** Overlay values the renderer accepts for this section; anything else renders as the first one. */
export function overlay_values_of(type: HomeSectionType, variant: string | undefined): readonly string[] {
  return is_hero_overlay(type, variant) ? HERO_OVERLAY_VARIANT_OVERLAYS : BG_IMAGE_OVERLAYS
}

/** Overlay shown as selected: the stored value when the renderer accepts it, else its fallback. */
export function effective_overlay(type: HomeSectionType, variant: string | undefined, value: string): string {
  const allowed = overlay_values_of(type, variant)
  return allowed.includes(value) ? value : (allowed[0] ?? value)
}
const CONSENT_MODE_OPTIONS: SegmentOption<(typeof CTA_CONSENT_MODES)[number]>[] = [
  { value: 'notice', label: 'Notice' },
  { value: 'checkbox', label: 'Checkbox' },
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

export type LayoutOption = { value: string; label: string }

/** Layout radio of each type: hero/cta-band `style.variant`, text-media `style.image_side`. */
export const LAYOUT_OPTIONS: Readonly<Record<Exclude<HomeSectionType, 'posts'>, readonly LayoutOption[]>> = {
  hero: HERO_VARIANTS.map((value) => ({
    value,
    label: { 'text-centric': 'Text only', split: 'Split', overlay: 'Overlay', stacked: 'Stacked' }[value],
  })),
  'text-media': IMAGE_SIDES.map((value) => ({ value, label: value === 'start' ? 'Image left' : 'Image right' })),
  'cta-band': CTA_BAND_VARIANTS.map((value) => ({
    value,
    label: { band: 'Band', card: 'Card', split: 'Split' }[value],
  })),
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

function TextInput(props: {
  field: TextFieldSpec
  value: string | undefined
  on_input: (value: string | undefined) => void
}) {
  const id = `home-field-${createUniqueId()}`
  const counter = () => text_counter(props.value, props.field)
  const unit_text = () => (props.field.unit === 'bytes' ? 'bytes' : 'characters')

  const handle_input = (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
    const next = text_field_value(props.field, event.currentTarget.value)
    if ((next ?? '') !== event.currentTarget.value) event.currentTarget.value = next ?? ''
    props.on_input(next)
  }

  const shared = () => ({
    id,
    class: FIELD_CLASS,
    value: props.value ?? '',
    required: props.field.required,
    'aria-describedby': `${id}-counter`,
    'aria-invalid': counter().count > props.field.max || (props.field.required && !props.value) || undefined,
    onInput: handle_input,
  })

  return (
    <div class="flex flex-col gap-1">
      <div class="flex items-baseline justify-between gap-2">
        <label for={id} class={LABEL_CLASS}>
          {props.field.label}
          <Show when={props.field.required}>
            <span class="text-text-muted"> (required)</span>
          </Show>
        </label>
        <span id={`${id}-counter`} class={`text-xs tabular-nums ${COUNTER_TONE_CLASS[counter().tone]}`}>
          {counter().text}
          <span class="sr-only"> {unit_text()}</span>
        </span>
      </div>
      <Show when={props.field.multiline} fallback={<input type="text" {...shared()} />}>
        <textarea rows={props.field.unit === 'bytes' ? 6 : 3} {...shared()} />
      </Show>
    </div>
  )
}

function UrlInput(props: {
  label: string
  value: string
  allow_contact: boolean
  required?: boolean
  on_input: (value: string) => void
}) {
  const id = `home-url-${createUniqueId()}`
  const error = () => cta_url_error(props.value, props.allow_contact)
  return (
    <div class="flex flex-col gap-1">
      <label for={id} class={LABEL_CLASS}>
        {props.label}
        <Show when={props.required}>
          <span class="text-text-muted"> (required)</span>
        </Show>
      </label>
      <input
        id={id}
        type="url"
        inputmode="url"
        class={FIELD_CLASS}
        value={props.value}
        placeholder="https://"
        required={props.required}
        aria-invalid={error() !== null || (props.required && props.value === '') || undefined}
        aria-describedby={error() ? `${id}-error` : undefined}
        onInput={(event) => props.on_input(event.currentTarget.value.trim())}
      />
      <Show when={error()}>
        {(message) => (
          <p id={`${id}-error`} class="text-xs text-error">
            {message()}
          </p>
        )}
      </Show>
    </div>
  )
}

function CtaFields(props: {
  title: string
  value: Cta | undefined
  allow_contact: boolean
  /** The link is required too (an added hero CTA); otherwise only the label is marked required. */
  url_required?: boolean
  on_change: (patch: Partial<Cta>) => void
  on_remove?: () => void
}) {
  const heading_id = `home-cta-${createUniqueId()}`
  const label_field = text_field('label', 'Label', LINK_LABEL_MAX_CHARS, { required: true })
  return (
    <section
      aria-labelledby={heading_id}
      data-home-cta=""
      class="flex flex-col gap-2 rounded-lg border border-border/60 p-2"
    >
      <div class="flex items-center justify-between gap-2">
        <h4 id={heading_id} class="text-xs font-semibold text-text">
          {props.title}
        </h4>
        <Show when={props.on_remove}>
          {(on_remove) => (
            <button
              type="button"
              class={LINK_BUTTON_CLASS}
              aria-label={`Remove button (${props.title.toLowerCase()})`}
              onClick={() => on_remove()()}
            >
              Remove button
            </button>
          )}
        </Show>
      </div>
      <TextInput
        field={label_field}
        value={props.value?.label}
        on_input={(label) => props.on_change({ label: label ?? '' })}
      />
      <UrlInput
        label="Link"
        value={props.value?.url ?? ''}
        allow_contact={props.allow_contact}
        required={props.url_required}
        on_input={(url) => props.on_change({ url })}
      />
    </section>
  )
}

function AddCtaButton(props: { on_click: () => void; children: JSX.Element }) {
  return (
    <button
      type="button"
      data-cta-add=""
      onClick={() => props.on_click()}
      class="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-3 py-2 text-sm text-text-muted hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
    >
      <Plus size={14} aria-hidden="true" />
      {props.children}
    </button>
  )
}

function MarkdownBody(props: {
  field: TextFieldSpec
  value: string | undefined
  on_input: (value: string | undefined) => void
}) {
  const [preview, set_preview] = createSignal(false)
  const html = createMemo(() => (preview() ? render_section_markdown(props.value ?? '', settings.locale) : ''))
  return (
    <div class="flex flex-col gap-1">
      <Show when={preview()} fallback={<TextInput field={props.field} value={props.value} on_input={props.on_input} />}>
        <span class={LABEL_CLASS}>{props.field.label} preview</span>
        <Show when={html()} fallback={<p class={HINT_CLASS}>Nothing to preview yet.</p>}>
          {/* Same allowlist renderer as the public page (sections/markdown.ts), so the HTML is safe and 1:1. */}
          <div
            class="section-md wrap-anywhere max-h-60 overflow-auto rounded-lg border border-border bg-bg p-2 text-sm"
            innerHTML={html()}
          />
        </Show>
      </Show>
      <div class="flex items-center justify-between gap-2">
        <p class={HINT_CLASS}>Bold, italic, links and lists.</p>
        <button
          type="button"
          class={LINK_BUTTON_CLASS}
          aria-pressed={preview()}
          onClick={() => set_preview(!preview())}
        >
          Preview
        </button>
      </div>
    </div>
  )
}

function LayoutThumb(props: { type: HomeSectionType; value: string }) {
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
        <Match when={props.type === 'hero' && props.value === 'text-centric'}>
          <div class="flex w-full flex-col items-center justify-center gap-1">
            {lines('w-2/3 items-center')}
            <div class={button} />
          </div>
        </Match>
        <Match when={props.type === 'hero' && props.value === 'split'}>
          <div class="flex w-full gap-1">
            {lines('flex-1 justify-center')}
            <div class={`${image} w-2/5`} />
          </div>
        </Match>
        <Match when={props.type === 'hero' && props.value === 'overlay'}>
          <div class="flex w-full items-center justify-center rounded-sm bg-current/25">
            <div class="flex w-2/3 flex-col gap-0.5 opacity-60">
              <div class="h-1 w-full rounded-full bg-bg-card" />
              <div class="h-1 w-3/4 rounded-full bg-bg-card" />
            </div>
          </div>
        </Match>
        <Match when={props.type === 'hero' && props.value === 'stacked'}>
          <div class="flex w-full flex-col gap-0.5">
            {lines('w-2/3')}
            <div class={`${image} flex-1`} />
          </div>
        </Match>
        <Match when={props.type === 'text-media'}>
          <div class={`flex w-full gap-1 ${props.value === 'end' ? 'flex-row-reverse' : ''}`}>
            <div class={`${image} w-1/3`} />
            {lines('flex-1 justify-center')}
          </div>
        </Match>
        <Match when={props.type === 'cta-band' && props.value === 'split'}>
          <div class="flex w-full items-center gap-1">
            {lines('flex-1')}
            <div class={button} />
          </div>
        </Match>
        <Match when={props.type === 'cta-band'}>
          <div
            class={`flex w-full flex-col items-center justify-center gap-1 ${
              props.value === 'card' ? 'mx-1.5 rounded-sm border border-current/40' : ''
            }`}
          >
            {lines('w-2/3 items-center')}
            <div class={button} />
          </div>
        </Match>
      </Switch>
    </div>
  )
}

function LayoutRadios(props: {
  type: Exclude<HomeSectionType, 'posts'>
  value: string
  on_change: (value: string) => void
}) {
  const name = `home-layout-${createUniqueId()}`
  const columns = () => (LAYOUT_OPTIONS[props.type].length === 3 ? 'grid-cols-3' : 'grid-cols-2')
  return (
    <fieldset>
      <legend class={GROUP_LABEL_CLASS}>Layout</legend>
      <div class={`grid gap-1.5 ${columns()}`}>
        <For each={LAYOUT_OPTIONS[props.type]}>
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
              <LayoutThumb type={props.type} value={option.value} />
              <span>{option.label}</span>
            </label>
          )}
        </For>
      </div>
    </fieldset>
  )
}

function BackgroundRadios(props: { value: string; on_change: (value: SectionBg) => void }) {
  const name = `home-bg-${createUniqueId()}`
  return (
    <fieldset>
      <legend class={GROUP_LABEL_CLASS}>Background</legend>
      <div class="grid grid-cols-4 gap-1.5">
        <For each={SECTION_BGS}>
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

function ContentTab(props: { section: HomeSection; on_edit_site?: () => void }) {
  const id = () => props.section.id
  const field_edit = use_field_edit()
  const scope = () => HOME_SECTION_LABELS[props.section.type]
  const tagged = (field: string, label: string, edit: () => void) =>
    field_edit({ key: home_field_key(id(), field), label }, edit)
  const tagged_cta = (field: string, title: string, patch: Partial<Cta>, edit: () => void) => {
    const part = 'url' in patch ? 'link' : 'label'
    tagged(`${field}.${part}`, edited_label(`${scope()} ${title}`, part), edit)
  }
  const set_text = (field: TextFieldSpec, value: string | undefined) => {
    const type = props.section.type
    tagged(field.key, edited_label(scope(), field.label), () =>
      commit_home_section(id(), type, () => ({ content: { [field.key]: value } }) as HomeSectionPatch<typeof type>)
    )
  }
  const value_of = (key: string): string | undefined => {
    const value = (props.section.content as Record<string, unknown>)[key]
    return typeof value === 'string' ? value : undefined
  }
  const set_image = (image: ImageRef | undefined) => {
    const type = props.section.type
    if (type === 'hero' || type === 'text-media') {
      field_edit({ label: changed_label(scope(), 'image') }, () =>
        commit_home_section(id(), type, () => ({ content: { image } }))
      )
    }
  }
  let ctas_el: HTMLDivElement | undefined
  const focus_ctas = (target: 'last-cta' | 'add') =>
    queueMicrotask(() => {
      const last_cta = [...(ctas_el?.querySelectorAll<HTMLElement>('[data-home-cta]') ?? [])].at(-1)
      const el =
        target === 'add'
          ? (ctas_el?.querySelector<HTMLElement>('[data-cta-add]') ?? last_cta?.querySelector('input'))
          : last_cta?.querySelector('input')
      el?.focus({ preventScroll: true })
    })
  const set_hero_cta = (index: number, patch: Partial<Cta>) =>
    tagged_cta(`cta${index}`, HERO_CTA_TITLES[index] ?? 'button', patch, () =>
      commit_home_section(id(), 'hero', (section) => {
        const cta = hero_cta_update(section.content.cta, index, patch)
        return cta ? { content: { cta } } : null
      })
    )
  const add_hero_cta = () =>
    field_edit({ label: added_label(scope(), 'button') }, () => {
      const added = commit_home_section(id(), 'hero', (section) => {
        const cta = hero_cta_add(section.content.cta)
        return cta ? { content: { cta } } : null
      })
      if (added) focus_ctas('last-cta')
    })
  const remove_hero_cta = (index: number) =>
    field_edit({ label: removed_label(scope(), HERO_CTA_TITLES[index] ?? 'button') }, () => {
      commit_home_section(id(), 'hero', (section) => ({
        content: { cta: hero_cta_remove(section.content.cta, index) },
      }))
      focus_ctas('add')
    })
  const set_text_media_cta = (patch: Partial<Cta>) =>
    tagged_cta('cta', 'button', patch, () =>
      commit_home_section(id(), 'text-media', (section) => {
        const cta = text_media_cta_update(section.content.cta, patch)
        return cta ? { content: { cta } } : null
      })
    )
  const add_text_media_cta = () =>
    field_edit({ label: added_label(scope(), 'button') }, () => {
      const added = commit_home_section(id(), 'text-media', (section) => {
        const cta = text_media_cta_add(section.content.cta)
        return cta ? { content: { cta } } : null
      })
      if (added) focus_ctas('last-cta')
    })
  const remove_text_media_cta = () =>
    field_edit({ label: removed_label(scope(), 'button') }, () => {
      commit_home_section(id(), 'text-media', () => ({ content: { cta: undefined } }))
      focus_ctas('add')
    })
  const set_cta_band_button = (patch: Partial<Cta>) =>
    tagged_cta('button', 'button', patch, () =>
      commit_home_section(id(), 'cta-band', (section) => ({
        content: { button: { ...section.content.button, ...patch } },
      }))
    )

  const cta_type = (): CtaType | null =>
    props.section.type === 'hero' || props.section.type === 'text-media' ? props.section.type : null

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

      <For each={CONTENT_TEXT_FIELDS[props.section.type]}>
        {(field) => (
          <Show
            when={field.key === 'body_md'}
            fallback={
              <TextInput field={field} value={value_of(field.key)} on_input={(value) => set_text(field, value)} />
            }
          >
            <MarkdownBody field={field} value={value_of(field.key)} on_input={(value) => set_text(field, value)} />
          </Show>
        )}
      </For>

      <Show when={props.section.type === 'posts'}>
        <p class={HINT_CLASS}>{POSTS_CONTENT_NOTE}</p>
      </Show>

      <Show when={cta_type()}>
        <ImageField
          label="Image"
          value={(props.section as SectionOf<CtaType>).content.image}
          on_change={set_image}
          can_upload={can_upload()}
          recommended={image_recommendation(props.section)}
        />
      </Show>

      <Show when={props.section.type === 'hero' && (props.section as SectionOf<'hero'>)}>
        {(hero) => (
          <div ref={ctas_el} class="flex flex-col gap-2">
            <Index each={hero().content.cta ?? []}>
              {(cta, index) => (
                <CtaFields
                  title={HERO_CTA_TITLES[index] ?? 'Button'}
                  value={cta()}
                  allow_contact
                  url_required
                  on_change={(patch) => set_hero_cta(index, patch)}
                  on_remove={() => remove_hero_cta(index)}
                />
              )}
            </Index>
            <Show when={(hero().content.cta?.length ?? 0) < HERO_CTA_MAX}>
              <AddCtaButton on_click={add_hero_cta}>
                Add button ({hero().content.cta?.length ?? 0}/{HERO_CTA_MAX})
              </AddCtaButton>
            </Show>
          </div>
        )}
      </Show>

      <Show when={props.section.type === 'text-media' && (props.section as SectionOf<'text-media'>)}>
        {(section) => (
          <div ref={ctas_el} class="flex flex-col gap-2">
            <Show
              when={section().content.cta}
              fallback={<AddCtaButton on_click={add_text_media_cta}>Add button</AddCtaButton>}
            >
              {(cta) => (
                <CtaFields
                  title="Button"
                  value={cta()}
                  allow_contact
                  url_required
                  on_change={set_text_media_cta}
                  on_remove={remove_text_media_cta}
                />
              )}
            </Show>
          </div>
        )}
      </Show>

      <Show when={props.section.type === 'cta-band' && (props.section as SectionOf<'cta-band'>)}>
        {(band) => (
          <>
            <CtaFields
              title="Button"
              value={band().content.button}
              allow_contact={false}
              on_change={set_cta_band_button}
            />
            <Segmented
              label="Consent"
              options={CONSENT_MODE_OPTIONS}
              value={band().content.consent_mode}
              on_change={(consent_mode) =>
                field_edit({ label: changed_label(scope(), 'consent') }, () =>
                  commit_home_section(id(), 'cta-band', () => ({ content: { consent_mode } }))
                )
              }
            />
          </>
        )}
      </Show>
    </>
  )
}

function StyleTab(props: { section: HomeSection }) {
  const style = () => props.section.style as Record<string, string | ImageRef | undefined>
  const enum_value = (key: string): string => {
    const value = style()[key]
    return typeof value === 'string' ? value : style_default(props.section.type, key)
  }
  const field_edit = use_field_edit()
  const set_style = (patch: Record<string, unknown>) => {
    const type = props.section.type
    const label = changed_label(HOME_SECTION_LABELS[type], style_field_label(Object.keys(patch).join(' ')))
    field_edit({ label }, () =>
      commit_home_section(props.section.id, type, () => ({ style: patch }) as HomeSectionPatch<typeof type>)
    )
  }
  const controls = createMemo(() =>
    style_controls_of(props.section.type, { bg: enum_value('bg'), variant: style().variant as string | undefined })
  )
  const has = (control: StyleControl) => controls().includes(control)
  const variant = () => style().variant as string | undefined
  const overlay_options = createMemo(() => {
    const allowed = overlay_values_of(props.section.type, variant())
    return OVERLAY_OPTIONS.filter((option) => allowed.includes(option.value))
  })
  const layout_key = () => (props.section.type === 'text-media' ? 'image_side' : 'variant')
  const layout_type = () => (props.section.type === 'posts' ? null : props.section.type)

  return (
    <>
      <Show when={has('layout') && layout_type()}>
        {(type) => (
          <LayoutRadios
            type={type()}
            value={enum_value(layout_key())}
            on_change={(value) => set_style({ [layout_key()]: value })}
          />
        )}
      </Show>

      <BackgroundRadios value={enum_value('bg')} on_change={(bg) => set_style({ bg })} />

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
          value={effective_overlay(props.section.type, variant(), enum_value('overlay'))}
          on_change={(overlay) => set_style({ overlay })}
        />
      </Show>

      <Segmented
        label="Width"
        options={WIDTH_OPTIONS}
        value={enum_value('width')}
        on_change={(width) => set_style({ width })}
      />
      <Segmented
        label="Spacing"
        options={SPACING_OPTIONS}
        value={enum_value('spacing')}
        on_change={(spacing) => set_style({ spacing })}
      />
      <Show when={has('height')}>
        <Segmented
          label="Height"
          options={HEIGHT_OPTIONS}
          value={enum_value('height')}
          on_change={(height) => set_style({ height })}
        />
      </Show>
      <Show when={has('align')}>
        <Segmented
          label="Alignment"
          options={ALIGN_OPTIONS}
          value={enum_value('align')}
          on_change={(align) => set_style({ align })}
        />
      </Show>
      <Show when={has('image_side')}>
        <Segmented
          label="Image side"
          options={IMAGE_SIDE_OPTIONS}
          value={enum_value('image_side')}
          on_change={(image_side) => set_style({ image_side })}
        />
      </Show>
      <Show when={has('ratio')}>
        <Segmented
          label="Image ratio"
          options={RATIO_OPTIONS}
          value={enum_value('ratio')}
          on_change={(ratio) => set_style({ ratio })}
        />
      </Show>
      <Show when={has('image_shape')}>
        <Segmented
          label="Image shape"
          options={SHAPE_OPTIONS}
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

  return (
    <PopoverShell
      open
      anchor={props.anchor}
      onClose={props.on_close}
      element_label={section() ? HOME_SECTION_LABELS[section()!.type] : 'Section'}
      slot_label="Home section"
    >
      <Show when={section()} fallback={<p class={HINT_CLASS}>This section no longer exists.</p>}>
        {(current) => (
          <>
            <Tabs active={tab()} on_change={set_tab} panel_id={panel_id} tab_id={tab_id} />
            <div id={panel_id} role="tabpanel" aria-labelledby={tab_id(tab())} class="flex flex-col gap-4">
              <Show when={tab() === 'content'} fallback={<StyleTab section={current()} />}>
                <ContentTab section={current()} on_edit_site={props.on_edit_site} />
              </Show>
            </div>
          </>
        )}
      </Show>
    </PopoverShell>
  )
}
