// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * SectionRenderer - SolidJS component
 * Renders a section with proper orientation using shared utilities
 */

import { For, createMemo, type Accessor, type JSX } from 'solid-js'
import type { PageLayoutSection } from '../../../components/admin/types/index'
import type { SettingsData } from '../../../components/admin/types/settings'
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
}

export function SectionRenderer(props: SectionRendererProps) {
  return (
    <div class={get_slot_container_class(props.section.slot, props.section.orientation)}>
      <For each={props.section.elements}>
        {(elementId, index) => {
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
            />
          )
          return (
            <div class={get_element_wrapper_class(props.section.orientation, props.section.slot)}>
              {props.renderElement
                ? props.renderElement({ section: props.section, elementId, index, content })
                : content()}
            </div>
          )
        }}
      </For>
    </div>
  )
}
