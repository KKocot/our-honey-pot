// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Contract of the home section registry: one `SectionDefinition` per section type drives the Zod schema,
 * the tolerant config reader, save validation, the Add section menu and the /admin editor; one renderer
 * per type (`SectionRenderers`) drives the public HTML and the canvas (ADR 6ac6089d63221e857a3bac13).
 *
 * Import direction (no cycles): `admin/types/settings(-schema).ts` -> `sections/registry.ts`
 * -> `<type>/definition.ts` -> this module. Definitions and this module never value-import `settings.ts`,
 * `settings-schema.ts`, `utils.ts`, `markdown.ts` or any `render.ts`: render modules import settings.ts and
 * read it at module top level (markdown.ts), so pulling them into the settings.ts graph breaks module init.
 * Renderers are bound outside that graph, in the dispatch module (`sections/render.ts`) via `SectionRenderers`.
 *
 * Adding a type: `<type>/definition.ts` exporting `define_section({...})` + one import and one entry in
 * `SECTION_DEFINITIONS` in `registry.ts` at its Add section menu position; `<type>/render.ts` + its entry in the `SectionRenderers`
 * map (typecheck fails until it exists). Schemas, limits, style defaults and the Add section menu follow.
 */

import { z } from 'zod'
import type { SettingsData } from '../../../components/admin/types/settings'
import { LINK_LABEL_MAX_CHARS } from '../../../components/admin/types/navigation'
import { ContactUrlSchema, ImageRefSchema } from '../../../lib/image-ref'
import type { SectionRenderContext } from './types'

/** 8 chars, no hyphen: cannot collide with `page-sec-*` layout section ids or element ids. */
export const HOME_SECTION_ID_REGEX = /^[a-z0-9]{8}$/

export const SECTION_WIDTHS = Object.freeze(['content', 'full'] as const)
export const SECTION_SPACINGS = Object.freeze(['sm', 'md', 'lg'] as const)
export const SECTION_BGS = Object.freeze(['none', 'bg', 'bg-secondary', 'card', 'primary', 'accent', 'image'] as const)
export const SECTION_OVERLAYS = Object.freeze(['none', 'dark-30', 'dark-50', 'dark-70', 'light-50'] as const)
export const SECTION_ALIGNS = Object.freeze(['start', 'center'] as const)
export const IMAGE_SIDES = Object.freeze(['start', 'end'] as const)
/** Overlays of an image background: text sits on the image, so `none` is not offered (spec 2.1). */
export const IMAGE_BG_OVERLAYS: readonly string[] = Object.freeze(SECTION_OVERLAYS.filter((value) => value !== 'none'))
/** Backgrounds of running-text sections: long text over a photo reads poorly, so `image` is left out. */
export const TEXT_SECTION_BGS = Object.freeze([
  'none',
  'bg',
  'bg-secondary',
  'card',
  'primary',
  'accent',
] as const) satisfies readonly (typeof SECTION_BGS)[number][]

/** Style every section shares; out-of-enum values fall back to these (ADR 6ac78ae263221e857a3bc274). */
export const COMMON_STYLE_DEFAULTS = Object.freeze({
  width: 'content',
  spacing: 'md',
  bg: 'none',
  overlay: 'dark-50',
} as const)

export function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const utf8_encoder = new TextEncoder()

export function utf8_length(value: string): number {
  return utf8_encoder.encode(value).length
}

export function code_point_length(value: string): number {
  return Array.from(value).length
}

/** Trimmed text of `min`-`max` code points. */
export function text_schema(min: number, max: number) {
  return z
    .string()
    .transform((value) => value.trim())
    .refine(
      (value) => {
        const length = code_point_length(value)
        return length >= min && length <= max
      },
      { message: `Text must be ${min}-${max} characters` }
    )
}

/** Markdown source limited in UTF-8 bytes; rendering goes through the allowlist in `markdown.ts` (ADR 6acfb92e63221e857a3c63f1). */
export function markdown_schema(max_bytes: number) {
  return z.string().refine((value) => utf8_length(value) <= max_bytes, {
    message: `Markdown must be at most ${max_bytes} bytes (UTF-8)`,
  })
}

/** Style enum that never fails a section: unknown values fall back, a missing one gets the default. */
export function style_enum<T extends readonly [string, ...string[]]>(options: T, fallback: T[number]) {
  return z.enum(options).catch(fallback).default(fallback)
}

export const link_label_schema = text_schema(1, LINK_LABEL_MAX_CHARS)

export const CtaSchema = z.object({
  label: link_label_schema,
  url: ContactUrlSchema,
})

const decorative_image_schema = z.preprocess(
  (raw) => (is_record(raw) ? { ...raw, decorative: true } : raw),
  ImageRefSchema
)

/** Shape of the shared style fields; spread it into every `style_schema` object. */
export const common_style_shape = {
  width: style_enum(SECTION_WIDTHS, COMMON_STYLE_DEFAULTS.width),
  spacing: style_enum(SECTION_SPACINGS, COMMON_STYLE_DEFAULTS.spacing),
  bg: style_enum(SECTION_BGS, COMMON_STYLE_DEFAULTS.bg),
  bg_image: decorative_image_schema.optional(),
  overlay: style_enum(SECTION_OVERLAYS, COMMON_STYLE_DEFAULTS.overlay),
}

/** Layout containers a home section can be placed in besides the main column (home page only). */
export const SECTION_PLACEMENT_CONTAINERS = Object.freeze(['top', 'bottom', 'sidebarLeft', 'sidebarRight'] as const)
export type SectionPlacementContainer = (typeof SECTION_PLACEMENT_CONTAINERS)[number]

/** `{ container, index }` restricted to `allowed`; a container outside it fails at the `placement` path. */
export function placement_schema(allowed: readonly SectionPlacementContainer[]) {
  return z
    .object({
      container: z.enum(SECTION_PLACEMENT_CONTAINERS),
      index: z.number().int().min(0),
    })
    .refine((placement) => allowed.includes(placement.container), {
      message: 'Section type cannot be placed in this container',
    })
}

/** `placements` of full-width types (hero, cta-band): a narrow sidebar cannot hold them. */
export const EDGE_PLACEMENTS: readonly SectionPlacementContainer[] = Object.freeze(['top', 'bottom'])

export type SectionPlacementSchema = ReturnType<typeof placement_schema>
export type SectionPlacement = z.output<SectionPlacementSchema>

/** Absent `placement` = the main column. `build_section_schema` narrows it to the type's `placements`. */
export const section_base_shape = {
  id: z.string().regex(HOME_SECTION_ID_REGEX, {
    message: 'Section id must be 8 characters [a-z0-9]',
  }),
  hidden: z.boolean().optional(),
  placement: placement_schema(SECTION_PLACEMENT_CONTAINERS).optional(),
}

export function pick_valid<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T | undefined {
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

// Hostile config arrays are read on every SSR request: only the first `limit * N` raw entries are ever parsed.
const RAW_ENTRIES_SCANNED_PER_KEPT_SLOT = 4

export function raw_scan_window(values: ReadonlyArray<unknown>, limit: number): ReadonlyArray<unknown> {
  return values.slice(0, limit * RAW_ENTRIES_SCANNED_PER_KEPT_SLOT)
}

/** Valid entries of an untrusted list, at most `max`; a non-array yields []. */
export function pick_valid_list<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown, max: number): T[] {
  if (!Array.isArray(value)) return []
  const picked: T[] = []
  for (const raw_item of raw_scan_window(value, max)) {
    if (picked.length >= max) break
    const parsed = pick_valid(schema, raw_item)
    if (parsed !== undefined) picked.push(parsed)
  }
  return picked
}

export type SectionSchema<T extends string, C extends z.ZodTypeAny, S extends z.ZodTypeAny> = z.ZodObject<{
  id: z.ZodString
  hidden: z.ZodOptional<z.ZodBoolean>
  placement: z.ZodOptional<SectionPlacementSchema>
  type: z.ZodLiteral<T>
  content: C
  style: S
}>

/** A parsed section of type `T` (what `HomeSection` narrows to). */
export type SectionValue<T extends string, C extends z.ZodTypeAny, S extends z.ZodTypeAny> = z.output<
  SectionSchema<T, C, S>
>

export interface SectionDefaults<C extends z.ZodTypeAny, S extends z.ZodTypeAny> {
  content: z.output<C>
  style: z.output<S>
}

export type StyleDefaults = Readonly<Record<string, string>>
/** Style key (`bg`, `image_shape`) -> the only values its Style tab control offers. */
export type StyleOptions = Readonly<Record<string, readonly string[]>>
export type TextLimits = Readonly<Record<string, number>>
/** Loose view of `section.style` for the editor helpers (Solid store values included). */
export type StyleValues = Readonly<Record<string, unknown>>

/**
 * Style tab controls; a new control needs a matching editor in HomeSectionPopover. The options of an enum
 * control can be narrowed per definition with `SectionDefinition.style_options` (keyed by the style key).
 */
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

/** Miniatures the Layout radio can draw; a new shape needs a matching drawing in HomeSectionPopover. */
export type LayoutThumb =
  | 'centered-button'
  | 'card-button'
  | 'row-button'
  | 'text-image'
  | 'image-text'
  | 'text-above-image'
  | 'image-above-text'
  | 'overlay'
  | 'list'
  | 'grid'
  | 'rule'
  | 'centered'

export interface LayoutOption {
  value: string
  /** Admin label (EN). */
  label: string
  thumb: LayoutThumb
}

export interface FieldOption {
  value: string
  label: string
}

export interface ImageRecommendation {
  ratio: number
  ratio_label: string
}

interface FieldBase {
  /** Content key, relative to the parent (`section.content`, a list item or a group). */
  key: string
  /** Admin label (EN). */
  label: string
  /** Absent = optional: an emptied field is removed from the content. */
  required?: boolean
  hint?: string
}

/** Plain text counted in code points; `textarea` is the multiline variant. */
export interface TextFieldDescriptor extends FieldBase {
  kind: 'text' | 'textarea'
  max_len: number
}

/** Markdown counted in UTF-8 bytes, rendered through `render_section_markdown`. */
export interface MarkdownFieldDescriptor extends FieldBase {
  kind: 'markdown'
  max_bytes: number
}

/** Link target: https always, mailto:/tel: only with `allow_contact`. */
export interface UrlFieldDescriptor extends FieldBase {
  kind: 'url'
  allow_contact: boolean
}

/** `ImageRef` (url + alt); the recommended ratio comes from `SectionDefinition.image_recommendation`. */
export interface ImageFieldDescriptor extends FieldBase {
  kind: 'image'
}

export interface SelectFieldDescriptor extends FieldBase {
  kind: 'select'
  options: readonly FieldOption[]
}

/** ISO date `YYYY-MM-DD`. */
export interface DateFieldDescriptor extends FieldBase {
  kind: 'date'
}

export interface BooleanFieldDescriptor extends FieldBase {
  kind: 'boolean'
}

/** Array of objects; entries are added and removed explicitly, `item_labels[i]` titles entry `i`. */
export interface ListFieldDescriptor extends FieldBase {
  kind: 'list'
  item_fields: readonly FieldDescriptor[]
  max: number
  item_labels?: readonly string[]
}

/** Nested object (e.g. a button); an optional group is added and removed as a whole. */
export interface GroupFieldDescriptor extends FieldBase {
  kind: 'group'
  fields: readonly FieldDescriptor[]
}

/** Declarative editor field; generic Content tab editors are built from these. */
export type FieldDescriptor =
  | TextFieldDescriptor
  | MarkdownFieldDescriptor
  | UrlFieldDescriptor
  | ImageFieldDescriptor
  | SelectFieldDescriptor
  | DateFieldDescriptor
  | BooleanFieldDescriptor
  | ListFieldDescriptor
  | GroupFieldDescriptor

export type FieldKind = FieldDescriptor['kind']

/**
 * One home section type. Keys of `text_limits` are unprefixed (`headline_chars`); settings.ts publishes them
 * prefixed with the snake-cased type (`hero_headline_chars`) as `SECTION_TEXT_LIMITS`.
 */
export interface SectionDefinition<
  T extends string = string,
  C extends z.ZodTypeAny = z.ZodTypeAny,
  S extends z.ZodTypeAny = z.ZodTypeAny,
  SD extends StyleDefaults = StyleDefaults,
  L extends TextLimits = TextLimits,
> {
  readonly type: T
  /** Admin label (EN): stack item, popover title, save errors. */
  readonly label: string
  /** One sentence for the Add section menu. */
  readonly description: string
  readonly content_schema: C
  /** Must accept `{}` (every style field has a default). */
  readonly style_schema: S
  /** Full section object (`id`, `hidden`, `placement`, `type`, `content`, `style`); member of `HomeSectionSchema`. */
  readonly schema: SectionSchema<T, C, S>
  /** Type-specific style defaults, applied over `COMMON_STYLE_DEFAULTS`. */
  readonly style_defaults: SD
  readonly text_limits: L
  /** Upper bound of sections of this type on the home page. */
  readonly max_per_page: number
  /** Exactly one per page, never added, removed, duplicated or hidden by the owner (`posts`). */
  readonly fixed: boolean
  /** Top-level content keys whose invalid value drops the whole section in the tolerant reader. */
  readonly required_content_keys: readonly string[]
  /**
   * Content dot path -> placeholder text a new section starts with; the editor treats it as unfilled.
   * A numeric segment addresses a list entry (`items.1.label`). The example texts of one list field are
   * matched at every position, so an example moved to another entry still blocks Save (`placeholder_paths`).
   */
  readonly placeholder: Readonly<Record<string, string>>
  /** Content dot paths a new section leaves empty on purpose, so it cannot be saved until the owner fills them. */
  readonly must_fill: readonly string[]
  readonly has_layout: boolean
  /** Style key the Layout radio writes (`variant`, `image_side`); null without a layout control. */
  readonly layout_key: string | null
  readonly layout_options: readonly LayoutOption[]
  readonly fields: readonly FieldDescriptor[]
  /** Narrowed Style tab options; a key not listed offers every value of its enum. Keep in line with `style_schema`. */
  readonly style_options: StyleOptions
  /** The section collects consent, so the editor warns while `footer.privacy` is missing. */
  readonly requires_privacy_link: boolean
  /** Layout containers this type may be placed in on the home page; the main column is always allowed. */
  readonly placements: readonly SectionPlacementContainer[]
  /** Fresh content (placeholders + `must_fill` left empty) and full style of a new section. */
  defaults(): SectionDefaults<C, S>
  /** Style tab controls for the current style values. */
  style_controls(style: StyleValues): StyleControl[]
  /** Overlay values the renderer accepts for a backdrop in this style. */
  overlay_values(style: StyleValues): readonly string[]
  /** Rewrites raw untrusted content in place before the schema pass of the tolerant reader. */
  prepare_content?(content: Record<string, unknown>): void
  /** Save errors spanning other settings; called once with all sections of this type when there is any. */
  cross_field_errors?(sections: readonly SectionValue<T, C, S>[], settings: SettingsData): string[]
  image_recommendation?(section: SectionValue<T, C, S>): ImageRecommendation | undefined
}

/** Any registered definition, e.g. the result of `get_section_definition` for a runtime string. */
export type AnySectionDefinition = SectionDefinition<string, z.ZodTypeAny, z.ZodTypeAny, StyleDefaults, TextLimits>

/** Input of `define_section`: `schema` is built, the flags below default to "not special". */
export type SectionSpec<
  T extends string,
  C extends z.ZodTypeAny,
  S extends z.ZodTypeAny,
  SD extends StyleDefaults,
  L extends TextLimits,
> = Omit<
  SectionDefinition<T, C, S, SD, L>,
  | 'schema'
  | 'fixed'
  | 'required_content_keys'
  | 'placeholder'
  | 'must_fill'
  | 'has_layout'
  | 'layout_key'
  | 'layout_options'
  | 'requires_privacy_link'
  | 'style_controls'
  | 'overlay_values'
  | 'style_options'
> & {
  fixed?: boolean
  style_options?: StyleOptions
  required_content_keys?: readonly string[]
  placeholder?: Readonly<Record<string, string>>
  must_fill?: readonly string[]
  layout?: { key: string; options: readonly LayoutOption[] }
  requires_privacy_link?: boolean
  /** Default: `base_style_controls` with the layout radio when `layout` is set. */
  style_controls?(style: StyleValues): StyleControl[]
  /** Default: `IMAGE_BG_OVERLAYS`. */
  overlay_values?(style: StyleValues): readonly string[]
}

/** Parsed section of a definition. */
export type SectionValueOf<D> =
  D extends SectionDefinition<infer T, infer C, infer S, StyleDefaults, TextLimits> ? SectionValue<T, C, S> : never

/** Public HTML of one section, also used 1:1 by the /admin canvas; '' renders nothing. */
export type SectionRenderFn<D> = (section: SectionValueOf<D>, ctx: SectionRenderContext) => string

/**
 * One renderer per registered type, e.g. `{ hero: render_hero, ... } satisfies SectionRenderers<SectionDefinitions>`
 * in the dispatch module; a registered type without a renderer fails typecheck.
 */
export type SectionRenderers<D extends readonly AnySectionDefinition[]> = {
  readonly [E in D[number] as E['type']]: SectionRenderFn<E>
}

export function build_section_schema<T extends string, C extends z.ZodTypeAny, S extends z.ZodTypeAny>(
  type: T,
  content_schema: C,
  style_schema: S,
  placements: readonly SectionPlacementContainer[] = []
): SectionSchema<T, C, S> {
  return z.object({
    ...section_base_shape,
    placement: placement_schema(placements).optional(),
    type: z.literal(type),
    content: content_schema,
    style: style_schema,
  })
}

/**
 * Shared Style tab controls: layout radio, background (+ image and overlay when it is an image), width, spacing.
 * `text_on_image`: the section puts its text on its own image (hero `overlay`), so overlay shows without `bg: image`.
 */
export function base_style_controls(
  style: StyleValues,
  options: { layout: boolean; text_on_image?: boolean }
): StyleControl[] {
  const controls: StyleControl[] = []
  const text_on_image = options.text_on_image === true
  if (options.layout) controls.push('layout')
  controls.push('background')
  if (style.bg === 'image' && !text_on_image) controls.push('bg_image')
  if (style.bg === 'image' || text_on_image) controls.push('overlay')
  controls.push('width', 'spacing')
  return controls
}

export function define_section<
  T extends string,
  C extends z.ZodTypeAny,
  S extends z.ZodTypeAny,
  SD extends StyleDefaults,
  L extends TextLimits,
>(spec: SectionSpec<T, C, S, SD, L>): SectionDefinition<T, C, S, SD, L> {
  const { layout, style_controls, overlay_values, style_options, ...rest } = spec
  const has_layout = layout !== undefined
  return Object.freeze({
    ...rest,
    schema: build_section_schema(spec.type, spec.content_schema, spec.style_schema, spec.placements),
    placements: Object.freeze([...spec.placements]),
    style_options: Object.freeze({ ...style_options }),
    fixed: spec.fixed ?? false,
    required_content_keys: Object.freeze([...(spec.required_content_keys ?? [])]),
    placeholder: Object.freeze({ ...spec.placeholder }),
    must_fill: Object.freeze([...(spec.must_fill ?? [])]),
    has_layout,
    layout_key: layout?.key ?? null,
    layout_options: Object.freeze([...(layout?.options ?? [])]),
    requires_privacy_link: spec.requires_privacy_link ?? false,
    style_controls: style_controls ?? ((style: StyleValues) => base_style_controls(style, { layout: has_layout })),
    overlay_values: overlay_values ?? (() => IMAGE_BG_OVERLAYS),
  })
}

const LIST_INDEX_REGEX = /^\d+$/

function step_into(value: unknown, key: string): { found: boolean; value: unknown } {
  if (Array.isArray(value)) {
    const index = LIST_INDEX_REGEX.test(key) ? Number(key) : -1
    return index >= 0 && index < value.length
      ? { found: true, value: value[index] }
      : { found: false, value: undefined }
  }
  if (is_record(value) && Object.hasOwn(value, key)) return { found: true, value: value[key] }
  return { found: false, value: undefined }
}

/** Value at a content dot path (`button.url`, `items.1.label`); undefined when any step is missing. */
export function content_value_at(content: unknown, path: string): unknown {
  let value: unknown = content
  for (const key of path.split('.')) {
    const step = step_into(value, key)
    if (!step.found) return undefined
    value = step.value
  }
  return value
}

/** `items.1.label` -> `items.*.label`: the list field a placeholder path belongs to. */
function list_pattern(path: string): string {
  return path
    .split('.')
    .map((key) => (LIST_INDEX_REGEX.test(key) ? '*' : key))
    .join('.')
}

/** Concrete paths and values of a pattern; `*` expands to every entry of the list found there. */
function expand_pattern(value: unknown, keys: readonly string[], prefix: string): Array<[string, unknown]> {
  if (keys.length === 0) return [[prefix, value]]
  const [key, ...rest] = keys
  const join = (part: string) => (prefix === '' ? part : `${prefix}.${part}`)
  if (key === '*') {
    if (!Array.isArray(value)) return []
    return value.flatMap((item, index) => expand_pattern(item, rest, join(String(index))))
  }
  const step = step_into(value, key)
  return step.found ? expand_pattern(step.value, rest, join(key)) : []
}

/** Content paths still holding a placeholder text; list entries are matched against every example of their list field. */
export function placeholder_paths(definition: Pick<AnySectionDefinition, 'placeholder'>, content: unknown): string[] {
  const examples = new Map<string, Set<string>>()
  for (const [path, text] of Object.entries(definition.placeholder)) {
    const pattern = list_pattern(path)
    examples.set(pattern, (examples.get(pattern) ?? new Set()).add(text))
  }
  const hits: string[] = []
  for (const [pattern, texts] of examples) {
    for (const [path, value] of expand_pattern(content, pattern.split('.'), '')) {
      if (typeof value === 'string' && texts.has(value)) hits.push(path)
    }
  }
  return hits
}

/** Content paths still holding their placeholder text or left empty from `must_fill`; [] = filled in. */
export function unfilled_paths(
  definition: Pick<AnySectionDefinition, 'placeholder' | 'must_fill'>,
  content: unknown
): string[] {
  const empty_paths = definition.must_fill.filter((path) => {
    const value = content_value_at(content, path)
    return typeof value !== 'string' || value.trim() === ''
  })
  return [...placeholder_paths(definition, content), ...empty_paths]
}

/** `text-media` -> `text_media`: prefix of a type's keys in `SECTION_TEXT_LIMITS`. */
export type SnakeCase<S extends string> = S extends `${infer Head}-${infer Tail}` ? `${Head}_${SnakeCase<Tail>}` : S

export function snake_case(type: string): string {
  return type.replace(/-/g, '_')
}

type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (arg: infer I) => void ? I : never

type PrefixedTextLimits<D> = D extends { type: infer T extends string; text_limits: infer L }
  ? { readonly [K in keyof L & string as `${SnakeCase<T>}_${K}`]: L[K] }
  : never

/** Types of the definitions, in registry order. */
export type DefinitionTypes<D extends readonly AnySectionDefinition[]> = { readonly [K in keyof D]: D[K]['type'] }

/** Mutable tuple of the section schemas, as `z.discriminatedUnion` expects it. */
export type DefinitionSchemas<D extends readonly AnySectionDefinition[]> = { -readonly [K in keyof D]: D[K]['schema'] }

export type StyleDefaultsByType<D extends readonly AnySectionDefinition[]> = {
  readonly [E in D[number] as E['type']]: E['style_defaults']
}

export type PrefixedTextLimitsOf<D extends readonly AnySectionDefinition[]> = UnionToIntersection<
  PrefixedTextLimits<D[number]>
>
