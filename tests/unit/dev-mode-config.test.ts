// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.HIVE_USERNAME = "alice";
  const chain = {
    api: {
      bridge: {
        get_post: vi.fn(),
        list_community_roles: vi.fn(),
      },
    },
  };
  const tx = { id: "tx-1", pushOperation: vi.fn() };
  return {
    chain,
    tx,
    broadcast: vi.fn(),
    sign: vi.fn(),
    get_broadcast_chain: vi.fn(),
    push_dev_config: vi.fn(async () => undefined),
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
vi.mock("@hiveio/wax", () => ({
  BlogPostOperation: class {
    constructor(readonly data: Record<string, unknown>) {}
  },
  ReplyOperation: class {
    constructor(readonly data: Record<string, unknown>) {}
  },
}));
vi.mock("../../src/lib/broadcast-chain", () => ({
  get_broadcast_chain: mocks.get_broadcast_chain,
}));
vi.mock("../../src/lib/transaction-signer", () => ({
  sign_transaction: mocks.sign,
}));
vi.mock("../../src/lib/dev-config-store", async (import_original) => ({
  ...(await import_original<typeof import("../../src/lib/dev-config-store")>()),
  push_dev_config: mocks.push_dev_config,
}));
vi.mock("../../src/components/ui", () => ({ showToast: vi.fn() }));
vi.mock("../../src/components/admin/store", () => ({
  setHasUnsavedChanges: vi.fn(),
}));
vi.mock("../../src/components/admin/queries", () => ({
  flushPendingSettings: vi.fn(),
  getSettingsSnapshot: vi.fn(),
  configSource: vi.fn(),
  is_community_mode: () => true,
}));

import {
  broadcastConfigToHive,
  build_config_body,
  CONFIG_PERMLINK,
  load_stored_config,
  read_dev_config,
} from "../../src/components/admin/hive-broadcast";
import {
  execute_save,
  handle_broadcast_to_hive,
  normalize_config,
} from "../../src/components/admin/panels/AdminPanel/handlers";
import { showToast } from "../../src/components/ui";
import { getSettingsSnapshot } from "../../src/components/admin/queries";
import { clear_config_account_cache } from "../../src/lib/config-account";
import {
  get_default_settings,
  type SettingsData,
} from "../../src/components/admin/types/settings";

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

function settings_with(overrides: Partial<SettingsData>): SettingsData {
  return { ...structuredClone(get_default_settings(true)), ...overrides };
}

function enable_dev_mode() {
  stub_host("localhost");
  localStorage.setItem("ohp-dev:enabled", "1");
}

function network_calls(): number {
  return (
    mocks.chain.api.bridge.get_post.mock.calls.length +
    mocks.chain.api.bridge.list_community_roles.mock.calls.length +
    mocks.get_broadcast_chain.mock.calls.length +
    mocks.sign.mock.calls.length
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  clear_config_account_cache();
  vi.stubGlobal("localStorage", memory_storage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dev mode config save", () => {
  it("stores the config locally without touching the network", async () => {
    enable_dev_mode();
    const settings = settings_with({ siteName: "Local blog" });
    const result = await broadcastConfigToHive(settings, "alice", "key");

    expect(result).toMatchObject({
      success: true,
      permlink: CONFIG_PERMLINK,
      isUpdate: false,
    });
    expect(result.txId).toMatch(/^dev-\d+$/);
    expect(network_calls()).toBe(0);
    const stored = JSON.parse(
      localStorage.getItem("ohp-dev:config:alice") ?? "null",
    );
    expect(stored).toMatchObject({ blog: "alice", account: "alice" });
    expect(typeof stored.saved_at).toBe("string");

    const again = await broadcastConfigToHive(settings, "alice", "key");
    expect(again.isUpdate).toBe(true);
  });

  it("pushes the read-back entry to the dev server", async () => {
    enable_dev_mode();
    await broadcastConfigToHive(
      settings_with({ siteName: "Local blog" }),
      "alice",
      "key",
    );
    expect(mocks.push_dev_config).toHaveBeenCalledTimes(1);
    expect(mocks.push_dev_config).toHaveBeenCalledWith(
      "alice",
      read_dev_config("alice"),
    );
  });

  it("enforces the same 64 KiB limit as the chain", async () => {
    enable_dev_mode();
    const settings = settings_with({ siteDescription: "x".repeat(70 * 1024) });
    const result = await broadcastConfigToHive(settings, "alice", "key");
    expect(result.success).toBe(false);
    expect(result.error).toContain("too large");
    expect(localStorage.getItem("ohp-dev:config:alice")).toBeNull();
    expect(mocks.push_dev_config).not.toHaveBeenCalled();
  });
});

describe("dev mode config read", () => {
  it("returns the local config so a dev save confirms on the first read", async () => {
    enable_dev_mode();
    const settings = settings_with({ siteName: "Local blog" });
    await broadcastConfigToHive(settings, "alice", "key");

    const stored = await load_stored_config("alice");
    expect(stored.status).toBe("found");
    expect(stored.account).toMatchObject({ blog: "alice", account: "alice" });
    if (stored.status === "found") {
      expect(normalize_config(stored.settings)).toBe(
        normalize_config(settings),
      );
    }
    expect(mocks.chain.api.bridge.get_post).not.toHaveBeenCalled();
  });

  it("falls back to the chain when there is no local config", async () => {
    enable_dev_mode();
    mocks.chain.api.bridge.get_post.mockResolvedValueOnce({
      body: build_config_body(
        "alice",
        settings_with({ siteName: "Chain" }),
        "t",
      ),
    });
    const stored = await load_stored_config("alice");
    expect(mocks.chain.api.bridge.get_post).toHaveBeenCalledTimes(1);
    if (stored.status === "found")
      expect(stored.settings.siteName).toBe("Chain");
  });

  it("ignores malformed entries and entries of another blog", () => {
    enable_dev_mode();
    localStorage.setItem("ohp-dev:config:alice", "{not json");
    expect(read_dev_config("alice")).toBeNull();
    localStorage.setItem(
      "ohp-dev:config:alice",
      JSON.stringify({
        blog: "bob",
        account: "bob",
        saved_at: "t",
        settings: {},
      }),
    );
    expect(read_dev_config("alice")).toBeNull();
    localStorage.setItem(
      "ohp-dev:config:alice",
      JSON.stringify({
        blog: "alice",
        account: "alice",
        saved_at: "t",
        settings: [],
      }),
    );
    expect(read_dev_config("alice")).toBeNull();
  });
});

describe("dev mode save flow", () => {
  const gate = { config_account: "alice", load_error: null, username: "alice" };

  it("execute_save confirms a local save on the first read, without the node delay", async () => {
    enable_dev_mode();
    const settings = settings_with({ siteName: "Local blog" });
    const sleep = vi.fn(async () => undefined);
    const on_sent = vi.fn();

    const outcome = await execute_save(
      { blog: "alice", gate, private_key: "key" },
      {
        flush: vi.fn(),
        snapshot: () => settings,
        broadcast: broadcastConfigToHive,
        load: load_stored_config,
        sleep,
        on_sent,
      },
    );

    expect(outcome).toMatchObject({
      kind: "confirmed",
      is_update: false,
      edited_since_send: false,
    });
    expect(sleep.mock.calls).toEqual([[0]]);
    expect(on_sent).toHaveBeenCalledTimes(1);
    expect(network_calls()).toBe(0);
    expect(read_dev_config("alice")?.settings.siteName).toBe("Local blog");
  });

  it("handle_broadcast_to_hive reports a local save", async () => {
    enable_dev_mode();
    vi.mocked(getSettingsSnapshot).mockReturnValue(
      settings_with({ siteName: "Local blog" }),
    );
    const end = vi.fn();

    await handle_broadcast_to_hive(
      {
        username: "alice",
        privateKey: "key",
        keyType: "posting",
        loginType: "keychain",
      },
      "alice",
      { account: "alice", error: null },
      { begin: () => true, end, open_login: vi.fn() },
    );

    expect(end).toHaveBeenCalledWith("saved");
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      "Saved config locally (dev mode, not on Hive)",
      "success",
    );
    expect(network_calls()).toBe(0);
  });
});

describe("outside dev mode", () => {
  it("ignores a local config without the flag and reads the chain", async () => {
    stub_host("localhost");
    localStorage.setItem(
      "ohp-dev:config:alice",
      JSON.stringify({
        blog: "alice",
        account: "alice",
        saved_at: "t",
        settings: { siteName: "Local" },
      }),
    );
    mocks.chain.api.bridge.get_post.mockResolvedValueOnce({
      body: build_config_body(
        "alice",
        settings_with({ siteName: "Chain" }),
        "t",
      ),
    });
    const stored = await load_stored_config("alice");
    expect(stored.status === "found" && stored.settings.siteName).toBe("Chain");
  });

  it("ignores the local config during SSR (no window)", async () => {
    localStorage.setItem("ohp-dev:enabled", "1");
    expect(read_dev_config("alice")).toBeNull();
  });

  it("broadcasts on chain without the flag", async () => {
    stub_host("localhost");
    mocks.chain.api.bridge.get_post.mockResolvedValue({
      body: build_config_body("alice", settings_with({}), "t"),
    });
    mocks.get_broadcast_chain.mockResolvedValue({
      createTransaction: async () => mocks.tx,
      broadcast: mocks.broadcast,
    });
    const result = await broadcastConfigToHive(
      settings_with({}),
      "alice",
      "key",
    );
    expect(result).toMatchObject({
      success: true,
      txId: "tx-1",
      isUpdate: true,
    });
    expect(mocks.broadcast).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("ohp-dev:config:alice")).toBeNull();
  });
});
