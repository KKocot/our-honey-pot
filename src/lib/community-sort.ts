// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { CommunitySortOrder } from "./queries";

/** Sorts the community feed supports; shared by SSR and the client so both validate identically. */
export const COMMUNITY_SORT_OPTIONS: readonly CommunitySortOrder[] = [
  "trending",
  "hot",
  "created",
  "payout",
];

export function is_community_sort(value: string): value is CommunitySortOrder {
  return (COMMUNITY_SORT_OPTIONS as readonly string[]).includes(value);
}

/** Requested sort if supported, else the configured default if it is a visible tab, else the first visible tab. */
export function resolve_community_sort(
  requested: string | undefined,
  configured_default: string | undefined,
  visible_sorts: readonly CommunitySortOrder[],
): CommunitySortOrder {
  if (requested && is_community_sort(requested)) return requested;
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
