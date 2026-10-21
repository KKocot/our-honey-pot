// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { Component } from 'solid-js'
import { pageElementLabels } from '../types/layout'
import { AuthorProfilePopover } from './popovers/AuthorProfilePopover'
import { CommunityProfilePopover } from './popovers/CommunityProfilePopover'
import { CommunitySidebarPopover } from './popovers/CommunitySidebarPopover'
import { FooterPopover } from './popovers/FooterPopover'
import { HeaderPopover } from './popovers/HeaderPopover'
import { NavigationPopover } from './popovers/NavigationPopover'
import { PostsPopover } from './popovers/PostsPopover'
import type { PopoverMoveControls } from './popovers/PopoverShell'

/** Superset of the popover props; every popover reads only the fields it declares. */
export interface ElementPopoverHostProps {
  section_id: string
  element_id: string
  slot: string
  anchor: HTMLElement | undefined
  on_close: () => void
  move?: PopoverMoveControls
  comments_view?: boolean
  on_create_page?: () => void
}

export interface ElementRegistryEntry {
  label: string
  popover: Component<ElementPopoverHostProps>
  /** False when the popover offers only visibility + Move; the canvas then hides the gear. */
  has_settings: boolean
}

const entry = (
  element_id: string,
  popover: Component<ElementPopoverHostProps>,
  has_settings = true
): ElementRegistryEntry => ({
  label: pageElementLabels[element_id] ?? element_id,
  popover,
  has_settings,
})

export const ELEMENT_REGISTRY: Readonly<Record<string, ElementRegistryEntry>> = Object.freeze({
  header: entry('header', HeaderPopover),
  navigation: entry('navigation', NavigationPopover),
  authorProfile: entry('authorProfile', AuthorProfilePopover),
  communityProfile: entry('communityProfile', CommunityProfilePopover),
  // Legacy input only: expanded into the four blocks when a config is read, kept so a stray id still opens a popover.
  communitySidebar: entry('communitySidebar', CommunitySidebarPopover),
  // Entries stay without settings so Enter on the block still opens Move + Show (keyboard path).
  communityDescription: entry('communityDescription', CommunitySidebarPopover, false),
  communityRules: entry('communityRules', CommunitySidebarPopover, false),
  communityTeam: entry('communityTeam', CommunitySidebarPopover, false),
  communityLanguage: entry('communityLanguage', CommunitySidebarPopover, false),
  posts: entry('posts', PostsPopover),
  footer: entry('footer', FooterPopover),
})

/** Registry entry of a page element, or null when the element has no popover. */
export function get_element_entry(element_id: string | null): ElementRegistryEntry | null {
  if (!element_id || !Object.hasOwn(ELEMENT_REGISTRY, element_id)) return null
  return ELEMENT_REGISTRY[element_id]
}

/** Whether the element's popover has real settings beyond visibility and Move. */
export function element_has_settings(element_id: string | null): boolean {
  return get_element_entry(element_id)?.has_settings ?? false
}
