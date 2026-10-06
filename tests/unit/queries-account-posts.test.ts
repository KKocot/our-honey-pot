// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.HIVE_USERNAME = "alice";
  return {
    chain: {
      api: {
        bridge: {
          get_account_posts: vi.fn(),
          get_ranked_posts: vi.fn(),
          get_discussion: vi.fn(),
        },
      },
    },
  };
});

vi.mock("@hiveio/workerbee/blog-logic", () => ({
  configureEndpoints: vi.fn(),
  getWax: vi.fn(async () => mocks.chain),
  withRetry: vi.fn((fn: (chain: unknown) => Promise<unknown>) =>
    fn(mocks.chain),
  ),
  DataProvider: vi.fn(),
}));

import {
  fetch_comments,
  fetch_community_posts,
  fetch_post_replies,
  fetch_posts,
} from "../../src/lib/queries";

const { get_account_posts, get_ranked_posts, get_discussion } =
  mocks.chain.api.bridge;

function post(
  permlink: string,
  category: string,
  tags: unknown = [category],
): Record<string, unknown> {
  return { author: "alice", permlink, category, json_metadata: { tags } };
}

describe("fetch_posts", () => {
  beforeEach(() => {
    get_account_posts.mockReset();
  });

  it("calls bridge.get_account_posts without a tag param", async () => {
    get_account_posts.mockResolvedValue([]);

    await fetch_posts("alice", "posts", 10, undefined, "hive");

    expect(get_account_posts).toHaveBeenCalledTimes(1);
    const params = get_account_posts.mock.calls[0][0];
    expect(params).toEqual({
      sort: "posts",
      account: "alice",
      observer: "",
      limit: 10,
    });
    expect(params).not.toHaveProperty("tag");
  });

  it("forwards the pagination cursor as start_author/start_permlink", async () => {
    get_account_posts.mockResolvedValue([]);

    await fetch_posts("alice", "blog", 5, {
      startAuthor: "alice",
      startPermlink: "p-5",
    });

    expect(get_account_posts.mock.calls[0][0]).toMatchObject({
      start_author: "alice",
      start_permlink: "p-5",
    });
  });

  it("returns all bridge posts when no tag is given", async () => {
    const page = [post("a", "hive"), post("b", "photo")];
    get_account_posts.mockResolvedValue(page);

    const result = await fetch_posts("alice", "posts", 10);

    expect(result.posts).toEqual(page);
    expect(result.has_more).toBe(false);
  });

  it("filters by category or json_metadata.tags, case-insensitively", async () => {
    get_account_posts.mockResolvedValue([
      post("a", "hive"),
      post("b", "photo", ["photo", "Hive"]),
      post("c", "photo", ["photo"]),
      post("d", "photo", "hive"),
      { author: "alice", permlink: "e", category: "HIVE", json_metadata: {} },
    ]);

    const result = await fetch_posts("alice", "posts", 5, undefined, "hive");

    expect(result.posts.map((p) => p.permlink)).toEqual(["a", "b", "e"]);
  });

  it("derives cursor and has_more from the unfiltered bridge page", async () => {
    get_account_posts.mockResolvedValue([
      post("a", "hive"),
      post("b", "photo"),
      post("c", "photo"),
    ]);

    const result = await fetch_posts("alice", "posts", 3, undefined, "hive");

    expect(result.posts.map((p) => p.permlink)).toEqual(["a"]);
    expect(result.has_more).toBe(true);
    expect(result.next_cursor).toEqual({
      startAuthor: "alice",
      startPermlink: "c",
    });
  });

  it("keeps paginating when a full bridge page has no matching posts", async () => {
    get_account_posts.mockResolvedValue([post("x", "photo"), post("y", "art")]);

    const result = await fetch_posts("alice", "posts", 2, undefined, "hive");

    expect(result.posts).toEqual([]);
    expect(result.has_more).toBe(true);
    expect(result.next_cursor?.startPermlink).toBe("y");
  });

  it("rejects on a network error instead of returning an empty page", async () => {
    get_account_posts.mockRejectedValue(new Error("network down"));

    await expect(
      fetch_posts("alice", "posts", 10, undefined, "hive"),
    ).rejects.toThrow("network down");
  });

  it("rejects on a network error for later pages too", async () => {
    get_account_posts.mockRejectedValue(new Error("network down"));

    await expect(
      fetch_posts("alice", "blog", 5, {
        startAuthor: "alice",
        startPermlink: "p5",
      }),
    ).rejects.toThrow("network down");
  });
});

describe("list fetchers surface network errors", () => {
  beforeEach(() => {
    get_account_posts.mockReset();
    get_ranked_posts.mockReset();
    get_discussion.mockReset();
  });

  it("fetch_comments rejects instead of returning no comments", async () => {
    get_account_posts.mockRejectedValue(new Error("timeout"));

    await expect(fetch_comments("alice", "comments", 10)).rejects.toThrow(
      "timeout",
    );
  });

  it("fetch_community_posts rejects instead of returning an empty feed", async () => {
    get_ranked_posts.mockRejectedValue(new Error("timeout"));

    await expect(
      fetch_community_posts("hive-1", "trending", 20),
    ).rejects.toThrow("timeout");
    await expect(
      fetch_community_posts("hive-1", "trending", 20, "bob", "p2"),
    ).rejects.toThrow("timeout");
  });

  it("fetch_post_replies rejects on a network error", async () => {
    get_discussion.mockRejectedValue(new Error("timeout"));

    await expect(fetch_post_replies("alice", "my-threads")).rejects.toThrow(
      "timeout",
    );
  });

  it("fetch_post_replies treats a missing post as an empty tree", async () => {
    get_discussion.mockRejectedValue({
      assertionData: JSON.stringify({
        extension: {
          assertion_expression: "Post alice/my-threads does not exist",
        },
      }),
    });

    await expect(fetch_post_replies("alice", "my-threads")).resolves.toEqual({
      tree: [],
      total_count: 0,
    });
  });
});
