// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Registry of home section types; order = order of `HOME_SECTION_TYPES` and of the Add section menu.
 * New type: one import of its `definition.ts` and one entry in `SECTION_DEFINITIONS` at its menu position.
 * Must stay free of render modules (see the header of registry-types.ts).
 */

import { z } from 'zod'
import {
  COMMON_STYLE_DEFAULTS,
  common_style_shape,
  define_section,
  text_schema,
  type AnySectionDefinition,
  type SectionDefinition,
} from './registry-types'
import { about_definition } from './about/definition'
import { callout_definition } from './callout/definition'
import { cta_band_definition } from './cta-band/definition'
import { faq_definition } from './faq/definition'
import { hero_definition } from './hero/definition'
import { links_definition } from './links/definition'
import { now_definition } from './now/definition'
import { quote_definition } from './quote/definition'
import { text_media_definition } from './text-media/definition'

const POSTS_TEXT_LIMITS = Object.freeze({ title_chars: 60 })
const POSTS_STYLE_DEFAULTS = Object.freeze({})

const posts_content_schema = z.object({ title: text_schema(0, POSTS_TEXT_LIMITS.title_chars).optional() }).default({})
const posts_style_schema = z.object(common_style_shape).default({})

/** The blog posts list: fixed, exactly one per page; its HTML comes from the posts island (renderer returns ''). */
export const posts_definition: SectionDefinition<
  'posts',
  typeof posts_content_schema,
  typeof posts_style_schema,
  typeof POSTS_STYLE_DEFAULTS,
  typeof POSTS_TEXT_LIMITS
> = define_section({
  type: 'posts',
  label: 'Posts',
  description: 'The list of blog posts.',
  content_schema: posts_content_schema,
  style_schema: posts_style_schema,
  style_defaults: POSTS_STYLE_DEFAULTS,
  text_limits: POSTS_TEXT_LIMITS,
  max_per_page: 1,
  fixed: true,
  fields: [{ kind: 'text', key: 'title', label: 'Title', max_len: POSTS_TEXT_LIMITS.title_chars }],
  defaults: () => ({ content: {}, style: { ...COMMON_STYLE_DEFAULTS } }),
})

export const SECTION_DEFINITIONS = Object.freeze([
  hero_definition,
  text_media_definition,
  about_definition,
  links_definition,
  callout_definition,
  now_definition,
  quote_definition,
  faq_definition,
  posts_definition,
  cta_band_definition,
] as const)

export type SectionDefinitions = typeof SECTION_DEFINITIONS
export type RegisteredSectionDefinition = SectionDefinitions[number]
export type RegisteredSectionType = RegisteredSectionDefinition['type']

const DEFINITIONS_BY_TYPE: ReadonlyMap<string, AnySectionDefinition> = new Map(
  SECTION_DEFINITIONS.map((definition): [string, AnySectionDefinition] => [definition.type, definition])
)

/** Definition of a registered type; undefined for anything else (unknown config types, non-strings). */
export function get_section_definition<T extends RegisteredSectionType>(
  type: T
): Extract<RegisteredSectionDefinition, { type: T }>
export function get_section_definition(type: unknown): AnySectionDefinition | undefined
export function get_section_definition(type: unknown): AnySectionDefinition | undefined {
  return typeof type === 'string' ? DEFINITIONS_BY_TYPE.get(type) : undefined
}
