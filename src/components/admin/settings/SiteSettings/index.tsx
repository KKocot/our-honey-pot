// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createUniqueId } from 'solid-js'
import { settings, updateSettings } from '../store'
import { createLocalInput } from '../hooks'

const FIELD_CLASS =
  'w-full px-4 py-2 bg-bg border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary'

export function SiteSettings() {
  const name_id = createUniqueId()
  const description_id = createUniqueId()
  const [localSiteName, setLocalSiteName, commitSiteName] = createLocalInput(
    () => settings.siteName,
    (val) => updateSettings({ siteName: val })
  )
  const [localSiteDescription, setLocalSiteDescription, commitSiteDescription] = createLocalInput(
    () => settings.siteDescription,
    (val) => updateSettings({ siteDescription: val })
  )

  return (
    <div class="space-y-4">
      <div>
        <label for={name_id} class="block text-sm font-medium text-text mb-1">
          Site Name
        </label>
        <input
          id={name_id}
          type="text"
          value={localSiteName()}
          placeholder="Hive Blog"
          onInput={(e) => setLocalSiteName(e.currentTarget.value)}
          onBlur={commitSiteName}
          class={FIELD_CLASS}
        />
      </div>

      <div>
        <label for={description_id} class="block text-sm font-medium text-text mb-1">
          Site Description
        </label>
        <textarea
          id={description_id}
          rows={2}
          class={`${FIELD_CLASS} resize-y`}
          value={localSiteDescription()}
          placeholder="Posts from Hive blockchain"
          onInput={(e) => setLocalSiteDescription(e.currentTarget.value)}
          onBlur={commitSiteDescription}
        />
      </div>
    </div>
  )
}
