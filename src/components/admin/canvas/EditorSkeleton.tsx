// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For, Show } from 'solid-js'
import { hasLeftSidebar, hasRightSidebar, type LayoutTemplate } from '../types/layout'

export const CONTENT_CLASS = 'mx-auto max-w-[var(--content-width,80rem)] px-4 py-16'

const SKELETON_BLOCK = 'rounded-lg bg-bg-secondary animate-pulse motion-reduce:animate-none'

/** Canvas placeholder mirroring the page grid (top, main + sidebars, bottom). */
export function CanvasSkeleton(props: { template: LayoutTemplate; sidebar_style: Record<string, string> }) {
  return (
    <div class={CONTENT_CLASS}>
      <span class="sr-only">Loading settings</span>
      <div class={`mb-12 h-24 ${SKELETON_BLOCK}`} />
      <div class="sidebar-layout">
        <div class="main-content space-y-4">
          <For each={[0, 1, 2]}>{() => <div class={`h-40 ${SKELETON_BLOCK}`} />}</For>
        </div>
        <Show when={hasLeftSidebar(props.template)}>
          <div
            class={`sidebar-left h-64 page-lg:w-[var(--sidebar-width)] ${SKELETON_BLOCK}`}
            style={props.sidebar_style}
          />
        </Show>
        <Show when={hasRightSidebar(props.template)}>
          <div
            class={`sidebar-right h-64 page-lg:w-[var(--sidebar-width)] ${SKELETON_BLOCK}`}
            style={props.sidebar_style}
          />
        </Show>
      </div>
      <div class={`mt-12 h-16 ${SKELETON_BLOCK}`} />
    </div>
  )
}

const BAR_BLOCK = 'rounded-md bg-bg-secondary animate-pulse motion-reduce:animate-none'

// Panel geometry mirrors SidePanel: docked 22.5rem (lg+), overlay below the top bar (md), half-height sheet (mobile).
const PANEL_CLASS =
  'flex w-[22.5rem] shrink-0 flex-col border-l border-border bg-bg-card max-lg:fixed max-lg:top-12 max-lg:right-0 max-lg:bottom-0 max-lg:z-40 max-lg:shadow-xl max-md:inset-x-0 max-md:top-auto max-md:h-[50dvh] max-md:w-auto max-md:rounded-t-xl max-md:border-t max-md:border-l-0'

/** Static /admin shell shown before the editor bundle runs; no reactive state, so Astro can render it on the server. */
export function AdminShellSkeleton(props: { template?: LayoutTemplate; sidebar_style?: Record<string, string> }) {
  return (
    <div data-admin-skeleton="" aria-busy="true" class="fixed inset-0 z-50 flex flex-col bg-bg text-text">
      <span role="status" class="sr-only">
        Loading editor
      </span>

      <div
        aria-hidden="true"
        class="relative z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-bg-card px-2"
      >
        <div class="flex h-12 shrink-0 items-center px-3">
          <div class={`h-4 w-8 ${BAR_BLOCK}`} />
        </div>
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <div class={`h-8 w-16 max-md:hidden ${BAR_BLOCK}`} />
          <div class={`h-8 w-24 max-md:hidden ${BAR_BLOCK}`} />
          <div class={`h-8 w-16 ${BAR_BLOCK}`} />
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <div class={`h-4 w-32 max-md:hidden ${BAR_BLOCK}`} />
          <div class={`h-8 w-16 ${BAR_BLOCK}`} />
          <div class={`size-8 ${BAR_BLOCK}`} />
        </div>
      </div>

      <div aria-hidden="true" class="flex min-h-0 flex-1">
        <div class="min-w-0 flex-1 overflow-hidden bg-bg pt-4 max-md:pb-14">
          <div class="page-container style-tokens mx-auto">
            <CanvasSkeleton template={props.template ?? 'sidebar-right'} sidebar_style={props.sidebar_style ?? {}} />
          </div>
        </div>

        <div class={PANEL_CLASS}>
          <div class="flex h-12 shrink-0 items-center justify-end border-b border-border px-2 max-md:h-11">
            <div class={`size-8 ${BAR_BLOCK}`} />
          </div>
          <div class="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
            <For each={[0, 1, 2, 3]}>{() => <div class={`h-4 flex-1 ${BAR_BLOCK}`} />}</For>
          </div>
          <div class="min-h-0 flex-1 space-y-3 overflow-hidden p-4">
            <div class={`h-5 w-1/2 ${BAR_BLOCK}`} />
            <For each={[0, 1, 2, 3]}>{() => <div class={`h-16 ${SKELETON_BLOCK}`} />}</For>
          </div>
        </div>
      </div>
    </div>
  )
}
