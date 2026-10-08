// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import {
  For,
  Show,
  createEffect,
  createSignal,
  createUniqueId,
  on,
  onCleanup,
  onMount,
  type Accessor,
  type JSX,
} from 'solid-js'
import {
  ChevronDown,
  ChevronUp,
  FileText,
  LayoutTemplate,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Palette,
  PanelsTopLeft,
} from 'lucide-solid'
import type { EditorPanelTab, EditorState } from '../../editor-state'
import { LayoutTab } from './tabs/LayoutTab'
import { ContentTab } from './tabs/ContentTab'

export interface SidePanelProps {
  state: Pick<EditorState, 'panel_tab' | 'set_panel_tab' | 'mode'>
  /** Docked (>= 1024 px) or overlay (768-1023 px) panel expanded; collapsed shows an icon rail. Ignored on mobile. */
  open: boolean
  on_open_change: (open: boolean) => void
  templates: JSX.Element
  style: JSX.Element
  /** Defaults to the built-in LayoutTab / ContentTab. */
  layout?: JSX.Element
  content?: JSX.Element
}

type Viewport = 'mobile' | 'tablet' | 'desktop'
type SheetSize = 'peek' | 'half' | 'full'

const TABS: ReadonlyArray<{ value: EditorPanelTab; label: string; icon: typeof Palette }> = [
  { value: 'templates', label: 'Templates', icon: LayoutTemplate },
  { value: 'style', label: 'Style', icon: Palette },
  { value: 'layout', label: 'Layout', icon: PanelsTopLeft },
  { value: 'content', label: 'Content', icon: FileText },
]

const STORAGE_KEY = 'ohp-admin-side-panel'
const MOBILE_QUERY = '(max-width: 767.98px)'
const TABLET_QUERY = '(max-width: 1023.98px)'

const ICON_BUTTON =
  'inline-flex size-8 shrink-0 items-center justify-center rounded text-text-muted hover:bg-bg-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-primary max-md:size-11'

interface StoredPanelState {
  tab?: EditorPanelTab
  scroll?: Partial<Record<EditorPanelTab, number>>
}

function is_panel_tab(value: unknown): value is EditorPanelTab {
  return TABS.some((tab) => tab.value === value)
}

function read_stored(): StoredPanelState {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    const { tab, scroll } = parsed as Record<string, unknown>
    return {
      tab: is_panel_tab(tab) ? tab : undefined,
      scroll: scroll && typeof scroll === 'object' ? (scroll as StoredPanelState['scroll']) : undefined,
    }
  } catch {
    return {}
  }
}

function write_stored(value: StoredPanelState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // sessionStorage may be disabled or full; the panel works without it.
  }
}

function create_viewport(): Accessor<Viewport> {
  const mobile = window.matchMedia(MOBILE_QUERY)
  const tablet = window.matchMedia(TABLET_QUERY)
  const read = (): Viewport => (mobile.matches ? 'mobile' : tablet.matches ? 'tablet' : 'desktop')
  const [viewport, set_viewport] = createSignal<Viewport>(read())
  const update = () => set_viewport(read())
  mobile.addEventListener('change', update)
  tablet.addEventListener('change', update)
  onCleanup(() => {
    mobile.removeEventListener('change', update)
    tablet.removeEventListener('change', update)
  })
  return viewport
}

function is_typing_target(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Editor side panel: docked right on desktop, overlay on tablet, bottom sheet on mobile. Hidden in Moderation mode. */
export function SidePanel(props: SidePanelProps) {
  const base_id = createUniqueId()
  const title_id = `side-panel-title-${base_id}`
  const tab_id = (tab: EditorPanelTab) => `side-panel-tab-${base_id}-${tab}`
  const panel_id = (tab: EditorPanelTab) => `side-panel-panel-${base_id}-${tab}`
  const tab_refs: Partial<Record<EditorPanelTab, HTMLButtonElement>> = {}
  const panel_refs: Partial<Record<EditorPanelTab, HTMLDivElement>> = {}

  const viewport = create_viewport()
  const [sheet, set_sheet] = createSignal<SheetSize>('half')
  const [visited, set_visited] = createSignal<ReadonlySet<EditorPanelTab>>(new Set([props.state.panel_tab()]))
  const stored = read_stored()
  const scroll_positions: Partial<Record<EditorPanelTab, number>> = { ...stored.scroll }

  const active = () => props.state.panel_tab()
  const is_mobile = () => viewport() === 'mobile'
  const rail = () => !is_mobile() && !props.open
  const content_visible = () => (is_mobile() ? sheet() !== 'peek' : props.open)

  const persist = () => write_stored({ tab: active(), scroll: scroll_positions })

  onMount(() => {
    if (stored.tab && stored.tab !== active()) props.state.set_panel_tab(stored.tab)
  })

  createEffect(
    on(active, (tab) => {
      set_visited((current) => (current.has(tab) ? current : new Set([...current, tab])))
      persist()
      requestAnimationFrame(() => {
        const element = panel_refs[tab]
        if (element) element.scrollTop = scroll_positions[tab] ?? 0
      })
    })
  )

  let scroll_frame = 0
  const handle_scroll = (tab: EditorPanelTab, element: HTMLDivElement) => {
    if (element.hidden) return
    cancelAnimationFrame(scroll_frame)
    scroll_frame = requestAnimationFrame(() => {
      scroll_positions[tab] = element.scrollTop
      persist()
    })
  }
  onCleanup(() => cancelAnimationFrame(scroll_frame))

  const select_tab = (tab: EditorPanelTab) => {
    props.state.set_panel_tab(tab)
    if (is_mobile() && sheet() === 'peek') set_sheet('half')
    if (!is_mobile() && !props.open) props.on_open_change(true)
  }

  const handle_tab_keydown = (event: KeyboardEvent) => {
    const index = TABS.findIndex((tab) => tab.value === active())
    const next_index = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowDown: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      ArrowUp: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    }[event.key]
    if (next_index === undefined) return
    event.preventDefault()
    const next = TABS[next_index].value
    props.state.set_panel_tab(next)
    tab_refs[next]?.focus()
  }

  const collapse = () => {
    if (is_mobile()) set_sheet('peek')
    else props.on_open_change(false)
    requestAnimationFrame(() => tab_refs[active()]?.focus())
  }

  const handle_panel_keydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    if (viewport() === 'desktop' || !content_visible()) return
    event.preventDefault()
    collapse()
  }

  onMount(() => {
    const handle_shortcut = (event: KeyboardEvent) => {
      if (event.key !== '[' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (is_typing_target(event.target) || props.state.mode() !== 'design' || is_mobile()) return
      event.preventDefault()
      props.on_open_change(!props.open)
    }
    window.addEventListener('keydown', handle_shortcut)
    onCleanup(() => window.removeEventListener('keydown', handle_shortcut))
  })

  const render_tab = (tab: EditorPanelTab): JSX.Element => {
    switch (tab) {
      case 'templates':
        return props.templates
      case 'style':
        return props.style
      case 'layout':
        return props.layout ?? <LayoutTab />
      case 'content':
        return props.content ?? <ContentTab />
    }
  }

  const aside_class = () => {
    const base = 'flex flex-col bg-bg-card text-text'
    if (is_mobile()) {
      const height = { peek: 'h-14', half: 'h-[50dvh]', full: 'h-[calc(100dvh-3rem)]' }[sheet()]
      return `${base} fixed inset-x-0 bottom-0 z-40 rounded-t-xl border-t border-border shadow-xl ${height}`
    }
    const width = props.open ? 'w-[22.5rem]' : 'w-11'
    if (viewport() === 'tablet') {
      return `${base} fixed top-12 right-0 bottom-0 z-40 border-l border-border ${props.open ? 'shadow-xl' : ''} ${width}`
    }
    return `${base} h-full shrink-0 border-l border-border ${width}`
  }

  const tablist_class = () => {
    if (is_mobile()) return 'order-last grid h-14 shrink-0 grid-cols-4 border-t border-border'
    if (rail()) return 'flex flex-col gap-1 p-1.5'
    return 'flex shrink-0 border-b border-border'
  }

  const tab_class = (selected: boolean) => {
    const tone = selected ? 'text-text' : 'text-text-muted hover:text-text'
    const focus = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary'
    if (is_mobile())
      return `relative flex min-h-11 flex-col items-center justify-center gap-0.5 text-xs font-medium ${tone} ${focus}`
    if (rail()) {
      return `inline-flex size-8 items-center justify-center rounded ${selected ? 'bg-bg-secondary' : ''} ${tone} hover:bg-bg-secondary ${focus}`
    }
    return `relative flex-1 px-2 py-2.5 text-sm font-medium ${tone} ${focus}`
  }

  return (
    <Show when={props.state.mode() === 'design'}>
      <aside
        id="admin-side-panel"
        aria-labelledby={title_id}
        data-sheet={is_mobile() ? sheet() : undefined}
        onKeyDown={handle_panel_keydown}
        class={aside_class()}
      >
        <h2 id={title_id} class="sr-only">
          Design panel
        </h2>

        <Show when={is_mobile() && content_visible()}>
          <div class="flex h-11 shrink-0 items-center justify-between border-b border-border px-2">
            <button
              type="button"
              aria-label={sheet() === 'full' ? 'Shrink panel to half screen' : 'Expand panel to full screen'}
              aria-controls="admin-side-panel"
              onClick={() => set_sheet(sheet() === 'full' ? 'half' : 'full')}
              class={ICON_BUTTON}
            >
              <Show when={sheet() === 'full'} fallback={<ChevronUp size={18} aria-hidden="true" />}>
                <ChevronDown size={18} aria-hidden="true" />
              </Show>
            </button>
            <span aria-hidden="true" class="h-1 w-10 rounded-full bg-border" />
            <button type="button" aria-label="Minimize panel" onClick={collapse} class={ICON_BUTTON}>
              <Minus size={18} aria-hidden="true" />
            </button>
          </div>
        </Show>

        <Show when={!is_mobile()}>
          <div
            class={`flex shrink-0 items-center border-b border-border ${rail() ? 'h-12 justify-center' : 'h-12 justify-end px-2'}`}
          >
            <button
              type="button"
              aria-label={props.open ? 'Collapse panel ([)' : 'Expand panel ([)'}
              aria-expanded={props.open}
              aria-controls="admin-side-panel"
              aria-keyshortcuts="["
              onClick={() => (props.open ? collapse() : props.on_open_change(true))}
              class={ICON_BUTTON}
            >
              <Show when={props.open} fallback={<PanelRightOpen size={16} aria-hidden="true" />}>
                <PanelRightClose size={16} aria-hidden="true" />
              </Show>
            </button>
          </div>
        </Show>

        <div
          role="tablist"
          aria-label="Design panel sections"
          aria-orientation={rail() ? 'vertical' : 'horizontal'}
          class={tablist_class()}
        >
          <For each={TABS}>
            {(tab) => {
              const selected = () => active() === tab.value
              const Icon = tab.icon
              return (
                <button
                  type="button"
                  role="tab"
                  ref={(element) => (tab_refs[tab.value] = element)}
                  id={tab_id(tab.value)}
                  aria-selected={selected()}
                  aria-controls={panel_id(tab.value)}
                  aria-label={rail() ? tab.label : undefined}
                  title={rail() ? tab.label : undefined}
                  tabindex={selected() ? 0 : -1}
                  onClick={() => select_tab(tab.value)}
                  onKeyDown={handle_tab_keydown}
                  class={tab_class(selected())}
                >
                  <Show when={is_mobile() || rail()}>
                    <Icon size={18} aria-hidden="true" />
                  </Show>
                  <Show when={!rail()}>
                    <span>{tab.label}</span>
                  </Show>
                  <Show when={selected() && !rail()}>
                    <span
                      aria-hidden="true"
                      class={`absolute inset-x-0 h-0.5 bg-primary ${is_mobile() ? 'top-0' : 'bottom-0'}`}
                    />
                  </Show>
                </button>
              )
            }}
          </For>
        </div>

        <div class={`relative min-h-0 flex-1 ${content_visible() ? '' : 'hidden'}`}>
          <For each={TABS}>
            {(tab) => (
              <div
                role="tabpanel"
                ref={(element) => (panel_refs[tab.value] = element)}
                id={panel_id(tab.value)}
                aria-labelledby={tab_id(tab.value)}
                tabindex={0}
                hidden={active() !== tab.value}
                onScroll={(event) => handle_scroll(tab.value, event.currentTarget)}
                class="absolute inset-0 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              >
                <Show when={visited().has(tab.value)}>{render_tab(tab.value)}</Show>
              </div>
            )}
          </For>
        </div>
      </aside>
    </Show>
  )
}
