// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { beforeEach, describe, expect, it, vi } from "vitest";

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

import {
  CONFIRM_TIMEOUT_MS,
  execute_save,
  normalize_config,
  save_block_reason,
  wait_for_stored_config,
  type SaveDeps,
  type SaveGate,
} from "../../src/components/admin/panels/AdminPanel/handlers";
import type { StoredConfig } from "../../src/components/admin/hive-broadcast";
import {
  get_default_settings,
  type SettingsData,
} from "../../src/components/admin/types/settings";

const OWNER = "alice";
const BLOG = "hive-123456";
const ACCOUNT = {
  blog: BLOG,
  account: OWNER,
  source: "community_owner" as const,
};

const owner_gate: SaveGate = {
  config_account: OWNER,
  load_error: null,
  username: OWNER,
};

function found(settings: Partial<SettingsData>): StoredConfig {
  return {
    status: "found",
    account: ACCOUNT,
    permlink: "blog-config",
    settings,
  };
}

interface Harness {
  deps: SaveDeps;
  calls: string[];
  store: SettingsData;
  chain: { stored: StoredConfig; visible_after_reads: number; reads: number };
  slept: number[];
}

function harness(): Harness {
  const calls: string[] = [];
  const slept: number[] = [];
  const store = get_default_settings(true);
  let pending: Partial<SettingsData> | null = { siteName: "Latest edit" };
  const chain = {
    stored: { status: "missing", account: ACCOUNT } as StoredConfig,
    visible_after_reads: 2,
    reads: 0,
  };
  let written: SettingsData | null = null;

  const deps: SaveDeps = {
    flush: vi.fn(() => {
      calls.push("flush");
      if (pending) Object.assign(store, pending);
      pending = null;
    }),
    snapshot: vi.fn(() => {
      calls.push("snapshot");
      return structuredClone(store);
    }),
    broadcast: vi.fn(async (settings: SettingsData) => {
      calls.push("broadcast");
      written = structuredClone(settings);
      return { success: true, permlink: "blog-config", isUpdate: true };
    }),
    load: vi.fn(async () => {
      chain.reads += 1;
      if (written && chain.reads >= chain.visible_after_reads) {
        chain.stored = found(written);
      }
      return chain.stored;
    }),
    sleep: vi.fn(async (ms: number) => {
      slept.push(ms);
    }),
  };
  return { deps, calls, store, chain, slept };
}

describe("save gate", () => {
  it("allows only the config account", () => {
    expect(save_block_reason(owner_gate)).toBeNull();
    expect(save_block_reason({ ...owner_gate, username: "moderator" })).toBe(
      "not_owner",
    );
    expect(save_block_reason({ ...owner_gate, username: null })).toBe(
      "not_authenticated",
    );
    expect(save_block_reason({ ...owner_gate, config_account: null })).toBe(
      "no_config_account",
    );
  });

  it("blocks saving when the config could not be read, even for the owner", () => {
    expect(
      save_block_reason({ ...owner_gate, load_error: "network down" }),
    ).toBe("config_error");
  });
});

describe("execute_save", () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  it("flushes debounced edits before taking the snapshot", async () => {
    await execute_save(
      { blog: BLOG, gate: owner_gate, private_key: "" },
      h.deps,
    );
    expect(h.calls.slice(0, 3)).toEqual(["flush", "snapshot", "broadcast"]);
    const sent = vi.mocked(h.deps.broadcast).mock.calls[0][0];
    expect(sent.siteName).toBe("Latest edit");
  });

  it("reports success only after the stored config reads back equal", async () => {
    h.chain.visible_after_reads = 3;
    const outcome = await execute_save(
      { blog: BLOG, gate: owner_gate, private_key: "" },
      h.deps,
    );
    expect(outcome).toEqual({
      kind: "confirmed",
      is_update: true,
      url: "https://peakd.com/@alice/blog-config",
      edited_since_send: false,
    });
    expect(h.chain.reads).toBe(3);
  });

  it("flags edits made while waiting for confirmation", async () => {
    vi.mocked(h.deps.load).mockImplementationOnce(async () => {
      h.store.siteName = "Edited during polling";
      return h.chain.stored;
    });
    const outcome = await execute_save(
      { blog: BLOG, gate: owner_gate, private_key: "" },
      h.deps,
    );
    expect(outcome).toMatchObject({ kind: "confirmed", edited_since_send: true });
  });

  it("keeps polling while the node still serves the old config", async () => {
    h.chain.stored = found({ siteName: "Old" });
    h.chain.visible_after_reads = 2;
    const outcome = await execute_save(
      { blog: BLOG, gate: owner_gate, private_key: "" },
      h.deps,
    );
    expect(outcome.kind).toBe("confirmed");
    expect(h.chain.reads).toBe(2);
  });

  it("returns unconfirmed on timeout without reporting success", async () => {
    h.chain.visible_after_reads = Number.POSITIVE_INFINITY;
    const outcome = await execute_save(
      { blog: BLOG, gate: owner_gate, private_key: "" },
      h.deps,
    );
    expect(outcome).toEqual({ kind: "unconfirmed" });
    expect(h.slept.reduce((sum, ms) => sum + ms, 0)).toBe(CONFIRM_TIMEOUT_MS);
    expect(h.slept[1]).toBeGreaterThan(h.slept[0]);
  });

  it("refuses a user who is not the config account without broadcasting", async () => {
    const outcome = await execute_save(
      {
        blog: BLOG,
        gate: { ...owner_gate, username: "moderator" },
        private_key: "",
      },
      h.deps,
    );
    expect(outcome.kind).toBe("blocked");
    if (outcome.kind === "blocked") expect(outcome.message).toContain("@alice");
    expect(h.deps.broadcast).not.toHaveBeenCalled();
  });

  it("refuses to save while the config load is in error state", async () => {
    const outcome = await execute_save(
      {
        blog: BLOG,
        gate: { ...owner_gate, load_error: "Could not read" },
        private_key: "",
      },
      h.deps,
    );
    expect(outcome).toMatchObject({ kind: "blocked", reason: "config_error" });
    expect(h.deps.flush).not.toHaveBeenCalled();
    expect(h.deps.broadcast).not.toHaveBeenCalled();
  });

  it("returns the broadcast error without polling", async () => {
    vi.mocked(h.deps.broadcast).mockResolvedValueOnce({
      success: false,
      error: "RC",
    });
    const outcome = await execute_save(
      { blog: BLOG, gate: owner_gate, private_key: "" },
      h.deps,
    );
    expect(outcome).toEqual({ kind: "failed", error: "RC" });
    expect(h.deps.load).not.toHaveBeenCalled();
  });
});

describe("wait_for_stored_config", () => {
  it("treats read errors as not yet confirmed", async () => {
    const expected = get_default_settings(true);
    const load = vi
      .fn<(blog: string) => Promise<StoredConfig>>()
      .mockRejectedValueOnce(new Error("node down"))
      .mockResolvedValueOnce(found(expected));
    const ok = await wait_for_stored_config(BLOG, expected, {
      load,
      sleep: async () => {},
    });
    expect(ok).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("compares configs ignoring key order", () => {
    expect(normalize_config({ siteName: "A", gridColumns: 2 })).toBe(
      normalize_config({ gridColumns: 2, siteName: "A" }),
    );
    expect(normalize_config({ siteName: "A" })).not.toBe(
      normalize_config({ siteName: "B" }),
    );
  });
});
