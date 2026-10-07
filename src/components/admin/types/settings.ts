// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// ============================================
// Settings Data Structure
// ============================================

import type { ThemeColors } from './theme'
import type { LayoutSection, CardLayout, PageLayout, PageLayoutConfig } from './layout'
import type { NavigationTab } from './navigation'
import type { SocialLink } from './social'

export const POSTS_PER_PAGE_MIN = 5
export const POSTS_PER_PAGE_MAX = 30
export const MAX_PINNED_POSTS = 5
/** Pinned post entry: `permlink` (post of the blog account) or `author/permlink` */
export const PINNED_POST_ENTRY_REGEX = /^(?:[a-z0-9.-]+\/)?[a-z0-9._-]+$/

/** Sort order options for community posts display */
export type CommunityDisplaySortOrder = 'trending' | 'hot' | 'created' | 'payout' | 'muted'

// Naming convention:
// Legacy fields use camelCase (e.g. postsSortOrder, showAuthorProfile).
// New community fields use snake_case (e.g. community_default_sort, community_show_rules)
// per project coding rules. Migration of legacy fields is not worth the cost
// as it would break configs already saved on blockchain.

/**
 * Complete site settings data structure.
 * This is persisted to the database and controls all customizable aspects of the site.
 */
export interface SettingsData {
  hiveUsername: string
  siteTheme: string
  customColors: ThemeColors | null
  siteName: string
  siteDescription: string
  layoutSections: LayoutSection[]
  postsLayout: 'list' | 'grid' | 'masonry'
  gridColumns: number
  cardGapPx: number
  cardLayout: 'horizontal' | 'vertical'
  thumbnailPosition: 'left' | 'right'
  thumbnailSizePx: number
  cardPaddingPx: number
  cardBorderRadiusPx: number
  titleSizePx: number
  showThumbnail: boolean
  showSummary: boolean
  summaryMaxLength: number
  showDate: boolean
  showVotes: boolean
  showComments: boolean
  showPayout: boolean
  showTags: boolean
  cardBorder: boolean
  maxTags: number
  showHeader: boolean
  showAuthorProfile: boolean
  authorAvatarSizePx: number
  showPostCount: boolean
  showAuthorRewards: boolean
  postsPerPage: number
  sidebarWidthPx: number
  // Author Profile extended settings
  authorProfileLayout: 'horizontal' | 'vertical'
  showAuthorAbout: boolean
  showAuthorLocation: boolean
  showAuthorWebsite: boolean
  showAuthorJoinDate: boolean
  showAuthorReputation: boolean
  showAuthorFollowers: boolean
  showAuthorFollowing: boolean
  showAuthorVotingPower: boolean
  showAuthorHiveBalance: boolean
  showAuthorHbdBalance: boolean
  showAuthorCoverImage: boolean
  authorCoverHeightPx: number
  authorUsernameSizePx: number
  authorDisplayNameSizePx: number
  authorAboutSizePx: number
  authorStatsSizePx: number
  authorMetaSizePx: number
  authorReputationSizePx: number
  // Comments Tab settings
  showCommentsTab: boolean
  // Comment Card settings
  commentShowAuthor: boolean
  commentShowAvatar: boolean
  commentAvatarSizePx: number
  commentShowReplyContext: boolean
  commentShowTimestamp: boolean
  commentShowRepliesCount: boolean
  commentShowVotes: boolean
  commentShowPayout: boolean
  commentShowViewLink: boolean
  commentMaxLength: number
  commentPaddingPx: number
  // Card layout with sections (drag & drop)
  postCardLayout: CardLayout
  commentCardLayout: CardLayout
  authorProfileLayout2: CardLayout
  // Page layout - legacy slot-based (kept for migration)
  pageLayout: PageLayout
  // Page layout - template-based (v2)
  pageLayoutConfig: PageLayoutConfig
  // Sorting settings
  postsSortOrder: 'blog' | 'posts'
  includeReblogs: boolean
  // Card Hover Animation settings
  cardHoverEffect: 'none' | 'shadow' | 'lift' | 'scale' | 'glow'
  cardTransitionDuration: number // ms
  cardHoverScale: number // 1.0 = none, 1.02 = 2% scale, etc.
  cardHoverShadow: string // shadow intensity: 'sm' | 'md' | 'lg' | 'xl'
  cardHoverBrightness: number // 1.0 = none, 1.05 = 5% brighter
  // Scroll Animation settings
  scrollAnimationEnabled: boolean
  scrollAnimationType: 'none' | 'fade' | 'slide-up' | 'slide-left' | 'zoom' | 'flip'
  scrollAnimationDuration: number // ms
  scrollAnimationDelay: number // ms delay between each card
  // Navigation Tabs settings
  navigationTabs: NavigationTab[]
  // Social media links for author profile
  socialLinks: SocialLink[]
  // Pinned posts (personal and community blogs)
  pinnedPostPermlinks: string[]
  // Footer settings
  footer_text?: string
  // Community-specific display settings
  community_default_sort?: CommunityDisplaySortOrder
  community_show_rules?: boolean
  community_show_leadership?: boolean
  community_show_subscribers?: boolean
  community_show_description?: boolean
  community_avatar_size_px?: number
  community_title_size_px?: number
  community_about_size_px?: number
  community_visible_sorts?: CommunityDisplaySortOrder[]
  // Sparse per-instance size overrides of home page layout elements, keyed by instance_key()
  instanceOverrides?: InstanceOverrides
}

/** Single source of truth for per-instance size ranges (validation and admin controls); out-of-range values are rejected because they reach inline styles. */
export const INSTANCE_OVERRIDE_RANGES = Object.freeze({
  gridColumns: Object.freeze({ min: 1, max: 4 }),
  cardGapPx: Object.freeze({ min: 0, max: 64 }),
  postsPerPage: Object.freeze({ min: POSTS_PER_PAGE_MIN, max: POSTS_PER_PAGE_MAX }),
  thumbnailSizePx: Object.freeze({ min: 32, max: 400 }),
  cardPaddingPx: Object.freeze({ min: 0, max: 64 }),
  cardBorderRadiusPx: Object.freeze({ min: 0, max: 48 }),
  titleSizePx: Object.freeze({ min: 12, max: 48 }),
  summaryMaxLength: Object.freeze({ min: 50, max: 500 }),
  maxTags: Object.freeze({ min: 1, max: 10 }),
  commentAvatarSizePx: Object.freeze({ min: 24, max: 64 }),
  commentPaddingPx: Object.freeze({ min: 8, max: 32 }),
  commentMaxLength: Object.freeze({ min: 0, max: 1000 }),
  authorAvatarSizePx: Object.freeze({ min: 32, max: 128 }),
  authorCoverHeightPx: Object.freeze({ min: 48, max: 200 }),
  authorUsernameSizePx: Object.freeze({ min: 12, max: 24 }),
  authorDisplayNameSizePx: Object.freeze({ min: 14, max: 32 }),
  authorAboutSizePx: Object.freeze({ min: 10, max: 18 }),
  authorStatsSizePx: Object.freeze({ min: 10, max: 20 }),
  authorMetaSizePx: Object.freeze({ min: 10, max: 16 }),
  community_avatar_size_px: Object.freeze({ min: 32, max: 96 }),
  community_title_size_px: Object.freeze({ min: 14, max: 28 }),
  community_about_size_px: Object.freeze({ min: 12, max: 18 }),
} satisfies Partial<Record<keyof SettingsData, { min: number; max: number }>>)

export type InstanceOverrideKey = keyof typeof INSTANCE_OVERRIDE_RANGES
export type InstanceSizeOverrides = Partial<Record<InstanceOverrideKey, number>>
/** Key: `${PageLayoutSection.id}:${elementId}` (see instance_key) */
export type InstanceOverrides = Record<string, InstanceSizeOverrides>

export const MAX_INSTANCE_OVERRIDES = 64
export const INSTANCE_OVERRIDE_KEY_REGEX = /^[A-Za-z0-9_-]{1,64}:[A-Za-z][A-Za-z0-9]{0,63}$/

/** Home page elements that accept size overrides and the settings each of them may override. */
export const INSTANCE_OVERRIDE_KEYS_BY_ELEMENT: Readonly<Record<string, ReadonlyArray<InstanceOverrideKey>>> =
  Object.freeze({
    posts: Object.freeze([
      'gridColumns',
      'cardGapPx',
      'postsPerPage',
      'thumbnailSizePx',
      'cardPaddingPx',
      'cardBorderRadiusPx',
      'titleSizePx',
      'summaryMaxLength',
      'maxTags',
      'commentAvatarSizePx',
      'commentPaddingPx',
      'commentMaxLength',
    ] as const),
    authorProfile: Object.freeze([
      'authorAvatarSizePx',
      'authorCoverHeightPx',
      'authorUsernameSizePx',
      'authorDisplayNameSizePx',
      'authorAboutSizePx',
      'authorStatsSizePx',
      'authorMetaSizePx',
    ] as const),
    communityProfile: Object.freeze([
      'community_avatar_size_px',
      'community_title_size_px',
      'community_about_size_px',
    ] as const),
  })

export function instance_key(section_id: string, element_id: string): string {
  return `${section_id}:${element_id}`
}

/** Setting keys `element_id` may override; empty for unknown elements. */
export function instance_override_keys_for(element_id: string): ReadonlyArray<InstanceOverrideKey> {
  return Object.hasOwn(INSTANCE_OVERRIDE_KEYS_BY_ELEMENT, element_id)
    ? INSTANCE_OVERRIDE_KEYS_BY_ELEMENT[element_id]
    : []
}

/** Finite integer inside the admin slider range of `key`. */
export function is_instance_override_value(key: InstanceOverrideKey, value: unknown): value is number {
  const range = INSTANCE_OVERRIDE_RANGES[key]
  return Number.isInteger(value) && (value as number) >= range.min && (value as number) <= range.max
}

export const defaultSettings: SettingsData = {
  hiveUsername: '',
  siteTheme: 'light',
  customColors: null,
  siteName: '',
  siteDescription: '',
  layoutSections: [
    { id: 'header', position: 'top', enabled: true },
    { id: 'authorProfile', position: 'sidebar-left', enabled: true },
    { id: 'posts', position: 'main', enabled: true },
    { id: 'footer', position: 'bottom', enabled: false },
  ],
  postsLayout: 'list',
  gridColumns: 2,
  cardGapPx: 24,
  cardLayout: 'horizontal',
  thumbnailPosition: 'left',
  thumbnailSizePx: 96,
  cardPaddingPx: 24,
  cardBorderRadiusPx: 16,
  titleSizePx: 20,
  showThumbnail: true,
  showSummary: true,
  summaryMaxLength: 150,
  showDate: true,
  showVotes: true,
  showComments: true,
  showPayout: true,
  showTags: true,
  cardBorder: true,
  maxTags: 5,
  showHeader: true,
  showAuthorProfile: true,
  authorAvatarSizePx: 64,
  showPostCount: true,
  showAuthorRewards: true,
  postsPerPage: 20,
  sidebarWidthPx: 280,
  authorProfileLayout: 'horizontal',
  showAuthorAbout: true,
  showAuthorLocation: true,
  showAuthorWebsite: true,
  showAuthorJoinDate: true,
  showAuthorReputation: true,
  showAuthorFollowers: true,
  showAuthorFollowing: true,
  showAuthorVotingPower: false,
  showAuthorHiveBalance: false,
  showAuthorHbdBalance: false,
  showAuthorCoverImage: true,
  authorCoverHeightPx: 64,
  authorUsernameSizePx: 14,
  authorDisplayNameSizePx: 18,
  authorAboutSizePx: 14,
  authorStatsSizePx: 14,
  authorMetaSizePx: 12,
  authorReputationSizePx: 12,
  showCommentsTab: true,
  commentShowAuthor: true,
  commentShowAvatar: true,
  commentAvatarSizePx: 40,
  commentShowReplyContext: true,
  commentShowTimestamp: true,
  commentShowRepliesCount: true,
  commentShowVotes: true,
  commentShowPayout: true,
  commentShowViewLink: true,
  commentMaxLength: 0,
  commentPaddingPx: 16,
  postCardLayout: {
    sections: [
      {
        id: 'sec-main',
        orientation: 'horizontal',
        children: [
          { type: 'element', id: 'thumbnail' },
          {
            type: 'section',
            section: {
              id: 'sec-content',
              orientation: 'vertical',
              children: [
                { type: 'element', id: 'title' },
                { type: 'element', id: 'summary' },
                {
                  type: 'section',
                  section: {
                    id: 'sec-meta',
                    orientation: 'horizontal',
                    children: [
                      { type: 'element', id: 'date' },
                      { type: 'element', id: 'votes' },
                      { type: 'element', id: 'comments' },
                      { type: 'element', id: 'payout' },
                    ],
                  },
                },
                { type: 'element', id: 'tags' },
              ],
            },
          },
        ],
      },
    ],
  },
  commentCardLayout: {
    sections: [
      { id: 'sec-1', orientation: 'horizontal', children: [{ type: 'element', id: 'replyContext' }] },
      {
        id: 'sec-2',
        orientation: 'horizontal',
        children: [
          { type: 'element', id: 'avatar' },
          { type: 'element', id: 'author' },
          { type: 'element', id: 'timestamp' },
        ],
      },
      { id: 'sec-3', orientation: 'vertical', children: [{ type: 'element', id: 'body' }] },
      {
        id: 'sec-4',
        orientation: 'horizontal',
        children: [
          { type: 'element', id: 'replies' },
          { type: 'element', id: 'votes' },
          { type: 'element', id: 'payout' },
          { type: 'element', id: 'viewLink' },
        ],
      },
    ],
  },
  authorProfileLayout2: {
    sections: [
      { id: 'sec-1', orientation: 'horizontal', children: [{ type: 'element', id: 'coverImage' }] },
      {
        id: 'sec-2',
        orientation: 'horizontal',
        children: [
          { type: 'element', id: 'avatar' },
          { type: 'element', id: 'username' },
          { type: 'element', id: 'reputation' },
        ],
      },
      { id: 'sec-3', orientation: 'vertical', children: [{ type: 'element', id: 'about' }] },
      {
        id: 'sec-4',
        orientation: 'horizontal',
        children: [
          { type: 'element', id: 'location' },
          { type: 'element', id: 'website' },
          { type: 'element', id: 'joinDate' },
        ],
      },
      {
        id: 'sec-5',
        orientation: 'horizontal',
        children: [
          { type: 'element', id: 'followers' },
          { type: 'element', id: 'following' },
          { type: 'element', id: 'postCount' },
          { type: 'element', id: 'hpEarned' },
        ],
      },
      {
        id: 'sec-6',
        orientation: 'horizontal',
        children: [
          { type: 'element', id: 'votingPower' },
          { type: 'element', id: 'hiveBalance' },
          { type: 'element', id: 'hbdBalance' },
        ],
      },
    ],
  },
  pageLayout: {
    sections: [
      { id: 'page-sec-1', slot: 'top', orientation: 'horizontal', elements: ['header'], active: true },
      { id: 'page-sec-2', slot: 'sidebar-left', orientation: 'vertical', elements: ['authorProfile'], active: true },
      { id: 'page-sec-3', slot: 'main', orientation: 'vertical', elements: ['posts'], active: true },
      { id: 'page-sec-4', slot: 'bottom', orientation: 'horizontal', elements: ['footer'], active: true },
    ],
  },
  pageLayoutConfig: {
    template: 'sidebar-left',
    containers: {
      top: { elements: [{ id: 'header', active: true }] },
      sidebarLeft: { elements: [{ id: 'authorProfile', active: true }] },
      sidebarRight: { elements: [] },
      bottom: { elements: [{ id: 'footer', active: true }] },
    },
  },
  postsSortOrder: 'blog',
  includeReblogs: false,
  cardHoverEffect: 'shadow',
  cardTransitionDuration: 200,
  cardHoverScale: 1.02,
  cardHoverShadow: 'md',
  cardHoverBrightness: 1.0,
  scrollAnimationEnabled: true,
  scrollAnimationType: 'fade',
  scrollAnimationDuration: 400,
  scrollAnimationDelay: 100,
  navigationTabs: [
    { id: 'posts', label: 'Posts', enabled: true, showCount: false },
    { id: 'threads', label: 'Hive Threads', enabled: false, showCount: false },
    { id: 'comments', label: 'Comments', enabled: true, showCount: false },
  ],
  socialLinks: [],
  pinnedPostPermlinks: [],
  footer_text: '',
  community_default_sort: 'trending',
  community_show_rules: true,
  community_show_leadership: true,
  community_show_subscribers: true,
  community_show_description: true,
  community_avatar_size_px: 48,
  community_title_size_px: 16,
  community_about_size_px: 14,
  community_visible_sorts: ['trending', 'hot', 'created', 'payout'],
  instanceOverrides: {},
}

export const defaultCommunitySettings: SettingsData = {
  ...defaultSettings,
  siteTheme: 'ocean',
  postsLayout: 'grid',
  gridColumns: 2,
  cardLayout: 'vertical',
  cardGapPx: 20,
  cardPaddingPx: 20,
  cardBorderRadiusPx: 12,
  titleSizePx: 18,
  thumbnailSizePx: 200,
  showSummary: true,
  summaryMaxLength: 100,
  showAuthorProfile: false,
  cardHoverEffect: 'lift',
  scrollAnimationType: 'slide-up',
  postCardLayout: {
    sections: [
      {
        id: 'sec-main',
        orientation: 'vertical',
        children: [
          { type: 'element', id: 'thumbnail' },
          {
            type: 'section',
            section: {
              id: 'sec-author-date',
              orientation: 'horizontal',
              children: [
                { type: 'element', id: 'avatar' },
                { type: 'element', id: 'date' },
              ],
            },
          },
          { type: 'element', id: 'title' },
          { type: 'element', id: 'summary' },
          {
            type: 'section',
            section: {
              id: 'sec-meta',
              orientation: 'horizontal',
              children: [
                { type: 'element', id: 'votes' },
                { type: 'element', id: 'comments' },
              ],
            },
          },
        ],
      },
    ],
  },
  layoutSections: [
    { id: 'header', position: 'top', enabled: true },
    { id: 'posts', position: 'main', enabled: true },
    { id: 'footer', position: 'bottom', enabled: true },
  ],
  pageLayout: {
    sections: [
      {
        id: 'page-sec-1',
        slot: 'top',
        orientation: 'horizontal',
        elements: ['header'],
        active: true,
      },
      {
        id: 'page-sec-2',
        slot: 'sidebar-left',
        orientation: 'vertical',
        elements: ['communityProfile', 'communitySidebar'],
        active: true,
      },
      {
        id: 'page-sec-3',
        slot: 'main',
        orientation: 'vertical',
        elements: ['posts'],
        active: true,
      },
      {
        id: 'page-sec-4',
        slot: 'bottom',
        orientation: 'horizontal',
        elements: ['footer'],
        active: true,
      },
    ],
  },
  pageLayoutConfig: {
    template: 'sidebar-left',
    containers: {
      top: { elements: [{ id: 'header', active: true }] },
      sidebarLeft: {
        elements: [
          { id: 'communityProfile', active: true },
          { id: 'communitySidebar', active: true },
        ],
      },
      sidebarRight: { elements: [] },
      bottom: { elements: [{ id: 'footer', active: true }] },
    },
  },
}

/** Fresh deep copy on every call: the module-level defaults are shared by every blog served by the process (K7). */
export function get_default_settings(is_community: boolean): SettingsData {
  return structuredClone(is_community ? defaultCommunitySettings : defaultSettings)
}

// instanceOverrides is shared by both modes (posts exist in both); its nested keys follow the two lists below.

/** Keys of SettingsData that are community-only and should be stripped in user mode */
export const COMMUNITY_SETTINGS_KEYS: ReadonlyArray<keyof SettingsData> = [
  'community_default_sort',
  'community_show_rules',
  'community_show_leadership',
  'community_show_subscribers',
  'community_show_description',
  'community_avatar_size_px',
  'community_title_size_px',
  'community_about_size_px',
  'community_visible_sorts',
] as const

/** Keys of SettingsData that are user-only and should be stripped in community mode */
export const USER_ONLY_SETTINGS_KEYS: ReadonlyArray<keyof SettingsData> = [
  'navigationTabs',
  'commentCardLayout',
  'commentAvatarSizePx',
  'commentPaddingPx',
  'commentMaxLength',
  'showCommentsTab',
  'commentShowAuthor',
  'commentShowAvatar',
  'commentShowReplyContext',
  'commentShowTimestamp',
  'commentShowRepliesCount',
  'commentShowVotes',
  'commentShowPayout',
  'commentShowViewLink',
  'authorProfileLayout2',
  'authorAvatarSizePx',
  'authorCoverHeightPx',
  'authorUsernameSizePx',
  'authorDisplayNameSizePx',
  'authorAboutSizePx',
  'authorStatsSizePx',
  'authorMetaSizePx',
  'authorReputationSizePx',
  'socialLinks',
  // Author Profile visibility flags
  'showAuthorProfile',
  'authorProfileLayout',
  'showAuthorAbout',
  'showAuthorLocation',
  'showAuthorWebsite',
  'showAuthorJoinDate',
  'showAuthorReputation',
  'showAuthorFollowers',
  'showAuthorFollowing',
  'showAuthorVotingPower',
  'showAuthorHiveBalance',
  'showAuthorHbdBalance',
  'showAuthorCoverImage',
  'showPostCount',
  'showAuthorRewards',
] as const

function without_override_keys(overrides: InstanceOverrides, keys_to_strip: ReadonlySet<string>): InstanceOverrides {
  const kept_overrides: InstanceOverrides = {}
  for (const [key, entry] of Object.entries(overrides)) {
    if (typeof entry !== 'object' || entry === null) continue
    const kept_entry = Object.fromEntries(Object.entries(entry).filter(([setting]) => !keys_to_strip.has(setting)))
    if (Object.keys(kept_entry).length > 0) kept_overrides[key] = kept_entry
  }
  return kept_overrides
}

function strip_settings_keys<T extends Partial<SettingsData>>(config: T, keys: ReadonlyArray<keyof SettingsData>): T {
  const keys_to_strip: ReadonlySet<string> = new Set(keys)
  const kept: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config)) {
    if (!keys_to_strip.has(key)) {
      kept[key] = value
    }
  }
  if (config.instanceOverrides) {
    kept.instanceOverrides = without_override_keys(config.instanceOverrides, keys_to_strip)
  }
  // Safe: we only removed keys, shape is subset of T
  return kept as T
}

/**
 * Remove community-specific fields from a settings object (used in user mode), including community keys
 * inside instanceOverrides. COMMUNITY_SETTINGS_KEYS is the single source of truth for which fields to strip.
 */
export function strip_community_fields<T extends Partial<SettingsData>>(config: T): T {
  return strip_settings_keys(config, COMMUNITY_SETTINGS_KEYS)
}

/**
 * Remove user-only fields from a settings object (used in community mode), including user-only keys
 * inside instanceOverrides. USER_ONLY_SETTINGS_KEYS is the single source of truth for which fields to strip.
 */
export function strip_user_fields<T extends Partial<SettingsData>>(config: T): T {
  return strip_settings_keys(config, USER_ONLY_SETTINGS_KEYS)
}

/**
 * Strip irrelevant fields based on current mode.
 * In community mode: removes user-only fields (comments, author profile details, etc.).
 * In user mode: removes community-specific fields (community_*).
 */
export function strip_irrelevant_fields<T extends Partial<SettingsData>>(config: T, is_community: boolean): T {
  return is_community ? strip_user_fields(config) : strip_community_fields(config)
}

/**
 * Helper function to convert SettingsData to Record for diff comparison.
 * Uses JSON round-trip to produce a plain object (no prototype chain issues).
 */
export function settings_to_record(settings: SettingsData): Record<string, unknown> {
  const json: unknown = JSON.parse(JSON.stringify(settings))
  if (typeof json === 'object' && json !== null && !Array.isArray(json)) {
    return json as Record<string, unknown>
  }
  return {}
}
