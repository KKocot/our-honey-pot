// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For, Show, createEffect, createSignal, createUniqueId, type JSX } from 'solid-js'
import { ChevronDown } from 'lucide-solid'
import { Slider, showToast } from '../../../../ui'
import { apply_layout_op, is_community_mode, set_global_size, settings, updateSettings } from '../../../queries'
import {
  authorProfileElementLabels,
  commentCardElementLabels,
  hasLeftSidebar,
  hasRightSidebar,
  postCardElementLabels,
  type ContainerName,
  type LayoutTemplate,
} from '../../../types/layout'
import { INSTANCE_OVERRIDE_RANGES, type InstanceOverrideKey, type SettingsData } from '../../../types/settings'
import { is_element_rendered, page_element_ids, template_hiding, template_showing } from '../../../canvas/layout-ops'
import { CardLayoutDnd } from '../../../canvas/popovers/CardLayoutDnd'
import { AUTHOR_PROFILE_ELEMENT_IDS } from '../../../canvas/popovers/AuthorProfilePopover'
import type { CardStructure } from '../../../canvas/popovers/PopoverShell'

const [revealed_card, set_revealed_card] = createSignal<CardStructure | null>(null)

/** Opens the card structure disclosure and scrolls it into view once the Layout tab is rendered. */
export function reveal_card_structure(card: CardStructure): void {
  set_revealed_card(card)
}

type SidebarName = Extract<ContainerName, 'sidebarLeft' | 'sidebarRight'>

const SIDEBARS: ReadonlyArray<{ name: SidebarName; label: string }> = [
  { name: 'sidebarLeft', label: 'Left sidebar' },
  { name: 'sidebarRight', label: 'Right sidebar' },
]

const LAYOUT_OPTIONS: ReadonlyArray<{ value: SettingsData['postsLayout']; label: string }> = [
  { value: 'list', label: 'List' },
  { value: 'grid', label: 'Grid' },
  { value: 'masonry', label: 'Masonry' },
]

function current_template(): LayoutTemplate {
  return settings.pageLayoutConfig?.template ?? 'no-sidebar'
}

function is_sidebar_shown(sidebar: SidebarName): boolean {
  return sidebar === 'sidebarLeft' ? hasLeftSidebar(current_template()) : hasRightSidebar(current_template())
}

function sidebar_has_elements(sidebar: SidebarName): boolean {
  const mode_ids = page_element_ids(is_community_mode())
  return (settings.pageLayoutConfig?.containers?.[sidebar]?.elements ?? []).some((element) =>
    is_element_rendered(element, mode_ids)
  )
}

function toggle_sidebar(sidebar: SidebarName): void {
  const hiding = is_sidebar_shown(sidebar)
  apply_layout_op((current) => {
    const config = current.pageLayoutConfig
    if (!config) return null
    const template = hiding ? template_hiding(config.template, sidebar) : template_showing(config.template, sidebar)
    return template === config.template ? null : { pageLayoutConfig: { ...config, template } }
  })
}

function Group(props: { title: string; description?: string; children: JSX.Element }) {
  const heading_id = `layout-group-${createUniqueId()}`
  return (
    <section aria-labelledby={heading_id} class="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0">
      <header>
        <h3 id={heading_id} class="text-xs font-semibold uppercase text-text-muted">
          {props.title}
        </h3>
        <Show when={props.description}>
          <p class="mt-0.5 text-xs text-text-muted">{props.description}</p>
        </Show>
      </header>
      {props.children}
    </section>
  )
}

/** Single-level disclosure for the heavy card trees; mounted only while open. */
function Disclosure(props: { title: string; card?: CardStructure; children: JSX.Element }) {
  const id = createUniqueId()
  const button_id = `layout-disclosure-${id}`
  const region_id = `layout-disclosure-region-${id}`
  const [open, set_open] = createSignal(false)
  let button: HTMLButtonElement | undefined

  createEffect(() => {
    if (!props.card || revealed_card() !== props.card) return
    set_revealed_card(null)
    set_open(true)
    // Two frames: the side panel restores its saved scroll position one frame after a tab switch.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        button?.scrollIntoView({ block: 'start', behavior: 'smooth' })
        button?.focus({ preventScroll: true })
      })
    )
  })

  return (
    <section class="scroll-mt-2 border-b border-border last:border-b-0">
      <h3>
        <button
          ref={button}
          id={button_id}
          type="button"
          aria-expanded={open()}
          aria-controls={region_id}
          onClick={() => set_open(!open())}
          class="flex w-full items-center gap-2 px-4 py-3 text-left text-xs font-semibold uppercase text-text-muted hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary max-md:min-h-11"
        >
          <span class="flex-1">{props.title}</span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            class={`transition-transform duration-150 ease-out motion-reduce:transition-none ${open() ? 'rotate-180' : ''}`}
          />
        </button>
      </h3>
      <Show when={open()}>
        <div id={region_id} role="region" aria-labelledby={button_id} class="px-4 pb-4">
          {props.children}
        </div>
      </Show>
    </section>
  )
}

function SidebarSwitch(props: { name: SidebarName; label: string }) {
  const hint_id = `sidebar-hint-${createUniqueId()}`
  const shown = () => is_sidebar_shown(props.name)
  const blocked = () => !shown() && !sidebar_has_elements(props.name)
  return (
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <span class="block text-sm text-text">{props.label}</span>
        <Show when={blocked()}>
          <span id={hint_id} class="block text-xs text-text-muted">
            Empty. Move a section here on the canvas first.
          </span>
        </Show>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={shown()}
        aria-label={props.label}
        aria-describedby={blocked() ? hint_id : undefined}
        disabled={blocked()}
        onClick={() => toggle_sidebar(props.name)}
        class={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${
          shown() ? 'bg-primary' : 'bg-border'
        }`}
      >
        <span
          aria-hidden="true"
          class={`inline-block size-4 rounded-full bg-bg-card shadow-sm transition-transform duration-150 ease-out motion-reduce:transition-none ${
            shown() ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

function GlobalSizeSlider(props: { setting: InstanceOverrideKey; label: string; unit?: string }) {
  const range = () => INSTANCE_OVERRIDE_RANGES[props.setting]
  return (
    <Slider
      label={props.label}
      value={settings[props.setting] ?? range().min}
      min={range().min}
      max={range().max}
      unit={props.unit}
      onChange={(value) => {
        if (!set_global_size(props.setting, value)) showToast('Failed to save the value', 'error')
      }}
    />
  )
}

function PostsLayoutSwitch() {
  return (
    <div role="group" aria-label="Posts layout" class="flex rounded-lg bg-bg-secondary p-0.5 text-xs">
      <For each={LAYOUT_OPTIONS}>
        {(option) => (
          <button
            type="button"
            aria-pressed={settings.postsLayout === option.value}
            onClick={() => updateSettings({ postsLayout: option.value })}
            class={`flex-1 rounded-md px-2 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11 ${
              settings.postsLayout === option.value
                ? 'bg-bg-card text-text shadow-sm'
                : 'text-text-muted hover:text-text'
            }`}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  )
}

/** Global page layout: sidebars, posts list and card structures. Per-instance sizes stay in canvas popovers. */
export function LayoutTab() {
  return (
    <div class="flex flex-col">
      <Group title="Sidebars">
        <For each={SIDEBARS}>{(sidebar) => <SidebarSwitch name={sidebar.name} label={sidebar.label} />}</For>
      </Group>
      <Group title="Posts list" description="Defaults for every list; lists with their own size keep it.">
        <PostsLayoutSwitch />
        <Show when={settings.postsLayout === 'grid'}>
          <GlobalSizeSlider setting="gridColumns" label="Columns" />
        </Show>
        <GlobalSizeSlider setting="cardGapPx" label="Card gap" unit="px" />
        <GlobalSizeSlider setting="postsPerPage" label="Posts per page" />
      </Group>
      <Disclosure title="Post card" card="post">
        <CardLayoutDnd layout_key="postCardLayout" element_labels={postCardElementLabels} label="Post card layout" />
      </Disclosure>
      <Disclosure title="Comment card" card="comment">
        <CardLayoutDnd
          layout_key="commentCardLayout"
          element_labels={commentCardElementLabels}
          label="Comment card layout"
        />
      </Disclosure>
      <Show when={!is_community_mode()}>
        <Disclosure title="Profile card" card="profile">
          <CardLayoutDnd
            layout_key="authorProfileLayout2"
            element_labels={authorProfileElementLabels}
            element_ids={AUTHOR_PROFILE_ELEMENT_IDS}
            label="Profile card layout"
          />
        </Disclosure>
      </Show>
    </div>
  )
}
