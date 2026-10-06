// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list_community_roles: vi.fn(),
}));

vi.mock("@hiveio/workerbee/blog-logic", () => {
  const chain = {
    api: { bridge: { list_community_roles: mocks.list_community_roles } },
  };
  return {
    configureEndpoints: vi.fn(),
    getWax: vi.fn(async () => chain),
    withRetry: vi.fn((fn: (c: unknown) => Promise<unknown>) => fn(chain)),
  };
});

import {
  clear_config_account_cache,
  ConfigAccountError,
  CONFIG_ACCOUNT_CACHE_TTL_MS,
  get_blog_role,
  resolve_config_account,
} from "../../src/lib/config-account";

const ROLES = [
  ["hive-123456", "owner", ""],
  ["boss", "admin", ""],
  ["helper", "mod", ""],
  ["fan", "member", ""],
];

beforeEach(() => {
  mocks.list_community_roles.mockReset();
  clear_config_account_cache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("resolve_config_account", () => {
  it("uses HIVE_USERNAME for a personal blog without calling hivemind", async () => {
    await expect(resolve_config_account("alice")).resolves.toEqual({
      blog: "alice",
      account: "alice",
      source: "personal",
    });
    expect(mocks.list_community_roles).not.toHaveBeenCalled();
  });

  it("uses the owner role for a community", async () => {
    mocks.list_community_roles.mockResolvedValueOnce([
      ["boss", "admin", ""],
      ["founder", "owner", ""],
    ]);
    await expect(resolve_config_account("hive-123456")).resolves.toEqual({
      blog: "hive-123456",
      account: "founder",
      source: "community_owner",
    });
  });

  it("throws no_owner when the community has no owner", async () => {
    mocks.list_community_roles.mockResolvedValueOnce([["boss", "admin", ""]]);
    await expect(resolve_config_account("hive-123456")).rejects.toMatchObject({
      code: "no_owner",
    });
  });

  it("throws network instead of falling back when hivemind fails", async () => {
    mocks.list_community_roles.mockRejectedValueOnce(new Error("fetch failed"));
    const error = await resolve_config_account("hive-123456").catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ConfigAccountError);
    expect(error).toMatchObject({ code: "network" });
  });

  it("maps an unknown community to community_not_found", async () => {
    mocks.list_community_roles.mockRejectedValueOnce(
      Object.assign(new Error("Assert Exception"), {
        assertionData: JSON.stringify({
          extension: {
            assertion_expression: "given community name is not valid",
          },
        }),
      }),
    );
    await expect(resolve_config_account("hive-123456")).rejects.toMatchObject({
      code: "community_not_found",
    });
  });

  it("throws no_blog for an empty HIVE_USERNAME", async () => {
    await expect(resolve_config_account("")).rejects.toMatchObject({
      code: "no_blog",
    });
  });
});

describe("roles cache", () => {
  it("serves cached roles within the TTL and refetches after it (owner change)", async () => {
    vi.useFakeTimers();
    mocks.list_community_roles
      .mockResolvedValueOnce([["old-owner", "owner", ""]])
      .mockResolvedValueOnce([["new-owner", "owner", ""]]);

    expect((await resolve_config_account("hive-123456")).account).toBe(
      "old-owner",
    );
    vi.advanceTimersByTime(CONFIG_ACCOUNT_CACHE_TTL_MS - 1);
    expect((await resolve_config_account("hive-123456")).account).toBe(
      "old-owner",
    );
    expect(mocks.list_community_roles).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2);
    expect((await resolve_config_account("hive-123456")).account).toBe(
      "new-owner",
    );
    expect(mocks.list_community_roles).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight request between concurrent callers", async () => {
    mocks.list_community_roles.mockResolvedValueOnce(ROLES);
    const results = await Promise.all([
      resolve_config_account("hive-123456"),
      resolve_config_account("hive-123456"),
      get_blog_role("hive-123456", "boss"),
    ]);
    expect(results[0].account).toBe("hive-123456");
    expect(results[2]).toBe("admin");
    expect(mocks.list_community_roles).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    mocks.list_community_roles
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce(ROLES);
    await expect(resolve_config_account("hive-123456")).rejects.toBeInstanceOf(
      ConfigAccountError,
    );
    await expect(resolve_config_account("hive-123456")).resolves.toMatchObject({
      account: "hive-123456",
    });
  });
});

describe("get_blog_role", () => {
  it("maps community roles to owner/admin/mod/none", async () => {
    mocks.list_community_roles.mockResolvedValue(ROLES);
    expect(await get_blog_role("hive-123456", "hive-123456")).toBe("owner");
    expect(await get_blog_role("hive-123456", "boss")).toBe("admin");
    expect(await get_blog_role("hive-123456", "helper")).toBe("mod");
    expect(await get_blog_role("hive-123456", "fan")).toBe("none");
    expect(await get_blog_role("hive-123456", "stranger")).toBe("none");
    expect(await get_blog_role("hive-123456", null)).toBe("none");
  });

  it("personal blog: only the blog account is owner", async () => {
    expect(await get_blog_role("alice", "alice")).toBe("owner");
    expect(await get_blog_role("alice", "bob")).toBe("none");
    expect(mocks.list_community_roles).not.toHaveBeenCalled();
  });
});
