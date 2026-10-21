// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import {
  batch,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
  type Accessor,
  type Component,
  type JSX,
} from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { FlaskConical, RotateCw } from 'lucide-solid'
import { Button, showToast } from '../../ui'
import { apply_layout_op, is_community_mode, settings, type HiveData } from '../queries'
import {
  MAIN_SECTION_ID,
  hasLeftSidebar,
  hasRightSidebar,
  pageElementLabels,
  slotLabels,
  type ContainerElement,
  type ContainerName,
  type LayoutTemplate,
  type PageLayoutSection,
  type PageSlotPosition,
} from '../types/layout'
import { clamp_style_token, defaultSettings, type SettingsData } from '../types/settings'
import { build_style_token_vars } from '../../../lib/style-tokens'
import { resolve_sidebar_width_px } from '../../../lib/head-meta'
import { DEVICE_WIDTHS } from '../editor-state'
import type { BridgePost } from '@hiveio/workerbee/blog-logic'
import { resolve_instance_settings, resolve_main_posts_settings } from '../../../lib/instance-overrides'
import { resolve_default_sort } from '../../../lib/community-sort'
import { resolve_visible_sorts } from '../../community/pagination'
import { filter_hidden_posts } from '../../community/community-posts'
import {
  all_profile_parts_disabled,
  all_sidebar_blocks_disabled,
  description_block_visible,
  has_visible_sidebar_blocks,
  language_block_visible,
  profile_part_flags,
  profile_renders,
  rules_block_visible,
  sidebar_block_flags,
  slot_element_renders,
  team_block_visible,
} from '../../community/sidebar-blocks'
import { CommunitySidebar } from '../../community/CommunitySidebar'
import {
  CommunityDescriptionBlock,
  CommunityLanguageBlock,
  CommunityRulesBlock,
  CommunityTeamBlock,
} from '../../community/blocks'
import type { HiveCommunity } from '../../../lib/types/community'
import { community_block_flag } from './popovers/CommunitySidebarPopover'
import { get_section_wrapper_class } from '../../../shared/components/page-layout'
import {
  SectionRenderer,
  type SectionElementContext,
  type SectionHomeContext,
  type SectionSlotItem,
} from '../../../shared/components/solid/SectionRenderer'
import { PageSlotContext } from '../../../shared/components/header/slot-context'
import { SiteTopbar } from '../../../shared/components/solid/ElementRenderer'
import { resolveSiteName } from '../../../shared/components/header/utils'
import { home_lead_section_ids } from '../../../shared/components/sections'
import {
  home_section_containers,
  resolve_section_container,
  split_home_containers,
  type ContainerElementFilter,
} from '../../../shared/components/sections/render'
import { is_placement_allowed } from '../../../shared/components/sections/registry'
import type { HomeContainerItem } from '../../../shared/components/sections/types'
import { CommunityContent } from '../../community/CommunityContent'
import {
  CONTAINER_NAMES,
  CONTAINER_SECTION_IDS,
  CONTAINER_SLOTS,
  MAIN_ELEMENT_IDS,
  is_container_element_allowed,
  is_element_rendered as is_rendered,
  page_element_ids,
  move_element,
  move_section,
  template_after_move,
  template_hiding,
  template_showing,
} from './layout-ops'
import {
  add_element_op,
  addable_elements,
  addable_sections,
  remove_element_op,
  show_block_op,
  type ElementOp,
} from './element-ops'
import { AddElementMenu } from './AddElementMenu'
import { add_section_to_container, move_section_placement } from './container-section-ops'
import { home_sections_of, remove_home_section, type AddableHomeSectionType } from './home-section-ops'
import { CanvasSkeleton, CONTENT_CLASS } from './EditorSkeleton'
import { use_canvas_data, type CanvasDataState, type MockReason } from './use_canvas_data'
import { DndRoot, type DndCancelReason, type DndMoveEvent } from './dnd/DndRoot'
import { DropZone } from './dnd/DropZone'
import type { DndOrientation } from './dnd/use_sortable'
import { EditableElement, PAGE_ELEMENT_DND_TYPE, type EditableElementDnd } from './EditableElement'
import { EditableSection, PAGE_SECTION_DND_TYPE, type EditableSectionDnd } from './EditableSection'
import { active_tab, clear_selection, is_home_section_selected, is_selected, set_active_tab } from './selection'
import { HomeSectionsStack, PlacedHomeSection, type HomeSectionOp } from './home-sections/HomeSectionsStack'
import {
  DELETE_UNDO_MS,
  HOME_OP_LABELS,
  HOME_SECTION_DND_TYPE,
  home_swap_op,
  parse_home_sortable_id,
} from './home-sections/model'

/** Inline `--sidebar-width` for canvas sidebars, clamped like the public `<aside>` in index.astro. */
export function canvas_sidebar_style(raw: unknown): Record<string, string> {
  return { '--sidebar-width': `${resolve_sidebar_width_px(raw)}px` }
}

interface CommunityBlockSpec {
  component: Component<{ community: HiveCommunity; locale?: string; show?: boolean }>
  visible: (community: HiveCommunity, show: boolean) => boolean
}

const COMMUNITY_BLOCKS: Readonly<Record<string, CommunityBlockSpec>> = {
  communityDescription: { component: CommunityDescriptionBlock, visible: description_block_visible },
  communityRules: { component: CommunityRulesBlock, visible: rules_block_visible },
  communityTeam: { component: CommunityTeamBlock, visible: team_block_visible },
  communityLanguage: { component: CommunityLanguageBlock, visible: language_block_visible },
}

const community_block = (element_id: string): CommunityBlockSpec | null =>
  Object.hasOwn(COMMUNITY_BLOCKS, element_id) ? COMMUNITY_BLOCKS[element_id] : null

/** Elements the canvas renders with the community components itself (ElementRenderer has no blog locale for them). */
export function is_canvas_community_element(element_id: string): boolean {
  return element_id === 'communitySidebar' || community_block(element_id) !== null
}

export const HIDDEN_ELEMENT_LABEL = 'Hidden — enable in settings'

/** True when the community element would render something on the public page. */
export function community_element_has_data(
  element_id: string,
  community: HiveCommunity | null,
  element_settings: SettingsData
): boolean {
  if (!community) return false
  if (element_id === 'communityProfile') {
    return profile_renders(community, profile_part_flags(element_settings))
  }
  if (element_id === 'communitySidebar') {
    return has_visible_sidebar_blocks(community, sidebar_block_flags(element_settings))
  }
  const block = community_block(element_id)
  const flag = community_block_flag(element_id)
  return !!block && !!flag && block.visible(community, element_settings[flag] !== false)
}

/** Chip text for a community element hidden by its settings flag(s), else undefined (plain "No data"). */
export function community_element_empty_label(element_id: string, element_settings: SettingsData): string | undefined {
  if (element_id === 'communityProfile') {
    return all_profile_parts_disabled(profile_part_flags(element_settings)) ? HIDDEN_ELEMENT_LABEL : undefined
  }
  if (element_id === 'communitySidebar') {
    return all_sidebar_blocks_disabled(sidebar_block_flags(element_settings)) ? HIDDEN_ELEMENT_LABEL : undefined
  }
  const flag = community_block_flag(element_id)
  return flag && element_settings[flag] === false ? HIDDEN_ELEMENT_LABEL : undefined
}

/** Canvas render of a community block or the aggregate sidebar: the same components and blog locale as the public page. */
export function CanvasCommunityElement(props: {
  element_id: string
  community: HiveCommunity | null
  settings: SettingsData
}) {
  const flags = () => sidebar_block_flags(props.settings)
  const block = () => community_block(props.element_id)
  const show = () => {
    const flag = community_block_flag(props.element_id)
    return flag ? props.settings[flag] !== false : true
  }
  return (
    <Show when={props.community}>
      {(community) => (
        <Show
          when={block()}
          fallback={
            <CommunitySidebar
              community={community()}
              locale={props.settings.locale}
              show_description={flags().show_description}
              show_rules={flags().show_rules}
              show_leadership={flags().show_leadership}
              show_language={flags().show_language}
            />
          }
        >
          {(spec) => (
            <Dynamic
              component={spec().component}
              community={community()}
              locale={props.settings.locale}
              show={show()}
            />
          )}
        </Show>
      )}
    </Show>
  )
}

export interface EditorCanvasProps {
  /** Shared data source (e.g. also read by the TopBar badge); the canvas creates its own when omitted. */
  canvas_data?: CanvasDataState
  /** Settings are still loading: skeleton instead of the blog. */
  loading?: boolean
  /** Save in progress: edits are blocked. */
  busy?: boolean
  /** Inline "Sample data" / "Live data" badge; the shell may render it in its TopBar instead. */
  show_source_badge?: boolean
  /** Canvas zoom: 'fit' scales the device frame down to the available width; a number is a fixed factor. */
  zoom?: CanvasZoom
  /** Device frame width preset. */
  device?: CanvasDevice
  /** Hover preview (e.g. a preset): rendered instead of the settings store, never written to it. */
  preview_settings?: SettingsData | null
  /** Applies a home section op as one undo step; without it the op goes straight to the store. */
  on_home_op?: (op: HomeSectionOp, label: string) => boolean
  /** Undoes the last step if it is still history step `step` (Undo of "Section deleted"). */
  on_undo_step?: (step: number) => boolean
  /** Id of the last history step, read right after `on_home_op` to tie an Undo to that step. */
  undo_step_id?: () => number | null
}

export type CanvasZoom = 'fit' | number
export type CanvasDevice = 'desktop' | 'tablet' | 'mobile'

export const MIN_CANVAS_ZOOM = 0.5
export const MAX_CANVAS_ZOOM = 1

/** Horizontal padding of CONTENT_CLASS (px-4 on both sides). */
const CONTENT_PADDING_X_PX = 32

/** Frame width: desktop grows so the widest content width still fits beside its padding; tablet/mobile stay fixed. */
export function resolve_device_width(device: CanvasDevice, content_width_px: unknown): number {
  if (device !== 'desktop') return DEVICE_WIDTHS[device] ?? DEVICE_WIDTHS.desktop
  const content = clamp_style_token('contentWidthPx', content_width_px) ?? defaultSettings.contentWidthPx
  return Math.max(DEVICE_WIDTHS.desktop, content + CONTENT_PADDING_X_PX)
}

const clamp_zoom = (value: number) => Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, value))

const ZOOM_SUPPORTED = typeof CSS !== 'undefined' && CSS.supports('zoom', '0.5')

/** Zoom factor for the frame: fit = available width / device width, never upscaled. */
export function resolve_canvas_zoom(zoom: CanvasZoom, device_width: number, available_width: number): number {
  if (zoom === 'fit') {
    if (!(available_width > 0) || !(device_width > 0)) return 1
    return clamp_zoom(available_width / device_width)
  }
  return Number.isFinite(zoom) && zoom > 0 ? clamp_zoom(zoom) : 1
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

const ZONE_SLOTS: Readonly<Record<ZoneId, PageSlotPosition>> = { ...CONTAINER_SLOTS, main: 'main' }

const SORTABLE_PREFIX = 'page-el'
const SECTION_SORTABLE_PREFIX = 'page-sec'
const PLACED_SORTABLE_PREFIX = 'page-hs'

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

/** Sortable id of a home section placed in `container`; it sorts in the container's element group. */
export function placed_sortable_id(container: ContainerName, section_id: string): string {
  return `${PLACED_SORTABLE_PREFIX}:${container}:${section_id}`
}

function parse_placed_sortable_id(id: string): { container: ContainerName; section_id: string } | null {
  const [prefix, container, section_id] = id.split(':')
  if (prefix !== PLACED_SORTABLE_PREFIX || !container || !section_id || !is_container(container)) return null
  return { container, section_id }
}

function slot_orientation(slot: PageSlotPosition): DndOrientation {
  return slot === 'top' || slot === 'bottom' ? 'horizontal' : 'vertical'
}

const element_filter = (mode_ids: ReadonlySet<string>) => (element: ContainerElement) => is_rendered(element, mode_ids)

/**
 * Element counts towards `placement.index` like in SlotRenderer.astro: rendered in the blog mode and by
 * `slot_element_renders` with its instance settings (an empty or disabled community block does not count).
 */
export function placement_element_filter(
  current: SettingsData,
  mode_ids: ReadonlySet<string>,
  community: HiveCommunity | null
): ContainerElementFilter {
  const counted = new Set<string>()
  for (const name of CONTAINER_NAMES) {
    for (const element of current.pageLayoutConfig?.containers?.[name]?.elements ?? []) {
      if (!is_rendered(element, mode_ids)) continue
      const instance = resolve_instance_settings(current, CONTAINER_SECTION_IDS[name], element.id)
      if (slot_element_renders(element.id, community, false, instance)) counted.add(element.id)
    }
  }
  return (element) => is_rendered(element, mode_ids) && counted.has(element.id)
}

/**
 * Entries of `container` in canvas order: the SSR split (`split_home_containers` with `counts`) plus the elements only
 * the canvas shows (empty community blocks keep a selectable frame), each before the next element SSR renders.
 */
export function canvas_container_items(
  current: SettingsData,
  container: ContainerName,
  mode_ids: ReadonlySet<string>,
  counts: ContainerElementFilter
): HomeContainerItem[] {
  const shown = (current.pageLayoutConfig?.containers?.[container]?.elements ?? []).filter(element_filter(mode_ids))
  const items: HomeContainerItem[] = []
  let next = 0
  const flush = (end: number) => {
    for (; next < end; next++) items.push({ kind: 'element', element: shown[next] })
  }
  for (const item of split_home_containers(current, { is_element_rendered: counts }).containers[container]) {
    if (item.kind === 'element') {
      const at = shown.findIndex((element, position) => position >= next && element.id === item.element.id)
      if (at !== -1) {
        flush(at)
        next = at + 1
      }
    }
    items.push(item)
  }
  flush(shown.length)
  return items
}

const counts_any_element = () => true

/** Elements accepted by `counts` before position `index` of `items`, the dragged entry taken out first. */
function elements_before(
  items: readonly HomeContainerItem[],
  is_dragged: (item: HomeContainerItem) => boolean,
  index: number,
  counts: ContainerElementFilter = counts_any_element
): number {
  return items
    .filter((item) => !is_dragged(item))
    .slice(0, Math.max(index, 0))
    .filter((item) => item.kind === 'element' && counts(item.element)).length
}

/** Containers holding home sections keep their sidebar shown when their last element leaves (`template_after_move`). */
function containers_with_sections(current: SettingsData): ReadonlySet<ContainerName> {
  return home_section_containers(current, { include_hidden: true })
}

/** Drop of an element among the entries of a container: its index counts elements only (placed sections skipped). */
function element_drop_event(
  event: DndMoveEvent,
  current: SettingsData,
  mode_ids: ReadonlySet<string>,
  community: HiveCommunity | null
): DndMoveEvent {
  const parsed = parse_sortable_id(event.id)
  const to = event.target.container_id
  if (!parsed || !is_container(to)) return event
  const counts = placement_element_filter(current, mode_ids, community)
  const index = elements_before(
    canvas_container_items(current, to, mode_ids, counts),
    (item) => item.kind === 'element' && item.element.id === parsed.element_id,
    event.target.index
  )
  return { ...event, target: { ...event.target, index } }
}

/**
 * Placement op of a placed home section dropped among the entries of a container (same or another one); a section
 * next to the drop point in the same slot is the tie-break anchor, so two sections with one index swap too.
 */
export function placed_move_op(
  event: DndMoveEvent,
  mode_ids: ReadonlySet<string>,
  community: HiveCommunity | null = null
): HomeSectionOp {
  return (current) => {
    const parsed = parse_placed_sortable_id(event.id)
    const to = event.target.container_id
    if (!parsed || !is_container(to)) return null
    const counts = placement_element_filter(current, mode_ids, community)
    const is_dragged = (item: HomeContainerItem) => item.kind === 'section' && item.section.id === parsed.section_id
    const items = canvas_container_items(current, to, mode_ids, counts)
    const rest = items.filter((item) => !is_dragged(item))
    const at = Math.min(Math.max(event.target.index, 0), rest.length)
    const index = elements_before(items, is_dragged, at, counts)
    const next = rest[at]
    const previous = rest[at - 1]
    const before = next?.kind === 'section' ? next.section.id : undefined
    const after = before === undefined && previous?.kind === 'section' ? previous.section.id : undefined
    return move_section_placement(current, parsed.section_id, { container: to, index, before, after })
  }
}

/** Trash of a placed section; a sidebar left with neither rendered elements nor sections is hidden, like after an element trash. */
export function remove_placed_section_op(id: string, mode_ids: ReadonlySet<string>): HomeSectionOp {
  return (current) => {
    const section = home_sections_of(current).find((entry) => entry.id === id)
    const patch = remove_home_section(current, id)
    const config = current.pageLayoutConfig
    if (!section || !patch || !config?.containers) return patch
    const container = resolve_section_container(section, current)
    if (container === 'main') return patch
    const elements = config.containers[container]?.elements ?? []
    const left = home_section_containers({ ...current, ...patch }, { include_hidden: true })
    if (elements.some(element_filter(mode_ids)) || left.has(container)) return patch
    const template = template_hiding(config.template, container)
    if (template === config.template) return patch
    // JSON round-trip instead of structuredClone: Solid store proxies are not structured-cloneable.
    const copy = JSON.parse(JSON.stringify(config)) as SettingsData['pageLayoutConfig']
    return { ...patch, pageLayoutConfig: { ...copy, template } }
  }
}

/** Drag wiring of an element in a container slot; its group is the container id the drop handlers read. */
export function canvas_element_dnd(
  container: ContainerName,
  element_id: string,
  orientation: Accessor<DndOrientation>
): EditableElementDnd {
  return { sortable_id: sortable_id(container, element_id), container_id: () => container, orientation }
}

/** Drag wiring of a slot section; its group is its own id, never the slot's element group. */
export function canvas_section_dnd(container: ContainerName): EditableSectionDnd {
  // Sharing the elements' group, dnd-kit reindexed the section with them and an element dropped first kept its index.
  return { sortable_id: section_sortable_id(container), container_id: () => section_sortable_id(container) }
}

/** Slot of a sortable group: element groups are slot ids, a section group is its sortable id. */
function zone_of_group(group: string): string {
  return parse_section_sortable_id(group) ?? group
}

function parse_section_sortable_id(id: string): ContainerName | null {
  const [prefix, container] = id.split(':')
  if (prefix !== SECTION_SORTABLE_PREFIX || !container || !is_container(container)) return null
  return container
}

function is_container(zone: string): zone is ContainerName {
  return zone in CONTAINER_SECTION_IDS
}

/** Full-array index for a drop at `visible_index` among rendered elements; inactive elements keep their neighbours. */
function to_full_index(elements: ContainerElement[], mode_ids: ReadonlySet<string>, visible_index: number): number {
  const rendered = elements.filter((element) => is_rendered(element, mode_ids))
  const anchor = rendered[visible_index]
  if (anchor) return elements.indexOf(anchor)
  const last = rendered.at(-1)
  return last ? elements.indexOf(last) + 1 : elements.length
}

type RejectReason = (reason: string) => void

function slot_name(container: ContainerName): string {
  return slotLabels[ZONE_SLOTS[container]] ?? container
}

/** Layout op of an element drop; `reject` receives the reason when the move is refused. */
export function move_op(event: DndMoveEvent, mode_ids: ReadonlySet<string>, reject: RejectReason) {
  return (current: SettingsData): Partial<SettingsData> | null => {
    const parsed = parse_sortable_id(event.id)
    const to = event.target.container_id
    const config = current.pageLayoutConfig
    if (!parsed || !is_container(to) || !config?.containers) {
      reject('Elements can only be dropped on a slot.')
      return null
    }

    const from_elements = config.containers[parsed.container]?.elements ?? []
    const from_index = from_elements.findIndex((element) => element.id === parsed.element_id)
    if (from_index < 0) {
      reject('This element is no longer in its slot.')
      return null
    }
    if (
      parsed.container !== to &&
      (config.containers[to]?.elements ?? []).some((element) => element.id === parsed.element_id)
    ) {
      reject(`${slot_name(to)} already contains this element.`)
      return null
    }

    const target_elements = (config.containers[to]?.elements ?? []).filter(
      (element) => parsed.container !== to || element.id !== parsed.element_id
    )
    const to_index = to_full_index(target_elements, mode_ids, event.target.index)

    const next = move_element(
      { pageLayoutConfig: config, instanceOverrides: current.instanceOverrides ?? {} },
      { container: parsed.container, index: from_index },
      { container: to, index: to_index }
    )
    if (!next) {
      reject('Could not move the element.')
      return null
    }
    return {
      pageLayoutConfig: {
        ...next.pageLayoutConfig,
        template: template_after_move(
          next,
          parsed.container,
          to,
          element_filter(mode_ids),
          containers_with_sections(current)
        ),
      },
      instanceOverrides: next.instanceOverrides,
    }
  }
}

function move_section_op(event: DndMoveEvent, mode_ids: ReadonlySet<string>, reject: RejectReason) {
  return (current: SettingsData): Partial<SettingsData> | null => {
    const from = parse_section_sortable_id(event.id)
    const to = event.target.container_id
    const config = current.pageLayoutConfig
    if (!from || !is_container(to) || !config?.containers) {
      reject('Sections can only be dropped on a top, sidebar or bottom slot.')
      return null
    }
    if (from === to) {
      reject('The section is already in this slot.')
      return null
    }

    // The drop target is the whole slot: sections swap places (a plain move into an empty slot), so no index.
    const next = move_section(
      { pageLayoutConfig: config, instanceOverrides: current.instanceOverrides ?? {} },
      from,
      to
    )
    if (!next) {
      reject('Could not move the section.')
      return null
    }
    return {
      pageLayoutConfig: {
        ...next.pageLayoutConfig,
        template: template_after_move(next, from, to, element_filter(mode_ids), containers_with_sections(current)),
      },
      instanceOverrides: next.instanceOverrides,
    }
  }
}

/** History labels of the element controls (one undo step each). */
export const ELEMENT_OP_LABELS = Object.freeze({
  add: 'Added component',
  remove: 'Removed component',
  show: 'Showed block',
})

/** Add op of the '+' menu; the target sidebar is shown, like a drop into a hidden one. */
export function add_to_container_op(container: ContainerName, element_id: string, is_community: boolean): ElementOp {
  const add = add_element_op(container, element_id, is_community)
  return (current) => {
    const patch = add(current)
    const config = patch?.pageLayoutConfig
    if (!patch || !config) return patch
    return { ...patch, pageLayoutConfig: { ...config, template: template_showing(config.template, container) } }
  }
}

/** Trash op; a sidebar left without rendered elements is hidden, like after a drag out of it. */
export function remove_from_container_op(
  container: ContainerName,
  element_id: string,
  mode_ids: ReadonlySet<string>
): ElementOp {
  const remove = remove_element_op(container, element_id)
  return (current) => {
    const patch = remove(current)
    const config = patch?.pageLayoutConfig
    if (!patch || !config) return patch
    if ((config.containers[container]?.elements ?? []).some(element_filter(mode_ids))) return patch
    if (containers_with_sections(current).has(container)) return patch
    return { ...patch, pageLayoutConfig: { ...config, template: template_hiding(config.template, container) } }
  }
}

/** Live blog canvas of the admin editor: shared Solid renderers, per-instance settings and slot drop zones. */
export function EditorCanvas(props: EditorCanvasProps) {
  const canvas = props.canvas_data ?? use_canvas_data()
  const [dragging, set_dragging] = createSignal(false)
  let dragged_home_section = false

  const commit_home_op = (op: HomeSectionOp, label: string): boolean =>
    props.on_home_op ? props.on_home_op(op, label) : apply_layout_op(op)
  const undo_step = (step: number): boolean => props.on_undo_step?.(step) ?? false
  const last_step = (): number | null => props.undo_step_id?.() ?? null

  const mode_ids = createMemo(() => page_element_ids(is_community_mode()))
  const view = (): SettingsData => props.preview_settings ?? settings
  const template = (): LayoutTemplate => view().pageLayoutConfig?.template ?? 'no-sidebar'
  const show_left = () => hasLeftSidebar(template()) || dragging()
  const show_right = () => hasRightSidebar(template()) || dragging()
  const sidebar_style = () => canvas_sidebar_style(view().sidebarWidthPx)

  const [available_width, set_available_width] = createSignal(0)
  let viewport_el: HTMLDivElement | undefined
  onMount(() => {
    if (!viewport_el || typeof ResizeObserver === 'undefined') return
    const viewport = viewport_el
    const observer = new ResizeObserver(() => set_available_width(viewport.clientWidth))
    observer.observe(viewport)
    set_available_width(viewport.clientWidth)
    onCleanup(() => observer.disconnect())
  })
  const device_width = () => resolve_device_width(props.device ?? 'desktop', view().contentWidthPx)
  const style_vars = createMemo((): Record<string, string> => build_style_token_vars(view()))
  const canvas_zoom = createMemo(() =>
    ZOOM_SUPPORTED ? resolve_canvas_zoom(props.zoom ?? 'fit', device_width(), available_width()) : 1
  )
  const frame = (children: JSX.Element) => (
    <CanvasFrame
      zoom={canvas_zoom()}
      width={device_width()}
      framed={(props.device ?? 'desktop') !== 'desktop'}
      style_vars={style_vars()}
    >
      {children}
    </CanvasFrame>
  )

  const is_mock = () => canvas.source === 'mock'
  const is_loading = () => props.loading === true || canvas.is_loading

  const preview_sort = () =>
    resolve_default_sort(view().community_default_sort, resolve_visible_sorts(view().community_visible_sorts))
  const main_posts_limit = () => resolve_main_posts_settings(view()).postsPerPage || 20

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
  // Same name resolver and community context as index.astro, which passes it to the Layout top bar.
  const site_name = () =>
    resolveSiteName(view(), { community_title: community_title(), community_about: community()?.about })
  // Community blogs keep owner links in the top bar; blog mode shows them next to its posts tabs.
  const topbar_nav = () => (is_community_mode() ? resolve_settings(MAIN_SECTION_ID, 'navigation') : undefined)
  const has_lead = () => home_lead_section_ids(view()).length > 0

  const has_data = (element_id: string, section_id: string) => {
    if (element_id === 'authorProfile') return !!hive_data()?.profile
    // A hidden or empty block renders nothing; the no-data frame keeps it selectable.
    if (element_id === 'communityProfile' || is_canvas_community_element(element_id)) {
      return community_element_has_data(element_id, community(), resolve_settings(section_id, element_id))
    }
    return true
  }

  const empty_label = (element_id: string, section_id: string) =>
    element_id === 'communityProfile' || is_canvas_community_element(element_id)
      ? community_element_empty_label(element_id, resolve_settings(section_id, element_id))
      : undefined

  const resolve_settings = (section_id: string, element_id: string) =>
    resolve_instance_settings(view(), section_id, element_id)

  // Public index.astro renders the community main slot with CommunityContent (sort tabs, pinned, pagination), not PostsSection.
  const CommunityMain = () => {
    const main_settings = createMemo(() => resolve_main_posts_settings(view()))
    const content = (static_posts: BridgePost[] | undefined) => (
      <CommunityContent
        community_name={view().hiveUsername}
        initial_sort={preview_sort()}
        posts_per_page={main_posts_limit()}
        settings={main_settings()}
        post_card_layout={view().postCardLayout}
        static_posts={static_posts}
      />
    )
    return (
      <Show when={is_mock()} fallback={content(undefined)}>
        {content((canvas.data?.community?.posts ?? []).slice(0, main_posts_limit()))}
      </Show>
    )
  }

  const slot_shell = (container: ContainerName, elements: string[]): PageLayoutSection => {
    const slot = ZONE_SLOTS[container]
    return { id: CONTAINER_SECTION_IDS[container], slot, orientation: slot_orientation(slot), elements, active: true }
  }

  const container_elements = (container: ContainerName): string[] =>
    (view().pageLayoutConfig?.containers?.[container]?.elements ?? [])
      .filter(element_filter(mode_ids()))
      .map((element) => element.id)

  const container_section = (container: ContainerName): PageLayoutSection | null => {
    const elements = container_elements(container)
    return elements.length === 0 ? null : slot_shell(container, elements)
  }

  const placement_counts = createMemo(() => placement_element_filter(view(), mode_ids(), community()))

  // A sidebar the template hides renders only while dragging: its stored elements show, its sections sit in main.
  const container_slot_items = (container: ContainerName): SectionSlotItem[] =>
    canvas_container_items(view(), container, mode_ids(), placement_counts()).map((item): SectionSlotItem =>
      item.kind === 'element' ? { kind: 'element', id: item.element.id } : { kind: 'section', section: item.section }
    )

  const main_section = createMemo((): PageLayoutSection => ({
    id: MAIN_SECTION_ID,
    slot: 'main',
    orientation: 'vertical',
    elements: MAIN_ELEMENT_IDS.filter((id) => mode_ids().has(id)),
    active: true,
  }))

  // Sections swap, so every slot takes them; their own slot too, which makes a drop back home a no-op.
  const can_accept = (zone: ContainerName) => (source_id: string) => {
    if (parse_section_sortable_id(source_id)) return true
    const placed = parse_placed_sortable_id(source_id)
    if (placed) {
      const section = home_sections_of(settings).find((entry) => entry.id === placed.section_id)
      return !!section && is_placement_allowed(section.type, zone)
    }
    const parsed = parse_sortable_id(source_id)
    if (!parsed || !is_container_element_allowed(parsed.element_id, is_community_mode())) return false
    if (parsed.container === zone) return true
    return !(settings.pageLayoutConfig?.containers?.[zone]?.elements ?? []).some(
      (element) => element.id === parsed.element_id
    )
  }

  // Home sections swap inside the main slot, so their drag does not reveal the hidden sidebars.
  const handle_drag_start = (id: string) => {
    clear_selection()
    dragged_home_section = parse_home_sortable_id(id) !== null
    if (!dragged_home_section) set_dragging(true)
  }

  const handle_home_drop = (event: DndMoveEvent) => {
    const op = home_swap_op(event.id, event.target.container_id)
    if (!op) {
      showToast('Drop it on another section to swap them.', 'warning')
      return
    }
    if (!commit_home_op(op, HOME_OP_LABELS.swap)) showToast('Could not swap the sections.', 'error')
  }

  const handle_drag_end = (event: DndMoveEvent) => {
    if (parse_home_sortable_id(event.id)) {
      dragged_home_section = false
      handle_home_drop(event)
      return
    }
    if (parse_placed_sortable_id(event.id)) {
      const moved = batch(() => {
        set_dragging(false)
        return commit_home_op(placed_move_op(event, mode_ids(), community()), HOME_OP_LABELS.move)
      })
      if (!moved) showToast('This section cannot be placed there.', 'error')
      return
    }
    const section = parse_section_sortable_id(event.id)
    if (section === event.target.container_id) {
      set_dragging(false)
      return
    }
    let reason = 'This move is not allowed.'
    const reject: RejectReason = (message) => {
      reason = message
    }
    const ids = mode_ids()
    const data = community()
    const op = section
      ? move_section_op(event, ids, reject)
      : (current: SettingsData) => move_op(element_drop_event(event, current, ids, data), ids, reject)(current)
    // One update: dropping the drag-only sidebars and applying the new template must not unmount the target zone in between.
    const applied = batch(() => {
      set_dragging(false)
      return apply_layout_op(op)
    })
    if (!applied) showToast(reason, 'error')
  }

  const handle_drag_cancel = (reason: DndCancelReason) => {
    set_dragging(false)
    const home = dragged_home_section
    dragged_home_section = false
    if (reason !== 'outside') return
    showToast(
      home ? 'Drop it on another section to swap them.' : 'Drop it on a highlighted slot to move it.',
      'warning'
    )
  }

  const element_label = (element_id: string) => pageElementLabels[element_id] ?? element_id

  const remove_from_slot = (container: ContainerName, section_id: string, element_id: string) => {
    const was_selected = is_selected(section_id, element_id)
    const label = element_label(element_id)
    if (!commit_home_op(remove_from_container_op(container, element_id, mode_ids()), ELEMENT_OP_LABELS.remove)) {
      showToast(`Could not remove ${label}.`, 'error')
      return
    }
    if (was_selected) clear_selection()
    const step = last_step()
    showToast(`${label} removed`, 'success', {
      duration_ms: DELETE_UNDO_MS,
      action:
        step === null
          ? undefined
          : {
              label: 'Undo',
              on_click: () => {
                if (!undo_step(step)) showToast('Undo is no longer available for this component.', 'error')
              },
            },
    })
  }

  const add_to_slot = (container: ContainerName, element_id: string) => {
    if (!commit_home_op(add_to_container_op(container, element_id, is_community_mode()), ELEMENT_OP_LABELS.add)) {
      showToast(`Could not add ${element_label(element_id)} to ${slot_name(container)}.`, 'error')
    }
  }

  const show_block = (element_id: string) => {
    if (!commit_home_op(show_block_op(element_id), ELEMENT_OP_LABELS.show)) {
      showToast(`Could not show ${element_label(element_id)}.`, 'error')
    }
  }

  // Only the global block flag has a one-click undo; an aggregate sidebar with every block off goes through its gear.
  const hidden_by_flag = (element_id: string) => {
    const flag = community_block_flag(element_id)
    return flag !== null && view()[flag] === false
  }

  const add_items = () => addable_elements(settings, is_community_mode())

  const add_menu_label = (slot: PageSlotPosition) => `Add component to ${slotLabels[slot] ?? slot} section`

  const add_section_items = (container: ContainerName) => addable_sections(settings, container)

  const add_section_to_slot = (container: ContainerName, type: AddableHomeSectionType) => {
    if (!commit_home_op((current) => add_section_to_container(current, container, type), HOME_OP_LABELS.add)) {
      showToast(`Could not add the section to ${slot_name(container)}.`, 'error')
    }
  }

  const remove_placed_section = (id: string) => {
    if (is_home_section_selected(id)) clear_selection()
    if (!commit_home_op(remove_placed_section_op(id, mode_ids()), HOME_OP_LABELS.delete)) {
      showToast('This section cannot be deleted.', 'error')
      return
    }
    const step = last_step()
    showToast('Section deleted', 'success', {
      duration_ms: DELETE_UNDO_MS,
      action:
        step === null
          ? undefined
          : {
              label: 'Undo',
              on_click: () => {
                if (!undo_step(step)) showToast('Undo is no longer available for this section.', 'error')
              },
            },
    })
  }

  const render_placed_section =
    (container: ContainerName) =>
    (context: SectionHomeContext): JSX.Element => {
      const id = context.section().id
      const slot = ZONE_SLOTS[container]
      return (
        <PlacedHomeSection
          section={context.section}
          view={view}
          slot={slot}
          dnd={{
            sortable_id: placed_sortable_id(container, id),
            container_id: () => container,
            index: context.index,
            orientation: () => slot_orientation(slot),
          }}
          on_remove={() => remove_placed_section(id)}
        />
      )
    }

  const SlotZone = (zone_props: { spec: SlotSpec; in_sidebar?: boolean }) => {
    const zone = zone_props.spec.zone
    const container = is_container(zone) ? zone : null
    const section = createMemo(() => (zone === 'main' ? main_section() : container_section(zone)))
    const slot_items = createMemo(() => (container ? container_slot_items(container) : undefined))
    const has_placed = () => (slot_items() ?? []).some((item) => item.kind === 'section')
    const count = () => slot_items()?.length ?? section()?.elements.length ?? 0

    const placed_renderer = container ? render_placed_section(container) : undefined

    const slot_renderer = (
      current: () => PageLayoutSection,
      render_element?: (context: SectionElementContext) => JSX.Element
    ) => (
      <PageSlotContext.Provider value={zone_props.spec.slot}>
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
          items={slot_items()}
          renderHomeSection={placed_renderer}
        />
      </PageSlotContext.Provider>
    )

    const render_element = (context: SectionElementContext): JSX.Element => (
      <EditableElement
        section_id={context.section.id}
        slot={zone_props.spec.slot}
        element_id={context.elementId}
        index={context.index}
        count={count}
        dnd={
          is_container(zone)
            ? canvas_element_dnd(zone, context.elementId, () => context.section.orientation)
            : undefined
        }
        is_mock={is_mock()}
        has_data={has_data(context.elementId, context.section.id)}
        empty_label={empty_label(context.elementId, context.section.id)}
        on_remove={container ? () => remove_from_slot(container, context.section.id, context.elementId) : undefined}
        on_show={hidden_by_flag(context.elementId) ? () => show_block(context.elementId) : undefined}
      >
        {zone === 'main' && is_community_mode() && context.elementId === 'posts' ? (
          <CommunityMain />
        ) : is_canvas_community_element(context.elementId) ? (
          <CanvasCommunityElement
            element_id={context.elementId}
            community={community()}
            settings={resolve_settings(context.section.id, context.elementId)}
          />
        ) : (
          context.content()
        )}
      </EditableElement>
    )

    const zone_content = () => (
      <DropZone
        id={zone}
        count={count()}
        accept={[PAGE_ELEMENT_DND_TYPE, PAGE_SECTION_DND_TYPE]}
        disabled={!is_container(zone)}
        can_accept={is_container(zone) ? can_accept(zone) : undefined}
        claim_types={[PAGE_SECTION_DND_TYPE]}
        ignore_types={[HOME_SECTION_DND_TYPE]}
        label={slotLabels[zone_props.spec.slot]}
      >
        {/* A container without rendered elements has no slot section to drag; its own '+' adds elements and sections. */}
        <Show when={container !== null && !section() ? container : null}>
          {(empty) => (
            <>
              <div class="flex justify-end px-1 pt-1">
                <AddElementMenu
                  items={add_items()}
                  label={add_menu_label(zone_props.spec.slot)}
                  on_add={(id) => add_to_slot(empty(), id)}
                  sections={add_section_items(empty())}
                  on_add_section={(type) => add_section_to_slot(empty(), type)}
                />
              </div>
              <Show when={has_placed()}>{slot_renderer(() => slot_shell(empty(), []))}</Show>
            </>
          )}
        </Show>
        <Show when={section()}>
          {(current) => (
            <EditableSection
              section_id={current().id}
              slot={zone_props.spec.slot}
              element_count={current().elements.length}
              dnd={container ? canvas_section_dnd(container) : undefined}
              add_items={container ? add_items() : undefined}
              on_add={container ? (id) => add_to_slot(container, id) : undefined}
              sections={container ? add_section_items(container) : undefined}
              on_add_section={container ? (type) => add_section_to_slot(container, type) : undefined}
            >
              {slot_renderer(current, render_element)}
            </EditableSection>
          )}
        </Show>
      </DropZone>
    )

    return (
      <div class={get_section_wrapper_class(zone_props.spec.slot)}>
        <p class="mb-1 text-xs text-text-muted page-md:hidden">{slotLabels[zone_props.spec.slot]}</p>
        <Show when={zone === 'main'} fallback={zone_content()}>
          <HomeSectionsStack
            view={view}
            posts={zone_content()}
            commit={commit_home_op}
            undo_step={undo_step}
            last_step={last_step}
            part="body"
          />
        </Show>
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

      <div ref={viewport_el}>
        <Show
          when={!is_loading()}
          fallback={frame(<CanvasSkeleton template={template()} sidebar_style={sidebar_style()} />)}
        >
          <DndRoot
            onDragStart={handle_drag_start}
            onDragEnd={handle_drag_end}
            onDragCancel={handle_drag_cancel}
            container_label={(id) => slotLabels[ZONE_SLOTS[zone_of_group(id) as ZoneId]] ?? id}
          >
            {frame(
              <>
                <SiteTopbar siteName={site_name()} nav={topbar_nav()} />
                <div class={CONTENT_CLASS}>
                  <SlotZone spec={SLOT_SPECS.top} />
                  {/* Mirrors the public main landmark (lead + grid); a div, since the /admin shell owns the page landmarks. */}
                  <div data-canvas-main="">
                    <Show when={has_lead()}>
                      <HomeSectionsStack
                        view={view}
                        posts={null}
                        commit={commit_home_op}
                        undo_step={undo_step}
                        last_step={last_step}
                        part="lead"
                      />
                    </Show>
                    {/* One persistent tree: showing the sidebars at drag start must not remount the main slot. */}
                    {/* Main first, like index.astro: narrow devices show the content before the sidebars. */}
                    <div class={show_left() || show_right() ? 'sidebar-layout editor-sidebar-layout' : undefined}>
                      <div class="main-content">
                        <SlotZone spec={SLOT_SPECS.main} />
                      </div>
                      <Show when={show_left()}>
                        <div class="sidebar-left" style={sidebar_style()}>
                          <SlotZone spec={SLOT_SPECS['sidebar-left']} in_sidebar />
                        </div>
                      </Show>
                      <Show when={show_right()}>
                        <div class="sidebar-right" style={sidebar_style()}>
                          <SlotZone spec={SLOT_SPECS['sidebar-right']} in_sidebar />
                        </div>
                      </Show>
                    </div>
                  </div>
                  <SlotZone spec={SLOT_SPECS.bottom} />
                </div>
              </>
            )}
          </DndRoot>
        </Show>
      </div>
    </div>
  )
}

/** Fixed-width device frame; the `page` container (no padding) drives page-* variants and the sidebar layout. */
function CanvasFrame(props: {
  zoom: number
  width: number
  framed: boolean
  style_vars: Record<string, string>
  children: JSX.Element
}) {
  // `zoom` (not transform) keeps dnd-kit and anchor geometry in client px; it must stay below DndRoot.
  return (
    <div style={{ zoom: props.zoom, '--canvas-zoom': String(props.zoom) }}>
      <div
        class={`page-container style-tokens mx-auto ${props.framed ? 'my-4 bg-bg shadow-md ring-1 ring-border' : ''}`}
        style={{ ...props.style_vars, width: `${props.width}px` }}
      >
        {props.children}
      </div>
    </div>
  )
}
