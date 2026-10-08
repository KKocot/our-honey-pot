// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For, Show, createEffect, createMemo, createSignal, createUniqueId, on, onCleanup, onMount } from 'solid-js'
import { Check, Lock, LockOpen, Shuffle, TriangleAlert } from 'lucide-solid'
import {
  audit_contrast,
  contrast_ratio,
  fix_token,
  shuffle_palette,
  type ContrastPair,
  type Harmony,
  type PaletteMode,
  type ThemeToken,
} from '../../palette'
import { find_theme_preset, themePresets, type ThemeColors } from '../../types/theme'
import type { SettingsData } from '../../types/settings'
import { Disclosure, GROUP_LABEL, ICON_BUTTON, SUBHEADING, Segmented } from './controls'
import { current_theme_colors, parse_hex, type StyleChange } from './style-macros'

export const TOKEN_LABELS: Readonly<Record<ThemeToken, string>> = Object.freeze({
  bg: 'Background',
  bgSecondary: 'Secondary background',
  bgCard: 'Card',
  text: 'Text',
  textMuted: 'Muted text',
  primary: 'Primary',
  primaryHover: 'Primary hover',
  primaryText: 'Text on primary',
  accent: 'Accent',
  border: 'Border',
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
})

const TOKEN_GROUPS: ReadonlyArray<{ title: string; tokens: readonly ThemeToken[] }> = [
  { title: 'Surfaces', tokens: ['bg', 'bgSecondary', 'bgCard'] },
  { title: 'Text', tokens: ['text', 'textMuted'] },
  { title: 'Brand', tokens: ['primary', 'primaryHover', 'primaryText', 'accent'] },
  { title: 'Border', tokens: ['border'] },
  { title: 'Status', tokens: ['success', 'error', 'warning', 'info'] },
]

const HARMONY_LABELS: Readonly<Record<Harmony, string>> = Object.freeze({
  analogous: 'Analogous',
  complementary: 'Complementary',
  triadic: 'Triadic',
  'split-complementary': 'Split complementary',
})

const MODE_OPTIONS = [
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
]

const SWATCH = 'size-4 rounded border border-border/30'

function detect_mode(colors: ThemeColors): PaletteMode {
  return contrast_ratio(colors.bg, '#ffffff') > contrast_ratio(colors.bg, '#000000') ? 'dark' : 'light'
}

function new_seed(): number {
  return Math.floor(Math.random() * 0xffffffff)
}

function is_editable_target(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.closest('input, textarea, select, [contenteditable]') !== null
}

function prefers_reduced_motion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function ContrastBadge(props: { pair: ContrastPair }) {
  const failed = () => props.pair.status === 'fail'
  const label = () => (failed() ? 'Fails' : props.pair.status)
  return (
    <span
      class={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[0.6875rem] leading-none tabular-nums ${
        failed() ? 'border-error/60 text-error' : 'border-border text-text-muted'
      }`}
      aria-label={`${TOKEN_LABELS[props.pair.fg]} on ${TOKEN_LABELS[props.pair.bg]}: ${props.pair.ratio.toFixed(1)} to 1, ${label()}`}
    >
      <span aria-hidden="true">
        on {TOKEN_LABELS[props.pair.bg].toLowerCase()} · {props.pair.ratio.toFixed(1)}
      </span>
      <span aria-hidden="true" class="font-semibold">
        {label()}
      </span>
    </span>
  )
}

interface TokenRowProps {
  id: string
  token: ThemeToken
  value: string
  locked: boolean
  pairs: ContrastPair[]
  on_value: (hex: string) => void
  on_toggle_lock: () => void
  on_fix: () => void
}

function TokenRow(props: TokenRowProps) {
  const label = () => TOKEN_LABELS[props.token]
  const failing = () => props.pairs.some((pair) => pair.status === 'fail')
  const [invalid, set_invalid] = createSignal(false)

  const commit_text = (input: HTMLInputElement) => {
    const hex = parse_hex(input.value)
    if (!hex) {
      set_invalid(true)
      return
    }
    set_invalid(false)
    input.value = hex
    if (hex !== props.value.toLowerCase()) props.on_value(hex)
  }

  return (
    <li id={props.id} class="space-y-1 py-2" data-failing={failing() || undefined}>
      <div class="flex items-center gap-2">
        <input
          type="color"
          value={props.value}
          aria-label={`${label()} color`}
          onInput={(e) => props.on_value(e.currentTarget.value)}
          class="size-8 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
        />
        <span class="min-w-0 flex-1 truncate text-sm text-text">{label()}</span>
        <Show when={failing()}>
          <TriangleAlert size={16} class="shrink-0 text-error" aria-label="Fails AA contrast" role="img" />
        </Show>
        <input
          type="text"
          value={props.value}
          spellcheck={false}
          maxLength={7}
          aria-label={`${label()} hex value`}
          aria-invalid={invalid() || undefined}
          onChange={(e) => commit_text(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit_text(e.currentTarget)
          }}
          onBlur={(e) => {
            if (invalid()) {
              e.currentTarget.value = props.value
              set_invalid(false)
            }
          }}
          class="w-20 rounded-md border border-border bg-bg px-2 py-1 font-mono text-xs text-text focus:outline-none focus:ring-1 focus:ring-primary aria-invalid:border-error"
        />
        <button
          type="button"
          aria-pressed={props.locked}
          aria-label={`Lock ${label()}`}
          title={props.locked ? `${label()} is kept on shuffle` : `Keep ${label()} on shuffle`}
          onClick={() => props.on_toggle_lock()}
          class={`${ICON_BUTTON} aria-pressed:text-primary`}
        >
          <Show when={props.locked} fallback={<LockOpen size={16} aria-hidden="true" />}>
            <Lock size={16} aria-hidden="true" />
          </Show>
        </button>
      </div>
      <Show when={props.pairs.length > 0}>
        <div class="flex flex-wrap items-center gap-1 pl-10">
          <For each={props.pairs}>{(pair) => <ContrastBadge pair={pair} />}</For>
          <Show when={failing()}>
            <button
              type="button"
              data-fix
              onClick={() => props.on_fix()}
              class="rounded px-1.5 py-0.5 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            >
              Fix
            </button>
          </Show>
        </div>
      </Show>
    </li>
  )
}

interface PaletteSectionProps {
  settings: Pick<SettingsData, 'siteTheme' | 'customColors'>
  on_change: StyleChange
}

/** Accent generator, Shuffle (S), lockable 14-token editor with contrast badges and the classic palettes. */
export function PaletteSection(props: PaletteSectionProps) {
  const base_id = `palette-${createUniqueId()}`
  const colors = createMemo(() => current_theme_colors(props.settings))
  const audit = createMemo(() => audit_contrast(colors()))
  const issues = createMemo(() => audit().filter((pair) => pair.status === 'fail'))
  const base_preset = () => find_theme_preset(props.settings.siteTheme)
  const is_custom = () => props.settings.customColors != null

  const [locked, set_locked] = createSignal<ReadonlySet<ThemeToken>>(new Set())
  const [mode, set_mode] = createSignal<PaletteMode>(detect_mode(colors()))
  const [accent, set_accent] = createSignal(colors().primary)
  const [seed, set_seed] = createSignal(new_seed())
  const [harmony, set_harmony] = createSignal<Harmony | undefined>(undefined)
  let last_emitted = ''

  createEffect(
    on(colors, (next) => {
      if (JSON.stringify(next) === last_emitted) return
      set_accent(next.primary)
      set_mode(detect_mode(next))
    })
  )

  const emit = (next: ThemeColors, label: string) => {
    last_emitted = JSON.stringify(next)
    props.on_change({ customColors: next }, label)
  }

  const generate = (label: string, options: { harmony?: Harmony; seed: number }) => {
    const result = shuffle_palette(colors(), {
      mode: mode(),
      locked: locked(),
      accent: accent(),
      harmony: options.harmony,
      seed: options.seed,
    })
    set_harmony(result.harmony)
    emit(result.colors, label)
  }

  const shuffle = () => {
    const next_seed = new_seed()
    set_seed(next_seed)
    generate('Shuffled palette', { seed: next_seed })
  }

  let accent_frame = 0
  const set_accent_live = (value: string) => {
    const hex = parse_hex(value)
    if (!hex) return
    set_accent(hex)
    if (accent_frame) return
    accent_frame = requestAnimationFrame(() => {
      accent_frame = 0
      generate('Changed accent color', { harmony: harmony(), seed: seed() })
    })
  }

  const change_mode = (next: PaletteMode) => {
    if (next === mode()) return
    set_mode(next)
    generate(`Switched palette to ${next}`, { harmony: harmony(), seed: seed() })
  }

  const set_token = (token: ThemeToken, hex: string) => {
    const value = parse_hex(hex)
    if (!value) return
    emit({ ...colors(), [token]: value }, `Changed ${TOKEN_LABELS[token].toLowerCase()} color`)
  }

  const toggle_lock = (token: ThemeToken) => {
    const next = new Set(locked())
    if (next.has(token)) next.delete(token)
    else next.add(token)
    set_locked(next)
  }

  const fix = (token: ThemeToken) => {
    emit(fix_token(colors(), token), `Fixed ${TOKEN_LABELS[token].toLowerCase()} contrast`)
  }

  const row_id = (token: ThemeToken) => `${base_id}-${token}`

  const reveal_first_issue = () => {
    const first = issues()[0]
    if (!first) return
    const row = document.getElementById(row_id(first.fg))
    if (!row) return
    row.scrollIntoView({ block: 'center', behavior: prefers_reduced_motion() ? 'auto' : 'smooth' })
    row.querySelector<HTMLButtonElement>('[data-fix]')?.focus({ preventScroll: true })
  }

  onMount(() => {
    const on_key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key !== 's' || is_editable_target(event.target)) return
      event.preventDefault()
      shuffle()
    }
    document.addEventListener('keydown', on_key)
    onCleanup(() => {
      document.removeEventListener('keydown', on_key)
      if (accent_frame) cancelAnimationFrame(accent_frame)
    })
  })

  const select_classic = (id: string, name: string) =>
    props.on_change({ siteTheme: id, customColors: null }, `Applied "${name}" palette`)

  return (
    <div class="space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-text-muted">
          {is_custom() ? 'Custom palette' : `${base_preset()?.name ?? themePresets[0].name} palette`}
          <Show when={is_custom() && base_preset()}>
            {(preset) => (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={() => props.on_change({ customColors: null }, `Reset palette to "${preset().name}"`)}
                  class="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  Reset to {preset().name}
                </button>
              </>
            )}
          </Show>
        </p>
        <span aria-live="polite">
        <button
          type="button"
          onClick={reveal_first_issue}
          disabled={issues().length === 0}
          class={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default ${
            issues().length === 0 ? 'text-success' : 'text-error hover:underline'
          }`}
        >
          <Show when={issues().length > 0} fallback={<Check size={14} aria-hidden="true" />}>
            <TriangleAlert size={14} aria-hidden="true" />
          </Show>
          {issues().length === 0
            ? 'All text passes AA'
            : `${issues().length} contrast ${issues().length === 1 ? 'issue' : 'issues'}`}
        </button>
        </span>
      </div>

      <div class="space-y-3 rounded-lg border border-border bg-bg p-3">
        <div>
          <label for={`${base_id}-accent`} class={GROUP_LABEL}>
            Accent
          </label>
          <div class="flex items-center gap-2">
            <input
              id={`${base_id}-accent`}
              type="color"
              value={accent()}
              disabled={locked().has('primary')}
              onInput={(e) => set_accent_live(e.currentTarget.value)}
              class="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <input
              type="text"
              value={accent()}
              spellcheck={false}
              maxLength={7}
              aria-label="Accent hex value"
              disabled={locked().has('primary')}
              onChange={(e) => {
                if (parse_hex(e.currentTarget.value)) set_accent_live(e.currentTarget.value)
                else e.currentTarget.value = accent()
              }}
              class="w-24 rounded-md border border-border bg-bg-card px-2 py-1.5 font-mono text-xs text-text focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <button
              type="button"
              onClick={shuffle}
              aria-keyshortcuts="S"
              title="Shuffle palette (S)"
              class="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-bg-card px-3 text-sm font-medium text-text transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Shuffle size={16} aria-hidden="true" />
              Shuffle
            </button>
          </div>
          <Show when={locked().has('primary')}>
            <p class="mt-1 text-xs text-text-muted">Primary is locked, so Shuffle keeps it as the accent.</p>
          </Show>
        </div>
        <Segmented label="Mode" value={mode()} options={MODE_OPTIONS} on_change={change_mode} />
        <p class="text-xs text-text-muted" aria-live="polite">
          <Show when={harmony()} fallback="Pick an accent or press S to shuffle.">
            {(value) => `${HARMONY_LABELS[value()]} harmony`}
          </Show>
        </p>
      </div>

      <For each={TOKEN_GROUPS}>
        {(group) => (
          <section aria-label={`${group.title} colors`}>
            <h4 class={SUBHEADING}>{group.title}</h4>
            <ul class="divide-y divide-border/50">
              <For each={group.tokens}>
                {(token) => (
                  <TokenRow
                    id={row_id(token)}
                    token={token}
                    value={colors()[token]}
                    locked={locked().has(token)}
                    pairs={audit().filter((pair) => pair.fg === token)}
                    on_value={(hex) => set_token(token, hex)}
                    on_toggle_lock={() => toggle_lock(token)}
                    on_fix={() => fix(token)}
                  />
                )}
              </For>
            </ul>
          </section>
        )}
      </For>

      <Disclosure title="Classic palettes">
        <div class="grid grid-cols-2 gap-2">
          <For each={themePresets}>
            {(preset) => (
              <button
                type="button"
                aria-pressed={!is_custom() && props.settings.siteTheme === preset.id}
                onClick={() => select_classic(preset.id, preset.name)}
                class="rounded-lg border-2 border-border p-2 text-left transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary aria-pressed:border-primary"
              >
                <span class="mb-1.5 flex gap-1" aria-hidden="true">
                  <span class={SWATCH} style={{ background: preset.colors.bg }} />
                  <span class={SWATCH} style={{ background: preset.colors.primary }} />
                  <span class={SWATCH} style={{ background: preset.colors.accent }} />
                  <span class={SWATCH} style={{ background: preset.colors.text }} />
                </span>
                <span class="block truncate text-xs font-medium text-text">{preset.name}</span>
              </button>
            )}
          </For>
        </div>
      </Disclosure>
    </div>
  )
}
