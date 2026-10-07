// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it, vi } from "vitest";

vi.mock("@hiveio/workerbee/blog-logic", () => ({
  configureEndpoints: vi.fn(),
  getWax: vi.fn(),
  withRetry: vi.fn(),
  DataProvider: vi.fn(),
}));
vi.mock("@hiveio/wax", () => ({
  BlogPostOperation: class {},
  ReplyOperation: class {},
}));
vi.mock("../../src/lib/broadcast-chain", () => ({
  get_broadcast_chain: vi.fn(),
}));
vi.mock("../../src/lib/transaction-signer", () => ({
  sign_transaction: vi.fn(),
}));
vi.mock("../../src/components/ui", () => ({ showToast: vi.fn() }));
vi.mock("../../src/components/admin/store", () => ({
  setHasUnsavedChanges: vi.fn(),
  syncSettingsToStore: vi.fn(),
}));
vi.mock("../../src/components/admin/queries", () => ({
  flushPendingSettings: vi.fn(),
  getSettingsSnapshot: vi.fn(),
  is_community_mode: () => true,
}));

import { parse_local_settings } from "../../src/components/admin/panels/AdminPanel/handlers";

describe("parse_local_settings", () => {
  it("reports missing settings as empty", () => {
    expect(parse_local_settings(null, false)).toEqual({ kind: "empty" });
    expect(parse_local_settings("", false)).toEqual({ kind: "empty" });
  });

  it("returns invalid for malformed JSON instead of throwing", () => {
    const result = parse_local_settings("{not json", false);
    expect(result.kind).toBe("invalid");
  });

  it.each(["null", "[]", "42", '"text"'])(
    "rejects non-object JSON %s",
    (saved) => {
      expect(parse_local_settings(saved, false)).toEqual({
        kind: "invalid",
        error: "Saved settings are not a JSON object",
      });
    },
  );

  it("drops invalid fields one by one and keeps valid ones", () => {
    const result = parse_local_settings(
      JSON.stringify({
        siteName: "Mine",
        postsPerPage: 100_000,
        showAuthorProfile: "yes",
      }),
      false,
    );
    expect(result).toEqual({ kind: "ok", settings: { siteName: "Mine" } });
  });

  it("does not fill defaults for keys absent from storage", () => {
    const result = parse_local_settings(
      JSON.stringify({ siteName: "A" }),
      true,
    );
    expect(result.kind === "ok" && Object.keys(result.settings)).toEqual([
      "siteName",
    ]);
  });

  it("sanitizes instanceOverrides per key", () => {
    const result = parse_local_settings(
      JSON.stringify({
        instanceOverrides: {
          "page-sec-main:posts": { gridColumns: 3, cardGapPx: "8px" },
          "bad key": { gridColumns: 2 },
          "page-sec-top:posts": { postsPerPage: 100_000 },
        },
      }),
      false,
    );
    expect(result).toEqual({
      kind: "ok",
      settings: {
        instanceOverrides: { "page-sec-main:posts": { gridColumns: 3 } },
      },
    });
  });

  it("strips community fields outside community mode", () => {
    const saved = JSON.stringify({
      siteName: "Mine",
      community_show_rules: true,
    });
    expect(parse_local_settings(saved, false)).toEqual({
      kind: "ok",
      settings: { siteName: "Mine" },
    });
    expect(parse_local_settings(saved, true)).toEqual({
      kind: "ok",
      settings: { siteName: "Mine", community_show_rules: true },
    });
  });
});
