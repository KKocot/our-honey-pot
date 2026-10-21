// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createUniqueId, Show } from 'solid-js'
import { unwrap } from 'solid-js/store'
import { settings, updateSettings, updateSettingsImmediate } from '../../store'
import { createLocalInput } from '../../hooks'
import { ImageField } from '../../canvas/popovers/ImageField'
import { changed_label, edited_label, use_field_edit } from '../../canvas/popovers/field-edit'
import { Segmented, type SegmentOption } from '../ThemeSettings/controls'
import type { BrandMode, BrandSettings, BrandSize } from '../../types/settings'
import { brand_falls_back_to_text, can_upload_config, FIELD_CLASS, LABEL_CLASS, patch_group, Subsection } from './index'

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

function current_brand(): BrandSettings {
  return settings.brand ?? { mode: 'text', size: 'md' }
}

const BRAND_FIELD_LABELS: Readonly<Record<keyof BrandSettings, string>> = {
  logo: 'logo',
  mode: 'top bar display',
  size: 'logo size',
}

/** Site name, description and brand: the header identity of the blog. */
export function SiteIdentitySettings() {
  const id = createUniqueId()
  const name_id = `site-name-${id}`
  const description_id = `site-description-${id}`
  const field_edit = use_field_edit()

  const set_brand = (patch: Partial<BrandSettings>) => {
    const field = (Object.keys(patch) as Array<keyof BrandSettings>).map((key) => BRAND_FIELD_LABELS[key]).join(' ')
    field_edit({ label: changed_label('brand', field) }, () =>
      updateSettingsImmediate({ brand: patch_group(unwrap(current_brand()), patch) })
    )
  }

  const [site_name, set_site_name, commit_site_name] = createLocalInput(
    () => settings.siteName,
    (value) =>
      field_edit({ key: 'site:name', label: edited_label('site', 'name') }, () => updateSettings({ siteName: value }))
  )
  const [site_description, set_site_description, commit_site_description] = createLocalInput(
    () => settings.siteDescription,
    (value) =>
      field_edit({ key: 'site:description', label: edited_label('site', 'description') }, () =>
        updateSettings({ siteDescription: value })
      )
  )

  return (
    <div class="flex min-w-0 flex-col gap-3">
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

      <Subsection title="Brand">
        <ImageField
          label="Logo"
          value={current_brand().logo}
          on_change={(next) => set_brand({ logo: next })}
          can_upload={can_upload_config()}
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
    </div>
  )
}
