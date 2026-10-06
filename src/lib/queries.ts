// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { QueryClient } from "@tanstack/solid-query";
import {
  withRetry,
  type BridgePost,
  type AccountPostsSortOption,
  type CommentSortOption,
  type IPaginationCursor,
} from "@hiveio/workerbee/blog-logic";
import { ensure_endpoints_configured } from "./hive-endpoints";
import { hive_assertion_message } from "./config-account";
import type { HiveCommunity, CommunitySubscriber } from "./types/community";

export type CommunitySortOrder = "trending" | "hot" | "created" | "payout";

export { ensure_endpoints_configured };

function with_hive_retry<T>(
  fn: Parameters<typeof withRetry<T>>[0],
): Promise<T> {
  ensure_endpoints_configured();
  return withRetry(fn);
}

// ============================================
// Query Client Factory (per-request on server)
// ============================================

/**
 * Create a new QueryClient instance for each request
 * NEVER create a global singleton on the server - it would leak data between users
 */
export function create_query_client(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes - important for hydration to work
        retry: 1,
      },
    },
  });
}

// ============================================
// Query Keys Factory
// ============================================

export const query_keys = {
  community: (name: string) => ["community", name] as const,
  community_posts: (
    name: string,
    sort: CommunitySortOrder,
    limit: number,
    cursor_author?: string,
    cursor_permlink?: string,
  ) =>
    [
      "community_posts",
      name,
      sort,
      limit,
      cursor_author,
      cursor_permlink,
    ] as const,
  subscribers: (name: string) => ["subscribers", name] as const,

  // Account posts (personal blog)
  posts: (
    username: string,
    sort: AccountPostsSortOption,
    limit: number,
    cursor?: IPaginationCursor,
    tag?: string | null,
  ) => ["account_posts", username, sort, limit, cursor, tag] as const,

  // Account comments
  comments: (
    username: string,
    sort: CommentSortOption,
    limit: number,
    cursor?: IPaginationCursor,
  ) => ["account_comments", username, sort, limit, cursor] as const,

  // Post replies (comments under a specific post)
  post_replies: (author: string, permlink: string) =>
    ["post_replies", author, permlink] as const,
};

// ============================================
// Query Function Return Types
// ============================================

export interface FetchCommunityPostsResult {
  posts: BridgePost[];
  has_more: boolean;
  next_author?: string;
  next_permlink?: string;
}

interface AccountPostsParams {
  sort: string;
  account: string;
  observer: string;
  limit: number;
  start_author?: string;
  start_permlink?: string;
}

export interface FetchPostsResult {
  posts: BridgePost[];
  has_more: boolean;
  next_cursor?: IPaginationCursor;
}

export interface FetchCommentsResult {
  comments: BridgePost[];
  has_more: boolean;
  next_cursor?: IPaginationCursor;
}

export interface CommentTreeNode {
  comment: BridgePost;
  children: CommentTreeNode[];
  hidden: boolean;
  hide_reason: string;
}

export interface FetchPostRepliesResult {
  tree: CommentTreeNode[];
  total_count: number;
}

// ============================================
// Community Query Functions
// ============================================

/**
 * Fetch community details (title, about, description, rules, team, subscribers count)
 * Uses withRetry for automatic endpoint rotation on timeout.
 */
export async function fetch_community(
  name: string,
): Promise<HiveCommunity | null> {
  try {
    return await with_hive_retry((chain) =>
      chain.api.bridge.get_community({ name, observer: "" }),
    );
  } catch (error) {
    console.error(
      "fetch_community failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Fetch community posts with server-side pagination via get_ranked_posts.
 * Pagination: pass start_author + start_permlink from previous page's last post.
 * Network errors propagate after endpoint rotation, so an outage is never shown as an empty feed.
 */
export async function fetch_community_posts(
  name: string,
  sort: CommunitySortOrder,
  limit: number,
  start_author?: string,
  start_permlink?: string,
): Promise<FetchCommunityPostsResult> {
  const params = {
    sort,
    tag: name,
    observer: "",
    limit,
    ...(start_author && start_permlink ? { start_author, start_permlink } : {}),
  };

  const posts = await with_hive_retry((chain) =>
    chain.api.bridge.get_ranked_posts(params),
  );

  const has_more = posts.length >= limit;
  const last_post = posts[posts.length - 1];

  return {
    posts,
    has_more,
    next_author: last_post?.author,
    next_permlink: last_post?.permlink,
  };
}

const PINNED_POST_CACHE_TTL_MS = 60_000;
const pinned_post_cache = new Map<
  string,
  { post: BridgePost | null; expires_at: number }
>();

function cache_pinned_post(key: string, post: BridgePost | null): void {
  pinned_post_cache.set(key, {
    post,
    expires_at: Date.now() + PINNED_POST_CACHE_TTL_MS,
  });
}

/**
 * Single post via bridge.get_post (no comment tree), or null when missing or on error.
 * Cached for a minute: every SSR of the community homepage resolves pinned posts.
 */
export async function fetch_pinned_post(
  author: string,
  permlink: string,
): Promise<BridgePost | null> {
  const key = `${author}/${permlink}`;
  const cached = pinned_post_cache.get(key);
  if (cached && cached.expires_at > Date.now()) return cached.post;
  try {
    const post = await with_hive_retry((chain) =>
      chain.api.bridge.get_post({ author, permlink }),
    );
    const result = post?.author ? (post as BridgePost) : null;
    cache_pinned_post(key, result);
    return result;
  } catch (error) {
    // "post does not exist" is cached like a hit; transport errors are retried on the next call
    if (hive_assertion_message(error)) cache_pinned_post(key, null);
    return null;
  }
}

/**
 * Fetch community subscribers list.
 * Returns array of tuples: [username, role, title, ...]
 */
export async function fetch_subscribers(
  name: string,
): Promise<CommunitySubscriber[]> {
  try {
    return await with_hive_retry((chain) =>
      chain.api.bridge.list_subscribers({ community: name }),
    );
  } catch (error) {
    console.error(
      "fetch_subscribers failed:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

// ============================================
// Account Posts (personal blog / category view)
// ============================================

function post_matches_tag(post: BridgePost, tag: string): boolean {
  const wanted = tag.toLowerCase();
  if (post.category?.toLowerCase() === wanted) return true;
  const tags: unknown = post.json_metadata?.tags;
  return (
    Array.isArray(tags) &&
    tags.some((t) => typeof t === "string" && t.toLowerCase() === wanted)
  );
}

/**
 * Fetch account posts with cursor-based pagination, optionally narrowed to a tag.
 * Network errors propagate after endpoint rotation.
 */
export async function fetch_posts(
  username: string,
  sort: AccountPostsSortOption,
  limit: number,
  cursor?: IPaginationCursor,
  tag?: string | null,
): Promise<FetchPostsResult> {
  const params: AccountPostsParams = {
    sort,
    account: username,
    observer: "",
    limit,
  };

  if (cursor) {
    params.start_author = cursor.startAuthor;
    params.start_permlink = cursor.startPermlink;
  }

  const bridge_posts = await with_hive_retry((chain) =>
    chain.api.bridge.get_account_posts(params),
  );

  // bridge.get_account_posts has no tag param: filter client-side, but page
  // from the unfiltered bridge result so the cursor never skips posts.
  const has_more = bridge_posts.length >= limit;
  const last_post = bridge_posts[bridge_posts.length - 1];
  const posts = tag
    ? bridge_posts.filter((post) => post_matches_tag(post, tag))
    : bridge_posts;

  return {
    posts,
    has_more,
    next_cursor: last_post
      ? { startAuthor: last_post.author, startPermlink: last_post.permlink }
      : undefined,
  };
}

// ============================================
// Account Comments
// ============================================

/**
 * Fetch account comments (replies made by a user).
 * Uses bridge.get_account_posts with sort="comments" or "replies".
 * Network errors propagate after endpoint rotation.
 */
export async function fetch_comments(
  username: string,
  sort: CommentSortOption,
  limit: number,
  cursor?: IPaginationCursor,
): Promise<FetchCommentsResult> {
  const params: AccountPostsParams = {
    sort,
    account: username,
    observer: "",
    limit,
  };

  if (cursor) {
    params.start_author = cursor.startAuthor;
    params.start_permlink = cursor.startPermlink;
  }

  const comments = await with_hive_retry((chain) =>
    chain.api.bridge.get_account_posts(params),
  );

  const has_more = comments.length >= limit;
  const last = comments[comments.length - 1];

  return {
    comments,
    has_more,
    next_cursor: last
      ? { startAuthor: last.author, startPermlink: last.permlink }
      : undefined,
  };
}

// ============================================
// Post Replies (comments under a specific post)
// ============================================

function is_bridge_post(entry: unknown): entry is BridgePost {
  if (typeof entry !== "object" || entry === null) return false;
  return (
    "author" in entry &&
    typeof entry.author === "string" &&
    "permlink" in entry &&
    typeof entry.permlink === "string" &&
    "parent_author" in entry &&
    typeof entry.parent_author === "string" &&
    "parent_permlink" in entry &&
    typeof entry.parent_permlink === "string" &&
    "body" in entry &&
    typeof entry.body === "string" &&
    "created" in entry &&
    typeof entry.created === "string" &&
    "author_reputation" in entry &&
    typeof entry.author_reputation === "number" &&
    "stats" in entry &&
    typeof entry.stats === "object" &&
    entry.stats !== null &&
    "gray" in entry.stats &&
    typeof entry.stats.gray === "boolean" &&
    "hide" in entry.stats &&
    typeof entry.stats.hide === "boolean"
  );
}

/** Hive bridge API returns reputation as a pre-calculated float (e.g. 25.5). Negative values indicate heavily downvoted accounts. */
const MIN_REPUTATION = 0;

function get_hide_reason(comment: BridgePost): string {
  if (comment.author_role === "muted") return "muted";
  if (comment.author_reputation < MIN_REPUTATION) return "low reputation";
  if (comment.stats.hide) return "hidden by community";
  if (comment.stats.gray) return "low ratings";
  return "";
}

function fetch_discussion(author: string, permlink: string) {
  return with_hive_retry((chain) =>
    chain.api.bridge.get_discussion({ author, permlink, observer: "" }),
  );
}

/**
 * Fetch full comment tree under a specific post.
 * Uses bridge.get_discussion which returns the full discussion tree as a flat map,
 * then builds a nested tree structure. Hidden comments are kept with a flag.
 * A missing post is an empty tree; network errors propagate after endpoint rotation.
 */
export async function fetch_post_replies(
  author: string,
  permlink: string,
): Promise<FetchPostRepliesResult> {
  let discussion: Awaited<ReturnType<typeof fetch_discussion>>;
  try {
    discussion = await fetch_discussion(author, permlink);
  } catch (error) {
    if (hive_assertion_message(error)) return { tree: [], total_count: 0 };
    throw error;
  }

  const root_key = `${author}/${permlink}`;

  // Index all valid comments by their key (hidden ones kept with flag)
  const comment_map = new Map<string, BridgePost>();
  for (const [key, entry] of Object.entries(discussion)) {
    if (key === root_key) continue;
    if (!is_bridge_post(entry)) continue;
    comment_map.set(key, entry);
  }

  // Build children lookup: parent_key -> list of child BridgePosts
  const children_map = new Map<string, BridgePost[]>();
  for (const [, comment] of comment_map) {
    const parent_key = `${comment.parent_author}/${comment.parent_permlink}`;
    const siblings = children_map.get(parent_key);
    if (siblings) {
      siblings.push(comment);
    } else {
      children_map.set(parent_key, [comment]);
    }
  }

  function build_subtree(parent_key: string, depth = 0): CommentTreeNode[] {
    if (depth > 50) return [];

    const direct_children = children_map.get(parent_key);
    if (!direct_children) return [];

    return direct_children.map((child) => {
      const child_key = `${child.author}/${child.permlink}`;
      const reason = get_hide_reason(child);
      return {
        comment: child,
        children: build_subtree(child_key, depth + 1),
        hidden: reason !== "",
        hide_reason: reason,
      };
    });
  }

  const tree = build_subtree(root_key);

  return { tree, total_count: comment_map.size };
}
