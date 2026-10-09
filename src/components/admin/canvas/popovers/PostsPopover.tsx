// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, createUniqueId, For, onCleanup, onMount, Show } from 'solid-js'
import { X } from 'lucide-solid'
import { Button } from '../../../ui'
import { clear_instance_override, settings, updateSettings } from '../../queries'
import { MAX_PINNED_POSTS, PINNED_POST_ENTRY_REGEX, type SettingsData } from '../../types/settings'
import { get_hive_username } from '../../../../lib/config'
import { parse_pinned_entry } from '../../../../lib/pinned-posts'
import { fetch_pinned_post } from '../../../../lib/queries'
import { PopoverShell, slot_label, type CardStructure, type PopoverScope } from './PopoverShell'
import {
  BackToSection,
  EditLayoutButton,
  GlobalGroup,
  PostCardControls,
  SizeSlider,
  element_label,
  has_instance_overrides,
  type ElementControlsProps,
  type ElementPopoverProps,
} from './PostCardPopover'

export interface PostsPopoverProps extends ElementPopoverProps {
  /** A post card was clicked in the canvas: the card sizes are scrolled into view. */
  card_clicked?: boolean
  /** Canvas shows the comments view: card controls apply to the comment card. */
  comments_view?: boolean
  /** Opens the card structure in the side panel; the button is hidden without it. */
  on_edit_card_layout?: (card: CardStructure) => void
}

const LAYOUT_OPTIONS: { value: SettingsData['postsLayout']; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'grid', label: 'Grid' },
  { value: 'masonry', label: 'Masonry' },
]

export function PostsPopover(props: PostsPopoverProps) {
  const [scope, set_scope] = createSignal<PopoverScope>('instance')
  const card_heading_id = `posts-card-${createUniqueId()}`
  const comments = () => props.comments_view === true
  const card_noun = () => (comments() ? 'Comment card' : 'Post card')
  let card_heading: HTMLHeadingElement | undefined

  onMount(() => {
    if (!props.card_clicked) return
    // Scrolls only the popover panel; scrollIntoView would also scroll the canvas behind it.
    const frame = requestAnimationFrame(() => {
      const panel = card_heading?.closest<HTMLElement>('[popover]')
      if (!card_heading || !panel) return
      const offset = card_heading.getBoundingClientRect().top - panel.getBoundingClientRect().top
      if (offset < 0 || offset + card_heading.offsetHeight > panel.clientHeight) panel.scrollTop += offset
    })
    onCleanup(() => cancelAnimationFrame(frame))
  })

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
      back={<BackToSection slot={props.slot} />}
      scope={scope()}
      onScopeChange={set_scope}
      onResetInstance={
        scope() === 'instance' ? () => clear_instance_override(props.section_id, props.element_id) : undefined
      }
      has_instance_overrides={has_instance_overrides(props.section_id, props.element_id)}
    >
      <ListControls {...controls()} />
      <section aria-labelledby={card_heading_id} class="flex flex-col gap-4 border-t border-border pt-3">
        <h3 id={card_heading_id} ref={card_heading} class="text-xs font-semibold uppercase text-text-muted">
          {card_noun()}
        </h3>
        <Show when={comments()} fallback={<PostCardControls {...controls()} />}>
          <CommentCardControls {...controls()} />
        </Show>
        <Show when={props.on_edit_card_layout}>
          {(open_layout) => (
            <EditLayoutButton
              label={`Edit ${card_noun().toLowerCase()} structure`}
              onClick={() => open_layout()(comments() ? 'comment' : 'post')}
            />
          )}
        </Show>
      </section>
      <GlobalGroup>
        <PostsLayoutSwitch />
        <PinnedPosts />
      </GlobalGroup>
    </PopoverShell>
  )
}

function CommentCardControls(props: ElementControlsProps) {
  return (
    <>
      <SizeSlider {...props} setting="commentAvatarSizePx" label="Avatar size" unit="px" />
      <SizeSlider {...props} setting="commentPaddingPx" label="Comment padding" unit="px" />
      <SizeSlider {...props} setting="commentMaxLength" label="Comment length" unit="chars" step={50} />
    </>
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

/** Pinned posts list with the add form; shared by the posts popover and the Content tab. */
export function PinnedPosts(props: { show_title?: boolean }) {
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
      <Show
        when={props.show_title ?? true}
        fallback={
          <p class="text-xs text-text-muted">
            {pinned().length}/{MAX_PINNED_POSTS} pinned
          </p>
        }
      >
        <h4 class="text-sm font-medium text-text">
          Pinned posts{' '}
          <span class="font-normal text-text-muted">
            ({pinned().length}/{MAX_PINNED_POSTS})
          </span>
        </h4>
      </Show>
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
