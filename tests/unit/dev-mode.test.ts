// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  live_broadcast: vi.fn(async () => undefined),
  create_transaction: vi.fn(),
  keychain_sign: vi.fn(),
  get_online_client: vi.fn(),
}));

vi.mock("@hiveio/wax", () => ({
  createHiveChain: async () => ({
    broadcast: mocks.live_broadcast,
    createTransaction: mocks.create_transaction,
  }),
}));
vi.mock("@hiveio/wax-signers-keychain", () => ({
  default: { for: () => ({ signTransaction: mocks.keychain_sign }) },
}));
vi.mock("../../src/lib/config", () => ({
  get_hive_chain_id: () => "chain-id",
  HBAUTH_SESSION_TIMEOUT_MS: 15 * 60 * 1000,
}));
vi.mock("../../src/lib/node-endpoint", () => ({
  get_current_endpoint: () => "https://api.example",
}));
vi.mock("../../src/lib/hbauth-service", () => ({
  getOnlineClient: mocks.get_online_client,
  logoutOnlineClient: vi.fn(),
}));
vi.mock("../../src/lib/wif-signer", () => ({
  HBAUTH_MANAGED_MARKER: "__hbauth__",
  is_raw_wif: () => false,
  sign_with_wif: vi.fn(),
}));

const VOTE = {
  vote_operation: {
    voter: "alice",
    author: "bob",
    permlink: "p",
    weight: 10000,
  },
};

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
  vi.stubGlobal("window", {
    location: { hostname },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

function stored_values(): string {
  const values: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    values.push(localStorage.getItem(localStorage.key(i) ?? "") ?? "");
  }
  return values.join("\n");
}

function enable_flag() {
  localStorage.setItem("ohp-dev:enabled", "1");
}

async function load_dev_mode() {
  vi.resetModules();
  return import("../../src/lib/dev-mode");
}

describe("dev-mode gate", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memory_storage());
    vi.stubGlobal("sessionStorage", memory_storage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("compute_dev_mode requires dev build, loopback host and flag", async () => {
    const { compute_dev_mode } = await load_dev_mode();
    expect(
      compute_dev_mode({ is_dev: true, hostname: "localhost", flag: "1" }),
    ).toBe(true);
    expect(
      compute_dev_mode({ is_dev: true, hostname: "[::1]", flag: "1" }),
    ).toBe(true);
    expect(
      compute_dev_mode({ is_dev: false, hostname: "localhost", flag: "1" }),
    ).toBe(false);
    expect(
      compute_dev_mode({ is_dev: true, hostname: "example.com", flag: "1" }),
    ).toBe(false);
    expect(
      compute_dev_mode({ is_dev: true, hostname: undefined, flag: "1" }),
    ).toBe(false);
    expect(
      compute_dev_mode({ is_dev: true, hostname: "localhost", flag: "true" }),
    ).toBe(false);
  });

  it("is off on a non-loopback host even with the flag", async () => {
    stub_host("blog.example.com");
    enable_flag();
    const dev = await load_dev_mode();
    expect(dev.is_dev_mode_available()).toBe(false);
    expect(dev.is_dev_mode()).toBe(false);
    expect(dev.set_dev_mode_enabled(true)).toBe(false);
  });

  it("is off on localhost without the flag", async () => {
    stub_host("localhost");
    const dev = await load_dev_mode();
    expect(dev.is_dev_mode_available()).toBe(true);
    expect(dev.is_dev_mode()).toBe(false);
  });

  it("is off without window (SSR)", async () => {
    enable_flag();
    const dev = await load_dev_mode();
    expect(dev.is_dev_mode()).toBe(false);
    expect(dev.dev_store_get(dev.DEV_KEYS.enabled)).toBeNull();
  });

  it("is on for localhost with the flag and toggles via set_dev_mode_enabled", async () => {
    stub_host("127.0.0.1");
    const dev = await load_dev_mode();
    expect(dev.set_dev_mode_enabled(true)).toBe(true);
    expect(dev.is_dev_mode()).toBe(true);
    expect(dev.set_dev_mode_enabled(false)).toBe(true);
    expect(dev.is_dev_mode()).toBe(false);
  });

  it("is off when storage throws", async () => {
    stub_host("localhost");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
    });
    const dev = await load_dev_mode();
    expect(dev.is_dev_mode()).toBe(false);
  });

  it("dev_store_get returns null on malformed JSON and ignores foreign keys", async () => {
    stub_host("localhost");
    localStorage.setItem("ohp-dev:role", "{not json");
    localStorage.setItem("ohp-session", '{"username":"alice"}');
    const dev = await load_dev_mode();
    expect(dev.dev_store_get(dev.DEV_KEYS.role)).toBeNull();
    expect(dev.dev_store_get("ohp-session")).toBeNull();
    expect(dev.dev_store_set("ohp-session", {})).toBe(false);
  });

  it("reset_dev_storage removes only ohp-dev: data and keeps the flag", async () => {
    stub_host("localhost");
    enable_flag();
    localStorage.setItem("ohp-dev:ops", "[]");
    localStorage.setItem("ohp-dev:config:alice", "{}");
    localStorage.setItem("ohp-dev:session", "{}");
    localStorage.setItem("ohp-session", "prod");
    localStorage.setItem("ohp-user-presets", "[]");
    localStorage.setItem("hive-node-endpoint", "https://api.example");
    const dev = await load_dev_mode();

    expect(dev.reset_dev_storage()).toBe(3);
    expect(localStorage.getItem("ohp-dev:ops")).toBeNull();
    expect(localStorage.getItem("ohp-dev:config:alice")).toBeNull();
    expect(localStorage.getItem("ohp-dev:session")).toBeNull();
    expect(localStorage.getItem("ohp-dev:enabled")).toBe("1");
    expect(localStorage.getItem("ohp-session")).toBe("prod");
    expect(localStorage.getItem("ohp-user-presets")).toBe("[]");
    expect(localStorage.getItem("hive-node-endpoint")).toBe(
      "https://api.example",
    );
  });
});

describe("dev-mode broadcast chain", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memory_storage());
    vi.stubGlobal("sessionStorage", memory_storage());
    mocks.live_broadcast.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function load_chain() {
    vi.resetModules();
    return import("../../src/lib/broadcast-chain");
  }

  const tx = { id: "tx-1", transaction: { operations: [VOTE] } };

  it("records broadcasts to ohp-dev:ops without calling the live broadcast", async () => {
    stub_host("localhost");
    enable_flag();
    const { get_broadcast_chain } = await load_chain();
    const store = await import("../../src/components/auth/auth-store");
    store.login({
      username: "alice",
      privateKey: "__KEYCHAIN_MANAGED__",
      keyType: "posting",
      loginType: "keychain",
    });
    const chain = await get_broadcast_chain();

    await expect(chain.broadcast(tx as never)).resolves.toBeUndefined();

    expect(mocks.live_broadcast).not.toHaveBeenCalled();
    const ops = JSON.parse(localStorage.getItem("ohp-dev:ops") ?? "[]");
    expect(ops).toEqual([
      {
        ts: expect.any(Number),
        tx_id: "tx-1",
        operations: [VOTE],
        username: "alice",
      },
    ]);
    store.logout();
  });

  it("keeps non-broadcast methods bound to the live chain", async () => {
    stub_host("localhost");
    enable_flag();
    mocks.create_transaction.mockResolvedValueOnce(tx);
    const { get_broadcast_chain } = await load_chain();
    const chain = await get_broadcast_chain();
    await expect(chain.createTransaction()).resolves.toBe(tx);
  });

  it("uses the live broadcast when dev mode is off", async () => {
    stub_host("localhost");
    const { get_broadcast_chain } = await load_chain();
    const chain = await get_broadcast_chain();
    await chain.broadcast(tx as never);

    expect(mocks.live_broadcast).toHaveBeenCalledOnce();
    expect(localStorage.getItem("ohp-dev:ops")).toBeNull();
  });
});

describe("dev-mode signing and login", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", memory_storage());
    vi.stubGlobal("sessionStorage", memory_storage());
    mocks.get_online_client.mockReset();
    mocks.get_online_client.mockRejectedValue(
      new Error("hbauth must not be used"),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function load_signer() {
    vi.resetModules();
    const [signer, constants] = await Promise.all([
      import("../../src/lib/transaction-signer"),
      import("../../src/components/auth/constants"),
    ]);
    return {
      sign_transaction: signer.sign_transaction,
      DEV_MARKER: constants.DEV_MARKER,
    };
  }

  async function load_store() {
    vi.resetModules();
    const [store, constants] = await Promise.all([
      import("../../src/components/auth/auth-store"),
      import("../../src/components/auth/constants"),
    ]);
    return { store, DEV_MARKER: constants.DEV_MARKER };
  }

  const fake_tx = () => ({ sigDigest: "00", addSignature: vi.fn() });

  it("sign_transaction rejects DEV_MARKER when dev mode is off", async () => {
    stub_host("example.com");
    enable_flag();
    const { sign_transaction, DEV_MARKER } = await load_signer();
    const tx = fake_tx();
    await expect(
      sign_transaction(tx as never, "alice", DEV_MARKER),
    ).rejects.toThrow(/dev mode/i);
    expect(tx.addSignature).not.toHaveBeenCalled();
    expect(mocks.get_online_client).not.toHaveBeenCalled();
  });

  it("sign_transaction is a no-op for DEV_MARKER in dev mode", async () => {
    stub_host("localhost");
    enable_flag();
    const { sign_transaction, DEV_MARKER } = await load_signer();
    const tx = fake_tx();
    await expect(
      sign_transaction(tx as never, "alice", DEV_MARKER),
    ).resolves.toBeUndefined();
    expect(tx.addSignature).not.toHaveBeenCalled();
  });

  const dev_user = (privateKey: string) => ({
    username: "alice",
    privateKey,
    keyType: "posting" as const,
    loginType: "dev" as const,
  });

  it("dev login is rejected when dev mode is off", async () => {
    stub_host("localhost");
    const { store } = await load_store();
    expect(() => store.login(dev_user("x"))).toThrow(/dev mode/i);
    expect(store.isAuthenticated()).toBe(false);
    expect(localStorage.getItem("ohp-dev:session")).toBeNull();
    expect(localStorage.getItem("ohp-session")).toBeNull();
  });

  it("dev login keeps only the marker in memory and metadata in ohp-dev:session", async () => {
    stub_host("localhost");
    enable_flag();
    const { store, DEV_MARKER } = await load_store();
    store.login(dev_user("5JsomethingSecret"));

    expect(store.currentUser()).toEqual(dev_user(DEV_MARKER));
    expect(localStorage.getItem("ohp-session")).toBeNull();
    expect(stored_values()).not.toContain(
      "5JsomethingSecret",
    );
    expect(sessionStorage.getItem("ohp-wif")).toBeNull();
    expect(
      JSON.parse(localStorage.getItem("ohp-dev:session") ?? "null"),
    ).toMatchObject({
      username: "alice",
      keyType: "posting",
    });

    store.logout();
    expect(localStorage.getItem("ohp-dev:session")).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
  });

  it("logout drops the dev role override together with the dev session", async () => {
    stub_host("localhost");
    enable_flag();
    const { store } = await load_store();
    localStorage.setItem(
      "ohp-dev:role",
      JSON.stringify({ username: "alice", role: "admin" }),
    );
    store.login(dev_user("x"));
    expect(localStorage.getItem("ohp-dev:role")).not.toBeNull();

    store.logout();
    expect(localStorage.getItem("ohp-dev:role")).toBeNull();
  });

  it("restoreSession returns a JSON-safe expiry for a dev session", async () => {
    stub_host("localhost");
    enable_flag();
    localStorage.setItem(
      "ohp-dev:session",
      JSON.stringify({ username: "alice", keyType: "posting", started_at: 1 }),
    );
    const { store } = await load_store();
    const restored = store.restoreSession();
    expect(restored?.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
    expect(JSON.parse(JSON.stringify(restored)).expiresAt).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("restoreSession restores a dev session only in dev mode", async () => {
    stub_host("localhost");
    enable_flag();
    localStorage.setItem(
      "ohp-dev:session",
      JSON.stringify({ username: "alice", keyType: "posting", started_at: 1 }),
    );
    let { store, DEV_MARKER } = await load_store();
    expect(store.restoreSession()?.loginType).toBe("dev");
    expect(store.currentUser()?.privateKey).toBe(DEV_MARKER);

    localStorage.removeItem("ohp-dev:enabled");
    ({ store } = await load_store());
    expect(store.restoreSession()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
    expect(localStorage.getItem("ohp-dev:session")).toBeNull();
  });

  it("restoreSession drops a malformed dev session", async () => {
    stub_host("localhost");
    enable_flag();
    localStorage.setItem("ohp-dev:session", "{broken");
    const { store } = await load_store();
    expect(store.restoreSession()).toBeNull();
    expect(localStorage.getItem("ohp-dev:session")).toBeNull();
  });
});
