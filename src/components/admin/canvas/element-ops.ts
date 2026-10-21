// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Settings ops of the canvas element controls (trash, '+', Show): each returns one patch, so a caller commits it as a
// single undo step (apply_layout_op / on_home_op). `null` means the op was rejected; the input is never mutated.

import {
  COMMUNITY_CONTAINER_ELEMENT_IDS,
  USER_CONTAINER_ELEMENT_IDS,
  pageElementLabels,
  type ContainerName,
} from '../types/layout'
import type { SettingsData } from '../types/settings'
import { add_element, can_add_element, remove_element, type PageLayoutState } from './layout-ops'
import type { SidebarToggleKey } from './popovers/CommunitySidebarPopover'

// Mirrors COMMUNITY_BLOCK_FLAGS of CommunitySidebarPopover: importing that UI module drags Solid components into this pure one.
const BLOCK_FLAGS: Readonly<Record<string, SidebarToggleKey>> = Object.freeze({
  communityDescription: 'community_show_description',
  communityRules: 'community_show_rules',
  communityTeam: 'community_show_leadership',
  communityLanguage: 'community_show_language',
})

const community_block_flag = (element_id: string): SidebarToggleKey | null =>
  Object.hasOwn(BLOCK_FLAGS, element_id) ? BLOCK_FLAGS[element_id] : null

export type ElementOp = (current: SettingsData) => Partial<SettingsData> | null

export interface AddableElement {
  id: string
  label: string
}

function layout_state(current: SettingsData): PageLayoutState | null {
  const config = current.pageLayoutConfig
  if (!config?.containers) return null
  return { pageLayoutConfig: config, instanceOverrides: current.instanceOverrides ?? {} }
}

/** Element removed from `container` together with its instance overrides; rejected when it is not there. */
export function remove_element_op(container: ContainerName, element_id: string): ElementOp {
  return (current) => {
    const state = layout_state(current)
    if (!state) return null
    const index = (state.pageLayoutConfig.containers[container]?.elements ?? []).findIndex(
      (element) => element.id === element_id
    )
    if (index < 0) return null
    const next = remove_element(state, { container, index })
    if (!next) return null
    return { pageLayoutConfig: next.pageLayoutConfig, instanceOverrides: next.instanceOverrides }
  }
}

/** Element appended to `container`; a community block hidden by its flag is shown in the same patch. */
export function add_element_op(container: ContainerName, element_id: string, is_community: boolean): ElementOp {
  return (current) => {
    const state = layout_state(current)
    if (!state) return null
    const next = add_element(state, container, element_id, is_community)
    if (!next) return null
    const patch: Partial<SettingsData> = {
      pageLayoutConfig: next.pageLayoutConfig,
      instanceOverrides: next.instanceOverrides,
    }
    const flag = community_block_flag(element_id)
    if (flag && current[flag] === false) patch[flag] = true
    return patch
  }
}

/** Community block flag set back to visible; rejected for other elements and for a block already shown. */
export function show_block_op(element_id: string): ElementOp {
  return (current) => {
    const flag = community_block_flag(element_id)
    if (!flag || current[flag] !== false) return null
    return { [flag]: true }
  }
}

/** Elements the '+' of `container` offers, in the mode's container order; empty without a layout (add_element_op would reject). */
export function addable_elements(
  settings: SettingsData,
  container: ContainerName,
  is_community: boolean
): AddableElement[] {
  const state = layout_state(settings)
  if (!state) return []
  const ids: ReadonlyArray<string> = is_community ? COMMUNITY_CONTAINER_ELEMENT_IDS : USER_CONTAINER_ELEMENT_IDS
  return ids
    .filter((id) => can_add_element(state, container, id, is_community))
    .map((id) => ({ id, label: pageElementLabels[id] ?? id }))
}
