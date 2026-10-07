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
import { PostsPopover, type PostsPopoverTab } from './popovers/PostsPopover'
import type { PopoverMoveControls } from './popovers/PopoverShell'

/** Superset of the popover props; every popover reads only the fields it declares. */
export interface ElementPopoverHostProps {
  section_id: string
  element_id: string
  slot: string
  anchor: HTMLElement | undefined
  on_close: () => void
  move?: PopoverMoveControls
  initial_tab?: PostsPopoverTab
  show_comments_tab?: boolean
  on_edit_site: () => void
}

export interface ElementRegistryEntry {
  label: string
  popover: Component<ElementPopoverHostProps>
}

const entry = (element_id: string, popover: Component<ElementPopoverHostProps>): ElementRegistryEntry => ({
  label: pageElementLabels[element_id] ?? element_id,
  popover,
})

export const ELEMENT_REGISTRY: Readonly<Record<string, ElementRegistryEntry>> = Object.freeze({
  header: entry('header', HeaderPopover),
  navigation: entry('navigation', NavigationPopover),
  authorProfile: entry('authorProfile', AuthorProfilePopover),
  communityProfile: entry('communityProfile', CommunityProfilePopover),
  communitySidebar: entry('communitySidebar', CommunitySidebarPopover),
  posts: entry('posts', PostsPopover),
  footer: entry('footer', FooterPopover),
})

/** Registry entry of a page element, or null when the element has no popover. */
export function get_element_entry(element_id: string | null): ElementRegistryEntry | null {
  if (!element_id || !Object.hasOwn(ELEMENT_REGISTRY, element_id)) return null
  return ELEMENT_REGISTRY[element_id]
}
