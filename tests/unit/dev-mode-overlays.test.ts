// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list_community_roles: vi.fn(),
  get_ranked_posts: vi.fn(),
  broadcast: vi.fn(async () => undefined),
  push_operation: vi.fn(),
  sign: vi.fn(async () => undefined),
  user: { username: "alice", privateKey: "unused" } as {
    username: string;
    privateKey: string;
  } | null,
}));

vi.mock("@hiveio/workerbee/blog-logic", () => {
  const chain = {
    api: {
      bridge: {
        list_community_roles: mocks.list_community_roles,
        get_ranked_posts: mocks.get_ranked_posts,
      },
    },
  };
  return {
    configureEndpoints: vi.fn(),
    getWax: vi.fn(async () => chain),
    withRetry: vi.fn((fn: (c: unknown) => Promise<unknown>) => fn(chain)),
  };
});
vi.mock("../../src/components/auth/auth-store", () => ({
  currentUser: () => mocks.user,
}));
vi.mock("../../src/lib/transaction-signer", () => ({
  sign_transaction: mocks.sign,
}));
vi.mock("../../src/lib/broadcast-chain", () => ({
  get_broadcast_chain: async () => ({
    createTransaction: async () => ({ pushOperation: mocks.push_operation }),
    broadcast: mocks.broadcast,
  }),
}));

import {
  broadcast_mute_post,
  broadcast_pin_post,
  broadcast_unmute_post,
  broadcast_unpin_post,
} from "../../src/components/admin/community-broadcast";
import {
  apply_dev_moderation_overlay,
  fetch_community_posts,
  record_dev_moderation,
} from "../../src/lib/queries";
import {
  clear_config_account_cache,
  get_blog_role,
  is_dev_role_allowed,
  get_community_roles,
  resolve_config_account,
  set_dev_role_override,
} from "../../src/lib/config-account";
import { DEV_KEYS } from "../../src/lib/dev-mode";
import type { BridgePost } from "@hiveio/workerbee/blog-logic";

const COMMUNITY = "hive-123456";

const ROLES = [
  [COMMUNITY, "owner", ""],
  ["boss", "admin", ""],
  ["eve", "member", "Fan"],
];

function memory_storage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, String(value));
    },
  };
}

function stub_host(hostname: string) {
  vi.stubGlobal("window", { location: { hostname } });
}

function enable_dev() {
  stub_host("localhost");
  localStorage.setItem("ohp-dev:enabled", "1");
}

function make_post(author: string, permlink: string): BridgePost {
  return {
    author,
    permlink,
    author_role: "guest",
    stats: { gray: false, hide: false, is_pinned: false },
  } as unknown as BridgePost;
}

function stored_moderation(): unknown {
  const raw = localStorage.getItem(DEV_KEYS.moderation);
  return raw === null ? null : JSON.parse(raw);
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memory_storage());
  mocks.list_community_roles.mockReset().mockResolvedValue(ROLES);
  mocks.get_ranked_posts.mockReset();
  mocks.broadcast.mockClear();
  clear_config_account_cache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dev moderation state", () => {
  it("pin and mute broadcasts record the state per community and post", async () => {
    enable_dev();
    await expect(
      broadcast_pin_post(COMMUNITY, "alice", "bob", "p1"),
    ).resolves.toEqual({ success: true });
    await broadcast_mute_post(COMMUNITY, "alice", "bob", "p1", "spam");
    await broadcast_mute_post("hive-999", "alice", "carol", "p2", "spam");
    expect(stored_moderation()).toEqual({
      [COMMUNITY]: { "bob/p1": { pinned: true, muted: true } },
      "hive-999": { "carol/p2": { muted: true } },
    });

    await broadcast_unpin_post(COMMUNITY, "alice", "bob", "p1");
    expect(stored_moderation()).toMatchObject({
      [COMMUNITY]: { "bob/p1": { muted: true } },
    });
    await broadcast_unmute_post(COMMUNITY, "alice", "bob", "p1", "ok");
    expect(stored_moderation()).toEqual({
      [COMMUNITY]: {},
      "hive-999": { "carol/p2": { muted: true } },
    });
  });

  it("records nothing without the dev flag", async () => {
    stub_host("localhost");
    await expect(
      broadcast_pin_post(COMMUNITY, "alice", "bob", "p1"),
    ).resolves.toEqual({ success: true });
    expect(stored_moderation()).toBeNull();
    expect(
      record_dev_moderation({
        type: "pin",
        community: COMMUNITY,
        author: "bob",
        permlink: "p1",
      }),
    ).toBe(false);
  });

  it("does not record a failed broadcast", async () => {
    enable_dev();
    mocks.user = null;
    const result = await broadcast_pin_post(COMMUNITY, "alice", "bob", "p1");
    mocks.user = { username: "alice", privateKey: "unused" };
    expect(result.success).toBe(false);
    expect(stored_moderation()).toBeNull();
  });
});

describe("apply_dev_moderation_overlay", () => {
  it("marks muted and pinned posts on clones without mutating the input", () => {
    enable_dev();
    record_dev_moderation({
      type: "mute",
      community: COMMUNITY,
      author: "bob",
      permlink: "p1",
    });
    record_dev_moderation({
      type: "pin",
      community: COMMUNITY,
      author: "bob",
      permlink: "p2",
    });
    const posts = [
      make_post("bob", "p1"),
      make_post("bob", "p2"),
      make_post("bob", "p3"),
    ];
    const snapshot = structuredClone(posts);

    const result = apply_dev_moderation_overlay(COMMUNITY, posts);

    expect(posts).toEqual(snapshot);
    expect(result[0]).not.toBe(posts[0]);
    expect(result[0].author_role).toBe("muted");
    expect(result[0].stats.gray).toBe(true);
    expect(result[1].stats.is_pinned).toBe(true);
    expect(result[2]).toBe(posts[2]);
  });

  it("unmute and unpin drop the local state, so chain values show through", () => {
    enable_dev();
    record_dev_moderation({
      type: "mute",
      community: COMMUNITY,
      author: "bob",
      permlink: "p1",
    });
    record_dev_moderation({
      type: "unmute",
      community: COMMUNITY,
      author: "bob",
      permlink: "p1",
    });
    record_dev_moderation({
      type: "unpin",
      community: COMMUNITY,
      author: "bob",
      permlink: "p1",
    });
    const muted = {
      ...make_post("bob", "p1"),
      author_role: "muted",
      stats: { gray: true, hide: false, is_pinned: true },
    } as unknown as BridgePost;

    const plain = make_post("bob", "p1");

    const [chain_muted] = apply_dev_moderation_overlay(COMMUNITY, [muted]);
    const [chain_plain] = apply_dev_moderation_overlay(COMMUNITY, [plain]);

    expect(chain_muted).toBe(muted);
    expect(chain_muted.author_role).toBe("muted");
    expect(chain_muted.stats).toEqual({
      gray: true,
      hide: false,
      is_pinned: true,
    });
    expect(chain_plain).toBe(plain);
    expect(stored_moderation()).toEqual({ [COMMUNITY]: {} });
  });

  it("ignores other communities, malformed JSON and missing dev mode", () => {
    const posts = [make_post("bob", "p1")];
    enable_dev();
    record_dev_moderation({
      type: "mute",
      community: "hive-999",
      author: "bob",
      permlink: "p1",
    });
    expect(apply_dev_moderation_overlay(COMMUNITY, posts)).toBe(posts);

    localStorage.setItem(DEV_KEYS.moderation, "{not json");
    expect(apply_dev_moderation_overlay(COMMUNITY, posts)).toBe(posts);

    record_dev_moderation({
      type: "mute",
      community: COMMUNITY,
      author: "bob",
      permlink: "p1",
    });
    localStorage.removeItem("ohp-dev:enabled");
    expect(apply_dev_moderation_overlay(COMMUNITY, posts)).toBe(posts);
  });

  it("is skipped without window (SSR)", () => {
    localStorage.setItem("ohp-dev:enabled", "1");
    localStorage.setItem(
      DEV_KEYS.moderation,
      JSON.stringify({ [COMMUNITY]: { "bob/p1": { muted: true } } }),
    );
    const posts = [make_post("bob", "p1")];
    expect(apply_dev_moderation_overlay(COMMUNITY, posts)).toBe(posts);
  });

  it("fetch_community_posts returns overlaid posts", async () => {
    enable_dev();
    record_dev_moderation({
      type: "pin",
      community: COMMUNITY,
      author: "bob",
      permlink: "p1",
    });
    const ranked = [make_post("bob", "p1")];
    mocks.get_ranked_posts.mockResolvedValueOnce(ranked);

    const result = await fetch_community_posts(COMMUNITY, "created", 20);

    expect(result.posts[0].stats.is_pinned).toBe(true);
    expect(ranked[0].stats.is_pinned).toBe(false);
  });
});

describe("dev role override", () => {
  it("overrides the role only for the matching username in dev mode", async () => {
    enable_dev();
    expect(set_dev_role_override({ username: "eve", role: "mod" })).toBe(true);
    await expect(get_blog_role(COMMUNITY, "eve")).resolves.toBe("mod");
    await expect(get_blog_role(COMMUNITY, "boss")).resolves.toBe("admin");
    await expect(get_blog_role("eve", "eve")).resolves.toBe("mod");
    await expect(get_blog_role("someone", "boss")).resolves.toBe("none");
  });

  it("owner override makes the account the community config account without touching the cache", async () => {
    enable_dev();
    await get_community_roles(COMMUNITY);
    set_dev_role_override({ username: "eve", role: "owner" });

    await expect(get_blog_role(COMMUNITY, "eve")).resolves.toBe("owner");
    await expect(resolve_config_account(COMMUNITY)).resolves.toMatchObject({
      account: "eve",
    });

    localStorage.removeItem("ohp-dev:enabled");
    const roles = await get_community_roles(COMMUNITY);
    expect(roles.find((r) => r.account === "eve")?.role).toBe("member");
    await expect(resolve_config_account(COMMUNITY)).resolves.toMatchObject({
      account: COMMUNITY,
    });
  });

  it("ignores an owner override for another account on a personal blog", async () => {
    enable_dev();
    set_dev_role_override({ username: "eve", role: "owner" });
    await expect(get_blog_role("someone", "eve")).resolves.toBe("none");
    await expect(get_blog_role(COMMUNITY, "eve")).resolves.toBe("owner");

    set_dev_role_override({ username: "someone", role: "owner" });
    await expect(get_blog_role("someone", "someone")).resolves.toBe("owner");
  });

  it("is_dev_role_allowed limits owner to the personal blog account", () => {
    expect(
      is_dev_role_allowed("Alice", { username: "alice", role: "owner" }),
    ).toBe(true);
    expect(
      is_dev_role_allowed("alice", { username: "eve", role: "owner" }),
    ).toBe(false);
    expect(
      is_dev_role_allowed("alice", { username: "eve", role: "admin" }),
    ).toBe(true);
    expect(
      is_dev_role_allowed(COMMUNITY, { username: "eve", role: "owner" }),
    ).toBe(true);
  });

  it("none drops the community role", async () => {
    enable_dev();
    set_dev_role_override({ username: "boss", role: "none" });
    await expect(get_blog_role(COMMUNITY, "boss")).resolves.toBe("none");
    set_dev_role_override(null);
    await expect(get_blog_role(COMMUNITY, "boss")).resolves.toBe("admin");
  });

  it("keeps production behaviour without the dev flag or on a remote host", async () => {
    localStorage.setItem(
      DEV_KEYS.role,
      JSON.stringify({ username: "eve", role: "owner" }),
    );
    stub_host("localhost");
    await expect(get_blog_role(COMMUNITY, "eve")).resolves.toBe("none");

    stub_host("blog.example.com");
    localStorage.setItem("ohp-dev:enabled", "1");
    expect(set_dev_role_override({ username: "eve", role: "owner" })).toBe(
      false,
    );
    await expect(get_blog_role(COMMUNITY, "eve")).resolves.toBe("none");
  });

  it("ignores a malformed override", async () => {
    enable_dev();
    localStorage.setItem(
      DEV_KEYS.role,
      JSON.stringify({ username: "eve", role: "member" }),
    );
    await expect(get_blog_role(COMMUNITY, "eve")).resolves.toBe("none");
    localStorage.setItem(DEV_KEYS.role, "{oops");
    await expect(get_blog_role(COMMUNITY, "eve")).resolves.toBe("none");
  });
});
