// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  not_mainnet: false,
  base: ["https://api.openhive.network", "https://api.hive.blog"],
}));

vi.mock("@hiveio/workerbee/blog-logic", () => ({
  configureEndpoints: vi.fn(),
}));
vi.mock("../../src/lib/config", () => ({
  get_hive_api_endpoint: () => mocks.base[0],
  get_hive_api_endpoints: () => [...mocks.base],
  is_not_mainnet: () => mocks.not_mainnet,
}));

import { configureEndpoints } from "@hiveio/workerbee/blog-logic";
import {
  build_read_endpoints,
  get_current_endpoint,
  get_read_endpoints,
  is_valid_endpoint,
  NODE_ENDPOINT_STORAGE_KEY,
  read_stored_endpoint,
  store_endpoint,
} from "../../src/lib/node-endpoint";

const CUSTOM = "https://node.example.com";

function memory_storage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

function stub_browser(storage: Storage | (() => never)): void {
  const window_stub = {};
  Object.defineProperty(window_stub, "localStorage", {
    get: typeof storage === "function" ? storage : () => storage,
  });
  vi.stubGlobal("window", window_stub);
}

beforeEach(() => {
  mocks.not_mainnet = false;
  vi.mocked(configureEndpoints).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("is_valid_endpoint", () => {
  it("accepts https URLs", () => {
    expect(is_valid_endpoint("https://api.hive.blog")).toBe(true);
    expect(is_valid_endpoint("https://node.example.com:8443/rpc")).toBe(true);
  });

  it("rejects javascript:, data:, protocol-relative and non-string values", () => {
    expect(is_valid_endpoint("javascript:alert(1)")).toBe(false);
    expect(is_valid_endpoint("data:text/html,<script>")).toBe(false);
    expect(is_valid_endpoint("//evil.example.com")).toBe(false);
    expect(is_valid_endpoint(42)).toBe(false);
    expect(is_valid_endpoint(null)).toBe(false);
  });

  it("rejects unparsable URLs and embedded credentials", () => {
    expect(is_valid_endpoint("not a url")).toBe(false);
    expect(is_valid_endpoint("https://")).toBe(false);
    expect(is_valid_endpoint("")).toBe(false);
    expect(is_valid_endpoint(" https://api.hive.blog")).toBe(false);
    expect(is_valid_endpoint("https://user:pass@api.hive.blog")).toBe(false);
  });

  it("rejects http on mainnet and allows it off mainnet", () => {
    expect(is_valid_endpoint("http://localhost:8090")).toBe(false);
    mocks.not_mainnet = true;
    expect(is_valid_endpoint("http://localhost:8090")).toBe(true);
    expect(is_valid_endpoint("ftp://localhost")).toBe(false);
  });
});

describe("stored endpoint", () => {
  it("round-trips a valid node through localStorage", () => {
    stub_browser(memory_storage());
    expect(store_endpoint(CUSTOM)).toBe(true);
    expect(read_stored_endpoint()).toBe(CUSTOM);
    expect(get_current_endpoint()).toBe(CUSTOM);
  });

  it("ignores invalid or malformed stored values", () => {
    const storage = memory_storage();
    stub_browser(storage);
    storage.setItem(
      NODE_ENDPOINT_STORAGE_KEY,
      JSON.stringify("javascript:alert(1)"),
    );
    expect(read_stored_endpoint()).toBeNull();
    storage.setItem(
      NODE_ENDPOINT_STORAGE_KEY,
      JSON.stringify("http://evil.example.com"),
    );
    expect(read_stored_endpoint()).toBeNull();
    storage.setItem(NODE_ENDPOINT_STORAGE_KEY, "{not json");
    expect(read_stored_endpoint()).toBeNull();
    expect(get_current_endpoint()).toBe(mocks.base[0]);
  });

  it("refuses to store an invalid URL", () => {
    const storage = memory_storage();
    stub_browser(storage);
    expect(store_endpoint("javascript:alert(1)")).toBe(false);
    expect(storage.getItem(NODE_ENDPOINT_STORAGE_KEY)).toBeNull();
  });

  it("falls back to the runtime config when localStorage throws", () => {
    stub_browser(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(read_stored_endpoint()).toBeNull();
    expect(store_endpoint(CUSTOM)).toBe(false);
    expect(get_current_endpoint()).toBe(mocks.base[0]);
  });
});

describe("read endpoint order", () => {
  it("puts the selected node first and keeps the runtime list as fallback", () => {
    expect(build_read_endpoints(CUSTOM, mocks.base)).toEqual([
      CUSTOM,
      ...mocks.base,
    ]);
  });

  it("does not duplicate a selected node that is already in the list", () => {
    expect(build_read_endpoints("https://api.hive.blog", mocks.base)).toEqual([
      "https://api.hive.blog",
      "https://api.openhive.network",
    ]);
  });

  it("ignores a missing or invalid selection", () => {
    expect(build_read_endpoints(null, mocks.base)).toEqual(mocks.base);
    expect(build_read_endpoints("javascript:alert(1)", mocks.base)).toEqual(
      mocks.base,
    );
  });

  it("uses only the runtime config on the server, even with a stored node", () => {
    expect(typeof window).toBe("undefined");
    expect(get_read_endpoints()).toEqual(mocks.base);
  });

  it("uses the stored node first in the browser", () => {
    stub_browser(memory_storage());
    store_endpoint(CUSTOM);
    expect(get_read_endpoints()).toEqual([CUSTOM, ...mocks.base]);
  });
});

describe("workerbee endpoint configuration", () => {
  it("configures once, then reconfigure_endpoints calls configureEndpoints again", async () => {
    vi.resetModules();
    const { ensure_endpoints_configured, reconfigure_endpoints } =
      await import("../../src/lib/hive-endpoints");
    const { configureEndpoints: configure } =
      await import("@hiveio/workerbee/blog-logic");
    vi.mocked(configure).mockClear();

    ensure_endpoints_configured();
    ensure_endpoints_configured();
    expect(configure).toHaveBeenCalledTimes(1);
    expect(configure).toHaveBeenLastCalledWith(mocks.base);

    reconfigure_endpoints([CUSTOM, ...mocks.base]);
    expect(configure).toHaveBeenCalledTimes(2);
    expect(configure).toHaveBeenLastCalledWith([CUSTOM, ...mocks.base]);

    ensure_endpoints_configured();
    expect(configure).toHaveBeenCalledTimes(2);
  });

  it("reconfigure_endpoints ignores an empty list", async () => {
    vi.resetModules();
    const { reconfigure_endpoints } =
      await import("../../src/lib/hive-endpoints");
    const { configureEndpoints: configure } =
      await import("@hiveio/workerbee/blog-logic");
    vi.mocked(configure).mockClear();

    reconfigure_endpoints([]);
    expect(configure).not.toHaveBeenCalled();
  });
});
