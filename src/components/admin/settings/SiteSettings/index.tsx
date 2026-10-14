// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createUniqueId, Show, type JSX } from 'solid-js'
import { unwrap } from 'solid-js/store'
import { settings, updateSettings, updateSettingsImmediate } from '../../store'
import { configSource } from '../../queries'
import { createLocalInput } from '../../hooks'
import { currentUser, isAuthenticated } from '../../../auth/auth-store'
import { ImageField, type ImageFieldProps } from '../../canvas/popovers/ImageField'
import { Segmented, type SegmentOption } from '../ThemeSettings/controls'
import {
  SEO_DESCRIPTION_MAX_CHARS,
  type BrandMode,
  type BrandSettings,
  type BrandSize,
  type SeoSettings,
  type SiteLocale,
  type TopbarSettings,
} from '../../types/settings'

const FOOTER_TEXT_MAX_LENGTH = 500
const FAVICON_ALT = 'Site icon'
/** The favicon is stored as a bare URL, so its ImageField has no alt input. */
export const FAVICON_FIELD = {
  hide_alt: true,
  recommended: { ratio: 1, ratio_label: '1:1', min_width: 48 },
} as const satisfies Pick<ImageFieldProps, 'hide_alt' | 'recommended'>
const COUNTER_WARN_RATIO = 0.9

const LABEL_CLASS = 'mb-1 block text-xs font-medium text-text'
const HINT_CLASS = 'text-xs text-text-muted'
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary max-md:min-h-11'

const BRAND_MODE_OPTIONS: ReadonlyArray<SegmentOption<BrandMode>> = [
  { value: 'text', label: 'Text' },
  { value: 'logo', label: 'Logo' },
  { value: 'logo+text', label: 'Logo + text' },
]

const BRAND_SIZE_OPTIONS: ReadonlyArray<SegmentOption<BrandSize>> = [
  { value: 'sm', label: 'Small', hint: '24 px' },
  { value: 'md', label: 'Medium', hint: '32 px' },
  { value: 'lg', label: 'Large', hint: '40 px' },
]

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

function current_brand(): BrandSettings {
  return settings.brand ?? { mode: 'text', size: 'md' }
}

function current_seo(): SeoSettings {
  return settings.seo ?? {}
}

function current_topbar(): TopbarSettings {
  return settings.topbar ?? { show_login: true, show_node_switcher: true }
}

const set_brand = (patch: Partial<BrandSettings>) =>
  updateSettingsImmediate({ brand: patch_group(unwrap(current_brand()), patch) })
const set_seo = (patch: Partial<SeoSettings>) =>
  updateSettingsImmediate({ seo: patch_group(unwrap(current_seo()), patch) })
const set_topbar = (patch: Partial<TopbarSettings>) =>
  updateSettingsImmediate({ topbar: patch_group(unwrap(current_topbar()), patch) })

function Subsection(props: { title: string; children: JSX.Element }) {
  const heading_id = `site-subsection-${createUniqueId()}`
  return (
    <section aria-labelledby={heading_id} class="flex flex-col gap-3 border-t border-border/60 pt-3">
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
  const id = createUniqueId()
  const name_id = `site-name-${id}`
  const description_id = `site-description-${id}`
  const footer_id = `site-footer-${id}`
  const seo_description_id = `site-seo-description-${id}`
  const seo_counter_id = `${seo_description_id}-counter`

  const can_upload = () =>
    can_write_config({
      username: isAuthenticated() ? (currentUser()?.username ?? null) : null,
      config_account: configSource().account,
      load_error: configSource().error,
    })

  const [site_name, set_site_name, commit_site_name] = createLocalInput(
    () => settings.siteName,
    (value) => updateSettings({ siteName: value })
  )
  const [site_description, set_site_description, commit_site_description] = createLocalInput(
    () => settings.siteDescription,
    (value) => updateSettings({ siteDescription: value })
  )
  const [footer_text, set_footer_text, commit_footer_text] = createLocalInput(
    () => settings.footer_text ?? '',
    (value) => updateSettings({ footer_text: value })
  )
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
      <div>
        <label for={name_id} class={LABEL_CLASS}>
          Site name
        </label>
        <input
          id={name_id}
          type="text"
          value={site_name()}
          placeholder="Hive Blog"
          onInput={(event) => set_site_name(event.currentTarget.value)}
          onBlur={commit_site_name}
          class={FIELD_CLASS}
        />
      </div>
      <div>
        <label for={description_id} class={LABEL_CLASS}>
          Description
        </label>
        <textarea
          id={description_id}
          rows={2}
          value={site_description()}
          placeholder="Posts from Hive blockchain"
          onInput={(event) => set_site_description(event.currentTarget.value)}
          onBlur={commit_site_description}
          class={`${FIELD_CLASS} resize-y`}
        />
      </div>
      <div>
        <label for={footer_id} class={LABEL_CLASS}>
          Footer text
        </label>
        <textarea
          id={footer_id}
          rows={2}
          maxLength={FOOTER_TEXT_MAX_LENGTH}
          value={footer_text()}
          placeholder="Shown in the page footer"
          onInput={(event) => set_footer_text(event.currentTarget.value)}
          onBlur={commit_footer_text}
          class={`${FIELD_CLASS} resize-y`}
        />
      </div>

      <Subsection title="Brand">
        <ImageField
          label="Logo"
          value={current_brand().logo}
          on_change={(next) => set_brand({ logo: next })}
          can_upload={can_upload()}
        />
        <Segmented
          label="Show in top bar"
          options={BRAND_MODE_OPTIONS}
          value={current_brand().mode}
          on_change={(mode) => set_brand({ mode })}
        />
        <Show when={brand_falls_back_to_text(current_brand())}>
          <p class="text-xs text-warning">Add a logo image. Until then the site name is shown as text.</p>
        </Show>
        <Segmented
          label="Logo size"
          options={BRAND_SIZE_OPTIONS}
          value={current_brand().size}
          on_change={(size) => set_brand({ size })}
          disabled={current_brand().mode === 'text'}
        />
      </Subsection>

      <Subsection title="SEO">
        <ImageField
          label="Social share image"
          value={current_seo().og_image}
          on_change={(next) => set_seo({ og_image: next })}
          can_upload={can_upload()}
          recommended={{ ratio: 1.91, ratio_label: '1.91:1', min_width: 1200 }}
        />
        <ImageField
          label="Favicon"
          value={favicon_value()}
          on_change={(next) => set_seo({ favicon: next?.url })}
          can_upload={can_upload()}
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
