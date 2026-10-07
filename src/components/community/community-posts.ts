// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import {
  fetch_community_posts,
  fetch_pinned_post,
  type CommunitySortOrder,
  type FetchCommunityPostsResult,
} from "../../lib/queries";
import { sort_shows_pinned_posts } from "../../lib/community-sort";
import {
  resolve_pinned_posts,
  merge_pinned_posts,
  mark_pinned,
} from "../../lib/pinned-posts";
import type { BridgePost } from "@hiveio/workerbee/blog-logic";

/** Hive bridge API returns reputation as a pre-calculated float. Negative = heavily downvoted. */
const MIN_REPUTATION = 0;

/** Drops posts hidden from the community blog; show_muted (the muted tab) lets moderated (muted/gray/hide) posts through. */
export function filter_hidden_posts(
  posts: readonly BridgePost[],
  show_muted: boolean
): BridgePost[] {
  return posts.filter((p) => {
    if (p.author_reputation < MIN_REPUTATION) return false;
    if (show_muted) return true;
    return p.author_role !== "muted" && !p.stats?.hide && !p.stats?.gray;
  });
}

/** First page gets config pinned posts on top, same as SSR; the cursor stays on the ranked list. */
export async function fetch_community_posts_with_pinned(
  community: string,
  sort: CommunitySortOrder,
  limit: number,
  pinned_permlinks: readonly string[] | undefined,
  start_author?: string,
  start_permlink?: string
): Promise<FetchCommunityPostsResult> {
  const result = await fetch_community_posts(
    community,
    sort,
    limit,
    start_author,
    start_permlink
  );
  if (start_author && start_permlink) return result;
  if (!sort_shows_pinned_posts(sort)) return result;

  const pinned = await resolve_pinned_posts(
    community,
    pinned_permlinks,
    result.posts,
    fetch_pinned_post
  );
  if (pinned.length === 0) return result;
  return {
    ...result,
    posts: merge_pinned_posts(pinned.map(mark_pinned), result.posts),
  };
}
