// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Must not import from '../types/index' -- the barrel pulls lib/config, which breaks node unit tests.
import {
  defaultCommunitySettings,
  defaultSettings,
  type Density,
  type FontId,
  type SettingsData,
} from '../types/settings'
import { pageLayoutConfigToLegacy, type CardLayout, type PageLayoutConfig } from '../types/layout'
import { PRESET_PALETTES } from '../types/theme'
import {
  COFFEE_SHOP_BASE,
  CREATIVE_STUDIO_BASE,
  DEVELOPER_BLOG_BASE,
  MINIMAL_WRITER_BASE,
  PERSONAL_JOURNAL_BASE,
  PHOTO_PORTFOLIO_BASE,
  TECH_MAGAZINE_BASE,
} from './layouts'
import { PRESET_LAYOUT_KEYS, PRESET_MOTION_KEYS, assign_setting, density_spacing, pick_settings } from './keys'

/** Whole-blog preset: layout and style halves are complete, so applying one never leaks values of the previous preset. */
export interface BlogPreset {
  id: string
  name: string
  tagline: string
  layout: Partial<SettingsData>
  /** Replaces layout keys in community mode before adapt_layout_for_community runs. */
  community_layout?: Partial<SettingsData>
  style: Partial<SettingsData>
}

interface StyleSpec {
  font_heading: FontId
  font_body: FontId
  radius_px: number
  density: Density
  card_border: boolean
  motion?: Partial<SettingsData>
}

type ContainerIds = Partial<
  Record<keyof PageLayoutConfig['containers'], PageLayoutConfig['containers']['top']['elements'][number]['id'][]>
>

function page_config(template: PageLayoutConfig['template'], ids: ContainerIds): PageLayoutConfig {
  const container = (list: ContainerIds[keyof ContainerIds]) => ({
    elements: (list ?? []).map((id) => ({ id, active: true })),
  })
  return {
    template,
    containers: {
      top: container(ids.top),
      sidebarLeft: container(ids.sidebarLeft),
      sidebarRight: container(ids.sidebarRight),
      bottom: container(ids.bottom),
    },
  }
}

function with_vertical_root(layout: CardLayout | undefined): CardLayout {
  const copy = structuredClone(layout ?? defaultSettings.postCardLayout)
  copy.sections = copy.sections.map((section, index) =>
    index === 0 ? { ...section, orientation: 'vertical' } : section
  )
  return copy
}

function build_layout(base: Partial<SettingsData>, overrides: Partial<SettingsData>): Partial<SettingsData> {
  const layout: Partial<SettingsData> = {}
  for (const key of PRESET_LAYOUT_KEYS) {
    if (key === 'pageLayout') continue
    assign_setting(layout, key, overrides[key] ?? base[key] ?? defaultSettings[key])
  }
  layout.pageLayout = pageLayoutConfigToLegacy(layout.pageLayoutConfig ?? defaultSettings.pageLayoutConfig)
  return layout
}

function build_style(id: string, base: Partial<SettingsData>, spec: StyleSpec): Partial<SettingsData> {
  const motion: Partial<SettingsData> = {}
  for (const key of PRESET_MOTION_KEYS) {
    assign_setting(motion, key, spec.motion?.[key] ?? base[key] ?? defaultSettings[key])
  }
  motion.scrollAnimationEnabled = (motion.scrollAnimationType ?? 'none') !== 'none'
  return {
    siteTheme: id,
    customColors: null,
    presetId: id,
    fontHeading: spec.font_heading,
    fontBody: spec.font_body,
    radiusPx: spec.radius_px,
    cardBorderRadiusPx: spec.radius_px,
    density: spec.density,
    ...density_spacing(spec.density),
    cardBorder: spec.card_border,
    ...motion,
  }
}

function deep_freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value)) deep_freeze(nested)
  }
  return value
}

interface PresetSpec {
  id: string
  name: string
  tagline: string
  base: Partial<SettingsData>
  layout?: Partial<SettingsData>
  community_page?: PageLayoutConfig
  style: StyleSpec
}

function define_preset(spec: PresetSpec): BlogPreset {
  if (!PRESET_PALETTES.some((p) => p.id === spec.id)) throw new Error(`Preset "${spec.id}" has no palette`)
  const preset: BlogPreset = {
    id: spec.id,
    name: spec.name,
    tagline: spec.tagline,
    layout: build_layout(spec.base, spec.layout ?? {}),
    style: build_style(spec.id, spec.base, spec.style),
  }
  if (spec.community_page) {
    preset.community_layout = {
      pageLayoutConfig: structuredClone(spec.community_page),
      pageLayout: pageLayoutConfigToLegacy(spec.community_page),
    }
  }
  return deep_freeze(preset)
}

const hive_commons_base: Partial<SettingsData> = pick_settings(defaultCommunitySettings, [
  'postsLayout',
  'gridColumns',
  'cardLayout',
  'thumbnailSizePx',
  'titleSizePx',
  'summaryMaxLength',
  'postCardLayout',
  'cardHoverEffect',
  'scrollAnimationType',
])

/** Catalog order (brief section 3); list_blog_presets reorders for community mode. */
export const BLOG_PRESETS: ReadonlyArray<BlogPreset> = Object.freeze([
  define_preset({
    id: 'essay',
    name: 'Essay',
    tagline: 'Long-form, quiet, paper-like',
    base: MINIMAL_WRITER_BASE,
    layout: { pageLayoutConfig: page_config('no-sidebar', { top: ['header', 'authorProfile'] }) },
    style: {
      font_heading: 'source-serif',
      font_body: 'source-serif',
      radius_px: 2,
      density: 'spacious',
      card_border: false,
    },
  }),
  define_preset({
    id: 'terminal',
    name: 'Terminal',
    tagline: 'Dark and technical, for dev blogs',
    base: DEVELOPER_BLOG_BASE,
    layout: {
      thumbnailSizePx: 96,
      pageLayoutConfig: page_config('sidebar-right', {
        top: ['header'],
        sidebarRight: ['authorProfile'],
        bottom: ['footer'],
      }),
    },
    style: { font_heading: 'jetbrains-mono', font_body: 'inter', radius_px: 4, density: 'compact', card_border: true },
  }),
  define_preset({
    id: 'gallery',
    name: 'Gallery',
    tagline: 'Photos first, words second',
    base: PHOTO_PORTFOLIO_BASE,
    style: {
      font_heading: 'space-grotesk',
      font_body: 'inter',
      radius_px: 12,
      density: 'comfortable',
      card_border: false,
    },
  }),
  define_preset({
    id: 'front-page',
    name: 'Front Page',
    tagline: 'Dense magazine and news grid',
    base: TECH_MAGAZINE_BASE,
    layout: { maxTags: 3 },
    style: { font_heading: 'fraunces', font_body: 'inter', radius_px: 2, density: 'compact', card_border: true },
  }),
  define_preset({
    id: 'notebook',
    name: 'Notebook',
    tagline: 'Soft personal journal',
    base: PERSONAL_JOURNAL_BASE,
    layout: {
      cardLayout: 'vertical',
      thumbnailSizePx: 160,
      postCardLayout: with_vertical_root(PERSONAL_JOURNAL_BASE.postCardLayout),
    },
    style: { font_heading: 'fraunces', font_body: 'atkinson', radius_px: 20, density: 'spacious', card_border: true },
  }),
  define_preset({
    id: 'poster',
    name: 'Poster',
    tagline: 'Bold creative studio, neo brutalism',
    base: CREATIVE_STUDIO_BASE,
    layout: { postsLayout: 'grid', gridColumns: 2, titleSizePx: 28 },
    style: {
      font_heading: 'space-grotesk',
      font_body: 'inter',
      radius_px: 0,
      density: 'comfortable',
      card_border: true,
      motion: { cardHoverEffect: 'lift' },
    },
  }),
  define_preset({
    id: 'kitchen-table',
    name: 'Kitchen Table',
    tagline: 'Warm lifestyle and food',
    base: COFFEE_SHOP_BASE,
    layout: {
      postsLayout: 'grid',
      gridColumns: 2,
      cardLayout: 'vertical',
      thumbnailSizePx: 200,
      postCardLayout: with_vertical_root(COFFEE_SHOP_BASE.postCardLayout),
      pageLayoutConfig: page_config('sidebar-right', {
        top: ['header'],
        sidebarRight: ['authorProfile'],
        bottom: ['footer'],
      }),
    },
    style: { font_heading: 'fraunces', font_body: 'inter', radius_px: 12, density: 'comfortable', card_border: true },
  }),
  define_preset({
    id: 'hive-commons',
    name: 'Hive Commons',
    tagline: 'Clear community front page',
    base: hive_commons_base,
    layout: {
      pageLayoutConfig: page_config('no-sidebar', { top: ['header', 'authorProfile'], bottom: ['footer'] }),
    },
    community_page: page_config('sidebar-right', {
      top: ['header', 'communityProfile'],
      sidebarRight: ['communitySidebar'],
      bottom: ['footer'],
    }),
    style: { font_heading: 'inter', font_body: 'inter', radius_px: 8, density: 'comfortable', card_border: true },
  }),
])

export const COMMUNITY_FIRST_PRESET_ID = 'hive-commons'

/** Hive Commons leads in community mode and closes the list in user mode. */
export function list_blog_presets(is_community: boolean): ReadonlyArray<BlogPreset> {
  const lead = BLOG_PRESETS.filter((p) => p.id === COMMUNITY_FIRST_PRESET_ID)
  const rest = BLOG_PRESETS.filter((p) => p.id !== COMMUNITY_FIRST_PRESET_ID)
  return is_community ? [...lead, ...rest] : [...rest, ...lead]
}

export function get_blog_preset(id: string): BlogPreset | undefined {
  return BLOG_PRESETS.find((p) => p.id === id)
}
