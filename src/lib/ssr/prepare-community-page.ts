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
import { resolve_community_sort } from "../community-sort";
import { resolve_visible_sorts } from "../../components/community/pagination";
import { get_default_settings } from "../../components/admin/types/settings";
import {
  resolve_pinned_posts,
  merge_pinned_posts,
  mark_pinned,
} from "../pinned-posts";
import type { SiteSettings } from "../../components/home/types";
import type { HiveCommunity } from "../types/community";
import type { CommunityPageData, CommunityQueryParams } from "./types";

/** A failed posts prefetch must not reach the client as cached data; without it the island fetches on its own. */
export function drop_failed_posts_query(
  query_client: QueryClient,
  posts_key: QueryKey,
): void {
  const state = query_client.getQueryState(posts_key);
  if (state?.status !== "error") return;
  console.error(
    "Community posts prefetch failed:",
    state.error instanceof Error ? state.error.message : state.error,
  );
  query_client.removeQueries({ queryKey: posts_key, exact: true });
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
  let settings: SiteSettings;
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

  const posts_limit = settings.postsPerPage || 20;
  const start_author = query_params.start_author;
  const start_permlink = query_params.start_permlink;

  // Create per-request QueryClient (NEVER global on server)
  const query_client = create_query_client();
  let has_more_posts = false;
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
        queryKey: query_keys.community(hive_username),
        queryFn: () => fetch_community(hive_username),
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

    drop_failed_posts_query(query_client, posts_key);

    const community_posts_data =
      query_client.getQueryData<FetchCommunityPostsResult>(posts_key);
    if (community_posts_data) {
      has_more_posts = community_posts_data.has_more;

      const is_first_page = !start_author || !start_permlink;
      if (is_first_page) {
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
    query_client.getQueryData<HiveCommunity | null>(
      query_keys.community(hive_username),
    ) ?? null;
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
