// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// ============================================
// Navigation Types
// ============================================

// Navigation Tab configuration (Posts, Comments, Threads, or custom category tabs)
export interface NavigationTab {
  id: string
  label: string
  enabled: boolean
  showCount: boolean
  tag?: string // For custom category tabs - filters posts by tag/community
  tooltip?: string
}

export const LINK_KINDS = Object.freeze(['url', 'tag', 'page'] as const)
export type LinkKind = (typeof LINK_KINDS)[number]

export const LINK_LABEL_MAX_CHARS = 24
export const LINK_TAG_REGEX = /^[a-z0-9-]{1,24}$/
export const PAGE_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const PAGE_SLUG_LENGTH = Object.freeze({ min: 2, max: 40 })

/** `target`: https/mailto:/tel: URL for `url`, tag for `tag`, page slug for `page`. */
export interface Link {
  label: string
  kind: LinkKind
  target: string
}

export interface Cta {
  label: string
  url: string
}
