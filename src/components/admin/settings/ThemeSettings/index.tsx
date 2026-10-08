// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { settings, updateSettingsImmediate } from '../../store'
import { applyThemeColors } from '../../queries'
import type { SettingsData } from '../../types/settings'
import type { ThemeColors } from '../../types/theme'
import { current_theme_colors } from './style-macros'

export { PaletteSection, TOKEN_LABELS } from './PaletteSection'
export { TypographySection, FONT_LABELS } from './TypographySection'
export { ShapeSection } from './ShapeSection'
export { MotionSection } from './MotionSection'
export { current_theme_colors, density_patch, radius_patch, parse_hex, type StyleChange } from './style-macros'

/** Colors the live settings store renders now. */
export function getCurrentColors(): ThemeColors {
  return current_theme_colors(settings)
}

/** Applies a settings patch to the live store in one commit and refreshes the theme vars when colors moved. */
export function apply_settings_patch(patch: Partial<SettingsData>): void {
  updateSettingsImmediate(patch)
  if ('customColors' in patch || 'siteTheme' in patch) applyThemeColors(getCurrentColors())
}
