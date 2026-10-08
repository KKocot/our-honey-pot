// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const showToast = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
  account: "alice" as string | null,
  snapshot: {} as Record<string, unknown>,
}));

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
vi.mock("../../src/components/ui", () => ({ showToast }));
vi.mock("../../src/components/admin/store", () => ({
  setHasUnsavedChanges: vi.fn(),
  syncSettingsToStore: vi.fn(),
}));
vi.mock("../../src/components/admin/queries", () => ({
  flushPendingSettings: vi.fn(),
  getSettingsSnapshot: () => structuredClone(state.snapshot),
  is_community_mode: () => true,
  configSource: () => ({ account: state.account, error: null }),
}));

import {
  LEGACY_LOCAL_BACKUP_KEY,
  build_local_backup,
  handle_clear_local_storage,
  handle_load_local_storage,
  handle_save_local_storage,
  local_backup_key,
  parse_local_settings,
} from "../../src/components/admin/panels/AdminPanel/handlers";

const backup = (settings: Record<string, unknown>, blog = "alice") =>
  JSON.stringify({ blog, settings });

describe("parse_local_settings", () => {
  it("reports missing settings as empty", () => {
    expect(parse_local_settings(null, false, "alice")).toEqual({
      kind: "empty",
    });
    expect(parse_local_settings("", false, "alice")).toEqual({ kind: "empty" });
  });

  it("returns invalid for malformed JSON instead of throwing", () => {
    const result = parse_local_settings("{not json", false, "alice");
    expect(result.kind).toBe("invalid");
  });

  it.each(["null", "[]", "42", '"text"'])(
    "rejects non-object JSON %s",
    (saved) => {
      expect(parse_local_settings(saved, false, "alice")).toEqual({
        kind: "invalid",
        error: "Saved settings are not a JSON object",
      });
    },
  );

  it("drops invalid fields one by one and keeps valid ones", () => {
    const result = parse_local_settings(
      backup({
        siteName: "Mine",
        postsPerPage: 100_000,
        showAuthorProfile: "yes",
      }),
      false,
      "alice",
    );
    expect(result).toEqual({
      kind: "ok",
      settings: { siteName: "Mine" },
      ignored: [],
    });
  });

  it("does not fill defaults for keys absent from storage", () => {
    const result = parse_local_settings(
      backup({ siteName: "A" }),
      true,
      "alice",
    );
    expect(result.kind === "ok" && Object.keys(result.settings)).toEqual([
      "siteName",
    ]);
  });

  it("sanitizes instanceOverrides per key", () => {
    const result = parse_local_settings(
      backup({
        instanceOverrides: {
          "page-sec-main:posts": { gridColumns: 3, cardGapPx: "8px" },
          "bad key": { gridColumns: 2 },
          "page-sec-top:posts": { postsPerPage: 100_000 },
        },
      }),
      false,
      "alice",
    );
    expect(result).toEqual({
      kind: "ok",
      settings: {
        instanceOverrides: { "page-sec-main:posts": { gridColumns: 3 } },
      },
      ignored: [],
    });
  });

  it("strips community fields outside community mode", () => {
    const saved = backup({
      siteName: "Mine",
      community_show_rules: true,
    });
    expect(parse_local_settings(saved, false, "alice")).toEqual({
      kind: "ok",
      settings: { siteName: "Mine" },
      ignored: [],
    });
    expect(parse_local_settings(saved, true, "alice")).toEqual({
      kind: "ok",
      settings: { siteName: "Mine", community_show_rules: true },
      ignored: [],
    });
  });
});

describe("local backup isolation per blog", () => {
  it.each([[{ bg: "#fff" }], [{ bg: "red;}" }], ["#ffffff"], [42]])(
    "drops an invalid customColors palette %j from a backup",
    (customColors) => {
      const result = parse_local_settings(
        backup({ siteName: "Mine", customColors }),
        false,
        "alice",
      );
      expect(result.kind === "ok" && result.settings).toEqual({
        siteName: "Mine",
      });
    },
  );

  it("treats a backup of another blog as foreign", () => {
    expect(
      parse_local_settings(backup({ siteName: "Bob" }, "bob"), true, "alice"),
    ).toEqual({ kind: "foreign", owner: "bob" });
  });

  it("drops identity fields and reports them as ignored", () => {
    const result = parse_local_settings(
      backup({
        siteName: "Mine",
        hiveUsername: "mallory",
        pinnedPostPermlinks: ["x"],
      }),
      true,
      "alice",
    );
    expect(result).toEqual({
      kind: "ok",
      settings: { siteName: "Mine" },
      ignored: ["hiveUsername", "pinnedPostPermlinks"],
    });
  });

  it("rejects unknown keys", () => {
    const result = parse_local_settings(
      '{"blog":"alice","settings":{"siteName":"Mine","evilField":1,"__proto__":{"x":1}}}',
      true,
      "alice",
    );
    expect(result).toEqual({
      kind: "ok",
      settings: { siteName: "Mine" },
      ignored: ["evilField", "__proto__"],
    });
  });

  it("accepts a legacy backup only when its hiveUsername matches the blog", () => {
    const legacy = JSON.stringify({ hiveUsername: "Alice", siteName: "Old" });
    expect(parse_local_settings(legacy, true, "alice")).toEqual({
      kind: "ok",
      settings: { siteName: "Old" },
      ignored: ["hiveUsername"],
    });
    expect(parse_local_settings(legacy, true, "bob")).toEqual({
      kind: "foreign",
      owner: "alice",
    });
    expect(
      parse_local_settings(JSON.stringify({ siteName: "Old" }), true, "alice"),
    ).toEqual({ kind: "foreign", owner: null });
  });

  it("never stores identity or unknown keys in a backup", () => {
    const saved = JSON.parse(
      build_local_backup(
        {
          siteName: "S",
          hiveUsername: "alice",
          pinnedPostPermlinks: [],
          junk: 1,
        },
        "Alice",
      ),
    );
    expect(saved).toEqual({ blog: "alice", settings: { siteName: "S" } });
  });
});

describe("local backup handlers", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
    state.account = "alice";
    state.snapshot = { hiveUsername: "alice", siteName: "Alice blog" };
    showToast.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves under a per-blog key", () => {
    handle_save_local_storage();
    expect([...store.keys()]).toEqual([local_backup_key("alice")]);
    expect(showToast).toHaveBeenLastCalledWith(expect.any(String), "success");
  });

  it("reports a storage failure on save explicitly", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    handle_save_local_storage();
    expect(showToast).toHaveBeenLastCalledWith(
      "Failed to save local backup: QuotaExceededError",
      "error",
    );
  });

  it("refuses to save when the blog is unknown", () => {
    state.account = null;
    state.snapshot = { hiveUsername: "" };
    handle_save_local_storage();
    expect(store.size).toBe(0);
    expect(showToast).toHaveBeenLastCalledWith(
      expect.stringContaining("unknown"),
      "error",
    );
  });

  it("does not load another blog's backup", () => {
    store.set(local_backup_key("alice"), backup({ siteName: "Bob" }, "bob"));
    const apply = vi.fn();
    handle_load_local_storage(apply);
    expect(apply).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenLastCalledWith(
      expect.stringContaining("@bob"),
      "error",
    );
  });

  it("keeps blogs separate in one browser", () => {
    handle_save_local_storage();
    state.account = "bob";
    state.snapshot = { hiveUsername: "bob", siteName: "Bob blog" };
    handle_save_local_storage();
    state.account = "alice";
    const apply = vi.fn();
    handle_load_local_storage(apply);
    expect(apply).toHaveBeenCalledWith(
      { siteName: "Alice blog" },
      "Loaded local backup",
    );
  });

  it("ignores a foreign legacy backup and leaves it in place", () => {
    store.set(
      LEGACY_LOCAL_BACKUP_KEY,
      JSON.stringify({ hiveUsername: "bob", siteName: "B" }),
    );
    const apply = vi.fn();
    handle_load_local_storage(apply);
    expect(apply).not.toHaveBeenCalled();
    expect(store.has(LEGACY_LOCAL_BACKUP_KEY)).toBe(true);
    expect(showToast).toHaveBeenLastCalledWith(
      expect.stringContaining("@bob"),
      "error",
    );
  });

  it("loads and migrates an own legacy backup without identity fields", () => {
    store.set(
      LEGACY_LOCAL_BACKUP_KEY,
      JSON.stringify({
        hiveUsername: "alice",
        pinnedPostPermlinks: ["p"],
        siteName: "Old",
      }),
    );
    const apply = vi.fn();
    handle_load_local_storage(apply);
    expect(apply).toHaveBeenCalledWith(
      { siteName: "Old" },
      "Loaded local backup",
    );
    expect(store.has(LEGACY_LOCAL_BACKUP_KEY)).toBe(false);
    expect(JSON.parse(store.get(local_backup_key("alice")) ?? "null")).toEqual({
      blog: "alice",
      settings: { siteName: "Old" },
    });
  });

  it("clears only the current blog's backup", () => {
    store.set(local_backup_key("alice"), backup({ siteName: "A" }));
    store.set(local_backup_key("bob"), backup({ siteName: "B" }, "bob"));
    store.set(LEGACY_LOCAL_BACKUP_KEY, JSON.stringify({ hiveUsername: "bob" }));
    handle_clear_local_storage();
    expect([...store.keys()].sort()).toEqual(
      [LEGACY_LOCAL_BACKUP_KEY, local_backup_key("bob")].sort(),
    );
  });
});
