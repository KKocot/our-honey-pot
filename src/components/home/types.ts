// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { CommentSortOption } from '@hiveio/workerbee/blog-logic'
import type { SettingsData } from '../admin/types'
import { defaultCommunitySettings } from "../admin/types/settings"

// ============================================
// Re-export types from admin/types
// ============================================

export type {
  CardSectionChild,
  CardSection,
  CardLayout,
  SocialLink,
  LayoutSection,
  PageSlotPosition,
  PageLayoutSection,
  PageLayout,
  PageLayoutConfig,
  LayoutTemplate,
  SidebarConfig,
  SidebarElement,
  ContainerConfig,
  ContainerElement,
  LayoutElementId,
  ContainerName,
  ThemeColors,
  NavigationTab,
} from '../admin/types/index'

// ============================================
// Site Settings (partial version for SSR)
// ============================================

// SiteSettings is the SSR-side config loaded from Hive
// All fields are optional because config may be incomplete
// Extends SettingsData with SSR-specific fields
interface SiteSettingsExtras {
  commentsSortOrder?: CommentSortOption
}

export type SiteSettings = Partial<SettingsData> & SiteSettingsExtras

// ============================================
// Default values (single source of truth: settings.ts)
// ============================================

export const defaultCommunityPageLayout = defaultCommunitySettings.pageLayout;
export const defaultCommunityPageLayoutConfig = defaultCommunitySettings.pageLayoutConfig;
