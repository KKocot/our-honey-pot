// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For, Show, createEffect, createSignal, createUniqueId, onCleanup } from 'solid-js'
import { Check, Plus, Trash2 } from 'lucide-solid'
import { settings, updateSettingsImmediate } from '../../store'
import type { SocialLink, SocialPlatform } from '../../types/index'
import { platformInfos, extract_username_from_url, is_valid_username } from '../../types/index'
import { createLocalInput } from '../../hooks'
import { get_domain_from_url, is_valid_url_for_favicon } from '../../../../shared/utils/url_helpers'
import { CustomLinkIcon, PlatformIcon } from './icons'

export { PlatformIcon }

const VALIDATION_ERRORS = {
  INVALID_URL: 'Invalid URL. It must start with http:// or https://',
  INVALID_USERNAME: 'Invalid username. No URLs, spaces or "..".',
} as const

const ALL_PLATFORMS = Object.keys(platformInfos) as SocialPlatform[]

const ICON_BUTTON =
  'inline-flex size-8 shrink-0 items-center justify-center rounded text-text-muted focus-visible:outline-2 focus-visible:outline-primary max-md:size-11'

/** Pasted profile URLs are reduced to the username; a leading @ is dropped. */
function auto_extract_username(input: string, platform: SocialPlatform): string {
  const trimmed = input.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('www.')) {
    return extract_username_from_url(trimmed, platform)
  }
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
}

/** Configs saved before link ids existed get a deterministic id, persisted on the next write. */
export function with_stable_ids(links: readonly SocialLink[]): SocialLink[] {
  return links.map((link, index) => (link.id ? link : { ...link, id: `legacy-${index}-${link.platform}` }))
}

/** The edited value replaces the deprecated url, which build_social_url would otherwise keep rendering. */
export function with_edited_username(link: SocialLink, username: string): SocialLink {
  const { url: _legacy_url, ...rest } = link
  return { ...rest, username }
}

interface EditRowProps {
  link: SocialLink
  on_update: (id: string, username: string) => boolean
  on_remove: (id: string) => void
  on_close: () => void
}

function EditRow(props: EditRowProps) {
  const id = createUniqueId()
  const input_id = `social-input-${id}`
  const error_id = `social-error-${id}`
  const info = () => platformInfos[props.link.platform]
  const is_custom = () => props.link.platform === 'custom'
  const prefix = () => (is_custom() ? undefined : info().baseUrl?.replace('https://', ''))
  const stored_value = () => props.link.username || props.link.url || ''
  const [value, set_value, commit] = createLocalInput(stored_value, (next) => props.on_update(props.link.id, next))
  const [error, set_error] = createSignal('')

  const validate = () => {
    const current = value()
    if (!current || current === stored_value() || is_valid_username(current, props.link.platform)) return
    set_error(is_custom() ? VALIDATION_ERRORS.INVALID_URL : VALIDATION_ERRORS.INVALID_USERNAME)
  }

  const confirm = () => {
    commit()
    props.on_close()
  }

  return (
    <div class="flex flex-col gap-1 rounded-lg border border-border bg-bg p-2">
      <label for={input_id} class="text-xs font-medium text-text">
        {info().name}
      </label>
      <div class="flex items-center gap-1">
        <div
          class="flex min-w-0 flex-1 items-center rounded-lg border bg-bg focus-within:ring-2 focus-within:ring-primary"
          classList={{ 'border-error': !!error(), 'border-border': !error() }}
        >
          <Show when={prefix()}>{(text) => <span class="shrink-0 pl-2 text-xs text-text-muted">{text()}</span>}</Show>
          <input
            id={input_id}
            type="text"
            placeholder={info().profilePlaceholder}
            value={value()}
            aria-invalid={error() !== ''}
            aria-describedby={error() ? error_id : undefined}
            onInput={(event) => {
              set_value(auto_extract_username(event.currentTarget.value, props.link.platform))
              set_error('')
            }}
            onBlur={validate}
            onKeyDown={(event) => {
              if (event.key === 'Enter') confirm()
            }}
            autofocus
            class="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-text focus:outline-none max-md:min-h-11"
          />
        </div>
        <button
          type="button"
          aria-label={`Confirm ${info().name}`}
          onClick={confirm}
          class={`${ICON_BUTTON} hover:bg-bg-secondary hover:text-text`}
        >
          <Check size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Remove ${info().name}`}
          onClick={() => {
            props.on_remove(props.link.id)
            props.on_close()
          }}
          class={`${ICON_BUTTON} hover:bg-error/10 hover:text-error`}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
      <Show when={error()}>
        <p id={error_id} role="alert" class="text-xs text-error">
          {error()}
        </p>
      </Show>
    </div>
  )
}

export function SocialLinksSettings() {
  const menu_id = `social-add-menu-${createUniqueId()}`
  const [editing_id, set_editing_id] = createSignal<string | null>(null)
  const [adding, set_adding] = createSignal(false)
  let dropdown_ref: HTMLDivElement | undefined

  const links_with_ids = () => with_stable_ids(settings.socialLinks || [])

  const update_link = (id: string, username: string): boolean => {
    const trimmed = username.trim()
    const link = links_with_ids().find((entry) => entry.id === id)
    if (!link) return false
    if (trimmed && !is_valid_username(trimmed, link.platform)) return false
    updateSettingsImmediate({
      socialLinks: links_with_ids().map((entry) => (entry.id === id ? with_edited_username(entry, trimmed) : entry)),
    })
    return true
  }

  const add_link = (platform: SocialPlatform) => {
    const id = crypto.randomUUID?.() ?? Date.now().toString()
    updateSettingsImmediate({ socialLinks: [...links_with_ids(), { id, platform, username: '' }] })
    set_adding(false)
    set_editing_id(id)
  }

  const remove_link = (id: string) => {
    updateSettingsImmediate({ socialLinks: links_with_ids().filter((entry) => entry.id !== id) })
  }

  createEffect(() => {
    if (!adding()) return
    const handle_pointer = (event: MouseEvent) => {
      if (dropdown_ref && !dropdown_ref.contains(event.target as Node)) set_adding(false)
    }
    const handle_key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      set_adding(false)
    }
    document.addEventListener('mousedown', handle_pointer)
    document.addEventListener('keydown', handle_key)
    onCleanup(() => {
      document.removeEventListener('mousedown', handle_pointer)
      document.removeEventListener('keydown', handle_key)
    })
  })

  return (
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-1.5">
        <For each={links_with_ids()}>
          {(link) => {
            const info = platformInfos[link.platform]
            const is_active = () => editing_id() === link.id
            const display_value = () => link.username || link.url || ''
            const has_value = () => display_value() !== ''
            const is_custom = link.platform === 'custom'
            const [favicon_ok, set_favicon_ok] = createSignal(true)

            createEffect(() => {
              display_value()
              set_favicon_ok(true)
            })

            const show_favicon = () => is_custom && is_valid_url_for_favicon(display_value()) && favicon_ok()

            return (
              <button
                type="button"
                aria-pressed={is_active()}
                aria-label={`${info.name}${has_value() ? `: ${display_value()}` : ' (empty)'}`}
                onClick={() => set_editing_id(is_active() ? null : link.id)}
                class="inline-flex size-9 items-center justify-center overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary max-md:size-11"
                classList={{
                  'ring-2 ring-primary ring-offset-1 ring-offset-bg-card': is_active(),
                  'opacity-50': !has_value() && !is_active(),
                  'hover:opacity-80': has_value(),
                }}
                style={{ background: show_favicon() ? 'transparent' : info.color }}
              >
                <Show when={is_custom} fallback={<PlatformIcon platform={link.platform} class="size-5 text-white" />}>
                  <Show when={show_favicon()} fallback={<CustomLinkIcon class="size-5 text-white" />}>
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(get_domain_from_url(display_value()))}&sz=64`}
                      alt=""
                      class="size-full rounded-lg"
                      onLoad={(event) => {
                        if (event.currentTarget.naturalWidth <= 2 || event.currentTarget.naturalHeight <= 2) {
                          set_favicon_ok(false)
                        }
                      }}
                      onError={() => set_favicon_ok(false)}
                    />
                  </Show>
                </Show>
              </button>
            )
          }}
        </For>

        <div class="relative" ref={dropdown_ref}>
          <button
            type="button"
            aria-label="Add social link"
            aria-expanded={adding()}
            aria-controls={menu_id}
            onClick={() => set_adding(!adding())}
            class="inline-flex size-9 items-center justify-center rounded-lg border border-dashed border-border text-text-muted hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-primary max-md:size-11"
          >
            <Plus size={16} aria-hidden="true" />
          </button>
          <Show when={adding()}>
            <div
              id={menu_id}
              class="absolute top-full right-0 z-50 mt-1 max-h-60 min-w-44 overflow-y-auto rounded-lg border border-border bg-bg-card p-1 shadow-lg"
            >
              <For each={ALL_PLATFORMS}>
                {(platform) => (
                  <button
                    type="button"
                    onClick={() => add_link(platform)}
                    class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-text hover:bg-bg-secondary focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
                  >
                    <span class="rounded p-1" style={{ background: platformInfos[platform].color }}>
                      <PlatformIcon platform={platform} class="size-3.5 text-white" />
                    </span>
                    {platformInfos[platform].name}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>

      <Show when={links_with_ids().length === 0 && !adding()}>
        <p class="text-xs text-text-muted">No links yet. Use + to add one.</p>
      </Show>

      <Show when={editing_id()}>
        {(id) => (
          <Show when={links_with_ids().find((entry) => entry.id === id())}>
            {(link) => (
              <EditRow
                link={link()}
                on_update={update_link}
                on_remove={remove_link}
                on_close={() => set_editing_id(null)}
              />
            )}
          </Show>
        )}
      </Show>
    </div>
  )
}
