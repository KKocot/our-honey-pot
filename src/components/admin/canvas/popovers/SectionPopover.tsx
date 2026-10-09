// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createMemo, createUniqueId, For, Show } from 'solid-js'
import { ChevronRight } from 'lucide-solid'
import { apply_layout_op, is_community_mode, settings } from '../../queries'
import {
  MAIN_SECTION_ID,
  hasLeftSidebar,
  hasRightSidebar,
  pageElementLabels,
  type ContainerElement,
  type ContainerName,
  type LayoutTemplate,
  type PageSlotPosition,
} from '../../types/layout'
import type { SettingsData } from '../../types/settings'
import {
  CONTAINER_NAMES,
  CONTAINER_SECTION_IDS,
  CONTAINER_SLOTS,
  MAIN_ELEMENT_IDS,
  container_of_section,
  is_element_rendered,
  move_section,
  page_element_ids,
  template_after_move,
  template_hiding,
  template_showing,
} from '../layout-ops'
import { clear_selection, find_instance_anchor, find_section_gear, select_instance } from '../selection'
import { PopoverShell, slot_label } from './PopoverShell'

export interface SectionPopoverProps {
  section_id: string
  slot: PageSlotPosition
  anchor: HTMLElement | undefined
  on_close: () => void
  /** Element has its own popover; elements without one are listed but not clickable. */
  has_element_popover: (element_id: string) => boolean
}

type SidebarName = Extract<ContainerName, 'sidebarLeft' | 'sidebarRight'>

const SIDEBARS: ReadonlyArray<{ name: SidebarName; label: string }> = [
  { name: 'sidebarLeft', label: 'left sidebar' },
  { name: 'sidebarRight', label: 'right sidebar' },
]

const ROW_BUTTON =
  'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm text-text hover:bg-bg-secondary focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-11'

function is_rendered(element: ContainerElement): boolean {
  return is_element_rendered(element, page_element_ids(is_community_mode()))
}

function rendered_in(container: ContainerName): string[] {
  return (settings.pageLayoutConfig?.containers?.[container]?.elements ?? [])
    .filter(is_rendered)
    .map((element) => element.id)
}

function is_sidebar_shown(template: LayoutTemplate, sidebar: SidebarName): boolean {
  return sidebar === 'sidebarLeft' ? hasLeftSidebar(template) : hasRightSidebar(template)
}

function section_move_op(from: ContainerName, to: ContainerName) {
  return (current: SettingsData): Partial<SettingsData> | null => {
    const config = current.pageLayoutConfig
    if (!config?.containers) return null
    const next = move_section(
      { pageLayoutConfig: config, instanceOverrides: current.instanceOverrides ?? {} },
      from,
      to
    )
    if (!next) return null
    return {
      pageLayoutConfig: { ...next.pageLayoutConfig, template: template_after_move(next, from, to, is_rendered) },
      instanceOverrides: next.instanceOverrides,
    }
  }
}

function template_op(next_template: (template: LayoutTemplate) => LayoutTemplate) {
  return (current: SettingsData): Partial<SettingsData> | null => {
    const config = current.pageLayoutConfig
    if (!config) return null
    const template = next_template(config.template)
    return template === config.template ? null : { pageLayoutConfig: { ...config, template } }
  }
}

/** The moved section remounts in another slot; focus follows it to its settings button. */
function focus_section_gear_later(section_id: string): void {
  requestAnimationFrame(() => find_section_gear(section_id)?.focus({ preventScroll: true }))
}

export function SectionPopover(props: SectionPopoverProps) {
  const elements_id = `section-popover-elements-${createUniqueId()}`
  const position_id = `section-popover-position-${createUniqueId()}`
  const sidebars_id = `section-popover-sidebars-${createUniqueId()}`
  const container = container_of_section(props.section_id)
  const own_sidebar = SIDEBARS.find((sidebar) => sidebar.name === container)

  const element_ids = createMemo(() => {
    if (container) return rendered_in(container)
    const mode_ids = page_element_ids(is_community_mode())
    return MAIN_ELEMENT_IDS.filter((id) => mode_ids.has(id))
  })

  const template = (): LayoutTemplate => settings.pageLayoutConfig?.template ?? 'no-sidebar'

  const move_targets = createMemo(() => {
    if (!container) return []
    return CONTAINER_NAMES.filter((name) => name !== container).map((name) => {
      const occupied = rendered_in(name).length > 0
      const target_label = slot_label(CONTAINER_SLOTS[name])
      return { name, label: occupied ? `Swap with ${target_label}` : `Move to ${target_label}` }
    })
  })

  const open_element = (element_id: string) => {
    const anchor_el = find_instance_anchor(props.section_id, element_id)
    if (!anchor_el) return
    select_instance({ section_id: props.section_id, element_id, slot: props.slot, anchor_el })
  }

  const move_to = (target: ContainerName) => {
    if (!container || !apply_layout_op(section_move_op(container, target))) return
    clear_selection()
    focus_section_gear_later(CONTAINER_SECTION_IDS[target])
  }

  // An empty sidebar hides itself after every move, so showing one only makes sense when it holds elements.
  const can_show = (sidebar: SidebarName) => rendered_in(sidebar).length > 0

  const toggle_sidebar = (sidebar: SidebarName) => {
    const hiding = is_sidebar_shown(template(), sidebar)
    const op = template_op((current) =>
      hiding ? template_hiding(current, sidebar) : template_showing(current, sidebar)
    )
    if (!apply_layout_op(op)) return
    if (!hiding || sidebar !== container) return
    clear_selection()
    focus_section_gear_later(MAIN_SECTION_ID)
  }

  return (
    <PopoverShell
      open
      anchor={props.anchor}
      onClose={props.on_close}
      element_label={slot_label(props.slot)}
      slot_label="Section"
    >
      <section aria-labelledby={elements_id} class="flex flex-col gap-1">
        <h3 id={elements_id} class="text-xs font-semibold uppercase text-text-muted">
          Elements
        </h3>
        <Show when={element_ids().length > 0} fallback={<p class="text-sm text-text-muted">No visible elements.</p>}>
          <ul class="flex flex-col">
            <For each={element_ids()}>
              {(element_id) => (
                <li>
                  <button
                    type="button"
                    class={ROW_BUTTON}
                    disabled={!props.has_element_popover(element_id)}
                    onClick={() => open_element(element_id)}
                  >
                    <span class="min-w-0 truncate">{pageElementLabels[element_id] ?? element_id}</span>
                    <ChevronRight size={14} aria-hidden="true" class="shrink-0 text-text-muted" />
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>

      <Show when={container}>
        <section aria-labelledby={position_id} class="flex flex-col gap-1">
          <h3 id={position_id} class="text-xs font-semibold uppercase text-text-muted">
            Position
          </h3>
          <ul class="flex flex-col">
            <For each={move_targets()}>
              {(target) => (
                <li>
                  <button type="button" class={ROW_BUTTON} onClick={() => move_to(target.name)}>
                    {target.label}
                  </button>
                </li>
              )}
            </For>
          </ul>
          <Show when={own_sidebar}>
            {(sidebar) => (
              <button type="button" class={ROW_BUTTON} onClick={() => toggle_sidebar(sidebar().name)}>
                Hide sidebar
              </button>
            )}
          </Show>
        </section>
      </Show>

      <Show when={props.section_id === MAIN_SECTION_ID}>
        <section aria-labelledby={sidebars_id} class="flex flex-col gap-1">
          <h3 id={sidebars_id} class="text-xs font-semibold uppercase text-text-muted">
            Sidebars
          </h3>
          <ul class="flex flex-col">
            <For each={SIDEBARS}>
              {(sidebar) => {
                const shown = () => is_sidebar_shown(template(), sidebar.name)
                const empty = () => !shown() && !can_show(sidebar.name)
                return (
                  <li>
                    <button
                      type="button"
                      class={ROW_BUTTON}
                      disabled={empty()}
                      onClick={() => toggle_sidebar(sidebar.name)}
                    >
                      <span>{shown() ? `Hide ${sidebar.label}` : `Show ${sidebar.label}`}</span>
                      <Show when={empty()}>
                        <span class="text-xs text-text-muted">Empty</span>
                      </Show>
                    </button>
                  </li>
                )
              }}
            </For>
          </ul>
        </section>
      </Show>
    </PopoverShell>
  )
}
