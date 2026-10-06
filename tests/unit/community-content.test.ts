// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch_community_posts: vi.fn(),
  fetch_pinned_post: vi.fn(),
  fetch_community: vi.fn(),
  query_keys: {
    community: (name: string) => ["community", name],
    community_posts: (...args: unknown[]) => ["community_posts", ...args],
  },
}));

const config_mocks = vi.hoisted(() => ({
  load_and_prepare_config: vi.fn(),
}));

vi.mock("../../src/lib/queries", async () => {
  const { QueryClient } = await import("@tanstack/solid-query");
  return {
    ...mocks,
    create_query_client: () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 300_000, retry: 1 } },
      }),
  };
});

vi.mock("../../src/lib/config-pipeline", () => config_mocks);

import {
  can_go_next,
  can_go_previous,
  change_sort,
  go_first,
  go_next,
  go_previous,
  initial_pagination,
  initial_view,
  is_community_sort,
  is_first_page,
  is_page_fully_hidden,
  parse_url_cursor,
  resolve_visible_sorts,
} from "../../src/components/community/pagination";
import { fetch_community_posts_with_pinned } from "../../src/components/community/community-posts";
import {
  resolve_community_sort,
  resolve_default_sort,
} from "../../src/lib/community-sort";
import {
  QueryClient,
  hydrate,
  type DehydratedState,
} from "@tanstack/solid-query";
import { prepare_community_page } from "../../src/lib/ssr/prepare-community-page";

describe("community pagination cursor stack", () => {
  it("starts on the first page with nothing to go back to", () => {
    const state = initial_pagination();
    expect(is_first_page(state.cursor)).toBe(true);
    expect(can_go_previous(state)).toBe(false);
  });

  it("previous on the first page is a no-op", () => {
    const state = initial_pagination();
    expect(go_previous(state)).toBe(state);
  });

  it("next pushes the current cursor and previous pops it back", () => {
    const first = initial_pagination();
    const second = go_next(first, "alice", "p1");
    const third = go_next(second, "bob", "p2");

    expect(third.cursor).toEqual({ author: "bob", permlink: "p2" });
    expect(third.history).toHaveLength(2);

    const back = go_previous(third);
    expect(back.cursor).toEqual({ author: "alice", permlink: "p1" });

    const back_to_start = go_previous(back);
    expect(is_first_page(back_to_start.cursor)).toBe(true);
    expect(can_go_previous(back_to_start)).toBe(false);
  });

  it("next without a cursor from the API keeps the state", () => {
    const state = go_next(initial_pagination(), "alice", "p1");
    expect(go_next(state, undefined, "p2")).toBe(state);
    expect(go_next(state, "bob", undefined)).toBe(state);
  });

  it("first page (also used on sort change) clears the stack", () => {
    const deep = go_next(go_next(initial_pagination(), "a", "1"), "b", "2");
    const reset = go_first();
    expect(reset.history).toEqual([]);
    expect(is_first_page(reset.cursor)).toBe(true);
    expect(can_go_previous(reset)).toBe(false);
    expect(deep.history).toHaveLength(2);
  });

  it("starting from a URL cursor has no previous page but is not the first page", () => {
    const state = initial_pagination(
      parse_url_cursor("?start_author=alice&start_permlink=p1"),
    );
    expect(is_first_page(state.cursor)).toBe(false);
    expect(can_go_previous(state)).toBe(false);
  });
});

describe("parse_url_cursor", () => {
  it("reads start_author and start_permlink like SSR", () => {
    expect(
      parse_url_cursor("?sort=hot&start_author=alice&start_permlink=p1"),
    ).toEqual({ author: "alice", permlink: "p1" });
  });

  it("treats missing or empty params as undefined", () => {
    expect(parse_url_cursor("")).toEqual({
      author: undefined,
      permlink: undefined,
    });
    expect(parse_url_cursor("?start_author=&start_permlink=p1")).toEqual({
      author: undefined,
      permlink: "p1",
    });
  });
});

describe("next page visibility", () => {
  it("shows next whenever the API has more, even if the page is fully hidden", () => {
    expect(
      can_go_next({ has_more: true, next_author: "a", next_permlink: "p" }),
    ).toBe(true);
    expect(is_page_fully_hidden(20, 0)).toBe(true);
  });

  it("hides next on the last page", () => {
    expect(
      can_go_next({ has_more: false, next_author: "a", next_permlink: "p" }),
    ).toBe(false);
  });

  it("hides next without data (loading or network error)", () => {
    expect(can_go_next(undefined)).toBe(false);
  });

  it("hides next when the API returned no cursor", () => {
    expect(can_go_next({ has_more: true })).toBe(false);
  });

  it("an empty page is not reported as hidden by the filter", () => {
    expect(is_page_fully_hidden(0, 0)).toBe(false);
    expect(is_page_fully_hidden(5, 1)).toBe(false);
  });
});

describe("community sort validation", () => {
  it("accepts the sorts SSR can render and rejects muted", () => {
    expect(is_community_sort("trending")).toBe(true);
    expect(is_community_sort("created")).toBe(true);
    expect(is_community_sort("muted")).toBe(false);
    expect(is_community_sort("bogus")).toBe(false);
  });

  it("drops muted from configured tabs", () => {
    expect(resolve_visible_sorts(["hot", "muted"])).toEqual(["hot"]);
  });

  it("falls back to defaults when nothing valid is configured", () => {
    const defaults = ["trending", "hot", "created", "payout"];
    expect(resolve_visible_sorts(undefined)).toEqual(defaults);
    expect(resolve_visible_sorts([])).toEqual(defaults);
    expect(resolve_visible_sorts(["muted"])).toEqual(defaults);
  });

  it("SSR falls back to the first visible tab when the configured default is unusable", () => {
    const all = ["trending", "hot", "created", "payout"] as const;
    const no_trending = ["hot", "created"] as const;
    expect(resolve_community_sort(undefined, "muted", all)).toBe("trending");
    expect(resolve_community_sort(undefined, "muted", no_trending)).toBe("hot");
    expect(resolve_community_sort("muted", "muted", no_trending)).toBe("hot");
    expect(resolve_community_sort("bogus", undefined, no_trending)).toBe("hot");
    expect(resolve_community_sort(undefined, "trending", no_trending)).toBe(
      "hot",
    );
  });

  it("SSR prefers a valid requested sort, then a visible configured default", () => {
    const visible = ["hot", "created", "payout"] as const;
    expect(resolve_community_sort("hot", "muted", visible)).toBe("hot");
    expect(resolve_community_sort("trending", "hot", visible)).toBe("trending");
    expect(resolve_community_sort("muted", "payout", visible)).toBe("payout");
    expect(resolve_community_sort("", "created", visible)).toBe("created");
  });

  it("admin default sort matches SSR fallback", () => {
    expect(resolve_default_sort("muted", ["hot", "created"])).toBe("hot");
    expect(resolve_default_sort("created", ["hot", "created"])).toBe("created");
  });
});

describe("initial_view", () => {
  const visible = ["hot", "created"] as const;
  const url = "?start_author=alice&start_permlink=p1";

  it("keeps a valid SSR sort and resumes from the URL cursor without history", () => {
    const view = initial_view("trending", visible, url);
    expect(view.sort).toBe("trending");
    expect(view.pagination.cursor).toEqual({ author: "alice", permlink: "p1" });
    expect(can_go_previous(view.pagination)).toBe(false);
  });

  it("drops the URL cursor when the SSR sort is invalid and falls back to the first visible tab", () => {
    const view = initial_view("muted", visible, url);
    expect(view.sort).toBe("hot");
    expect(is_first_page(view.pagination.cursor)).toBe(true);
  });

  it("starts on the first page when there is no window (server render)", () => {
    const view = initial_view("trending", visible, undefined);
    expect(is_first_page(view.pagination.cursor)).toBe(true);
  });
});

describe("change_sort", () => {
  it("resets the cursor stack when the sort changes mid-pagination", () => {
    const deep = go_next(go_next(initial_pagination(), "a", "1"), "b", "2");
    expect(can_go_previous(deep)).toBe(true);

    const next = change_sort("created");
    expect(next?.sort).toBe("created");
    expect(next?.pagination.history).toEqual([]);
    expect(is_first_page(next!.pagination.cursor)).toBe(true);
  });

  it("ignores sorts SSR cannot render", () => {
    expect(change_sort("muted")).toBeNull();
    expect(change_sort("bogus")).toBeNull();
  });
});

describe("fetch_community_posts_with_pinned", () => {
  const post = (author: string, permlink: string) => ({
    author,
    permlink,
    stats: {},
  });
  const ranked = {
    posts: [post("bob", "r1"), post("carol", "r2")],
    has_more: true,
    next_author: "carol",
    next_permlink: "r2",
  };

  beforeEach(() => {
    mocks.fetch_community_posts.mockReset().mockResolvedValue(ranked);
    mocks.fetch_pinned_post
      .mockReset()
      .mockResolvedValue(post("hive-1", "pin"));
  });

  it("puts pinned posts on top of the first page and keeps the ranked cursor", async () => {
    const result = await fetch_community_posts_with_pinned(
      "hive-1",
      "trending",
      20,
      ["pin"],
    );
    expect(result.posts.map((p) => p.permlink)).toEqual(["pin", "r1", "r2"]);
    expect(result.posts[0].stats?.is_pinned).toBe(true);
    expect(result.next_author).toBe("carol");
    expect(result.next_permlink).toBe("r2");
  });

  it("does not add pinned posts on later pages", async () => {
    const result = await fetch_community_posts_with_pinned(
      "hive-1",
      "trending",
      20,
      ["pin"],
      "alice",
      "p1",
    );
    expect(result).toBe(ranked);
    expect(mocks.fetch_pinned_post).not.toHaveBeenCalled();
    expect(mocks.fetch_community_posts).toHaveBeenCalledWith(
      "hive-1",
      "trending",
      20,
      "alice",
      "p1",
    );
  });
});

describe("prepare_community_page SSR prefetch", () => {
  const posts_key = [
    "community_posts",
    "hive-1",
    "trending",
    20,
    undefined,
    undefined,
  ];
  const ranked = {
    posts: [{ author: "bob", permlink: "r1", stats: {} }],
    has_more: true,
    next_author: "bob",
    next_permlink: "r1",
  };

  beforeEach(() => {
    config_mocks.load_and_prepare_config.mockReset().mockResolvedValue({
      hiveUsername: "hive-1",
      postsPerPage: 20,
      pinnedPostPermlinks: [],
    });
    mocks.fetch_community.mockReset().mockResolvedValue({ name: "hive-1" });
    mocks.fetch_community_posts.mockReset();
    mocks.fetch_pinned_post.mockReset().mockResolvedValue(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  function dehydrated_keys(state: string | null): unknown[] {
    const parsed: DehydratedState = JSON.parse(state ?? "{}");
    return parsed.queries.map((query) => query.queryKey);
  }

  it("does not dehydrate a failed posts prefetch as an empty success", async () => {
    mocks.fetch_community_posts.mockRejectedValue(new Error("node down"));

    const page = await prepare_community_page("hive-1", {});

    expect(dehydrated_keys(page.dehydrated_state)).toEqual([
      ["community", "hive-1"],
    ]);
    expect(page.has_more_posts).toBe(false);
    expect(page.error).toBeNull();
    expect(mocks.fetch_community_posts).toHaveBeenCalledTimes(1);
  });

  it("dehydrates posts when the prefetch succeeds", async () => {
    mocks.fetch_community_posts.mockResolvedValue(ranked);

    const page = await prepare_community_page("hive-1", {});

    expect(dehydrated_keys(page.dehydrated_state)).toContainEqual(
      JSON.parse(JSON.stringify(posts_key)),
    );
    expect(page.has_more_posts).toBe(true);
  });

  it("lets the client fetch posts itself after an SSR failure", async () => {
    mocks.fetch_community_posts.mockRejectedValueOnce(new Error("node down"));
    const page = await prepare_community_page("hive-1", {});

    const client = new QueryClient();
    hydrate(client, JSON.parse(page.dehydrated_state ?? "{}"));
    expect(client.getQueryData(posts_key)).toBeUndefined();

    const data = await client.fetchQuery({
      queryKey: posts_key,
      queryFn: () => Promise.resolve(ranked),
    });
    expect(data).toBe(ranked);
  });
});
