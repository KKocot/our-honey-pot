// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createUniqueId, type JSX } from 'solid-js'
import { unwrap } from 'solid-js/store'
import { settings, updateSettingsImmediate } from '../../store'
import { configSource } from '../../queries'
import { createLocalInput } from '../../hooks'
import { currentUser, isAuthenticated } from '../../../auth/auth-store'
import { ImageField, type ImageFieldProps } from '../../canvas/popovers/ImageField'
import { Segmented, type SegmentOption } from '../ThemeSettings/controls'
import {
  SEO_DESCRIPTION_MAX_CHARS,
  type BrandSettings,
  type SeoSettings,
  type SiteLocale,
  type TopbarSettings,
} from '../../types/settings'

const FAVICON_ALT = 'Site icon'
/** The favicon is stored as a bare URL, so its ImageField has no alt input. */
export const FAVICON_FIELD = {
  hide_alt: true,
  recommended: { ratio: 1, ratio_label: '1:1', min_width: 48 },
} as const satisfies Pick<ImageFieldProps, 'hide_alt' | 'recommended'>
const COUNTER_WARN_RATIO = 0.9

export const LABEL_CLASS = 'mb-1 block text-xs font-medium text-text'
const HINT_CLASS = 'text-xs text-text-muted'
export const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary max-md:min-h-11'

const LOCALE_OPTIONS: ReadonlyArray<SegmentOption<SiteLocale>> = [
  { value: 'en', label: 'English' },
  { value: 'pl', label: 'Polski' },
]

/** Same rule as the save gate: only the config account may write, and only when the stored config was read. */
export function can_write_config(input: {
  username: string | null
  config_account: string | null
  load_error: string | null
}): boolean {
  if (input.load_error || !input.config_account || !input.username) return false
  return input.username === input.config_account
}

/** Shallow patch of a settings group; `undefined` removes an optional key instead of storing it. */
export function patch_group<T extends object>(group: T, patch: Partial<T>): T {
  const next: Record<string, unknown> = { ...group, ...patch }
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) delete next[key]
  }
  return next as T
}

export function char_count(value: string): number {
  return Array.from(value).length
}

export function clamp_chars(value: string, max: number): string {
  const chars = Array.from(value)
  return chars.length > max ? chars.slice(0, max).join('') : value
}

export type CounterTone = 'normal' | 'warn' | 'limit'

/** Character counter colour: amber from 90% of the limit, red at or over it. */
export function counter_tone(count: number, max: number): CounterTone {
  if (count >= max) return 'limit'
  return count >= max * COUNTER_WARN_RATIO ? 'warn' : 'normal'
}

const COUNTER_TONE_CLASS: Record<CounterTone, string> = {
  normal: 'text-text-muted',
  warn: 'text-warning',
  limit: 'text-error',
}

/** `logo` / `logo+text` without an image renders as text (spec 1.1). */
export function brand_falls_back_to_text(brand: Pick<BrandSettings, 'mode' | 'logo'>): boolean {
  return brand.mode !== 'text' && !brand.logo?.url
}

/** Upload gate for image fields, bound to the signed-in user and the loaded config. */
export function can_upload_config(): boolean {
  return can_write_config({
    username: isAuthenticated() ? (currentUser()?.username ?? null) : null,
    config_account: configSource().account,
    load_error: configSource().error,
  })
}

function current_seo(): SeoSettings {
  return settings.seo ?? {}
}

function current_topbar(): TopbarSettings {
  return settings.topbar ?? { show_login: true, show_node_switcher: true }
}

const set_seo = (patch: Partial<SeoSettings>) =>
  updateSettingsImmediate({ seo: patch_group(unwrap(current_seo()), patch) })
const set_topbar = (patch: Partial<TopbarSettings>) =>
  updateSettingsImmediate({ topbar: patch_group(unwrap(current_topbar()), patch) })

export function Subsection(props: { title: string; children: JSX.Element }) {
  const heading_id = `site-subsection-${createUniqueId()}`
  return (
    <section
      aria-labelledby={heading_id}
      class="flex flex-col gap-3 border-t border-border/60 pt-3 first:border-t-0 first:pt-0"
    >
      <h4 id={heading_id} class="text-xs font-semibold text-text">
        {props.title}
      </h4>
      {props.children}
    </section>
  )
}

function Toggle(props: { label: string; hint: string; checked: boolean; on_change: (checked: boolean) => void }) {
  const id = `site-toggle-${createUniqueId()}`
  return (
    <div class="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={props.checked}
        aria-describedby={`${id}-hint`}
        onChange={(event) => props.on_change(event.currentTarget.checked)}
        class="mt-0.5 size-4 cursor-pointer rounded border-border text-primary focus:ring-primary"
      />
      <div class="flex flex-col">
        <label for={id} class="cursor-pointer text-sm text-text">
          {props.label}
        </label>
        <span id={`${id}-hint`} class={HINT_CLASS}>
          {props.hint}
        </span>
      </div>
    </div>
  )
}

export function SiteSettings() {
  const seo_description_id = `site-seo-description-${createUniqueId()}`
  const seo_counter_id = `${seo_description_id}-counter`

  const [seo_description, set_seo_description, commit_seo_description] = createLocalInput(
    () => current_seo().description ?? '',
    (value) => {
      const trimmed = clamp_chars(value.trim(), SEO_DESCRIPTION_MAX_CHARS)
      set_seo({ description: trimmed === '' ? undefined : trimmed })
    }
  )
  const seo_count = () => char_count(seo_description())

  const favicon_value = () => {
    const url = current_seo().favicon
    return url ? { url, alt: FAVICON_ALT } : undefined
  }

  return (
    <div class="flex flex-col gap-3">
      <Subsection title="SEO">
        <ImageField
          label="Social share image"
          value={current_seo().og_image}
          on_change={(next) => set_seo({ og_image: next })}
          can_upload={can_upload_config()}
          recommended={{ ratio: 1.91, ratio_label: '1.91:1', min_width: 1200 }}
        />
        <ImageField
          label="Favicon"
          value={favicon_value()}
          on_change={(next) => set_seo({ favicon: next?.url })}
          can_upload={can_upload_config()}
          hide_alt={FAVICON_FIELD.hide_alt}
          recommended={FAVICON_FIELD.recommended}
        />
        <div>
          <div class="flex items-baseline justify-between gap-2">
            <label for={seo_description_id} class={LABEL_CLASS}>
              Search description
            </label>
            <span
              id={seo_counter_id}
              class={`text-xs tabular-nums ${COUNTER_TONE_CLASS[counter_tone(seo_count(), SEO_DESCRIPTION_MAX_CHARS)]}`}
            >
              {seo_count()}/{SEO_DESCRIPTION_MAX_CHARS}
            </span>
          </div>
          <textarea
            id={seo_description_id}
            rows={3}
            value={seo_description()}
            placeholder={settings.siteDescription || 'Shown in search results'}
            aria-describedby={`${seo_counter_id} ${seo_description_id}-hint`}
            aria-invalid={seo_count() > SEO_DESCRIPTION_MAX_CHARS ? true : undefined}
            onInput={(event) => set_seo_description(event.currentTarget.value)}
            onBlur={commit_seo_description}
            class={`${FIELD_CLASS} resize-y`}
          />
          <p id={`${seo_description_id}-hint`} class={`mt-1 ${HINT_CLASS}`}>
            Shown in search results. Empty uses the site description; longer text is cut at {SEO_DESCRIPTION_MAX_CHARS}{' '}
            characters.
          </p>
        </div>
      </Subsection>

      <Subsection title="Language">
        <Segmented
          label="Blog language"
          options={LOCALE_OPTIONS}
          value={settings.locale ?? 'en'}
          on_change={(locale) => updateSettingsImmediate({ locale })}
        />
        <p class={HINT_CLASS}>Sets interface labels and date formats. Your own texts are not translated.</p>
      </Subsection>

      <Subsection title="Top bar">
        <Toggle
          label="Show Log in button"
          hint="When off, logging in is only possible at /admin."
          checked={current_topbar().show_login}
          on_change={(show_login) => set_topbar({ show_login })}
        />
        <Toggle
          label="Show node switcher"
          hint="Applies to the public site. The editor always shows it."
          checked={current_topbar().show_node_switcher}
          on_change={(show_node_switcher) => set_topbar({ show_node_switcher })}
        />
      </Subsection>
    </div>
  )
}
