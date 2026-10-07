// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createMemo, createSignal, For, Show, type JSX } from 'solid-js'
import { FlaskConical, RotateCw } from 'lucide-solid'
import { Button } from '../../ui'
import { apply_layout_op, is_community_mode, settings, type HiveData } from '../queries'
import {
  COMMUNITY_PAGE_ELEMENT_IDS,
  MAIN_SECTION_ID,
  USER_PAGE_ELEMENT_IDS,
  hasLeftSidebar,
  hasRightSidebar,
  slotLabels,
  type ContainerElement,
  type ContainerName,
  type LayoutTemplate,
  type PageLayoutSection,
  type PageSlotPosition,
} from '../types/layout'
import type { SettingsData } from '../types/settings'
import type { BridgePost } from '@hiveio/workerbee/blog-logic'
import { resolve_instance_settings, resolve_main_posts_settings } from '../../../lib/instance-overrides'
import { resolve_default_sort } from '../../../lib/community-sort'
import { resolve_visible_sorts } from '../../community/pagination'
import { filter_hidden_posts } from '../../community/community-posts'
import { get_section_wrapper_class } from '../../../shared/components/page-layout'
import { SectionRenderer, type SectionElementContext } from '../../../shared/components/solid/SectionRenderer'
import { CommunityContent } from '../../community/CommunityContent'
import {
  CONTAINER_SECTION_IDS,
  is_container_element_allowed,
  move_element,
  move_section,
  template_after_move,
} from './layout-ops'
import { use_canvas_data, type CanvasDataState, type MockReason } from './use_canvas_data'
import { DndRoot, type DndMoveEvent } from './dnd/DndRoot'
import { DropZone } from './dnd/DropZone'
import { EditableElement, PAGE_ELEMENT_DND_TYPE } from './EditableElement'
import { EditableSection, PAGE_SECTION_DND_TYPE } from './EditableSection'
import { active_tab, clear_selection, set_active_tab } from './selection'

export interface EditorCanvasProps {
  /** Shared data source (e.g. also read by the TopBar badge); the canvas creates its own when omitted. */
  canvas_data?: CanvasDataState
  /** Settings are still loading: skeleton instead of the blog. */
  loading?: boolean
  /** Save in progress: edits are blocked. */
  busy?: boolean
  /** Inline "Sample data" / "Live data" badge; the shell may render it in its TopBar instead. */
  show_source_badge?: boolean
}

type ZoneId = ContainerName | 'main'

interface SlotSpec {
  slot: PageSlotPosition
  zone: ZoneId
}

const SLOT_SPECS: Readonly<Record<PageSlotPosition, SlotSpec>> = {
  top: { slot: 'top', zone: 'top' },
  'sidebar-left': { slot: 'sidebar-left', zone: 'sidebarLeft' },
  main: { slot: 'main', zone: 'main' },
  'sidebar-right': { slot: 'sidebar-right', zone: 'sidebarRight' },
  bottom: { slot: 'bottom', zone: 'bottom' },
}

const ZONE_SLOTS: Readonly<Record<ZoneId, PageSlotPosition>> = {
  top: 'top',
  sidebarLeft: 'sidebar-left',
  main: 'main',
  sidebarRight: 'sidebar-right',
  bottom: 'bottom',
}

const MAIN_ELEMENT_IDS = ['navigation', 'posts']
const SORTABLE_PREFIX = 'page-el'
const SECTION_SORTABLE_PREFIX = 'page-sec'

const MOCK_REASON_TEXT: Readonly<Record<MockReason, string>> = {
  user_choice: 'Sample data selected',
  no_account: 'No Hive account configured',
  no_posts: 'This account has no posts yet',
  no_community: 'Community not found',
  error: 'Could not load data from Hive',
}

function sortable_id(container: ContainerName, element_id: string): string {
  return `${SORTABLE_PREFIX}:${container}:${element_id}`
}

function parse_sortable_id(id: string): { container: ContainerName; element_id: string } | null {
  const [prefix, container, element_id] = id.split(':')
  if (prefix !== SORTABLE_PREFIX || !container || !element_id) return null
  if (!(container in CONTAINER_SECTION_IDS)) return null
  return { container: container as ContainerName, element_id }
}

function section_sortable_id(container: ContainerName): string {
  return `${SECTION_SORTABLE_PREFIX}:${container}`
}

function parse_section_sortable_id(id: string): ContainerName | null {
  const [prefix, container] = id.split(':')
  if (prefix !== SECTION_SORTABLE_PREFIX || !container || !is_container(container)) return null
  return container
}

function is_container(zone: string): zone is ContainerName {
  return zone in CONTAINER_SECTION_IDS
}

function mode_element_ids(): ReadonlySet<string> {
  return is_community_mode() ? COMMUNITY_PAGE_ELEMENT_IDS : USER_PAGE_ELEMENT_IDS
}

function is_rendered(element: ContainerElement, mode_ids: ReadonlySet<string>): boolean {
  return element.active && mode_ids.has(element.id)
}

/** Full-array index for a drop at `visible_index` among rendered elements; inactive elements keep their neighbours. */
function to_full_index(elements: ContainerElement[], mode_ids: ReadonlySet<string>, visible_index: number): number {
  const rendered = elements.filter((element) => is_rendered(element, mode_ids))
  const anchor = rendered[visible_index]
  if (anchor) return elements.indexOf(anchor)
  const last = rendered.at(-1)
  return last ? elements.indexOf(last) + 1 : elements.length
}

function move_op(event: DndMoveEvent, mode_ids: ReadonlySet<string>) {
  return (current: SettingsData): Partial<SettingsData> | null => {
    const parsed = parse_sortable_id(event.id)
    const to = event.target.container_id
    const config = current.pageLayoutConfig
    if (!parsed || !is_container(to) || !config?.containers) return null

    const from_elements = config.containers[parsed.container]?.elements ?? []
    const from_index = from_elements.findIndex((element) => element.id === parsed.element_id)
    if (from_index < 0) return null

    const target_elements = (config.containers[to]?.elements ?? []).filter(
      (element) => parsed.container !== to || element.id !== parsed.element_id
    )
    const to_index = to_full_index(target_elements, mode_ids, event.target.index)

    const next = move_element(
      { pageLayoutConfig: config, instanceOverrides: current.instanceOverrides ?? {} },
      { container: parsed.container, index: from_index },
      { container: to, index: to_index }
    )
    if (!next) return null
    return {
      pageLayoutConfig: {
        ...next.pageLayoutConfig,
        template: template_after_move(next, parsed.container, to, (element) => is_rendered(element, mode_ids)),
      },
      instanceOverrides: next.instanceOverrides,
    }
  }
}

function move_section_op(event: DndMoveEvent, mode_ids: ReadonlySet<string>) {
  return (current: SettingsData): Partial<SettingsData> | null => {
    const from = parse_section_sortable_id(event.id)
    const to = event.target.container_id
    const config = current.pageLayoutConfig
    if (!from || !is_container(to) || !config?.containers) return null

    // Appended at the end: the drop target is the slot, not a position between its elements.
    const next = move_section(
      { pageLayoutConfig: config, instanceOverrides: current.instanceOverrides ?? {} },
      from,
      to
    )
    if (!next) return null
    return {
      pageLayoutConfig: {
        ...next.pageLayoutConfig,
        template: template_after_move(next, from, to, (element) => is_rendered(element, mode_ids)),
      },
      instanceOverrides: next.instanceOverrides,
    }
  }
}

/** Live blog canvas of the admin editor: shared Solid renderers, per-instance settings and slot drop zones. */
export function EditorCanvas(props: EditorCanvasProps) {
  const canvas = props.canvas_data ?? use_canvas_data()
  const [dragging, set_dragging] = createSignal(false)

  const mode_ids = createMemo(() => mode_element_ids())
  const template = (): LayoutTemplate => settings.pageLayoutConfig?.template ?? 'no-sidebar'
  const show_left = () => hasLeftSidebar(template()) || dragging()
  const show_right = () => hasRightSidebar(template()) || dragging()

  const is_mock = () => canvas.source === 'mock'
  const is_loading = () => props.loading === true || canvas.is_loading

  const preview_sort = () =>
    resolve_default_sort(settings.community_default_sort, resolve_visible_sorts(settings.community_visible_sorts))
  const main_posts_limit = () => resolve_main_posts_settings(settings).postsPerPage || 20

  const hive_data = createMemo((): HiveData | null => {
    const hive = canvas.data?.hive
    if (!hive) return null
    return { ...hive, posts: hive.posts.slice(0, main_posts_limit()) }
  })
  const community = () => canvas.data?.community?.community ?? null
  const community_posts = createMemo(() => {
    const posts = canvas.data?.community?.posts
    if (!posts) return undefined
    return filter_hidden_posts(posts, preview_sort() === 'muted').slice(0, main_posts_limit())
  })
  const community_title = () => (is_community_mode() ? community()?.title || '' : undefined)

  const has_data = (element_id: string) => {
    if (element_id === 'authorProfile') return !!hive_data()?.profile
    if (element_id === 'communityProfile' || element_id === 'communitySidebar') return !!community()
    return true
  }

  const resolve_settings = (section_id: string, element_id: string) =>
    resolve_instance_settings(settings, section_id, element_id)

  // Public index.astro renders the community main slot with CommunityContent (sort tabs, pinned, pagination), not PostsSection.
  const CommunityMain = () => {
    const main_settings = createMemo(() => resolve_main_posts_settings(settings))
    const content = (static_posts: BridgePost[] | undefined) => (
      <CommunityContent
        community_name={settings.hiveUsername}
        initial_sort={preview_sort()}
        posts_per_page={main_posts_limit()}
        settings={main_settings()}
        post_card_layout={settings.postCardLayout}
        static_posts={static_posts}
      />
    )
    return (
      <Show when={is_mock()} fallback={content(undefined)}>
        {content((canvas.data?.community?.posts ?? []).slice(0, main_posts_limit()))}
      </Show>
    )
  }

  const container_section = (container: ContainerName): PageLayoutSection | null => {
    const elements = (settings.pageLayoutConfig?.containers?.[container]?.elements ?? [])
      .filter((element) => is_rendered(element, mode_ids()))
      .map((element) => element.id)
    if (elements.length === 0) return null
    const slot = ZONE_SLOTS[container]
    return {
      id: CONTAINER_SECTION_IDS[container],
      slot,
      orientation: slot === 'top' || slot === 'bottom' ? 'horizontal' : 'vertical',
      elements,
      active: true,
    }
  }

  const main_section = createMemo((): PageLayoutSection => ({
    id: MAIN_SECTION_ID,
    slot: 'main',
    orientation: 'vertical',
    elements: MAIN_ELEMENT_IDS.filter((id) => mode_ids().has(id)),
    active: true,
  }))

  const can_accept = (zone: ContainerName) => (source_id: string) => {
    const section_from = parse_section_sortable_id(source_id)
    if (section_from) {
      if (section_from === zone) return true
      const target_ids = new Set(
        (settings.pageLayoutConfig?.containers?.[zone]?.elements ?? []).map((element) => element.id)
      )
      return !(settings.pageLayoutConfig?.containers?.[section_from]?.elements ?? []).some((element) =>
        target_ids.has(element.id)
      )
    }
    const parsed = parse_sortable_id(source_id)
    if (!parsed || !is_container_element_allowed(parsed.element_id, is_community_mode())) return false
    if (parsed.container === zone) return true
    return !(settings.pageLayoutConfig?.containers?.[zone]?.elements ?? []).some(
      (element) => element.id === parsed.element_id
    )
  }

  const handle_drag_start = () => {
    clear_selection()
    set_dragging(true)
  }

  const handle_drag_end = (event: DndMoveEvent) => {
    set_dragging(false)
    apply_layout_op(
      parse_section_sortable_id(event.id) ? move_section_op(event, mode_ids()) : move_op(event, mode_ids())
    )
  }

  const SlotZone = (zone_props: { spec: SlotSpec; in_sidebar?: boolean }) => {
    const zone = zone_props.spec.zone
    const section = createMemo(() => (zone === 'main' ? main_section() : container_section(zone)))
    const count = () => section()?.elements.length ?? 0

    const render_element = (context: SectionElementContext): JSX.Element => (
      <EditableElement
        section_id={context.section.id}
        slot={zone_props.spec.slot}
        element_id={context.elementId}
        index={context.index}
        count={count}
        dnd={
          is_container(zone)
            ? {
                sortable_id: sortable_id(zone, context.elementId),
                container_id: () => zone,
                orientation: () => context.section.orientation,
              }
            : undefined
        }
        is_mock={is_mock()}
        has_data={has_data(context.elementId)}
      >
        {zone === 'main' && is_community_mode() && context.elementId === 'posts' ? (
          <CommunityMain />
        ) : (
          context.content()
        )}
      </EditableElement>
    )

    return (
      <div class={get_section_wrapper_class(zone_props.spec.slot)}>
        <p class="mb-1 text-xs text-text-muted md:hidden">{slotLabels[zone_props.spec.slot]}</p>
        <DropZone
          id={zone}
          count={count()}
          accept={[PAGE_ELEMENT_DND_TYPE, PAGE_SECTION_DND_TYPE]}
          disabled={!is_container(zone)}
          can_accept={is_container(zone) ? can_accept(zone) : undefined}
          label={slotLabels[zone_props.spec.slot]}
        >
          <Show when={section()}>
            {(current) => (
              <EditableSection
                section_id={current().id}
                slot={zone_props.spec.slot}
                element_count={count()}
                dnd={
                  is_container(zone) ? { sortable_id: section_sortable_id(zone), container_id: () => zone } : undefined
                }
              >
                <SectionRenderer
                  section={current()}
                  inSidebar={zone_props.in_sidebar}
                  activeTab={active_tab}
                  setActiveTab={set_active_tab}
                  data={hive_data}
                  community_title={community_title()}
                  community_posts={community_posts()}
                  community={community()}
                  resolveSettings={resolve_settings}
                  renderElement={render_element}
                />
              </EditableSection>
            )}
          </Show>
        </DropZone>
      </div>
    )
  }

  return (
    <div aria-busy={is_loading() ? 'true' : undefined} class={props.busy ? 'pointer-events-none opacity-60' : ''}>
      <div class="mx-auto max-w-7xl px-4 pt-4">
        <Show when={canvas.error}>
          {(message) => (
            <div
              role="alert"
              class="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning bg-warning/10 px-4 py-3 text-sm text-text"
            >
              <p class="min-w-0 flex-1">
                Could not load posts from Hive. Showing sample data instead.
                <span class="block text-xs text-text-muted">{message()}</span>
              </p>
              <Button variant="secondary" size="sm" onClick={() => canvas.retry()}>
                <RotateCw size={14} aria-hidden="true" class="mr-1.5 inline" />
                Retry
              </Button>
            </div>
          )}
        </Show>
        <Show when={props.show_source_badge !== false && !is_loading()}>
          <Show
            when={is_mock()}
            fallback={
              <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-success">
                <span aria-hidden="true">●</span> Live data
              </span>
            }
          >
            <span
              title={canvas.mock_reason ? MOCK_REASON_TEXT[canvas.mock_reason] : undefined}
              class="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs text-warning"
            >
              <FlaskConical size={12} aria-hidden="true" />
              Sample data
              <Show when={canvas.mock_reason}>
                {(reason) => <span class="sr-only">: {MOCK_REASON_TEXT[reason()]}</span>}
              </Show>
            </span>
          </Show>
        </Show>
      </div>

      <Show when={!is_loading()} fallback={<CanvasSkeleton template={template()} />}>
        <DndRoot
          onDragStart={handle_drag_start}
          onDragEnd={handle_drag_end}
          onDragCancel={() => set_dragging(false)}
          container_label={(id) => slotLabels[ZONE_SLOTS[id as ZoneId]] ?? id}
        >
          <div class="mx-auto max-w-7xl px-4 py-16">
            <SlotZone spec={SLOT_SPECS.top} />
            <Show when={show_left() || show_right()} fallback={<SlotZone spec={SLOT_SPECS.main} />}>
              <div class="sidebar-layout">
                <Show when={show_left()}>
                  <div class="sidebar-left" style="--sidebar-width: 280px;">
                    <SlotZone spec={SLOT_SPECS['sidebar-left']} in_sidebar />
                  </div>
                </Show>
                <div class="main-content">
                  <SlotZone spec={SLOT_SPECS.main} />
                </div>
                <Show when={show_right()}>
                  <div class="sidebar-right" style="--sidebar-width: 280px;">
                    <SlotZone spec={SLOT_SPECS['sidebar-right']} in_sidebar />
                  </div>
                </Show>
              </div>
            </Show>
            <SlotZone spec={SLOT_SPECS.bottom} />
          </div>
        </DndRoot>
      </Show>
    </div>
  )
}

const SKELETON_BLOCK = 'rounded-lg bg-bg-secondary animate-pulse motion-reduce:animate-none'

function CanvasSkeleton(props: { template: LayoutTemplate }) {
  return (
    <div class="mx-auto max-w-7xl px-4 py-16">
      <span class="sr-only">Loading settings</span>
      <div class={`mb-6 h-24 ${SKELETON_BLOCK}`} />
      <div class="sidebar-layout">
        <Show when={hasLeftSidebar(props.template)}>
          <div class={`sidebar-left h-64 lg:w-[17.5rem] ${SKELETON_BLOCK}`} />
        </Show>
        <div class="main-content space-y-4">
          <For each={[0, 1, 2]}>{() => <div class={`h-40 ${SKELETON_BLOCK}`} />}</For>
        </div>
        <Show when={hasRightSidebar(props.template)}>
          <div class={`sidebar-right h-64 lg:w-[17.5rem] ${SKELETON_BLOCK}`} />
        </Show>
      </div>
      <div class={`mt-6 h-16 ${SKELETON_BLOCK}`} />
    </div>
  )
}
