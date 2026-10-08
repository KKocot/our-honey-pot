// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { strip_irrelevant_fields, type SettingsData } from '../types/settings'
import { adapt_layout_for_community } from '../types/templates'
import type { BlogPreset } from './catalog'

export type PresetApplyScope = 'full' | 'layout' | 'style'

/** Minimal shape shared by catalog presets and user presets. */
export interface PresetParts {
  name: string
  layout: Partial<SettingsData>
  community_layout?: Partial<SettingsData>
  style: Partial<SettingsData>
}

export interface PresetApplyResult {
  patch: Partial<SettingsData>
  /** History step label and toast title. */
  undo_label: string
  /** Size overrides dropped by this apply; 0 for style only (brief 3.2). */
  reset_overrides_count: number
}

function count_overrides(settings: SettingsData): number {
  return Object.keys(settings.instanceOverrides ?? {}).length
}

function layout_for_mode(parts: PresetParts, is_community: boolean): Partial<SettingsData> {
  const layout = structuredClone({ ...parts.layout, ...(is_community ? parts.community_layout : undefined) })
  return is_community ? adapt_layout_for_community(layout) : layout
}

function apply_label(name: string, scope: PresetApplyScope): string {
  if (scope === 'layout') return `Apply "${name}" layout`
  if (scope === 'style') return `Apply "${name}" style`
  return `Apply "${name}"`
}

/** Layout scopes replace every instanceOverride: the preset defines sizes and old `section:element` keys rarely survive. */
export function apply_preset_parts(
  parts: PresetParts,
  current: SettingsData,
  scope: PresetApplyScope,
  is_community: boolean
): PresetApplyResult {
  const patch: Partial<SettingsData> = {}
  const touches_layout = scope !== 'style'
  if (touches_layout) {
    Object.assign(patch, layout_for_mode(parts, is_community))
    patch.instanceOverrides = {}
  }
  if (scope !== 'layout') Object.assign(patch, structuredClone(parts.style))
  return {
    patch: strip_irrelevant_fields(patch, is_community),
    undo_label: apply_label(parts.name, scope),
    reset_overrides_count: touches_layout ? count_overrides(current) : 0,
  }
}

export function apply_blog_preset(
  preset: BlogPreset,
  current: SettingsData,
  scope: PresetApplyScope,
  is_community: boolean
): PresetApplyResult {
  return apply_preset_parts(preset, current, scope, is_community)
}
