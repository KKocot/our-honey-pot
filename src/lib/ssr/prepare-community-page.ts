// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { QueryClient, QueryKey } from "@tanstack/solid-query";
import { load_and_prepare_config } from "../config-pipeline";
import {
  create_query_client,
  query_keys,
  fetch_community,
  fetch_community_posts,
  fetch_pinned_post,
  type FetchCommunityPostsResult,
} from "../queries";
import { dehydrate_to_json } from "../dehydrate";
import {
  cursor_matches_sort,
  resolve_community_sort,
  sort_shows_pinned_posts,
} from "../community-sort";
import { resolve_visible_sorts } from "../../components/community/pagination";
import {
  get_default_settings,
  type SettingsData,
} from "../../components/admin/types/settings";
import { resolve_main_posts_settings } from "../instance-overrides";
import {
  resolve_pinned_posts,
  merge_pinned_posts,
  mark_pinned,
} from "../pinned-posts";
import type { HiveCommunity } from "../types/community";
import type { CommunityPageData, CommunityQueryParams } from "./types";

export const COMMUNITY_FETCH_ERROR =
  "Could not load community details from Hive.";

/** A failed prefetch must not reach the client as cached data; without it the island fetches on its own. Returns true when dropped. */
export function drop_failed_query(
  query_client: QueryClient,
  key: QueryKey,
  label: string,
): boolean {
  const state = query_client.getQueryState(key);
  if (state?.status !== "error") return false;
  console.error(
    `${label} prefetch failed:`,
    state.error instanceof Error ? state.error.message : state.error,
  );
  query_client.removeQueries({ queryKey: key, exact: true });
  return true;
}

// ============================================
// Main SSR function
// ============================================

/**
 * Prepares all SSR data for community mode homepage.
 * Loads config from Hive, prefetches community + ranked posts,
 * dehydrates query client state for client-side hydration.
 */
export async function prepare_community_page(
  hive_username: string,
  query_params: CommunityQueryParams,
): Promise<CommunityPageData> {
  let error: string | null = null;

  // Load settings through unified pipeline (migrations + mode-specific defaults)
  let settings: SettingsData;
  try {
    settings = await load_and_prepare_config(hive_username, true);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to load config from Hive:", message);
    settings = { ...get_default_settings(true), hiveUsername: hive_username };
  }

  const community_sort_order = resolve_community_sort(
    query_params.sort,
    settings.community_default_sort,
    resolve_visible_sorts(settings.community_visible_sorts),
  );

  // The island builds its query key from posts_limit, so SSR and client must both use the posts instance value.
  const posts_limit = resolve_main_posts_settings(settings).postsPerPage || 20;
  const keep_cursor = cursor_matches_sort(
    query_params.sort,
    community_sort_order,
  );
  const start_author = keep_cursor ? query_params.start_author : undefined;
  const start_permlink = keep_cursor ? query_params.start_permlink : undefined;

  // Create per-request QueryClient (NEVER global on server)
  const query_client = create_query_client();
  let has_more_posts = false;
  const community_key = query_keys.community(hive_username);
  const posts_key = query_keys.community_posts(
    hive_username,
    community_sort_order,
    posts_limit,
    start_author,
    start_permlink,
  );

  try {
    await Promise.allSettled([
      query_client.prefetchQuery({
        queryKey: community_key,
        queryFn: () => fetch_community(hive_username),
        // fetch_community already rotated endpoints; a second round only delays the page.
        retry: false,
      }),
      query_client.prefetchQuery({
        queryKey: posts_key,
        queryFn: () =>
          fetch_community_posts(
            hive_username,
            community_sort_order,
            posts_limit,
            start_author,
            start_permlink,
          ),
        // fetch_community_posts already rotated endpoints; a second round only delays the page.
        retry: false,
      }),
    ]);

    if (drop_failed_query(query_client, community_key, "Community")) {
      error = COMMUNITY_FETCH_ERROR;
    }
    drop_failed_query(query_client, posts_key, "Community posts");

    const community_posts_data =
      query_client.getQueryData<FetchCommunityPostsResult>(posts_key);
    if (community_posts_data) {
      has_more_posts = community_posts_data.has_more;

      const is_first_page = !start_author || !start_permlink;
      if (is_first_page && sort_shows_pinned_posts(community_sort_order)) {
        const pinned = await resolve_pinned_posts(
          hive_username,
          settings.pinnedPostPermlinks,
          community_posts_data.posts,
          fetch_pinned_post,
        );
        if (pinned.length > 0) {
          // Pagination cursor stays on the ranked list, so next pages are unaffected.
          query_client.setQueryData<FetchCommunityPostsResult>(posts_key, {
            ...community_posts_data,
            posts: merge_pinned_posts(
              pinned.map(mark_pinned),
              community_posts_data.posts,
            ),
          });
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Error fetching Hive data:", message);
    error = "Error fetching data from Hive blockchain.";
  }

  const community_data =
    query_client.getQueryData<HiveCommunity | null>(community_key) ?? null;
  const dehydrated_state = dehydrate_to_json(query_client);

  return {
    settings,
    dehydrated_state,
    community_data,
    community_sort_order,
    has_more_posts,
    posts_limit,
    error,
  };
}
