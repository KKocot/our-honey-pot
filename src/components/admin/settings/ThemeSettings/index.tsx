// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For } from 'solid-js'
import { settings, updateSettings, setCustomColors } from '../../store'
import { applyThemeColors } from '../../queries'
import { themePresets, type ThemeColors } from '../../types/index'
import { DialogContent, createDialog } from '../../../ui'
import { ColorCustomizerContent } from './ColorCustomizer'
import { AnimationSettings } from './AnimationSettings'

export { getCurrentColors } from './helpers'

const CARD_BASE =
  'rounded-lg border-2 p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary'
const SWATCH = 'size-4 rounded border border-border/30'

/** Theme preset picker, custom color dialog and animation settings, laid out for the settings drawer. */
export function ThemeSettings() {
  const dialog = createDialog(false)
  const is_custom = () => settings.customColors != null && typeof settings.customColors === 'object'
  const active_preset = () => (is_custom() ? 'custom' : settings.siteTheme)

  const select_preset = (preset_id: string) => {
    const preset = themePresets.find((item) => item.id === preset_id)
    if (!preset) return
    setCustomColors(null)
    updateSettings({ siteTheme: preset_id })
    applyThemeColors(preset.colors)
  }

  const open_custom = () => {
    if (!is_custom()) {
      const base = themePresets.find((item) => item.id === settings.siteTheme)?.colors ?? themePresets[0].colors
      setCustomColors({ ...base } satisfies ThemeColors)
    }
    dialog.setOpen(true)
  }

  return (
    <div class="space-y-6">
      <div>
        <h4 class="mb-3 text-xs font-medium tracking-wide text-text-muted uppercase">Theme Colors</h4>
        <div class="grid grid-cols-3 gap-2">
          <For each={themePresets}>
            {(preset) => (
              <button
                type="button"
                aria-pressed={active_preset() === preset.id}
                onClick={() => select_preset(preset.id)}
                class={`${CARD_BASE} ${
                  active_preset() === preset.id ? 'border-primary' : 'border-border hover:border-primary/50'
                }`}
              >
                <span class="mb-1.5 flex gap-1" aria-hidden="true">
                  <span class={SWATCH} style={{ background: preset.colors.bg }} />
                  <span class={SWATCH} style={{ background: preset.colors.primary }} />
                  <span class={SWATCH} style={{ background: preset.colors.accent }} />
                </span>
                <span class="block truncate text-xs font-medium text-text">{preset.name}</span>
              </button>
            )}
          </For>
          <button
            type="button"
            aria-pressed={active_preset() === 'custom'}
            onClick={open_custom}
            class={`${CARD_BASE} text-xs font-medium text-text ${
              active_preset() === 'custom' ? 'border-primary' : 'border-dashed border-border hover:border-primary/50'
            }`}
          >
            Custom
          </button>
        </div>
      </div>
      <AnimationSettings />
      <DialogContent open={dialog.open} onClose={() => dialog.setOpen(false)} class="max-w-2xl">
        <ColorCustomizerContent onClose={() => dialog.setOpen(false)} />
      </DialogContent>
    </div>
  )
}
