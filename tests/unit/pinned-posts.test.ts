// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it, vi } from "vitest";
import {
  merge_pinned_posts,
  parse_pinned_entry,
  resolve_pinned_posts,
} from "../../src/lib/pinned-posts";
import { PINNED_POST_ENTRY_REGEX } from "../../src/components/admin/types/settings";

describe("pinned posts", () => {
  const post = (author: string, permlink: string) => ({ author, permlink });

  it("merge puts pinned first without duplicates", () => {
    const ranked = [post("a", "one"), post("b", "two"), post("c", "three")];
    const merged = merge_pinned_posts(
      [post("b", "two"), post("x", "pin")],
      ranked,
    );
    expect(merged.map((p) => `${p.author}/${p.permlink}`)).toEqual([
      "b/two",
      "x/pin",
      "a/one",
      "c/three",
    ]);
  });

  it("merge with empty pinned returns ranked unchanged", () => {
    const ranked = [post("a", "one")];
    expect(merge_pinned_posts([], ranked)).toEqual(ranked);
  });

  it("resolve returns empty for missing or empty permlinks without fetching", async () => {
    const fetch_post = vi.fn();
    expect(
      await resolve_pinned_posts("hive-1", undefined, [], fetch_post),
    ).toEqual([]);
    expect(await resolve_pinned_posts("hive-1", [], [], fetch_post)).toEqual(
      [],
    );
    expect(
      await resolve_pinned_posts("hive-1", ["", "  "], [], fetch_post),
    ).toEqual([]);
    expect(fetch_post).not.toHaveBeenCalled();
  });

  it("resolve reuses ranked posts and fetches the rest as community/permlink", async () => {
    const ranked = [post("hive-1", "in-feed")];
    const fetch_post = vi.fn(async (author: string, permlink: string) =>
      post(author, permlink),
    );
    const result = await resolve_pinned_posts(
      "hive-1",
      ["in-feed", "older"],
      ranked,
      fetch_post,
    );
    expect(result).toEqual([
      post("hive-1", "in-feed"),
      post("hive-1", "older"),
    ]);
    expect(fetch_post).toHaveBeenCalledTimes(1);
    expect(fetch_post).toHaveBeenCalledWith("hive-1", "older");
  });

  it("resolve ignores posts by other authors that reuse a pinned permlink", async () => {
    const ranked = [post("alice", "same"), post("hive-1", "same")];
    expect(
      await resolve_pinned_posts("hive-1", ["same"], ranked, vi.fn()),
    ).toEqual([post("hive-1", "same")]);

    const fetch_post = vi.fn(async () => null);
    expect(
      await resolve_pinned_posts(
        "hive-1",
        ["same"],
        [post("alice", "same")],
        fetch_post,
      ),
    ).toEqual([]);
    expect(fetch_post).toHaveBeenCalledWith("hive-1", "same");
  });

  it("resolve drops a fetched post whose author is not the community", async () => {
    const fetch_post = vi.fn(async () => post("alice", "same"));
    expect(
      await resolve_pinned_posts("hive-1", ["same"], [], fetch_post),
    ).toEqual([]);
  });

  it("resolve skips missing posts and network errors, keeps order, dedupes", async () => {
    const fetch_post = vi.fn(async (author: string, permlink: string) => {
      if (permlink === "missing") return null;
      if (permlink === "boom") throw new Error("network down");
      return post(author, permlink);
    });
    const result = await resolve_pinned_posts(
      "hive-1",
      ["first", "missing", "boom", "first", "last"],
      [],
      fetch_post,
    );
    expect(result).toEqual([post("hive-1", "first"), post("hive-1", "last")]);
  });

  it("resolves author/permlink entries to that author, not the community", async () => {
    const ranked = [post("alice", "shared"), post("hive-1", "shared")];
    const fetch_post = vi.fn(async (author: string, permlink: string) =>
      post(author, permlink),
    );
    const result = await resolve_pinned_posts(
      "hive-1",
      ["alice/shared", "bob/older", "@carol/third"],
      ranked,
      fetch_post,
    );
    expect(result).toEqual([
      post("alice", "shared"),
      post("bob", "older"),
      post("carol", "third"),
    ]);
    expect(fetch_post.mock.calls).toEqual([
      ["bob", "older"],
      ["carol", "third"],
    ]);
  });
});

describe("parse_pinned_entry", () => {
  it("splits author/permlink and keeps a bare permlink without author", () => {
    expect(parse_pinned_entry("alice/my-post")).toEqual({
      author: "alice",
      permlink: "my-post",
    });
    expect(parse_pinned_entry(" my-post ")).toEqual({
      author: null,
      permlink: "my-post",
    });
  });

  it("rejects entries with an empty part", () => {
    expect(parse_pinned_entry("alice/")).toBeNull();
    expect(parse_pinned_entry("/my-post")).toBeNull();
    expect(parse_pinned_entry("")).toBeNull();
  });
});

describe("PINNED_POST_ENTRY_REGEX", () => {
  it("accepts permlink and author/permlink, rejects paths and uppercase", () => {
    expect(PINNED_POST_ENTRY_REGEX.test("my-post")).toBe(true);
    expect(PINNED_POST_ENTRY_REGEX.test("alice.b/my-post")).toBe(true);
    expect(PINNED_POST_ENTRY_REGEX.test("a/b/c")).toBe(false);
    expect(PINNED_POST_ENTRY_REGEX.test("Alice/post")).toBe(false);
  });
});
