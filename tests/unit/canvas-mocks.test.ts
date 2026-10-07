// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/components/admin/queries", () => ({
  settings: {},
  is_community_mode: () => true,
  useHivePreviewQuery: vi.fn(),
}));

import {
  MOCK_COMMUNITY_NAME,
  MOCK_USERNAME,
  create_mock_canvas_data,
  create_mock_community_preview,
  create_mock_hive_data,
  create_mock_posts,
} from "../../src/components/admin/canvas/mocks";
import {
  CANVAS_FETCH_ERROR,
  canvas_posts_limit,
  resolve_canvas_source,
  type CanvasSourceInput,
} from "../../src/components/admin/canvas/use_canvas_data";
import { createPostCardDataFromBridge } from "../../src/shared/components/post-card/utils";
import { filter_hidden_posts } from "../../src/components/community/community-posts";
import { get_default_settings } from "../../src/components/admin/types/settings";
import { MAIN_SECTION_ID } from "../../src/components/admin/types/layout";

describe("canvas mock factories", () => {
  it("returns fresh copies, so mutating one result never leaks into the next", () => {
    const first = create_mock_hive_data();
    first.posts[0]!.title = "mutated";
    first.posts.push(first.posts[0]!);
    (first.profile!.metadata as { about?: string }).about = "mutated";

    const second = create_mock_hive_data();
    expect(second.posts).toHaveLength(4);
    expect(second.posts[0]!.title).toBe("Introduction to Hive Blockchain");
    expect(second.profile!.metadata.about).not.toBe("mutated");
    expect(second.posts[0]).not.toBe(first.posts[0]);
  });

  it("returns mutable objects (templates stay frozen inside the module)", () => {
    const posts = create_mock_posts();
    expect(Object.isFrozen(posts)).toBe(false);
    expect(Object.isFrozen(posts[0]!.json_metadata)).toBe(false);
  });

  it("builds posts that the shared PostCard pipeline understands", () => {
    const [post] = create_mock_posts("alice");
    const card = createPostCardDataFromBridge(post!, {
      thumbnailSizePx: 96,
      maxTags: 3,
    });

    expect(card.author).toBe("alice");
    expect(card.tags).toEqual(["hive", "blockchain", "crypto"]);
    expect(card.votesCount).toBe(156);
    expect(card.commentsCount).toBe(24);
    expect(card.payout).toBeCloseTo(12.45);
    expect(card.thumbnail).toBeTruthy();
    expect(Number.isNaN(card.publishedAt.getTime())).toBe(false);
  });

  it("personalises hive data with the blog account", () => {
    const data = create_mock_hive_data("alice");
    expect(data.profile?.name).toBe("alice");
    expect(data.dbAccount?.name).toBe("alice");
    expect(
      data.comments.every((c) => c.author === "alice" && c.depth === 1),
    ).toBe(true);
    expect(
      data.threads.every(
        (t) =>
          t.parent_author === "alice" && t.parent_permlink === "my-threads",
      ),
    ).toBe(true);
  });

  it("builds community data whose posts survive the public visibility filter", () => {
    const preview = create_mock_community_preview("hive-123");
    expect(preview.community?.name).toBe("hive-123");
    expect(preview.community?.team[0]).toEqual(["hive-123", "owner", ""]);
    expect(preview.posts.every((p) => p.community === "hive-123")).toBe(true);
    expect(filter_hidden_posts(preview.posts, false)).toHaveLength(
      preview.posts.length,
    );
  });

  it("picks the shape by blog kind and falls back to placeholder names", () => {
    expect(create_mock_canvas_data("community", "  ")).toMatchObject({
      hive: null,
      community: { community: { name: MOCK_COMMUNITY_NAME } },
    });
    expect(create_mock_canvas_data("user")).toMatchObject({
      community: null,
      hive: { profile: { name: MOCK_USERNAME } },
    });
  });
});

describe("resolve_canvas_source", () => {
  const live_community = create_mock_community_preview("hive-123");
  const base = (
    overrides: Partial<CanvasSourceInput> = {},
  ): CanvasSourceInput => ({
    mode: "live",
    kind: "community",
    account: "hive-123",
    query: { status: "success", data: live_community, error: null },
    ...overrides,
  });

  it("uses live data when the blog has a community and posts", () => {
    expect(resolve_canvas_source(base())).toEqual({
      source: "live",
      mock_reason: null,
      is_loading: false,
      error: null,
    });
  });

  it("uses mocks when the user picks sample data, even with live data available", () => {
    expect(resolve_canvas_source(base({ mode: "mock" }))).toMatchObject({
      source: "mock",
      mock_reason: "user_choice",
      error: null,
    });
  });

  it("reports loading without falling back to mocks", () => {
    expect(
      resolve_canvas_source(
        base({ query: { status: "pending", data: undefined, error: null } }),
      ),
    ).toEqual({
      source: "live",
      mock_reason: null,
      is_loading: true,
      error: null,
    });
  });

  it("surfaces a query error instead of hiding it behind mocks", () => {
    const result = resolve_canvas_source(
      base({
        query: {
          status: "error",
          data: undefined,
          error: new Error("timeout"),
        },
      }),
    );
    expect(result).toMatchObject({
      source: "mock",
      mock_reason: "error",
      error: "timeout",
    });
  });

  it("treats a null result as no account: fetch failures reject the query instead", () => {
    const result = resolve_canvas_source(
      base({ query: { status: "success", data: null, error: null } }),
    );
    expect(result).toMatchObject({
      mock_reason: "no_account",
      error: null,
    });
  });

  it("falls back to the generic message for an error without one", () => {
    const result = resolve_canvas_source(
      base({ query: { status: "error", data: undefined, error: {} } }),
    );
    expect(result).toMatchObject({
      mock_reason: "error",
      error: CANVAS_FETCH_ERROR,
    });
  });

  it("uses mocks with a reason when the blog has no account or community", () => {
    expect(resolve_canvas_source(base({ account: " " })).mock_reason).toBe(
      "no_account",
    );
    expect(
      resolve_canvas_source(
        base({
          query: {
            status: "success",
            data: { community: null, posts: [] },
            error: null,
          },
        }),
      ).mock_reason,
    ).toBe("no_community");
  });

  it("keeps a community without posts live: CommunityContent fetches posts and shows its empty state", () => {
    expect(
      resolve_canvas_source(
        base({
          query: {
            status: "success",
            data: { ...live_community, posts: [] },
            error: null,
          },
        }),
      ),
    ).toMatchObject({ source: "live", mock_reason: null, error: null });
  });

  it("applies the same rules to a personal blog", () => {
    const hive = create_mock_hive_data("alice");
    const user = (data: CanvasSourceInput["query"]["data"]) =>
      resolve_canvas_source(
        base({
          kind: "user",
          account: "alice",
          query: { status: "success", data, error: null },
        }),
      );

    expect(user(hive).source).toBe("live");
    expect(user({ ...hive, posts: [] }).mock_reason).toBe("no_posts");
  });
});

describe("canvas_posts_limit", () => {
  const defaults = get_default_settings(true);

  it("uses the main posts instance override, like the SSR posts query", () => {
    const current = {
      ...defaults,
      postsPerPage: 10,
      instanceOverrides: { [`${MAIN_SECTION_ID}:posts`]: { postsPerPage: 25 } },
    };
    expect(canvas_posts_limit(current)).toBe(25);
  });

  it("falls back to the global value without an override of the main instance", () => {
    const current = {
      ...defaults,
      postsPerPage: 10,
      instanceOverrides: { "page-sec-top:posts": { postsPerPage: 25 } },
    };
    expect(canvas_posts_limit(current)).toBe(10);
  });
});
