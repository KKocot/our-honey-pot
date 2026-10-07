// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.HIVE_USERNAME = "hive-123";
  return {
    chain: { api: { bridge: { get_community: vi.fn() } } },
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

import { fetch_community } from "../../src/lib/queries";

const { get_community } = mocks.chain.api.bridge;

function hive_assertion(expression: string): { assertionData: string } {
  return {
    assertionData: JSON.stringify({
      extension: { assertion_expression: expression },
    }),
  };
}

describe("fetch_community", () => {
  beforeEach(() => {
    get_community.mockReset();
  });

  it("returns the community from bridge.get_community", async () => {
    get_community.mockResolvedValue({ name: "hive-123", title: "Hive" });
    await expect(fetch_community("hive-123")).resolves.toEqual({
      name: "hive-123",
      title: "Hive",
    });
    expect(get_community).toHaveBeenCalledWith({
      name: "hive-123",
      observer: "",
    });
  });

  it("rethrows network errors, so an outage never looks like a missing community", async () => {
    get_community.mockRejectedValue(new Error("fetch failed"));
    await expect(fetch_community("hive-123")).rejects.toThrow("fetch failed");
  });

  it("rethrows Hive assertions unrelated to a missing community", async () => {
    get_community.mockRejectedValue(hive_assertion("node is overloaded"));
    await expect(fetch_community("hive-123")).rejects.toBeDefined();
  });

  it("resolves null for a community that does not exist", async () => {
    get_community.mockRejectedValue(new Error("community not found"));
    await expect(fetch_community("hive-404")).resolves.toBeNull();
  });

  it("resolves null for a community reported by a Hive assertion as not found", async () => {
    get_community.mockRejectedValue(hive_assertion("community not found"));
    await expect(fetch_community("hive-404")).resolves.toBeNull();
  });
});
