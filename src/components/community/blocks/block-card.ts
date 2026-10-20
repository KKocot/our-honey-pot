// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { HiveCommunity } from "../../../lib/types/community";

/** Self-contained card; `@container` lets each block adapt to its own slot width (narrow sidebar or wide top/bottom). */
export const BLOCK_CARD_CLASS =
  "@container bg-bg-card rounded-xl shadow-sm border border-border p-4";

export const BLOCK_HEADING_CLASS = "text-text font-semibold text-sm mb-2";

export interface CommunityBlockProps<K extends keyof HiveCommunity> {
  community: Pick<HiveCommunity, K>;
  /** UI locale for labels; unknown values fall back to English. */
  locale?: string;
  /** Block toggle from settings; missing counts as visible. */
  show?: boolean;
}
