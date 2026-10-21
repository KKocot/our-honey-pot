// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For, Show, createUniqueId, type JSX } from 'solid-js'
import { apply_layout_op, is_community_mode, settings } from '../../../queries'
import { hasLeftSidebar, hasRightSidebar, type ContainerName, type LayoutTemplate } from '../../../types/layout'
import { is_element_rendered, page_element_ids, template_hiding, template_showing } from '../../../canvas/layout-ops'
import { SiteSettings } from '../../../settings/SiteSettings'
import { PagesSettings, type PagesSettingsProps } from '../../../settings/PagesSettings'
import { SocialLinksSettings } from '../../../settings/SocialLinksSettings'

export type SiteGroup = 'sidebars' | 'site' | 'pages' | 'social'

/** DOM id of a Site tab group, so callers can scroll it into view. */
export function site_group_id(group: SiteGroup): string {
  return `admin-site-${group}`
}

type SidebarName = Extract<ContainerName, 'sidebarLeft' | 'sidebarRight'>

const SIDEBARS: ReadonlyArray<{ name: SidebarName; label: string }> = [
  { name: 'sidebarLeft', label: 'Left sidebar' },
  { name: 'sidebarRight', label: 'Right sidebar' },
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

function Group(props: { id: SiteGroup; title: string; children: JSX.Element }) {
  const heading_id = `site-group-${createUniqueId()}`
  return (
    <section
      id={site_group_id(props.id)}
      aria-labelledby={heading_id}
      class="flex scroll-mt-2 flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0"
    >
      <h3 id={heading_id} class="text-xs font-semibold uppercase text-text-muted">
        {props.title}
      </h3>
      {props.children}
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

/** Site-wide settings only; per-component settings live in their canvas gear popovers (ADR 6ac6089d). */
export function SiteTab(props: { pages?: PagesSettingsProps }) {
  return (
    <div class="flex flex-col">
      <Group id="sidebars" title="Sidebars">
        <For each={SIDEBARS}>{(sidebar) => <SidebarSwitch name={sidebar.name} label={sidebar.label} />}</For>
      </Group>
      <Group id="site" title="Site">
        <SiteSettings />
      </Group>
      <Group id="pages" title="Pages">
        <PagesSettings {...props.pages} />
      </Group>
      <Group id="social" title="Social links">
        <SocialLinksSettings />
      </Group>
    </div>
  )
}
