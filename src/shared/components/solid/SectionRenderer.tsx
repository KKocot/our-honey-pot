// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * SectionRenderer - SolidJS component
 * Renders a section with proper orientation using shared utilities
 */

import { For, Show, createMemo, type Accessor, type JSX } from 'solid-js'
import type { PageLayoutSection } from '../../../components/admin/types/index'
import type { HomeSection, SettingsData } from '../../../components/admin/types/settings'
import type { HiveData } from '../../../components/admin/queries'
import type { BridgePost } from '@hiveio/workerbee/blog-logic'
import type { HiveCommunity } from '../../../lib/types/community'
import { get_slot_container_class, get_element_wrapper_class } from '../page-layout'
import { ElementRenderer } from './ElementRenderer'

/** Context handed to `renderElement`; `content` renders the element itself. */
export interface SectionElementContext {
  section: PageLayoutSection
  elementId: string
  index: Accessor<number>
  content: () => JSX.Element
}

/** One entry of a slot in render order: a layout element or a home section placed in its container. */
export type SectionSlotItem = { kind: 'element'; id: string } | { kind: 'section'; section: HomeSection }

/** Context handed to `renderHomeSection`; `index` is the position among all items of the slot. */
export interface SectionHomeContext {
  section: Accessor<HomeSection>
  index: Accessor<number>
}

interface SectionRendererProps {
  section: PageLayoutSection
  inSidebar?: boolean
  activeTab: Accessor<string>
  setActiveTab: (tab: string) => void
  data: Accessor<HiveData | null>
  community_title?: string
  community_posts?: BridgePost[]
  community?: HiveCommunity | null
  /** Per-instance settings (admin canvas); elements read the global settings store when omitted. */
  resolveSettings?: (sectionId: string, elementId: string) => SettingsData
  /** Wraps each element inside its layout wrapper (admin canvas edit overlay). */
  renderElement?: (context: SectionElementContext) => JSX.Element
  /** Render order of the slot, elements merged with placed home sections; default: `section.elements`. */
  items?: readonly SectionSlotItem[]
  /** Renders a placed home section; section items render nothing without it. */
  renderHomeSection?: (context: SectionHomeContext) => JSX.Element
}

const item_key = (item: SectionSlotItem): string =>
  item.kind === 'element' ? `element:${item.id}` : `section:${item.section.id}`

export function SectionRenderer(props: SectionRendererProps) {
  const items = createMemo(
    (): readonly SectionSlotItem[] =>
      props.items ?? props.section.elements.map((id): SectionSlotItem => ({ kind: 'element', id }))
  )
  const items_by_key = createMemo(() => new Map(items().map((item) => [item_key(item), item])))
  // Keyed by string, so a store update that replaces the item objects keeps the rendered entries mounted.
  const keys = createMemo(() => items().map(item_key))

  // One wrapper for elements and placed home sections, like SlotRenderer.astro (1:1, ADR 6ac6089d).
  const wrapper_class = () => get_element_wrapper_class(props.section.orientation, props.section.slot)

  const render_element = (elementId: string, index: Accessor<number>) => {
    const element_settings = createMemo(() => props.resolveSettings?.(props.section.id, elementId))
    const content = () => (
      <ElementRenderer
        elementId={elementId}
        inSidebar={props.inSidebar}
        activeTab={props.activeTab}
        setActiveTab={props.setActiveTab}
        data={props.data}
        community_title={props.community_title}
        community_posts={props.community_posts}
        community={props.community}
        settings={element_settings()}
        sectionId={props.section.id}
      />
    )
    return (
      <div class={wrapper_class()}>
        {props.renderElement ? props.renderElement({ section: props.section, elementId, index, content }) : content()}
      </div>
    )
  }

  const render_home_section = (key: string, initial: HomeSection, index: Accessor<number>) => {
    const section = () => {
      const current = items_by_key().get(key)
      return current?.kind === 'section' ? current.section : initial
    }
    return (
      <Show when={props.renderHomeSection}>
        {(render) => <div class={wrapper_class()}>{render()({ section, index })}</div>}
      </Show>
    )
  }

  return (
    <div class={get_slot_container_class(props.section.slot, props.section.orientation)}>
      <For each={keys()}>
        {(key, index) => {
          const item = items_by_key().get(key)
          if (!item) return null
          return item.kind === 'element'
            ? render_element(item.id, index)
            : render_home_section(key, item.section, index)
        }}
      </For>
    </div>
  )
}
