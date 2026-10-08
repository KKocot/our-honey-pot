// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For, Index, Show, createEffect, createMemo, createSignal, createUniqueId, on, onCleanup } from 'solid-js'
import { ChevronDown, Dices, EllipsisVertical, Plus } from 'lucide-solid'
import {
  USER_PRESETS_LIMIT,
  USER_PRESET_NAME_MAX_LENGTH,
  apply_blog_preset,
  apply_user_preset,
  delete_user_preset,
  list_blog_presets,
  read_user_presets,
  rename_user_preset,
  resolve_theme_colors,
  restore_user_preset,
  save_user_preset,
  type BlogPreset,
  type PresetApplyResult,
  type PresetApplyScope,
  type PresetStorage,
  type UserPreset,
  type UserPresetError,
  type UserPresetResult,
  type UserPresetsReadError,
} from '../../../presets'
import { strip_irrelevant_fields, type FontId, type SettingsData } from '../../../types/settings'
import { adapt_layout_for_community, designPatterns } from '../../../types/templates'
import type { ThemeColors } from '../../../types/theme'
import { hasLeftSidebar, hasRightSidebar } from '../../../types/layout'
import { generate_palette, oklch_to_hex } from '../../../palette'
import { DESIGN_FORMAT, DESIGN_VERSION, design_file_name } from '../../../config-io'
import { FONT_STACKS } from '../../../../../lib/style-tokens'
import { Button, Popover, showToast } from '../../../../ui'

export interface PresetsTabProps {
  /** Plain snapshot of the live settings. */
  settings: () => SettingsData
  is_community: () => boolean
  /** Blog account; user presets are stored per account in this browser. */
  hive_username: () => string
  /** Commits `patch` as one editor history step labelled `label`. */
  on_apply: (patch: Partial<SettingsData>, label: string) => void
  /** Renders `patch` on the canvas without touching history or the store; null returns to the committed settings. */
  on_preview?: (patch: Partial<SettingsData> | null) => void
  /** Editor history undo; without it toasts carry no Undo action. */
  on_undo?: () => void
  /** Test seam; defaults to localStorage. */
  storage?: PresetStorage | null
}

const TOAST_DURATION_MS = 5000
const PREVIEW_DELAY_MS = 80

const FONT_NAMES: Readonly<Record<FontId, string>> = {
  system: 'System',
  inter: 'Inter',
  'source-serif': 'Source Serif 4',
  fraunces: 'Fraunces',
  'space-grotesk': 'Space Grotesk',
  'jetbrains-mono': 'JetBrains Mono',
  atkinson: 'Atkinson Hyperlegible',
}

const USER_PRESET_ERRORS: Readonly<Record<UserPresetError, string>> = {
  'invalid-name': `Use 1 to ${USER_PRESET_NAME_MAX_LENGTH} characters.`,
  limit: `You can keep up to ${USER_PRESETS_LIMIT} presets. Delete one to save a new one.`,
  'not-found': 'This preset no longer exists.',
  storage: 'This browser blocked saving presets.',
}

const USER_PRESETS_READ_ERRORS: Readonly<Record<UserPresetsReadError, string>> = {
  unavailable: 'Saved presets are unavailable: this browser blocks local storage.',
  corrupt: 'Some saved presets could not be read and are not shown.',
}

const SCOPE_TITLE: Readonly<Record<PresetApplyScope, (name: string) => string>> = {
  full: (name) => `Applied "${name}"`,
  layout: (name) => `Applied layout of "${name}"`,
  style: (name) => `Applied style of "${name}"`,
}

const MENU_ITEM_CLASS =
  'flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm text-text hover:bg-bg-secondary focus-visible:bg-bg-secondary focus-visible:outline-none md:min-h-9'
const CHIP_BUTTON_CLASS =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function colors_of(style: Partial<SettingsData>): ThemeColors {
  return style.customColors ?? resolve_theme_colors(style.siteTheme)
}

function font_pair(style: Partial<SettingsData>): string {
  const heading = FONT_NAMES[style.fontHeading ?? 'system']
  const body = FONT_NAMES[style.fontBody ?? 'system']
  return heading === body ? heading : `${heading} / ${body}`
}

function download_json(file_name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = file_name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Debounced hover/focus preview so sweeping across cards never flashes every preset on the canvas. */
function create_preview(send: (patch: Partial<SettingsData> | null) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let showing = false

  const schedule = (build: (() => Partial<SettingsData>) | null) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (build) {
        send(build())
        showing = true
      } else if (showing) {
        send(null)
        showing = false
      }
    }, PREVIEW_DELAY_MS)
  }

  const cancel = () => {
    clearTimeout(timer)
    if (!showing) return
    showing = false
    send(null)
  }

  onCleanup(cancel)
  return { show: (build: () => Partial<SettingsData>) => schedule(build), hide: () => schedule(null), cancel }
}

function Swatches(props: { colors: ThemeColors }) {
  return (
    <span class="flex shrink-0 gap-1" aria-hidden="true">
      <Index each={[props.colors.bg, props.colors.text, props.colors.primary, props.colors.accent]}>
        {(color) => <span class="size-3.5 rounded-full border border-border" style={{ background: color() }} />}
      </Index>
    </span>
  )
}

interface MiniLayoutProps {
  layout: Partial<SettingsData>
  style: Partial<SettingsData>
  colors: ThemeColors
}

/** Skeleton of the preset layout drawn from its palette and page config; stands in for a build-time render. */
function MiniLayout(props: MiniLayoutProps) {
  const containers = () => props.layout.pageLayoutConfig?.containers
  const template = () => props.layout.pageLayoutConfig?.template ?? 'no-sidebar'
  const top_ids = () => (containers()?.top.elements ?? []).filter((e) => e.active).map((e) => e.id)
  const has_footer = () => (containers()?.bottom.elements ?? []).some((e) => e.active && e.id === 'footer')
  const has_profile = () => top_ids().some((id) => id === 'authorProfile' || id === 'communityProfile')
  const posts_layout = () => props.layout.postsLayout ?? 'list'
  const columns = () => (posts_layout() === 'list' ? 1 : Math.min(Math.max(props.layout.gridColumns ?? 2, 1), 3))
  const show_thumb = () => props.layout.showThumbnail !== false
  const horizontal = () => posts_layout() === 'list' && props.layout.cardLayout !== 'vertical'
  const radius = () => `${Math.round((props.style.radiusPx ?? 8) / 4)}px`
  const card_count = () => (posts_layout() === 'list' ? 3 : columns() * 2)

  const card_style = (index: number) => ({
    background: props.colors.bgCard,
    'border-radius': radius(),
    border: props.style.cardBorder ? `1px solid ${props.colors.border}` : undefined,
    'grid-row': posts_layout() === 'masonry' && index % 2 === 0 ? 'span 2' : undefined,
  })

  const sidebar = () => (
    <div
      class="flex w-1/4 shrink-0 flex-col gap-0.5 p-0.5"
      style={{ background: props.colors.bgCard, 'border-radius': radius() }}
    >
      <span class="size-2 rounded-full" style={{ background: props.colors.primary }} />
      <span class="h-0.5 w-3/4 rounded-full" style={{ background: props.colors.textMuted }} />
      <span class="h-0.5 w-1/2 rounded-full" style={{ background: props.colors.textMuted }} />
    </div>
  )

  return (
    <div
      aria-hidden="true"
      class="flex aspect-[4/3] w-full flex-col gap-1 overflow-hidden rounded-md border border-border p-1.5"
      style={{ background: props.colors.bg }}
    >
      <Show when={top_ids().includes('header')}>
        <div class="flex h-2 shrink-0 items-center gap-1">
          <span class="h-1.5 w-1/4 rounded-full" style={{ background: props.colors.text }} />
          <span class="ml-auto h-1 w-1/6 rounded-full" style={{ background: props.colors.primary }} />
        </div>
      </Show>
      <Show when={has_profile()}>
        <div
          class="flex h-4 shrink-0 items-center gap-1 px-1"
          style={{ background: props.colors.bgSecondary, 'border-radius': radius() }}
        >
          <span class="size-2.5 rounded-full" style={{ background: props.colors.primary }} />
          <span class="h-0.5 w-1/3 rounded-full" style={{ background: props.colors.text }} />
        </div>
      </Show>
      <div class="flex min-h-0 flex-1 gap-1">
        <Show when={hasLeftSidebar(template())}>{sidebar()}</Show>
        <div
          class="grid min-w-0 flex-1 auto-rows-fr gap-1"
          style={{ 'grid-template-columns': `repeat(${columns()}, minmax(0, 1fr))` }}
        >
          <For each={Array.from({ length: card_count() }, (_, i) => i)}>
            {(index) => (
              <div
                class="flex min-h-0 gap-0.5 overflow-hidden p-0.5"
                classList={{ 'flex-col': !horizontal() }}
                style={card_style(index)}
              >
                <Show when={show_thumb()}>
                  <span
                    class="shrink-0"
                    classList={{ 'aspect-square h-full': horizontal(), 'min-h-1 flex-1': !horizontal() }}
                    style={{ background: props.colors.accent, opacity: 0.45, 'border-radius': radius() }}
                  />
                </Show>
                <span class="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                  <span class="h-0.5 w-4/5 rounded-full" style={{ background: props.colors.text }} />
                  <span class="h-0.5 w-1/2 rounded-full" style={{ background: props.colors.textMuted }} />
                </span>
              </div>
            )}
          </For>
        </div>
        <Show when={hasRightSidebar(template())}>{sidebar()}</Show>
      </div>
      <Show when={has_footer()}>
        <div class="h-1 shrink-0 rounded-full" style={{ background: props.colors.bgSecondary }} />
      </Show>
    </div>
  )
}

interface MenuAction {
  label: string
  run: () => void
  preview?: () => void
}

interface ActionMenuProps {
  label: string
  actions: MenuAction[]
  trigger_class: string
  trigger_label: string
  icon: 'chevron' | 'ellipsis'
}

function ActionMenu(props: ActionMenuProps) {
  const [open, set_open] = createSignal(false)
  const menu_id = `preset-menu-${createUniqueId()}`
  let trigger: HTMLButtonElement | undefined

  const run = (action: MenuAction) => {
    set_open(false)
    action.run()
  }

  const move_focus = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]'))
    const at = items.indexOf(document.activeElement as HTMLElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    items[(at + step + items.length) % items.length]?.focus()
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        class={props.trigger_class}
        aria-label={props.trigger_label}
        aria-haspopup="menu"
        aria-expanded={open()}
        aria-controls={open() ? menu_id : undefined}
        onClick={() => set_open((v) => !v)}
      >
        <Show when={props.icon === 'chevron'} fallback={<EllipsisVertical class="size-4" aria-hidden="true" />}>
          <ChevronDown class="size-4" aria-hidden="true" />
        </Show>
      </button>
      <Popover
        open={open()}
        anchor={trigger}
        onClose={() => set_open(false)}
        label={props.label}
        placement="bottom-end"
        class="md:w-56"
      >
        <div id={menu_id} role="menu" aria-label={props.label} class="flex flex-col p-1" onKeyDown={move_focus}>
          <For each={props.actions}>
            {(action) => (
              <button
                type="button"
                role="menuitem"
                class={MENU_ITEM_CLASS}
                onClick={() => run(action)}
                onMouseEnter={() => action.preview?.()}
                onFocus={() => action.preview?.()}
              >
                {action.label}
              </button>
            )}
          </For>
        </div>
      </Popover>
    </>
  )
}

interface PresetCardProps {
  preset: BlogPreset
  is_community: boolean
  on_apply: (scope: PresetApplyScope) => void
  on_preview: (scope: PresetApplyScope) => void
  on_preview_end: () => void
}

function PresetCard(props: PresetCardProps) {
  const colors = () => resolve_theme_colors(props.preset.style.siteTheme)
  const layout = createMemo(() =>
    props.is_community
      ? adapt_layout_for_community({ ...props.preset.layout, ...props.preset.community_layout })
      : props.preset.layout
  )
  const heading_font = () => FONT_STACKS[props.preset.style.fontHeading ?? 'system']

  const leave = (event: FocusEvent) => {
    const next = event.relatedTarget
    if (next instanceof Node && (event.currentTarget as HTMLElement).contains(next)) return
    props.on_preview_end()
  }

  const click_card = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest('button')) return
    props.on_apply('full')
  }

  return (
    <li
      class="group flex cursor-pointer flex-col gap-2 rounded-xl border border-border bg-bg-card p-2 transition-[border-color,box-shadow] duration-150 ease-out hover:border-primary hover:shadow-md focus-within:border-primary motion-reduce:transition-none"
      onMouseEnter={() => props.on_preview('full')}
      onMouseLeave={() => props.on_preview_end()}
      onFocusIn={() => props.on_preview('full')}
      onFocusOut={leave}
      onClick={click_card}
    >
      <MiniLayout layout={layout()} style={props.preset.style} colors={colors()} />
      <div class="flex min-w-0 items-start justify-between gap-2 px-0.5">
        <div class="min-w-0">
          <h4 class="truncate text-sm font-semibold text-text" style={{ 'font-family': heading_font() }}>
            {props.preset.name}
          </h4>
          <p class="line-clamp-2 text-xs text-text-muted">{props.preset.tagline}</p>
        </div>
        <Swatches colors={colors()} />
      </div>
      <div class="mt-auto flex">
        <Button
          type="button"
          size="sm"
          class="flex-1 rounded-r-none"
          aria-label={`Apply "${props.preset.name}"`}
          onClick={() => props.on_apply('full')}
        >
          Apply
        </Button>
        <ActionMenu
          label={`Apply options for "${props.preset.name}"`}
          trigger_label={`More ways to apply "${props.preset.name}"`}
          icon="chevron"
          trigger_class="inline-flex w-9 items-center justify-center rounded-r-lg border-l border-primary-text/30 bg-primary text-primary-text hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-bg"
          actions={[
            { label: 'Apply', run: () => props.on_apply('full'), preview: () => props.on_preview('full') },
            {
              label: 'Apply layout only',
              run: () => props.on_apply('layout'),
              preview: () => props.on_preview('layout'),
            },
            {
              label: 'Apply style only',
              run: () => props.on_apply('style'),
              preview: () => props.on_preview('style'),
            },
          ]}
        />
      </div>
    </li>
  )
}

interface UserPresetRowProps {
  preset: UserPreset
  on_apply: (scope: 'full' | 'style') => void
  on_rename: (name: string) => string | null
  on_export: () => void
  on_delete: () => void
}

function UserPresetRow(props: UserPresetRowProps) {
  const [renaming, set_renaming] = createSignal(false)
  const [error, set_error] = createSignal<string | null>(null)
  const error_id = `user-preset-error-${createUniqueId()}`
  let input: HTMLInputElement | undefined

  createEffect(
    on(renaming, (active) => {
      if (active) requestAnimationFrame(() => input?.select())
    })
  )

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    const message = props.on_rename(input?.value ?? '')
    set_error(message)
    if (!message) set_renaming(false)
  }

  const cancel = () => {
    set_error(null)
    set_renaming(false)
  }

  return (
    <li class="flex flex-col gap-1 rounded-lg border border-border bg-bg-card p-2">
      <Show
        when={renaming()}
        fallback={
          <div class="flex items-center gap-2">
            <Swatches colors={colors_of(props.preset.style)} />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-text">{props.preset.name}</p>
              <p class="truncate text-xs text-text-muted">{font_pair(props.preset.style)}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-label={`Apply "${props.preset.name}"`}
              onClick={() => props.on_apply('full')}
            >
              Apply
            </Button>
            <ActionMenu
              label={`Actions for "${props.preset.name}"`}
              trigger_label={`More actions for "${props.preset.name}"`}
              icon="ellipsis"
              trigger_class={CHIP_BUTTON_CLASS}
              actions={[
                { label: 'Apply', run: () => props.on_apply('full') },
                { label: 'Apply style only', run: () => props.on_apply('style') },
                { label: 'Rename', run: () => set_renaming(true) },
                { label: 'Export', run: props.on_export },
                { label: 'Delete', run: props.on_delete },
              ]}
            />
          </div>
        }
      >
        <form class="flex items-center gap-2" onSubmit={submit}>
          <input
            ref={input}
            type="text"
            value={props.preset.name}
            maxlength={USER_PRESET_NAME_MAX_LENGTH}
            aria-label="Preset name"
            aria-invalid={error() ? true : undefined}
            aria-describedby={error() ? error_id : undefined}
            class="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                cancel()
              }
            }}
          />
          <Button type="submit" size="sm">
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        </form>
        <Show when={error()}>
          <p id={error_id} role="alert" class="text-xs text-error">
            {error()}
          </p>
        </Show>
      </Show>
    </li>
  )
}

/** Templates tab: catalog presets, Surprise me and presets saved in this browser. Every apply is one history step. */
export function PresetsTab(props: PresetsTabProps) {
  const preview = create_preview((patch) => props.on_preview?.(patch))
  const presets = createMemo(() => list_blog_presets(props.is_community()))
  const [user_presets, set_user_presets] = createSignal<UserPreset[]>([])
  const [read_error, set_read_error] = createSignal<UserPresetsReadError | null>(null)
  const [saving, set_saving] = createSignal(false)
  const [save_error, set_save_error] = createSignal<string | null>(null)
  const save_error_id = `save-preset-error-${createUniqueId()}`
  const heading_id = `templates-heading-${createUniqueId()}`
  const mine_heading_id = `my-presets-heading-${createUniqueId()}`
  let name_input: HTMLInputElement | undefined

  createEffect(
    on(props.hive_username, (username) => {
      const read = read_user_presets(username, props.storage)
      set_user_presets(read.presets)
      set_read_error(read.error)
    })
  )

  createEffect(
    on(saving, (active) => {
      if (active) requestAnimationFrame(() => name_input?.focus())
    })
  )

  const toast = (message: string, undo?: () => void) => {
    const on_click = undo ?? props.on_undo
    showToast(message, 'success', {
      duration_ms: TOAST_DURATION_MS,
      action: on_click ? { label: 'Undo', on_click } : undefined,
    })
  }

  const commit = (result: PresetApplyResult, name: string, scope: PresetApplyScope) => {
    const had_custom_colors = scope !== 'layout' && props.settings().customColors != null
    preview.cancel()
    props.on_apply(result.patch, result.undo_label)
    const details = [SCOPE_TITLE[scope](name)]
    if (result.reset_overrides_count > 0) {
      details.push(`${plural(result.reset_overrides_count, 'element size override')} reset`)
    }
    if (had_custom_colors) details.push('custom colors replaced')
    toast(details.join(' · '))
  }

  const preview_preset = (preset: BlogPreset, scope: PresetApplyScope) =>
    preview.show(() => apply_blog_preset(preset, props.settings(), scope, props.is_community()).patch)

  const apply_preset = (preset: BlogPreset, scope: PresetApplyScope) =>
    commit(apply_blog_preset(preset, props.settings(), scope, props.is_community()), preset.name, scope)

  const surprise = () => {
    const pattern = designPatterns[Math.floor(Math.random() * designPatterns.length)]
    if (!pattern) return
    const is_community = props.is_community()
    const layout = structuredClone(pattern.settings)
    const accent = oklch_to_hex({ l: 0.62, c: 0.16, h: Math.random() * 360 })
    const patch = strip_irrelevant_fields(
      {
        ...(is_community ? adapt_layout_for_community(layout) : layout),
        scrollAnimationEnabled: (layout.scrollAnimationType ?? 'none') !== 'none',
        customColors: generate_palette({ accent, mode: Math.random() < 0.5 ? 'light' : 'dark' }),
      },
      is_community
    )
    preview.cancel()
    props.on_apply(patch, 'Surprise me')
    toast('Applied a random layout and palette')
  }

  const handle = (result: UserPresetResult): string | null => {
    if (!result.ok) return USER_PRESET_ERRORS[result.error]
    set_user_presets(result.presets)
    return null
  }

  const save_current = (event: SubmitEvent) => {
    event.preventDefault()
    const result = save_user_preset(props.hive_username(), name_input?.value ?? '', props.settings(), {
      storage: props.storage,
    })
    const message = handle(result)
    set_save_error(message)
    if (!result.ok) return
    set_saving(false)
    showToast(`Saved preset "${result.preset.name}"`, 'success', { duration_ms: TOAST_DURATION_MS })
  }

  const cancel_save = () => {
    set_save_error(null)
    set_saving(false)
  }

  const apply_mine = (preset: UserPreset, scope: 'full' | 'style') =>
    commit(apply_user_preset(preset, props.settings(), scope, props.is_community()), preset.name, scope)

  const export_mine = (preset: UserPreset) =>
    download_json(design_file_name(preset.name), {
      format: DESIGN_FORMAT,
      version: DESIGN_VERSION,
      scope: 'full',
      settings: { ...preset.layout, ...preset.style },
    })

  const delete_mine = (preset: UserPreset) => {
    const result = delete_user_preset(props.hive_username(), preset.id, props.storage)
    const message = handle(result)
    if (message || !result.ok) {
      showToast(message ?? 'Could not delete the preset.', 'error')
      return
    }
    toast(`Deleted preset "${preset.name}"`, () => {
      const restored = handle(restore_user_preset(props.hive_username(), result.preset, result.index, props.storage))
      if (restored) showToast(restored, 'error')
    })
  }

  const at_limit = () => user_presets().length >= USER_PRESETS_LIMIT

  return (
    <div class="@container flex flex-col gap-6">
      <section aria-labelledby={heading_id} class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <h3 id={heading_id} class="text-sm font-semibold text-text">
            Templates
          </h3>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            class="inline-flex items-center gap-1.5"
            onClick={surprise}
          >
            <Dices class="size-4" aria-hidden="true" />
            Surprise me
          </Button>
        </div>
        <p class="text-xs text-text-muted">
          Hover a template to preview it on the canvas. Applying replaces layout and style; undo restores both.
        </p>
        <ul class="grid grid-cols-1 gap-3 @xs:grid-cols-2">
          <For each={presets()}>
            {(preset) => (
              <PresetCard
                preset={preset}
                is_community={props.is_community()}
                on_apply={(scope) => apply_preset(preset, scope)}
                on_preview={(scope) => preview_preset(preset, scope)}
                on_preview_end={preview.hide}
              />
            )}
          </For>
        </ul>
      </section>

      <section aria-labelledby={mine_heading_id} class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <h3 id={mine_heading_id} class="text-sm font-semibold text-text">
            My presets
          </h3>
          <span class="text-xs tabular-nums text-text-muted">
            {user_presets().length}/{USER_PRESETS_LIMIT}
          </span>
        </div>

        <Show when={read_error()}>
          {(error) => (
            <p role="alert" class="text-xs text-error">
              {USER_PRESETS_READ_ERRORS[error()]}
            </p>
          )}
        </Show>

        <Show
          when={saving()}
          fallback={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              class="inline-flex items-center justify-center gap-1.5"
              disabled={at_limit()}
              onClick={() => set_saving(true)}
            >
              <Plus class="size-4" aria-hidden="true" />
              Save current as preset
            </Button>
          }
        >
          <form class="flex flex-col gap-1" onSubmit={save_current}>
            <div class="flex items-center gap-2">
              <input
                ref={name_input}
                type="text"
                maxlength={USER_PRESET_NAME_MAX_LENGTH}
                placeholder="Preset name"
                aria-label="Preset name"
                aria-invalid={save_error() ? true : undefined}
                aria-describedby={save_error() ? save_error_id : undefined}
                class="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    cancel_save()
                  }
                }}
              />
              <Button type="submit" size="sm">
                Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={cancel_save}>
                Cancel
              </Button>
            </div>
            <Show when={save_error()}>
              <p id={save_error_id} role="alert" class="text-xs text-error">
                {save_error()}
              </p>
            </Show>
          </form>
        </Show>

        <Show when={at_limit()}>
          <p class="text-xs text-text-muted">{USER_PRESET_ERRORS.limit}</p>
        </Show>

        <Show
          when={user_presets().length > 0}
          fallback={<p class="text-sm text-text-muted">Save your current design to reuse it later.</p>}
        >
          <ul class="flex flex-col gap-2">
            <For each={user_presets()}>
              {(preset) => (
                <UserPresetRow
                  preset={preset}
                  on_apply={(scope) => apply_mine(preset, scope)}
                  on_rename={(name) =>
                    handle(rename_user_preset(props.hive_username(), preset.id, name, props.storage))
                  }
                  on_export={() => export_mine(preset)}
                  on_delete={() => delete_mine(preset)}
                />
              )}
            </For>
          </ul>
          <p class="text-xs text-text-muted">Saved in this browser only. Use Export to move a preset elsewhere.</p>
        </Show>
      </section>
    </div>
  )
}
