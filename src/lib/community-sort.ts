// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { CommunitySortOrder } from "./queries";

/** Sorts the community feed supports; shared by SSR and the client so both validate identically. */
export const COMMUNITY_SORT_OPTIONS: readonly CommunitySortOrder[] = [
  "trending",
  "hot",
  "created",
  "payout",
  "muted",
];

export function is_community_sort(value: string): value is CommunitySortOrder {
  return (COMMUNITY_SORT_OPTIONS as readonly string[]).includes(value);
}

/** Requested sort if it is a visible tab, else the configured default if it is a visible tab, else the first visible tab. */
export function resolve_community_sort(
  requested: string | undefined,
  configured_default: string | undefined,
  visible_sorts: readonly CommunitySortOrder[],
): CommunitySortOrder {
  if (
    requested &&
    is_community_sort(requested) &&
    visible_sorts.includes(requested)
  ) {
    return requested;
  }
  return resolve_default_sort(configured_default, visible_sorts);
}

/** Configured default when it is a supported, visible tab; otherwise the first visible tab. */
export function resolve_default_sort(
  configured_default: string | undefined,
  visible_sorts: readonly CommunitySortOrder[],
): CommunitySortOrder {
  if (
    configured_default &&
    is_community_sort(configured_default) &&
    visible_sorts.includes(configured_default)
  ) {
    return configured_default;
  }
  return visible_sorts[0] ?? COMMUNITY_SORT_OPTIONS[0];
}

/** A URL cursor belongs to the requested ranking; once the sort falls back to another one it must be dropped. */
export function cursor_matches_sort(
  requested: string | undefined,
  resolved: CommunitySortOrder,
): boolean {
  return !requested || requested === resolved;
}

/** Config pinned posts are regular posts, so the muted tab must not list them on top. */
export function sort_shows_pinned_posts(sort: CommunitySortOrder): boolean {
  return sort !== "muted";
}
