// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Navigation shared component utilities
 * Provides data transformation and rendering for navigation
 */

export type { NavigationTabConfig, NavigationItem, NavigationSettings, OwnerNavItem } from './types'
export { defaultNavigationTabs } from './types'

export {
  getTabCount,
  buildNavHref,
  buildNavigationItems,
  createNavigationSettings,
  hasEnabledTabs,
  hasNavigationContent,
  resolveOwnerLink,
  resolveCta,
  buildOwnerNavItems,
} from './utils'

export {
  renderNavigationItem,
  getNavigationItemClasses,
  renderNavigation,
  renderNavigationItems,
  renderNavigationButton,
  renderNavigationButtons,
  renderOwnerNav,
  renderOwnerLink,
  renderNavCta,
} from './render'
