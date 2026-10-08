// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createUniqueId } from 'solid-js'
import { settings, updateSettings } from '../../store'
import { createLocalInput } from '../../hooks'

const FOOTER_TEXT_MAX_LENGTH = 500

const LABEL_CLASS = 'mb-1 block text-xs font-medium text-text'
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary max-md:min-h-11'

export function SiteSettings() {
  const id = createUniqueId()
  const name_id = `site-name-${id}`
  const description_id = `site-description-${id}`
  const footer_id = `site-footer-${id}`
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
    </div>
  )
}
