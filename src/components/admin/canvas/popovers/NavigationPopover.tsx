// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, createUniqueId, For, onMount, Show } from 'solid-js'
import { ArrowDown, ArrowUp, Plus, TriangleAlert, X } from 'lucide-solid'
import { settings, updateSettings } from '../../queries'
import { createLocalInput } from '../../hooks'
import { pageElementLabels } from '../../types/layout'
import type { NavigationTab } from '../../types/navigation'
import { PopoverShell, slot_label, type PopoverMoveControls } from './PopoverShell'

export interface NavigationPopoverProps {
  section_id: string
  element_id: string
  slot: string
  anchor: HTMLElement | undefined
  on_close: () => void
  move?: PopoverMoveControls
}

const BUILT_IN_TAB_IDS: ReadonlySet<string> = new Set(['posts', 'threads', 'comments'])

const THREADS_HINT =
  'Create a post titled "My Threads" on your profile and write comments under it. They will be shown as threads (short posts with full content).'

const ICON_BUTTON =
  'inline-flex size-6 items-center justify-center rounded text-text-muted hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-30 max-md:size-11'

const TEXT_INPUT =
  'min-w-0 rounded border bg-bg px-2 py-1 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary'

function update_tab(tab_id: string, updates: Partial<NavigationTab>) {
  updateSettings({
    navigationTabs: settings.navigationTabs.map((tab) => (tab.id === tab_id ? { ...tab, ...updates } : tab)),
  })
}

function swap_tabs(index: number, other: number) {
  const tabs = [...settings.navigationTabs]
  if (index < 0 || other < 0 || index >= tabs.length || other >= tabs.length) return
  ;[tabs[index], tabs[other]] = [tabs[other], tabs[index]]
  updateSettings({ navigationTabs: tabs })
}

function add_category_tab(): string {
  const tab: NavigationTab = {
    id: `category-${(crypto.randomUUID?.() ?? Date.now().toString()).slice(0, 8)}`,
    label: 'Category',
    enabled: true,
    showCount: false,
    tag: '',
  }
  updateSettings({ navigationTabs: [...settings.navigationTabs, tab] })
  return tab.id
}

function remove_tab(tab_id: string) {
  if (BUILT_IN_TAB_IDS.has(tab_id)) return
  updateSettings({ navigationTabs: settings.navigationTabs.filter((tab) => tab.id !== tab_id) })
}

interface TabRowProps {
  tab: NavigationTab
  index: number
  total: number
  autofocus: boolean
  on_remove: (tab_id: string) => void
}

function TabRow(props: TabRowProps) {
  const row_id = createUniqueId()
  const label_id = `nav-tab-label-${row_id}`
  const tag_id = `nav-tab-tag-${row_id}`
  const tag_warning_id = `nav-tab-tag-warning-${row_id}`
  const is_built_in = () => BUILT_IN_TAB_IDS.has(props.tab.id)
  let label_input: HTMLInputElement | undefined

  const [local_label, set_local_label, commit_label] = createLocalInput(
    () => props.tab.label,
    (value) => {
      if (!is_built_in() && !value.trim()) return false
      update_tab(props.tab.id, { label: value })
    }
  )
  const [local_tag, set_local_tag, commit_tag] = createLocalInput(
    () => props.tab.tag ?? '',
    (value) => {
      if (!is_built_in() && !value.trim()) return false
      update_tab(props.tab.id, { tag: value })
    }
  )

  onMount(() => {
    if (props.autofocus) label_input?.select()
  })

  return (
    <li class="flex flex-col gap-1.5 rounded-lg border border-border bg-bg p-2">
      <div class="flex items-center gap-2">
        <div class="flex flex-col">
          <button
            type="button"
            class={ICON_BUTTON}
            aria-label={`Move "${props.tab.label}" up`}
            disabled={props.index === 0}
            onClick={() => swap_tabs(props.index, props.index - 1)}
          >
            <ArrowUp size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            class={ICON_BUTTON}
            aria-label={`Move "${props.tab.label}" down`}
            disabled={props.index === props.total - 1}
            onClick={() => swap_tabs(props.index, props.index + 1)}
          >
            <ArrowDown size={12} aria-hidden="true" />
          </button>
        </div>
        <input
          type="checkbox"
          checked={props.tab.enabled}
          aria-label={`Show tab "${props.tab.label}"`}
          onChange={(event) => update_tab(props.tab.id, { enabled: event.currentTarget.checked })}
          class="size-4 cursor-pointer rounded border-border text-primary focus:ring-primary"
        />
        <Show
          when={!is_built_in()}
          fallback={
            <span
              class={`min-w-0 flex-1 truncate text-sm font-medium ${props.tab.enabled ? 'text-text' : 'text-text-muted'}`}
            >
              {props.tab.label}
            </span>
          }
        >
          <label for={label_id} class="sr-only">
            Tab label
          </label>
          <input
            ref={label_input}
            id={label_id}
            type="text"
            value={local_label()}
            placeholder="Tab label"
            onInput={(event) => set_local_label(event.currentTarget.value)}
            onBlur={commit_label}
            class={`flex-1 border-border ${TEXT_INPUT}`}
          />
          <button
            type="button"
            class={`${ICON_BUTTON} text-error hover:bg-error/10 hover:text-error`}
            aria-label={`Remove tab "${props.tab.label}"`}
            onClick={() => props.on_remove(props.tab.id)}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </Show>
      </div>
      <Show when={props.tab.id === 'threads'}>
        <p class="text-xs text-text-muted">{THREADS_HINT}</p>
      </Show>
      <Show when={!is_built_in()}>
        <div class="flex items-center gap-1.5">
          <label for={tag_id} class="text-xs text-text-muted">
            Tag or community #
          </label>
          <input
            id={tag_id}
            type="text"
            value={local_tag()}
            placeholder="e.g. hive-123456"
            aria-invalid={!local_tag()}
            aria-describedby={local_tag() ? undefined : tag_warning_id}
            onInput={(event) => set_local_tag(event.currentTarget.value)}
            onBlur={commit_tag}
            class={`flex-1 ${TEXT_INPUT} ${local_tag() ? 'border-border' : 'border-warning'}`}
          />
        </div>
        <Show when={!local_tag()}>
          <p id={tag_warning_id} class="flex items-center gap-1 text-xs text-warning">
            <TriangleAlert size={12} aria-hidden="true" />
            An empty tag matches no posts
          </p>
        </Show>
      </Show>
    </li>
  )
}

export function NavigationPopover(props: NavigationPopoverProps) {
  const global_id = `navigation-popover-global-${createUniqueId()}`
  const visible_count = () => settings.navigationTabs.filter((tab) => tab.enabled).length
  const [added_tab_id, set_added_tab_id] = createSignal<string>()
  let add_button: HTMLButtonElement | undefined

  const handle_remove = (tab_id: string) => {
    remove_tab(tab_id)
    add_button?.focus()
  }

  return (
    <PopoverShell
      open
      anchor={props.anchor}
      onClose={props.on_close}
      element_label={pageElementLabels[props.element_id] ?? props.element_id}
      slot_label={slot_label(props.slot)}
      move={props.move}
    >
      <section aria-labelledby={global_id} class="flex flex-col gap-2">
        <div>
          <h3 id={global_id} class="text-xs font-semibold uppercase text-text-muted">
            Global
          </h3>
          <p class="text-xs text-text-muted">Changes every instance</p>
        </div>
        <ul class="flex flex-col gap-1.5" aria-label="Navigation tabs">
          <For each={settings.navigationTabs}>
            {(tab, index) => (
              <TabRow
                tab={tab}
                index={index()}
                total={settings.navigationTabs.length}
                autofocus={tab.id === added_tab_id()}
                on_remove={handle_remove}
              />
            )}
          </For>
        </ul>
        <button
          ref={add_button}
          type="button"
          onClick={() => set_added_tab_id(add_category_tab())}
          class="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/30 p-2 text-sm text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
        >
          <Plus size={14} aria-hidden="true" />
          Add category tab
        </button>
        <p class="text-xs text-text-muted">Visible tabs: {visible_count()}</p>
      </section>
    </PopoverShell>
  )
}
