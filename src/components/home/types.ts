// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { CommentSortOption } from "@hiveio/workerbee/blog-logic";
import type { SettingsData } from "../admin/types";
import { defaultCommunitySettings } from "../admin/types/settings";

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
} from "../admin/types/index";

// ============================================
// Site Settings (partial version for SSR)
// ============================================

// SiteSettings is the SSR-side config loaded from Hive
// All fields are optional because config may be incomplete
// Extends SettingsData with SSR-specific fields
interface SiteSettingsExtras {
  commentsSortOrder?: CommentSortOption;
}

export type SiteSettings = Partial<SettingsData> & SiteSettingsExtras;

// ============================================
// Default values (single source of truth: settings.ts)
// ============================================

function deep_freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deep_freeze(nested);
  }
  return value;
}

// Frozen copies: shared by every request in the process, so a caller mutating them must fail loudly (K7)
export const defaultCommunityPageLayout = deep_freeze(
  structuredClone(defaultCommunitySettings.pageLayout),
);
export const defaultCommunityPageLayoutConfig = deep_freeze(
  structuredClone(defaultCommunitySettings.pageLayoutConfig),
);
