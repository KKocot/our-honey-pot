// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For, createUniqueId } from 'solid-js'
import { settings, updateSettings } from '../../store'
import type { CommunitySortOrder } from '../../../../lib/queries'
import { COMMUNITY_SORT_OPTIONS, is_community_sort, resolve_default_sort } from '../../../../lib/community-sort'
import { resolve_visible_sorts } from '../../../community/pagination'

const SORT_COPY: Partial<Record<CommunitySortOrder, { label: string; description: string }>> = {
  trending: { label: 'Trending', description: 'Recent engagement and votes' },
  hot: { label: 'Hot', description: 'Most activity right now' },
  created: { label: 'New', description: 'Most recently published' },
  payout: { label: 'Payouts', description: 'Highest pending payout' },
  muted: { label: 'Muted', description: 'Muted by moderators; may contain spam' },
}

const ALL_SORT_OPTIONS = COMMUNITY_SORT_OPTIONS.map((value) => ({
  value,
  label: SORT_COPY[value]?.label ?? value,
  description: SORT_COPY[value]?.description ?? '',
}))

// Unsupported values in saved configs are ignored on read.
function get_visible_sorts(): CommunitySortOrder[] {
  return resolve_visible_sorts(settings.community_visible_sorts)
}

function get_default_sort(): CommunitySortOrder {
  return resolve_default_sort(settings.community_default_sort, get_visible_sorts())
}

function toggle_sort_visibility(sort: CommunitySortOrder) {
  const current = get_visible_sorts()
  const is_visible = current.includes(sort)
  if (is_visible && current.length <= 1) return

  const next = is_visible ? current.filter((entry) => entry !== sort) : [...current, sort]
  updateSettings({ community_visible_sorts: next })

  if (is_visible && get_default_sort() === sort) {
    updateSettings({ community_default_sort: next[0] })
  }
}

export function CommunityDisplaySettings() {
  const id = createUniqueId()
  const tabs_id = `community-tabs-${id}`
  const default_id = `community-default-sort-${id}`
  const visible_sorts = () => get_visible_sorts()
  const visible_options = () => ALL_SORT_OPTIONS.filter((option) => visible_sorts().includes(option.value))

  return (
    <div class="flex flex-col gap-3">
      <fieldset aria-describedby={`${tabs_id}-hint`}>
        <legend id={tabs_id} class="mb-1 text-xs font-medium text-text">
          Visible sort tabs
        </legend>
        <p id={`${tabs_id}-hint`} class="mb-2 text-xs text-text-muted">
          At least one tab stays visible.
        </p>
        <div class="flex flex-col gap-1">
          <For each={ALL_SORT_OPTIONS}>
            {(option) => {
              const is_checked = () => visible_sorts().includes(option.value)
              const is_last = () => is_checked() && visible_sorts().length <= 1
              return (
                <label class="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-bg-secondary max-md:min-h-11">
                  <input
                    type="checkbox"
                    checked={is_checked()}
                    disabled={is_last()}
                    onChange={() => toggle_sort_visibility(option.value)}
                    class="mt-0.5 size-4 shrink-0 rounded border-border text-primary focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <span class="min-w-0">
                    <span class="block text-sm text-text">{option.label}</span>
                    <span class="block text-xs text-text-muted">{option.description}</span>
                  </span>
                </label>
              )
            }}
          </For>
        </div>
      </fieldset>

      <div>
        <label for={default_id} class="mb-1 block text-xs font-medium text-text">
          Default sort
        </label>
        <select
          id={default_id}
          value={get_default_sort()}
          onChange={(event) => {
            const value = event.currentTarget.value
            if (is_community_sort(value)) updateSettings({ community_default_sort: value })
          }}
          class="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary max-md:min-h-11"
        >
          <For each={visible_options()}>{(option) => <option value={option.value}>{option.label}</option>}</For>
        </select>
      </div>
    </div>
  )
}
