// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { QueryClient } from "@tanstack/solid-query";
import {
  configureEndpoints,
  DataProvider,
  getWax,
  withRetry,
  type BridgePost,
} from "@hiveio/workerbee/blog-logic";
import { HIVE_API_ENDPOINTS } from "./config";
import type {
  HiveCommunity,
  CommunityTeamMember,
  CommunitySubscriber,
} from "./types/community";

export type CommunitySortOrder =
  | "trending"
  | "hot"
  | "created"
  | "payout"
  | "muted";

// Configure workerbee to use our custom Hive API endpoints
// This must be called before the first getWax() call
configureEndpoints(HIVE_API_ENDPOINTS);

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
    cursor_permlink?: string
  ) =>
    ["community_posts", name, sort, limit, cursor_author, cursor_permlink] as const,
  subscribers: (name: string) => ["subscribers", name] as const,
  community_roles: (name: string) => ["community_roles", name] as const,

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
export async function fetch_community(name: string): Promise<HiveCommunity | null> {
  try {
    return await withRetry((chain) =>
      chain.api.bridge.get_community({ name, observer: "" })
    );
  } catch (error) {
    console.error("fetch_community failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Fetch community posts with server-side pagination via get_ranked_posts.
 * Sort options: "trending" | "hot" | "created" | "payout" | "muted"
 * Pagination: pass start_author + start_permlink from previous page's last post.
 */
export async function fetch_community_posts(
  name: string,
  sort: CommunitySortOrder,
  limit: number,
  start_author?: string,
  start_permlink?: string
): Promise<FetchCommunityPostsResult> {
  try {
    const params = {
      sort,
      tag: name,
      observer: "",
      limit,
      ...(start_author && start_permlink
        ? { start_author, start_permlink }
        : {}),
    };

    const posts = await withRetry((chain) =>
      chain.api.bridge.get_ranked_posts(params)
    );

    const has_more = posts.length >= limit;
    const last_post = posts[posts.length - 1];

    return {
      posts,
      has_more,
      next_author: last_post?.author,
      next_permlink: last_post?.permlink,
    };
  } catch (error) {
    console.error("fetch_community_posts failed:", error instanceof Error ? error.message : error);
    return { posts: [], has_more: false };
  }
}

/**
 * Fetch a single post by author and permlink using bridge.get_discussion.
 * Returns the root post as BridgePost, or null if not found.
 */
export async function fetch_single_post(
  author: string,
  permlink: string
): Promise<BridgePost | null> {
  try {
    const discussion = await withRetry((chain) =>
      chain.api.bridge.get_discussion({ author, permlink, observer: "" })
    );
    const root_key = `${author}/${permlink}`;
    const post = discussion[root_key];
    if (post && post.author) {
      return post as BridgePost;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch community subscribers list.
 * Returns array of tuples: [username, role, title, ...]
 */
export async function fetch_subscribers(
  name: string
): Promise<CommunitySubscriber[]> {
  try {
    return await withRetry((chain) =>
      chain.api.bridge.list_subscribers({ community: name })
    );
  } catch (error) {
    console.error("fetch_subscribers failed:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Fetch community roles (moderators, admins, members).
 * Returns array of tuples: [username, role, title]
 */
export async function fetch_community_roles(
  name: string
): Promise<CommunityTeamMember[]> {
  try {
    return await withRetry((chain) =>
      chain.api.bridge.list_community_roles({ community: name })
    );
  } catch (error) {
    console.error("fetch_community_roles failed:", error instanceof Error ? error.message : error);
    return [];
  }
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

/**
 * Fetch full comment tree under a specific post.
 * Uses bridge.get_discussion which returns the full discussion tree as a flat map,
 * then builds a nested tree structure. Hidden comments are kept with a flag.
 */
export async function fetch_post_replies(
  author: string,
  permlink: string
): Promise<FetchPostRepliesResult> {
  try {
    const discussion = await withRetry((chain) =>
      chain.api.bridge.get_discussion({ author, permlink, observer: "" })
    );

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
  } catch (error) {
    console.error("fetch_post_replies failed:", error instanceof Error ? error.message : error);
    return { tree: [], total_count: 0 };
  }
}
