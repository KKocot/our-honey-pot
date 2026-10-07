// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { IPaginationCursor } from "@hiveio/workerbee/blog-logic";
import type { CommunitySortOrder } from "../../lib/queries";
import {
  cursor_matches_sort,
  is_community_sort,
} from "../../lib/community-sort";

export {
  COMMUNITY_SORT_OPTIONS,
  is_community_sort,
} from "../../lib/community-sort";

export const DEFAULT_VISIBLE_SORTS: readonly CommunitySortOrder[] = [
  "trending",
  "hot",
  "created",
  "payout",
];

/** Visible tabs from settings, restricted to sorts SSR can render; falls back to defaults when nothing valid remains. */
export function resolve_visible_sorts(
  configured: readonly string[] | undefined
): CommunitySortOrder[] {
  const allowed = (configured ?? []).filter(is_community_sort);
  return allowed.length > 0 ? allowed : [...DEFAULT_VISIBLE_SORTS];
}

export interface PageCursor {
  author?: string;
  permlink?: string;
}

export interface PaginationState {
  cursor: PageCursor;
  history: PageCursor[];
}

/** Same parsing as SSR (src/pages/index.astro), so the client query key matches the dehydrated one. */
export function parse_url_cursor(search: string): PageCursor {
  const params = new URLSearchParams(search);
  return {
    author: params.get("start_author") || undefined,
    permlink: params.get("start_permlink") || undefined,
  };
}

export function initial_pagination(cursor: PageCursor = {}): PaginationState {
  return { cursor, history: [] };
}

export function is_first_page(cursor: PageCursor): boolean {
  return !cursor.author || !cursor.permlink;
}

export function go_next(
  state: PaginationState,
  next_author: string | undefined,
  next_permlink: string | undefined
): PaginationState {
  if (!next_author || !next_permlink) return state;
  return {
    cursor: { author: next_author, permlink: next_permlink },
    history: [...state.history, state.cursor],
  };
}

export function go_previous(state: PaginationState): PaginationState {
  if (state.history.length === 0) return state;
  return {
    cursor: state.history[state.history.length - 1],
    history: state.history.slice(0, -1),
  };
}

export function go_first(): PaginationState {
  return initial_pagination();
}

export interface CommunityView {
  sort: CommunitySortOrder;
  pagination: PaginationState;
}

/** A URL cursor belongs to the URL sort, so it is dropped when SSR resolved a different (or invalid) sort. */
export function initial_view(
  initial_sort: string,
  visible_sorts: readonly CommunitySortOrder[],
  search: string | undefined
): CommunityView {
  if (!is_community_sort(initial_sort)) {
    return { sort: visible_sorts[0], pagination: initial_pagination() };
  }
  if (search === undefined) {
    return { sort: initial_sort, pagination: initial_pagination() };
  }
  const requested = new URLSearchParams(search).get("sort") || undefined;
  return {
    sort: initial_sort,
    pagination: initial_pagination(
      cursor_matches_sort(requested, initial_sort)
        ? parse_url_cursor(search)
        : {}
    ),
  };
}

/** Switching sort always restarts from the first page; unknown sorts are ignored (null). */
export function change_sort(sort: string): CommunityView | null {
  if (!is_community_sort(sort)) return null;
  return { sort, pagination: go_first() };
}

export function can_go_previous(state: PaginationState): boolean {
  return state.history.length > 0;
}

export interface PageResultSummary {
  has_more: boolean;
  next_author?: string;
  next_permlink?: string;
}

/** Next depends only on the ranked list, never on how many posts survived client-side filtering. */
export function can_go_next(data: PageResultSummary | undefined): boolean {
  return Boolean(data?.has_more && data.next_author && data.next_permlink);
}

export function is_page_fully_hidden(
  fetched_count: number,
  visible_count: number
): boolean {
  return fetched_count > 0 && visible_count === 0;
}

/** Bridge account-post cursor for the current page; undefined on the first page. */
export function to_account_cursor(
  cursor: PageCursor
): IPaginationCursor | undefined {
  const { author, permlink } = cursor;
  if (!author || !permlink) return undefined;
  return { startAuthor: author, startPermlink: permlink };
}

export interface AccountPageResult {
  has_more: boolean;
  next_cursor?: IPaginationCursor;
}

export function account_page_summary(
  data: AccountPageResult | undefined
): PageResultSummary {
  return {
    has_more: data?.has_more ?? false,
    next_author: data?.next_cursor?.startAuthor,
    next_permlink: data?.next_cursor?.startPermlink,
  };
}

/** Threads is a single comment tree, not a paged list. */
export function tab_has_pagination(tab: string): boolean {
  return tab !== "threads";
}
