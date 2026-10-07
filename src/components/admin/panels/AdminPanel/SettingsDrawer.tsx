// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For, Show, createEffect, createSignal, createUniqueId, on, onCleanup, type JSX } from 'solid-js'
import { ChevronDown, X } from 'lucide-solid'
import { is_community_mode } from '../../queries'
import { ThemeSettings } from '../../settings/ThemeSettings'
import { SiteSettings } from '../../settings/SiteSettings'
import { SocialLinksSettings } from '../../settings/SocialLinksSettings'
import { CommunityDisplaySettings } from '../../settings/CommunityDisplaySettings'
import { TemplateSelector } from '../../editors/TemplateSelector'

export type DrawerSection = 'theme' | 'site' | 'template' | 'social' | 'community'

interface SettingsDrawerProps {
  open: boolean
  section: DrawerSection | null
  on_section_change: (section: DrawerSection | null) => void
  on_close: () => void
  /** Sticky top bar the drawer starts below, so it never covers the bar's controls. */
  top_anchor: () => HTMLElement | undefined
}

interface AccordionItem {
  id: DrawerSection
  title: string
  render: () => JSX.Element
}

const ITEMS: AccordionItem[] = [
  { id: 'theme', title: 'Theme & animations', render: () => <ThemeSettings /> },
  { id: 'site', title: 'Site', render: () => <SiteSettings /> },
  { id: 'template', title: 'Template', render: () => <TemplateSelector /> },
  { id: 'social', title: 'Social links', render: () => <SocialLinksSettings /> },
  { id: 'community', title: 'Community display', render: () => <CommunityDisplaySettings /> },
]

/** Non-modal global settings drawer; the canvas stays interactive and shows every change live. */
export function SettingsDrawer(props: SettingsDrawerProps) {
  const base_id = createUniqueId()
  const title_id = `settings-drawer-title-${base_id}`
  const items = () => ITEMS.filter((item) => item.id !== 'community' || is_community_mode())
  const [top, setTop] = createSignal(0)
  let close_button: HTMLButtonElement | undefined

  createEffect(
    on(
      () => props.open,
      (open) => {
        if (!open) return
        close_button?.focus()
        const anchor = props.top_anchor()
        if (!anchor) return
        const update_top = () => setTop(Math.max(anchor.getBoundingClientRect().bottom, 0))
        update_top()
        window.addEventListener('scroll', update_top, { passive: true })
        window.addEventListener('resize', update_top)
        onCleanup(() => {
          window.removeEventListener('scroll', update_top)
          window.removeEventListener('resize', update_top)
        })
      }
    )
  )

  const handle_keydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    props.on_close()
  }

  return (
    <Show when={props.open}>
      <aside
        id="admin-settings-drawer"
        role="complementary"
        aria-labelledby={title_id}
        onKeyDown={handle_keydown}
        style={{ top: `${top()}px` }}
        class="fixed right-0 bottom-16 z-40 flex w-[23.75rem] max-w-full flex-col border-l border-border bg-bg-card shadow-xl transition-transform duration-250 ease-out starting:translate-x-full motion-reduce:transition-none"
      >
        <div class="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <h2 id={title_id} class="flex-1 text-sm font-semibold text-text">
            Settings
          </h2>
          <button
            ref={close_button}
            type="button"
            aria-label="Close settings"
            onClick={() => props.on_close()}
            class="inline-flex size-8 items-center justify-center rounded text-text-muted hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-primary max-md:size-11"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <For each={items()}>
            {(item) => {
              const expanded = () => props.section === item.id
              const button_id = `settings-drawer-${base_id}-${item.id}-button`
              const panel_id = `settings-drawer-${base_id}-${item.id}-panel`
              return (
                <section class="border-b border-border">
                  <h3>
                    <button
                      id={button_id}
                      type="button"
                      aria-expanded={expanded()}
                      aria-controls={panel_id}
                      onClick={() => props.on_section_change(expanded() ? null : item.id)}
                      class="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-text hover:bg-bg-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                    >
                      <span class="flex-1">{item.title}</span>
                      <ChevronDown
                        size={16}
                        aria-hidden="true"
                        class={`text-text-muted transition-transform duration-150 ease-out motion-reduce:transition-none ${expanded() ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </h3>
                  <Show when={expanded()}>
                    <div id={panel_id} role="region" aria-labelledby={button_id} class="px-4 pb-4">
                      {item.render()}
                    </div>
                  </Show>
                </section>
              )
            }}
          </For>
        </div>
      </aside>
    </Show>
  )
}
