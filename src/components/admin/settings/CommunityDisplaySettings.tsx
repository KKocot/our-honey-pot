// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For, Show, createUniqueId } from "solid-js";
import { settings, updateSettings } from "../store";
import type { CommunitySortOrder } from "../../../lib/queries";
import {
  COMMUNITY_SORT_OPTIONS,
  is_community_sort,
  resolve_default_sort,
} from "../../../lib/community-sort";
import { resolve_visible_sorts } from "../../community/pagination";

const SORT_COPY: Partial<
  Record<CommunitySortOrder, { label: string; description: string }>
> = {
  trending: {
    label: "Trending",
    description: "Posts sorted by recent engagement and votes",
  },
  hot: {
    label: "Hot",
    description: "Posts with the most activity right now",
  },
  created: {
    label: "New",
    description: "Most recently published posts",
  },
  payout: {
    label: "Payouts",
    description: "Posts with the highest pending payout",
  },
  muted: {
    label: "Muted",
    description: "Posts muted by community moderators; may contain spam",
  },
};

const ALL_SORT_OPTIONS = COMMUNITY_SORT_OPTIONS.map((value) => ({
  value,
  label: SORT_COPY[value]?.label ?? value,
  description: SORT_COPY[value]?.description ?? "",
}));

// Unsupported values in saved configs are ignored on read.
function get_visible_sorts(): CommunitySortOrder[] {
  return resolve_visible_sorts(settings.community_visible_sorts);
}

function get_default_sort(): CommunitySortOrder {
  return resolve_default_sort(
    settings.community_default_sort,
    get_visible_sorts(),
  );
}

function toggle_sort_visibility(sort: CommunitySortOrder) {
  const current = get_visible_sorts();
  const is_visible = current.includes(sort);

  if (is_visible && current.length <= 1) return;

  const next = is_visible
    ? current.filter((s) => s !== sort)
    : [...current, sort];

  updateSettings({ community_visible_sorts: next });

  if (is_visible && get_default_sort() === sort) {
    updateSettings({ community_default_sort: next[0] });
  }
}

export function CommunityDisplaySettings() {
  const current_sort = () => get_default_sort();
  const visible_sorts = () => get_visible_sorts();
  const default_sort_select_id = createUniqueId();
  const visible_options = () =>
    ALL_SORT_OPTIONS.filter((o) => visible_sorts().includes(o.value));

  return (
    <div class="space-y-5">
      <p class="text-sm text-text-muted">
        Configure which sort tabs are visible and the default sorting.
      </p>

      <div class="space-y-5">
        {/* Visible sort tabs */}
        <div>
          <h4 class="text-sm font-medium text-text mb-2">Visible Sort Tabs</h4>
          <p class="text-xs text-text-muted mb-3">
            Choose which sorting options are shown to visitors.
          </p>
          <div class="space-y-2">
            <For each={ALL_SORT_OPTIONS}>
              {(option) => {
                const is_checked = () => visible_sorts().includes(option.value);
                const is_only_one = () =>
                  is_checked() && visible_sorts().length <= 1;

                return (
                  <label class="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={is_checked()}
                      disabled={is_only_one()}
                      onChange={() => toggle_sort_visibility(option.value)}
                      class="mt-0.5 w-4 h-4 shrink-0 rounded border-border text-primary focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <span class="block">
                      <span class="text-sm font-medium text-text">
                        {option.label}
                      </span>
                      <span class="block text-xs text-text-muted">
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              }}
            </For>
          </div>
        </div>

        {/* Default sort order */}
        <div class="border-t border-border pt-4">
          <label
            for={default_sort_select_id}
            class="block text-sm font-medium text-text mb-1"
          >
            Default Sort Order
          </label>
          <select
            id={default_sort_select_id}
            value={current_sort()}
            onChange={(e) => {
              const value = e.currentTarget.value;
              if (is_community_sort(value)) {
                updateSettings({ community_default_sort: value });
              }
            }}
            class="w-full px-4 py-2 bg-bg border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <For each={visible_options()}>
              {(option) => <option value={option.value}>{option.label}</option>}
            </For>
          </select>
          <p class="text-xs text-text-muted mt-1">
            The default sorting when visitors first open the community page.
          </p>
        </div>
      </div>

      <div class="bg-bg rounded-lg p-4 border border-border">
        <p class="text-xs text-text-muted uppercase tracking-wide mb-3">
          Preview
        </p>

        <div class="flex flex-wrap gap-2">
          <For each={visible_options()}>
            {(option) => (
              <button
                type="button"
                class={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  current_sort() === option.value
                    ? "bg-primary text-primary-text"
                    : "bg-bg-secondary text-text-muted"
                }`}
                onClick={() => {
                  updateSettings({
                    community_default_sort: option.value,
                  });
                }}
              >
                {option.label}
              </button>
            )}
          </For>
        </div>

        <Show when={visible_options().length === 0}>
          <p class="text-sm text-text-muted text-center py-2">
            No sort tabs selected.
          </p>
        </Show>
      </div>
    </div>
  );
}
