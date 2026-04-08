// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { SiteSettings } from "../../components/home/types";
import type { HiveCommunity } from "../types/community";
import type { CommunitySortOrder } from "../queries";

// ============================================
// Query params parsed from URL
// ============================================

export interface CommunityQueryParams {
  sort?: string;
  start_author?: string;
  start_permlink?: string;
}

// ============================================
// SSR prepare results
// ============================================

export interface CommunityPageData {
  settings: SiteSettings;
  dehydrated_state: string | null;
  community_data: HiveCommunity | null;
  community_sort_order: CommunitySortOrder;
  has_more_posts: boolean;
  posts_limit: number;
  error: string | null;
}
