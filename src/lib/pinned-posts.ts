// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { BridgePost } from "@hiveio/workerbee/blog-logic";
import { MAX_PINNED_POSTS } from "../components/admin/types/settings";

interface PostRef {
  author: string;
  permlink: string;
}

function post_key(post: PostRef): string {
  return `${post.author}/${post.permlink}`;
}

/** Config entry `permlink` (author = blog account) or `author/permlink`; null when a part is empty. */
export function parse_pinned_entry(
  entry: string,
): { author: string | null; permlink: string } | null {
  const value = entry.trim().replace(/^@/, "");
  const slash = value.indexOf("/");
  const author = slash === -1 ? null : value.slice(0, slash);
  const permlink = slash === -1 ? value : value.slice(slash + 1);
  if (permlink === "" || author === "") return null;
  return { author, permlink };
}

/**
 * Resolve configured entries to posts, in configured order. A bare permlink means `blog/permlink`;
 * only an exact author+permlink match counts, so another author reusing the permlink cannot take the pin.
 * Missing or failed lookups are skipped.
 */
export async function resolve_pinned_posts<T extends PostRef>(
  blog: string,
  entries: readonly string[] | undefined,
  ranked_posts: readonly T[],
  fetch_post: (author: string, permlink: string) => Promise<T | null>,
): Promise<T[]> {
  const unique = [
    ...new Set((entries ?? []).filter((p) => p.trim() !== "")),
  ].slice(0, MAX_PINNED_POSTS);
  if (unique.length === 0) return [];

  const lookups = await Promise.allSettled(
    unique.map(async (entry): Promise<T | null> => {
      const ref = parse_pinned_entry(entry);
      if (!ref) return null;
      const author = ref.author ?? blog;
      const is_target = (p: PostRef | null): boolean =>
        p?.author === author && p.permlink === ref.permlink;
      const from_ranked = ranked_posts.find(is_target);
      if (from_ranked) return from_ranked;
      const fetched = await fetch_post(author, ref.permlink);
      return is_target(fetched) ? fetched : null;
    }),
  );

  const resolved: T[] = [];
  const seen = new Set<string>();
  for (const lookup of lookups) {
    if (lookup.status !== "fulfilled" || !lookup.value) continue;
    const key = post_key(lookup.value);
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(lookup.value);
  }
  return resolved;
}

/** Pinned posts first, then ranked posts without duplicates. */
export function merge_pinned_posts<T extends PostRef>(
  pinned: readonly T[],
  ranked: readonly T[],
): T[] {
  if (pinned.length === 0) return [...ranked];
  const pinned_keys = new Set(pinned.map(post_key));
  return [...pinned, ...ranked.filter((p) => !pinned_keys.has(post_key(p)))];
}

/** Flags a post as pinned so the list renders it in the pinned section. */
export function mark_pinned(post: BridgePost): BridgePost {
  return { ...post, stats: { ...post.stats, is_pinned: true } };
}
