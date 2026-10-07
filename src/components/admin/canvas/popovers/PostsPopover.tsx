// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, createUniqueId, For, Match, Show, Switch } from 'solid-js'
import { X } from 'lucide-solid'
import { Button } from '../../../ui'
import { clear_instance_override, settings, updateSettings } from '../../queries'
import { MAX_PINNED_POSTS, PINNED_POST_ENTRY_REGEX, type SettingsData } from '../../types/settings'
import { get_hive_username } from '../../../../lib/config'
import { parse_pinned_entry } from '../../../../lib/pinned-posts'
import { fetch_pinned_post } from '../../../../lib/queries'
import { CommentsControls } from './CommentsPopover'
import { PopoverShell, slot_label, type PopoverScope } from './PopoverShell'
import {
  GlobalGroup,
  PostCardControls,
  SizeSlider,
  element_label,
  has_instance_overrides,
  type ElementControlsProps,
  type ElementPopoverProps,
} from './PostCardPopover'

export type PostsPopoverTab = 'list' | 'card' | 'comments'

export interface PostsPopoverProps extends ElementPopoverProps {
  /** Tab shown on open; a click on a post card in the canvas opens "card". */
  initial_tab?: PostsPopoverTab
  /** Comments tab is offered only while the canvas shows the comments tab (default: true). */
  show_comments_tab?: boolean
}

const TABS: { value: PostsPopoverTab; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'card', label: 'Card' },
  { value: 'comments', label: 'Comments' },
]

const LAYOUT_OPTIONS: { value: SettingsData['postsLayout']; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'grid', label: 'Grid' },
  { value: 'masonry', label: 'Masonry' },
]

export function PostsPopover(props: PostsPopoverProps) {
  const [scope, set_scope] = createSignal<PopoverScope>('instance')
  const visible_tabs = () => TABS.filter((tab) => tab.value !== 'comments' || (props.show_comments_tab ?? true))
  const [active_tab, set_active_tab] = createSignal<PostsPopoverTab>(props.initial_tab ?? 'list')
  const current_tab = () =>
    visible_tabs().some((tab) => tab.value === active_tab()) ? active_tab() : visible_tabs()[0].value
  const tabs_id = createUniqueId()
  const tab_id = (tab: PostsPopoverTab) => `posts-tab-${tabs_id}-${tab}`
  const panel_id = `posts-panel-${tabs_id}`
  const tab_refs: Partial<Record<PostsPopoverTab, HTMLButtonElement>> = {}

  const handle_tab_keydown = (event: KeyboardEvent) => {
    const tabs = visible_tabs()
    const index = tabs.findIndex((tab) => tab.value === current_tab())
    const next_index = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[event.key]
    if (next_index === undefined) return
    event.preventDefault()
    const next = tabs[next_index].value
    set_active_tab(next)
    tab_refs[next]?.focus()
  }

  const controls = (): ElementControlsProps => ({
    section_id: props.section_id,
    element_id: props.element_id,
    scope: scope(),
  })

  return (
    <PopoverShell
      open
      anchor={props.anchor}
      onClose={props.on_close}
      element_label={element_label(props.element_id)}
      slot_label={slot_label(props.slot)}
      scope={scope()}
      onScopeChange={set_scope}
      onResetInstance={
        scope() === 'instance' ? () => clear_instance_override(props.section_id, props.element_id) : undefined
      }
      has_instance_overrides={has_instance_overrides(props.section_id, props.element_id)}
    >
      <div role="tablist" aria-label="Post list settings" class="-mt-1 flex border-b border-border">
        <For each={visible_tabs()}>
          {(tab) => (
            <button
              type="button"
              role="tab"
              ref={(element) => (tab_refs[tab.value] = element)}
              id={tab_id(tab.value)}
              aria-selected={current_tab() === tab.value}
              aria-controls={panel_id}
              tabindex={current_tab() === tab.value ? 0 : -1}
              onClick={() => set_active_tab(tab.value)}
              onKeyDown={handle_tab_keydown}
              class={`relative flex-1 px-2 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11 ${
                current_tab() === tab.value ? 'text-text' : 'text-text-muted hover:text-text'
              }`}
            >
              {tab.label}
              <Show when={current_tab() === tab.value}>
                <span aria-hidden="true" class="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
              </Show>
            </button>
          )}
        </For>
      </div>

      <div role="tabpanel" id={panel_id} aria-labelledby={tab_id(current_tab())} class="flex flex-col gap-4">
        <Switch>
          <Match when={current_tab() === 'list'}>
            <ListControls {...controls()} />
          </Match>
          <Match when={current_tab() === 'card'}>
            <PostCardControls {...controls()} />
          </Match>
          <Match when={current_tab() === 'comments'}>
            <CommentsControls {...controls()} />
          </Match>
        </Switch>
      </div>
    </PopoverShell>
  )
}

function ListControls(props: ElementControlsProps) {
  return (
    <>
      <SizeSlider {...props} setting="cardGapPx" label="Card gap" unit="px" />
      <Show when={settings.postsLayout === 'grid'}>
        <SizeSlider {...props} setting="gridColumns" label="Columns" />
      </Show>
      <SizeSlider {...props} setting="postsPerPage" label="Posts per page" />
      <GlobalGroup>
        <PostsLayoutSwitch />
        <PinnedPosts />
      </GlobalGroup>
    </>
  )
}

function PostsLayoutSwitch() {
  return (
    <div role="group" aria-label="List layout" class="flex rounded-lg bg-bg-secondary p-0.5 text-xs">
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

function PinnedPosts() {
  const [input, set_input] = createSignal('')
  const [error, set_error] = createSignal('')
  const [checking, set_checking] = createSignal(false)
  const error_id = `pinned-error-${createUniqueId()}`
  const pinned = () => settings.pinnedPostPermlinks ?? []

  const add = async () => {
    if (checking()) return
    const value = input().trim().replace(/^@/, '')
    set_error('')
    if (!value) return

    const ref = parse_pinned_entry(value)
    if (!ref || !PINNED_POST_ENTRY_REGEX.test(value)) {
      set_error('Invalid format. Enter a permlink or author/permlink (lowercase letters, digits, dots, _ and -).')
      return
    }
    if (pinned().includes(value)) {
      set_error('This post is already pinned.')
      return
    }

    const author = ref.author ?? get_hive_username()
    set_checking(true)
    try {
      const post = await fetch_pinned_post(author, ref.permlink)
      if (!post) {
        set_error(`Post @${author}/${ref.permlink} not found (or the node is unavailable).`)
        return
      }
    } finally {
      set_checking(false)
    }
    updateSettings({ pinnedPostPermlinks: [...pinned(), value] })
    set_input('')
  }

  return (
    <div class="flex flex-col gap-2">
      <h4 class="text-sm font-medium text-text">
        Pinned posts{' '}
        <span class="font-normal text-text-muted">
          ({pinned().length}/{MAX_PINNED_POSTS})
        </span>
      </h4>
      <Show when={pinned().length > 0}>
        <ul class="flex flex-col gap-1">
          <For each={pinned()}>
            {(permlink) => (
              <li class="flex items-center gap-1 rounded-md bg-bg-secondary py-0.5 pr-0.5 pl-2">
                <span class="min-w-0 flex-1 truncate font-mono text-xs text-text">{permlink}</span>
                <button
                  type="button"
                  aria-label={`Unpin ${permlink}`}
                  onClick={() =>
                    updateSettings({ pinnedPostPermlinks: pinned().filter((entry) => entry !== permlink) })
                  }
                  class="inline-flex size-8 shrink-0 items-center justify-center rounded text-text-muted hover:text-error focus-visible:outline-2 focus-visible:outline-primary max-md:size-11"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={pinned().length < MAX_PINNED_POSTS}>
        <form
          class="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void add()
          }}
        >
          <input
            type="text"
            placeholder="permlink or author/permlink"
            aria-label="Post to pin"
            aria-invalid={error() !== ''}
            aria-describedby={error() ? error_id : undefined}
            value={input()}
            onInput={(event) => {
              set_input(event.currentTarget.value)
              set_error('')
            }}
            class="min-w-0 flex-1 rounded-lg border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button type="submit" size="sm" disabled={checking()}>
            {checking() ? 'Checking…' : 'Pin'}
          </Button>
        </form>
      </Show>
      <Show when={error()}>
        <p id={error_id} role="alert" class="text-xs text-error">
          {error()}
        </p>
      </Show>
    </div>
  )
}
