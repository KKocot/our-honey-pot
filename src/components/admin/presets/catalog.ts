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
import { pageLayoutConfigToLegacy, type CardLayout, type CardSection, type PageLayoutConfig } from '../types/layout'
import { PRESET_PALETTES } from '../types/theme'
import { DEVELOPER_BLOG_BASE, MINIMAL_WRITER_BASE, PHOTO_PORTFOLIO_BASE, TECH_MAGAZINE_BASE } from './layouts'
import { is_preset_home } from './apply'
import {
  PRESET_LAYOUT_KEYS,
  PRESET_MOTION_KEYS,
  assign_setting,
  density_spacing,
  pick_settings,
  type PresetHome,
} from './keys'

/** Whole-blog preset: layout and style halves are complete, so applying one never leaks values of the previous preset. */
export interface BlogPreset {
  id: string
  name: string
  tagline: string
  layout: Partial<SettingsData>
  /** Replaces layout keys in community mode before adapt_layout_for_community runs. */
  community_layout?: Partial<SettingsData>
  style: Partial<SettingsData>
  /** Home sections with the placeholder content of their definitions; the owner fills them in before Save. */
  home?: PresetHome
}

interface StyleSpec {
  /** Id of a `PRESET_PALETTES` entry, stored in `siteTheme`. */
  palette: string
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

type CardChild = string | { id: string; orientation: 'horizontal' | 'vertical'; children: CardChild[] }

function card_layout(id: string, orientation: 'horizontal' | 'vertical', children: CardChild[]): CardLayout {
  const to_section = (section_id: string, dir: 'horizontal' | 'vertical', items: CardChild[]): CardSection => ({
    id: section_id,
    orientation: dir,
    children: items.map((item) =>
      typeof item === 'string'
        ? { type: 'element' as const, id: item }
        : { type: 'section' as const, section: to_section(item.id, item.orientation, item.children) }
    ),
  })
  return { sections: [to_section(id, orientation, children)] }
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
    siteTheme: spec.palette,
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
  home: PresetHome
}

function define_preset(spec: PresetSpec): BlogPreset {
  if (!PRESET_PALETTES.some((p) => p.id === spec.style.palette)) {
    throw new Error(`Preset "${spec.id}" uses unknown palette "${spec.style.palette}"`)
  }
  if (!is_preset_home(spec.home)) throw new Error(`Preset "${spec.id}" has invalid home sections`)
  const preset: BlogPreset = {
    id: spec.id,
    name: spec.name,
    tagline: spec.tagline,
    layout: build_layout(spec.base, spec.layout ?? {}),
    style: build_style(spec.id, spec.base, spec.style),
    home: structuredClone(spec.home),
  }
  if (spec.community_page) {
    preset.community_layout = {
      pageLayoutConfig: structuredClone(spec.community_page),
      pageLayout: pageLayoutConfigToLegacy(spec.community_page),
    }
  }
  return deep_freeze(preset)
}

const community_hub_base: Partial<SettingsData> = pick_settings(defaultCommunitySettings, [
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

const header_footer = page_config('no-sidebar', { top: ['header'], bottom: ['footer'] })

/** Catalog order; list_blog_presets reorders for community mode. */
export const BLOG_PRESETS: ReadonlyArray<BlogPreset> = Object.freeze([
  define_preset({
    id: 'minimal-writer',
    name: 'Minimal Writer',
    tagline: 'Personal text blog: short bio, what you do now, plain list of posts',
    base: MINIMAL_WRITER_BASE,
    layout: {
      titleSizePx: 20,
      summaryMaxLength: 160,
      postCardLayout: card_layout('sec-entry', 'vertical', [
        { id: 'sec-line', orientation: 'horizontal', children: ['title', 'date'] },
        'summary',
      ]),
      pageLayoutConfig: header_footer,
    },
    style: {
      palette: 'essay',
      font_heading: 'inter',
      font_body: 'inter',
      radius_px: 4,
      density: 'spacious',
      card_border: false,
      motion: { cardHoverEffect: 'none', scrollAnimationType: 'none' },
    },
    home: {
      sections: [
        { type: 'about', style: { layout: 'stacked', align: 'start', spacing: 'lg' } },
        'now',
        'posts',
        { type: 'links', style: { layout: 'list', align: 'start' } },
      ],
    },
  }),
  define_preset({
    id: 'editorial-magazine',
    name: 'Editorial Magazine',
    tagline: 'Multi-author publication: masthead, notice, post grid with sidebar',
    base: TECH_MAGAZINE_BASE,
    layout: {
      gridColumns: 2,
      maxTags: 1,
      pageLayoutConfig: page_config('sidebar-right', {
        top: ['header'],
        sidebarRight: ['authorProfile'],
        bottom: ['footer'],
      }),
    },
    style: {
      palette: 'front-page',
      font_heading: 'fraunces',
      font_body: 'inter',
      radius_px: 0,
      density: 'compact',
      card_border: true,
      motion: { cardHoverEffect: 'lift' },
    },
    home: {
      sections: [
        {
          type: 'hero',
          style: { variant: 'text-centric', align: 'center', width: 'full', spacing: 'lg', bg: 'bg-secondary' },
        },
        { type: 'callout', content: { tone: 'accent' } },
        'posts',
        { type: 'quote', style: { variant: 'centered' } },
      ],
    },
  }),
  define_preset({
    id: 'newsletter-classic',
    name: 'Newsletter Classic',
    tagline: 'One author, numbered issues: text hero, archive list, FAQ',
    base: MINIMAL_WRITER_BASE,
    layout: {
      titleSizePx: 22,
      summaryMaxLength: 200,
      postCardLayout: card_layout('sec-issue', 'vertical', ['date', 'title', 'summary']),
      pageLayoutConfig: header_footer,
    },
    style: {
      palette: 'notebook',
      font_heading: 'fraunces',
      font_body: 'source-serif',
      radius_px: 6,
      density: 'comfortable',
      card_border: true,
      motion: { cardHoverEffect: 'shadow', scrollAnimationType: 'fade' },
    },
    home: {
      sections: [
        { type: 'hero', style: { variant: 'text-centric', align: 'center', height: 'md' } },
        'posts',
        { type: 'quote', style: { variant: 'rule' } },
        { type: 'about', style: { layout: 'side', bg: 'bg-secondary' } },
        'faq',
      ],
    },
  }),
  define_preset({
    id: 'dev-garden',
    name: 'Dev Garden',
    tagline: 'Technical blog: about with facts, tagged posts, now and links',
    base: DEVELOPER_BLOG_BASE,
    layout: {
      showThumbnail: false,
      showVotes: false,
      maxTags: 4,
      postCardLayout: card_layout('sec-post', 'vertical', [
        'tags',
        'title',
        'summary',
        { id: 'sec-meta', orientation: 'horizontal', children: ['date', 'comments'] },
      ]),
      pageLayoutConfig: header_footer,
    },
    style: {
      palette: 'terminal',
      font_heading: 'jetbrains-mono',
      font_body: 'inter',
      radius_px: 8,
      density: 'comfortable',
      card_border: true,
      motion: { cardHoverEffect: 'glow' },
    },
    home: {
      sections: [
        { type: 'about', style: { layout: 'side', bg: 'card' } },
        'callout',
        'posts',
        'now',
        { type: 'links', style: { layout: 'list', align: 'start' } },
      ],
    },
  }),
  define_preset({
    id: 'photo-journal',
    name: 'Photo Journal',
    tagline: 'Photo blog: image hero, story block, large photo cards',
    base: PHOTO_PORTFOLIO_BASE,
    layout: {
      postsLayout: 'grid',
      gridColumns: 2,
      thumbnailSizePx: 360,
      showDate: true,
      titleSizePx: 18,
      postCardLayout: card_layout('sec-photo', 'vertical', ['thumbnail', 'title', 'date']),
      pageLayoutConfig: header_footer,
    },
    style: {
      palette: 'gallery',
      font_heading: 'space-grotesk',
      font_body: 'inter',
      radius_px: 4,
      density: 'spacious',
      card_border: false,
    },
    home: {
      sections: [
        { type: 'hero', style: { variant: 'overlay', height: 'lg', width: 'full', align: 'center' } },
        { type: 'text-media', style: { image_side: 'end', ratio: '3:2' } },
        'posts',
        { type: 'quote', style: { variant: 'centered' } },
        { type: 'about', style: { layout: 'stacked', align: 'center' } },
      ],
    },
  }),
  define_preset({
    id: 'community-hub',
    name: 'Community Hub',
    tagline: 'Hive community: notice on top, rules and about beside posts, team below',
    base: community_hub_base,
    layout: {
      postsLayout: 'list',
      gridColumns: 1,
      cardLayout: 'horizontal',
      thumbnailSizePx: 120,
      pageLayoutConfig: page_config('sidebar-right', {
        top: ['header'],
        sidebarRight: ['authorProfile'],
        bottom: ['footer'],
      }),
    },
    community_page: page_config('sidebar-right', {
      top: ['header', 'communityProfile'],
      sidebarRight: ['communityDescription', 'communityRules', 'communityLanguage'],
      bottom: ['communityTeam', 'footer'],
    }),
    style: {
      palette: 'hive-commons',
      font_heading: 'inter',
      font_body: 'inter',
      radius_px: 8,
      density: 'comfortable',
      card_border: true,
    },
    home: {
      sections: [{ type: 'callout', content: { tone: 'accent' }, style: { bg: 'card' } }, 'posts'],
    },
  }),
  define_preset({
    id: 'link-in-bio',
    name: 'Link-in-bio',
    tagline: 'Business card: photo and bio, link grid, latest posts compact',
    base: MINIMAL_WRITER_BASE,
    layout: {
      titleSizePx: 16,
      showSummary: false,
      postCardLayout: card_layout('sec-row', 'horizontal', ['title', 'date']),
      pageLayoutConfig: header_footer,
    },
    style: {
      palette: 'poster',
      font_heading: 'space-grotesk',
      font_body: 'inter',
      radius_px: 16,
      density: 'compact',
      card_border: true,
      motion: { cardHoverEffect: 'lift', scrollAnimationType: 'slide-up' },
    },
    home: {
      sections: [
        { type: 'about', style: { layout: 'stacked', align: 'center', image_shape: 'circle' } },
        { type: 'links', style: { layout: 'grid' } },
        { type: 'now', style: { align: 'center' } },
        'posts',
      ],
    },
  }),
])

export const COMMUNITY_FIRST_PRESET_ID = 'community-hub'

/** Community Hub leads in community mode and closes the list in user mode. */
export function list_blog_presets(is_community: boolean): ReadonlyArray<BlogPreset> {
  const lead = BLOG_PRESETS.filter((p) => p.id === COMMUNITY_FIRST_PRESET_ID)
  const rest = BLOG_PRESETS.filter((p) => p.id !== COMMUNITY_FIRST_PRESET_ID)
  return is_community ? [...lead, ...rest] : [...rest, ...lead]
}

export function get_blog_preset(id: string): BlogPreset | undefined {
  return BLOG_PRESETS.find((p) => p.id === id)
}
