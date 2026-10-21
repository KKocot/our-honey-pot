// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// ============================================
// Layout Types
// ============================================

// Old layout section (kept for backwards compatibility)
export interface LayoutSection {
  id: string
  position: 'top' | 'sidebar-left' | 'main' | 'sidebar-right' | 'bottom'
  enabled: boolean
}

// ============================================
// Page Layout System (section-based drag & drop)
// ============================================

/**
 * Page slot positions define the main layout areas.
 * - top: Above the main content (header area)
 * - sidebar-left: Left sidebar
 * - main: Primary content area
 * - sidebar-right: Right sidebar
 * - bottom: Below the main content (footer area)
 */
export type PageSlotPosition = 'top' | 'sidebar-left' | 'main' | 'sidebar-right' | 'bottom'

/**
 * Page section with slot placement, orientation, and element list.
 * Sections can be reordered within their slot and contain multiple elements.
 */
export interface PageLayoutSection {
  id: string
  slot: PageSlotPosition
  orientation: 'horizontal' | 'vertical'
  elements: string[] // page element IDs
  active: boolean // whether this section is visible in preview/output
}

/**
 * Page layout configuration with all sections.
 * Supports drag-and-drop reordering in the admin panel.
 */
export interface PageLayout {
  sections: PageLayoutSection[]
}

// ============================================
// Recursive nested sections system
// ============================================

/**
 * Child of a card section - can be either a simple element or a nested section.
 * This enables arbitrary nesting depth for complex card layouts.
 */
export type CardSectionChild = { type: 'element'; id: string } | { type: 'section'; section: CardSection }

/**
 * Card section with orientation and recursive children.
 * Sections can contain elements or nested sections, allowing flexible layouts.
 */
export interface CardSection {
  id: string
  orientation: 'horizontal' | 'vertical'
  children: CardSectionChild[]
}

/**
 * Card layout with multiple top-level sections.
 * Used for post cards, comment cards, and author profile layouts.
 */
export interface CardLayout {
  sections: CardSection[]
}

// Legacy section format (for backwards compatibility)
export interface LegacyCardSection {
  id: string
  orientation: 'horizontal' | 'vertical'
  elements: string[]
}

// Migrate legacy layout to new format
export function migrateCardSection(section: CardSection | LegacyCardSection): CardSection {
  // If already has children array, it's new format
  if ('children' in section && Array.isArray(section.children)) {
    return section as CardSection
  }
  // Convert elements array to children array
  const legacySection = section as LegacyCardSection
  return {
    id: legacySection.id,
    orientation: legacySection.orientation,
    children: (legacySection.elements || []).map((elementId) => ({
      type: 'element' as const,
      id: elementId,
    })),
  }
}

// Migrate entire layout
export function migrateCardLayout(layout: CardLayout | undefined | null): CardLayout | null {
  // Return null if layout is invalid - caller should use defaults
  if (!layout || !layout.sections || !Array.isArray(layout.sections)) {
    return null
  }
  return {
    sections: layout.sections.map(migrateCardSection),
  }
}

// Helper to collect all element IDs from a section (recursively)
export function collectElementIds(section: CardSection): string[] {
  const ids: string[] = []
  for (const child of section.children) {
    if (child.type === 'element') {
      ids.push(child.id)
    } else {
      ids.push(...collectElementIds(child.section))
    }
  }
  return ids
}

// Helper to collect all element IDs from a layout
export function collectAllElementIds(layout: CardLayout): string[] {
  const ids: string[] = []
  for (const section of layout.sections) {
    ids.push(...collectElementIds(section))
  }
  return ids
}

// Card hover effect options
export const cardHoverEffectOptions = [
  { value: 'none', label: 'None' },
  { value: 'shadow', label: 'Shadow' },
  { value: 'lift', label: 'Lift (scale + shadow)' },
  { value: 'scale', label: 'Scale only' },
  { value: 'glow', label: 'Glow' },
]

// Card hover shadow options
export const cardHoverShadowOptions = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra Large' },
  { value: '2xl', label: '2X Large' },
]

// Scroll animation type options
export const scrollAnimationTypeOptions = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade In' },
  { value: 'slide-up', label: 'Slide Up' },
  { value: 'slide-left', label: 'Slide from Left' },
  { value: 'zoom', label: 'Zoom In' },
  { value: 'flip', label: 'Flip' },
]

// Labels for post card elements
export const postCardElementLabels: Record<string, string> = {
  thumbnail: 'Thumbnail',
  avatar: 'Author Avatar',
  title: 'Title',
  summary: 'Summary',
  meta: 'Meta (date, votes, comments, payout)',
  tags: 'Tags',
}

// Labels for comment card elements
export const commentCardElementLabels: Record<string, string> = {
  replyContext: 'Reply Context',
  avatar: 'Avatar',
  author: 'Author',
  timestamp: 'Timestamp',
  body: 'Comment Body',
  actionBar: 'Action Bar (replies, votes, payout)',
}

// Labels for author profile elements
export const authorProfileElementLabels: Record<string, string> = {
  coverImage: 'Cover Image',
  avatar: 'Avatar',
  username: 'Username',
  displayName: 'Display Name',
  reputation: 'Reputation',
  about: 'About / Bio',
  location: 'Location',
  website: 'Website',
  joinDate: 'Join Date',
  followers: 'Followers',
  following: 'Following',
  postCount: 'Post Count',
  hivePower: 'Hive Power',
  hpEarned: 'HP',
  votingPower: 'Voting Power',
  hiveBalance: 'HIVE Balance',
  hbdBalance: 'HBD Balance',
}

// Labels for page elements
export const pageElementLabels: Record<string, string> = {
  header: 'Header',
  navigation: 'Navigation Tabs',
  authorProfile: 'Author Profile',
  communityProfile: 'Community Profile',
  communitySidebar: 'Community Sidebar',
  communityDescription: 'Community Description',
  communityRules: 'Community Rules',
  communityTeam: 'Community Team',
  communityLanguage: 'Community Language',
  posts: 'Posts List',
  footer: 'Footer',
}

// Colors for page elements - unified color for consistent look
export const pageElementColors: Record<string, string> = {
  header: 'bg-accent text-white',
  navigation: 'bg-accent text-white',
  authorProfile: 'bg-accent text-white',
  communityProfile: 'bg-accent text-white',
  communitySidebar: 'bg-accent text-white',
  communityDescription: 'bg-accent text-white',
  communityRules: 'bg-accent text-white',
  communityTeam: 'bg-accent text-white',
  communityLanguage: 'bg-accent text-white',
  posts: 'bg-accent text-white',
  footer: 'bg-accent text-white',
}

// Default fallback color for page elements
export const pageElementColor = 'bg-accent text-white'

// Helper to get color for a page element
export function getPageElementColor(elementId: string): string {
  return pageElementColors[elementId] || pageElementColor
}

// Slot labels
export const slotLabels: Record<string, string> = {
  top: 'Top (Header Area)',
  'sidebar-left': 'Left Sidebar',
  main: 'Main Content',
  'sidebar-right': 'Right Sidebar',
  bottom: 'Bottom (Footer Area)',
}

// All available page element IDs
export const ALL_PAGE_ELEMENT_IDS = [
  'header',
  'navigation',
  'authorProfile',
  'communityProfile',
  'communitySidebar',
  'communityDescription',
  'communityRules',
  'communityTeam',
  'communityLanguage',
  'posts',
  'footer',
]

// Page element IDs available per mode
export const USER_PAGE_ELEMENT_IDS: ReadonlySet<string> = new Set([
  'header',
  'navigation',
  'authorProfile',
  'posts',
  'footer',
])

export const COMMUNITY_PAGE_ELEMENT_IDS: ReadonlySet<string> = new Set([
  'header',
  'communityProfile',
  'communitySidebar',
  'communityDescription',
  'communityRules',
  'communityTeam',
  'communityLanguage',
  'posts',
  'footer',
])

// ============================================
// Template-based Page Layout System (v2)
// Sidebar-only config - kept for migration from v2 to v3
// ============================================

/**
 * Layout template defines the overall page structure.
 * Fixed elements: Header (top), Navigation+Posts (main), Footer (bottom).
 * Only sidebars are configurable.
 */
export type LayoutTemplate = 'no-sidebar' | 'sidebar-left' | 'sidebar-right' | 'both-sidebars'

/**
 * Single sidebar element with visibility toggle (v2, kept for migration).
 * Order in the array determines render order.
 */
export interface SidebarElement {
  id: string // e.g. 'authorProfile', 'communityProfile', 'communitySidebar'
  active: boolean
}

/**
 * Sidebar configuration (v2, kept for migration) - ordered list of elements.
 */
export interface SidebarConfig {
  elements: SidebarElement[]
}

// Template labels for UI
export const layoutTemplateLabels: Record<LayoutTemplate, string> = {
  'no-sidebar': 'Full Width',
  'sidebar-left': 'Left Sidebar',
  'sidebar-right': 'Right Sidebar',
  'both-sidebars': 'Both Sidebars',
}

// Helper: check if template has left sidebar
export function hasLeftSidebar(template: LayoutTemplate): boolean {
  return template === 'sidebar-left' || template === 'both-sidebars'
}

// Helper: check if template has right sidebar
export function hasRightSidebar(template: LayoutTemplate): boolean {
  return template === 'sidebar-right' || template === 'both-sidebars'
}

// ============================================
// Container-based Page Layout System (v3)
// Every element can be placed in any container
// ============================================

/** Single community sidebar blocks, placeable on their own; 'communitySidebar' stays only as legacy input of chain configs. */
export const COMMUNITY_BLOCK_ELEMENT_IDS = [
  'communityDescription',
  'communityRules',
  'communityTeam',
  'communityLanguage',
] as const

/** Legacy input only: replaced by COMMUNITY_BLOCK_ELEMENT_IDS when a config is read (expand_community_sidebar). */
export const LEGACY_COMMUNITY_SIDEBAR_ID = 'communitySidebar'

/** Ids with every legacy communitySidebar replaced in place by the blocks not yet in `present` (mutated as blocks are placed). */
export function expand_community_sidebar_ids(ids: ReadonlyArray<string>, present: Set<string>): string[] {
  return ids.flatMap((id) => {
    if (id !== LEGACY_COMMUNITY_SIDEBAR_ID) return [id]
    const blocks = COMMUNITY_BLOCK_ELEMENT_IDS.filter((block) => !present.has(block))
    for (const block of blocks) present.add(block)
    return blocks
  })
}

/** Container element ids; navigation and posts are fixed in the main area. Source of the pageLayoutConfig schema enum. */
export const LAYOUT_ELEMENT_IDS = [
  'header',
  'authorProfile',
  'communityProfile',
  'communitySidebar',
  ...COMMUNITY_BLOCK_ELEMENT_IDS,
  'footer',
] as const

export type LayoutElementId = (typeof LAYOUT_ELEMENT_IDS)[number]

/**
 * Container names corresponding to the page layout areas.
 */
export type ContainerName = 'top' | 'sidebarLeft' | 'sidebarRight' | 'bottom'

/**
 * Single container element with visibility toggle.
 * Order in the array determines render order within the container.
 */
export interface ContainerElement {
  id: LayoutElementId
  active: boolean
}

/**
 * Container configuration - ordered list of elements assigned to a container.
 */
export interface ContainerConfig {
  elements: ContainerElement[]
}

/**
 * Container-based page layout configuration (v3).
 * Each element can be placed in any container (top, sidebarLeft, sidebarRight, bottom).
 * Navigation and Posts are always in the main area.
 */
export interface PageLayoutConfig {
  template: LayoutTemplate
  containers: {
    top: ContainerConfig
    sidebarLeft: ContainerConfig
    sidebarRight: ContainerConfig
    bottom: ContainerConfig
  }
}

// Container element IDs available per mode
export const USER_CONTAINER_ELEMENT_IDS = [
  'header',
  'authorProfile',
  'footer',
] as const satisfies readonly LayoutElementId[]
export const COMMUNITY_CONTAINER_ELEMENT_IDS = [
  'header',
  'communityProfile',
  'communitySidebar',
  ...COMMUNITY_BLOCK_ELEMENT_IDS,
  'footer',
] as const satisfies readonly LayoutElementId[]

// Labels for containers
export const containerLabels: Record<ContainerName, string> = {
  top: 'Top (Header Area)',
  sidebarLeft: 'Left Sidebar',
  sidebarRight: 'Right Sidebar',
  bottom: 'Bottom (Footer Area)',
}

// Helper: get active element IDs from a container config
export function getActiveContainerElements(config: ContainerConfig): LayoutElementId[] {
  return config.elements.filter((e) => e.active).map((e) => e.id)
}

const CONTAINER_KEYS: ReadonlyArray<ContainerName> = ['top', 'sidebarLeft', 'sidebarRight', 'bottom']

/**
 * Copy of `config` with each legacy communitySidebar replaced in place by the four blocks (its `active` kept).
 * A block already in the layout wins and is not duplicated, so the result never holds communitySidebar.
 */
export function expand_community_sidebar(config: PageLayoutConfig): PageLayoutConfig {
  const present = new Set<string>(
    CONTAINER_KEYS.flatMap((key) => (config.containers[key]?.elements ?? []).map((element) => element.id))
  )
  const expand = (container: ContainerConfig | undefined): ContainerConfig => ({
    elements: (container?.elements ?? []).flatMap((element): ContainerElement[] => {
      if (element.id !== LEGACY_COMMUNITY_SIDEBAR_ID) return [{ ...element }]
      return expand_community_sidebar_ids([element.id], present).map((id) => ({
        id: id as LayoutElementId,
        active: element.active,
      }))
    }),
  })
  return {
    template: config.template,
    containers: {
      top: expand(config.containers.top),
      sidebarLeft: expand(config.containers.sidebarLeft),
      sidebarRight: expand(config.containers.sidebarRight),
      bottom: expand(config.containers.bottom),
    },
  }
}

/**
 * Migrate old PageLayout (slot-based v1) to new PageLayoutConfig (container-based v3).
 * Maps slot positions to container names and filters out fixed elements (navigation, posts).
 */
export function migratePageLayoutToConfig(old: PageLayout): PageLayoutConfig {
  // Collect elements per slot (excluding navigation and posts which are fixed in main)
  const fixedIds = new Set(['navigation', 'posts'])
  const VALID_ELEMENT_IDS: Set<string> = new Set(LAYOUT_ELEMENT_IDS)

  const mapSlotToContainer = (slot: PageSlotPosition): ContainerConfig => {
    const elements: ContainerElement[] = []
    for (const section of old.sections.filter((s) => s.slot === slot)) {
      for (const id of section.elements) {
        if (fixedIds.has(id)) continue
        if (!VALID_ELEMENT_IDS.has(id)) continue
        elements.push({ id: id as LayoutElementId, active: section.active !== false })
      }
    }
    return { elements }
  }

  const topContainer = mapSlotToContainer('top')
  const leftContainer = mapSlotToContainer('sidebar-left')
  const rightContainer = mapSlotToContainer('sidebar-right')
  const bottomContainer = mapSlotToContainer('bottom')

  const hasLeft = leftContainer.elements.length > 0
  const hasRight = rightContainer.elements.length > 0

  let template: LayoutTemplate = 'no-sidebar'
  if (hasLeft && hasRight) template = 'both-sidebars'
  else if (hasLeft) template = 'sidebar-left'
  else if (hasRight) template = 'sidebar-right'

  return expand_community_sidebar({
    template,
    containers: {
      top: topContainer,
      sidebarLeft: leftContainer,
      sidebarRight: rightContainer,
      bottom: bottomContainer,
    },
  })
}

/**
 * Migrate v2 PageLayoutConfig (with sidebarLeft/sidebarRight) to v3 (with containers).
 * Header goes to top, footer goes to bottom, sidebar elements stay in their sidebars.
 */
export function migratePageLayoutConfigV2ToV3(old: {
  template: LayoutTemplate
  sidebarLeft: { elements: Array<{ id: string; active: boolean }> }
  sidebarRight: { elements: Array<{ id: string; active: boolean }> }
}): PageLayoutConfig {
  return expand_community_sidebar({
    template: old.template,
    containers: {
      top: { elements: [{ id: 'header' as LayoutElementId, active: true }] },
      sidebarLeft: {
        elements: (old.sidebarLeft?.elements || []).map((e) => ({
          id: e.id as LayoutElementId,
          active: e.active,
        })),
      },
      sidebarRight: {
        elements: (old.sidebarRight?.elements || []).map((e) => ({
          id: e.id as LayoutElementId,
          active: e.active,
        })),
      },
      bottom: { elements: [{ id: 'footer' as LayoutElementId, active: true }] },
    },
  })
}

/** Id of the main section (navigation + posts); per-instance override keys and the SSR posts query depend on it. */
export const MAIN_SECTION_ID = 'page-sec-main'

/**
 * Convert PageLayoutConfig (v3) back to legacy PageLayout format.
 * Used by renderers during migration period. A container in `with_sections` holds home sections
 * (`home_section_containers`), so its slot is kept even without active elements.
 */
export function pageLayoutConfigToLegacy(
  config: PageLayoutConfig,
  with_sections: ReadonlySet<ContainerName> = new Set()
): PageLayout {
  const sections: PageLayoutSection[] = []

  // Top container -> slot 'top'
  const topElements = getActiveContainerElements(config.containers.top)
  if (topElements.length > 0 || with_sections.has('top')) {
    sections.push({
      id: 'page-sec-top',
      slot: 'top',
      orientation: 'horizontal',
      elements: topElements,
      active: true,
    })
  }

  // Left sidebar container -> slot 'sidebar-left'
  if (hasLeftSidebar(config.template)) {
    const elements = getActiveContainerElements(config.containers.sidebarLeft)
    if (elements.length > 0 || with_sections.has('sidebarLeft')) {
      sections.push({
        id: 'page-sec-sidebar-left',
        slot: 'sidebar-left',
        orientation: 'vertical',
        elements,
        active: true,
      })
    }
  }

  // Main is always navigation + posts
  sections.push({
    id: MAIN_SECTION_ID,
    slot: 'main',
    orientation: 'vertical',
    elements: ['navigation', 'posts'],
    active: true,
  })

  // Right sidebar container -> slot 'sidebar-right'
  if (hasRightSidebar(config.template)) {
    const elements = getActiveContainerElements(config.containers.sidebarRight)
    if (elements.length > 0 || with_sections.has('sidebarRight')) {
      sections.push({
        id: 'page-sec-sidebar-right',
        slot: 'sidebar-right',
        orientation: 'vertical',
        elements,
        active: true,
      })
    }
  }

  // Bottom container -> slot 'bottom'
  const bottomElements = getActiveContainerElements(config.containers.bottom)
  if (bottomElements.length > 0 || with_sections.has('bottom')) {
    sections.push({
      id: 'page-sec-bottom',
      slot: 'bottom',
      orientation: 'horizontal',
      elements: bottomElements,
      active: true,
    })
  }

  return { sections }
}
