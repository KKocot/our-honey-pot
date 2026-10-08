// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For, Show, createSignal, createUniqueId, type JSX } from 'solid-js'
import { ChevronDown } from 'lucide-solid'
import type { SettingsData } from '../../../types/settings'
import { PaletteSection } from '../../../settings/ThemeSettings/PaletteSection'
import { TypographySection } from '../../../settings/ThemeSettings/TypographySection'
import { ShapeSection } from '../../../settings/ThemeSettings/ShapeSection'
import { MotionSection } from '../../../settings/ThemeSettings/MotionSection'
import type { StyleChange } from '../../../settings/ThemeSettings/style-macros'

export type StyleSectionId = 'palette' | 'typography' | 'shape' | 'motion'

export interface StyleTabProps {
  settings: SettingsData
  /** One call = one history step; `label` names the intent ("Changed corner radius"). Patches with `customColors`/`siteTheme` need the theme vars re-applied by the host. */
  on_change: StyleChange
  /** Sections expanded on mount; defaults to Palette only. */
  initial_open?: readonly StyleSectionId[]
}

interface SectionDef {
  id: StyleSectionId
  title: string
  render: (props: StyleTabProps) => JSX.Element
}

const SECTIONS: readonly SectionDef[] = [
  { id: 'palette', title: 'Palette', render: (p) => <PaletteSection settings={p.settings} on_change={p.on_change} /> },
  {
    id: 'typography',
    title: 'Typography',
    render: (p) => <TypographySection settings={p.settings} on_change={p.on_change} />,
  },
  {
    id: 'shape',
    title: 'Shape & spacing',
    render: (p) => <ShapeSection settings={p.settings} on_change={p.on_change} />,
  },
  { id: 'motion', title: 'Motion', render: (p) => <MotionSection settings={p.settings} on_change={p.on_change} /> },
]

/** Side panel "Style" tab: global palette, typography, shape and motion; sections mount lazily (fonts load on open). */
export function StyleTab(props: StyleTabProps) {
  const base_id = `style-tab-${createUniqueId()}`
  const [open, set_open] = createSignal<ReadonlySet<StyleSectionId>>(new Set(props.initial_open ?? ['palette']))

  const toggle = (id: StyleSectionId) => {
    const next = new Set(open())
    if (next.has(id)) next.delete(id)
    else next.add(id)
    set_open(next)
  }

  return (
    <div class="divide-y divide-border">
      <For each={SECTIONS}>
        {(section) => {
          const expanded = () => open().has(section.id)
          const panel_id = `${base_id}-${section.id}`
          return (
            <section>
              <h3>
                <button
                  type="button"
                  id={`${panel_id}-trigger`}
                  aria-expanded={expanded()}
                  aria-controls={panel_id}
                  onClick={() => toggle(section.id)}
                  class="flex min-h-11 w-full items-center justify-between px-4 py-2 text-left text-sm font-semibold text-text transition-colors hover:bg-bg-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                >
                  {section.title}
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    class={`text-text-muted transition-transform duration-150 ease-out motion-reduce:transition-none ${
                      expanded() ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </h3>
              <div id={panel_id} role="region" aria-labelledby={`${panel_id}-trigger`} hidden={!expanded()}>
                <Show when={expanded()}>
                  <div class="px-4 pt-1 pb-5">{section.render(props)}</div>
                </Show>
              </div>
            </section>
          )
        }}
      </For>
    </div>
  )
}
