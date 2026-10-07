// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logout_online_client: vi.fn(),
}));

vi.mock("../../src/components/auth/constants", () => ({
  KEYCHAIN_MANAGED_MARKER: "__keychain__",
}));
vi.mock("../../src/lib/wif-signer", () => ({
  HBAUTH_MANAGED_MARKER: "__hbauth__",
}));
vi.mock("../../src/lib/config", () => ({
  HBAUTH_SESSION_TIMEOUT_MS: 15 * 60 * 1000,
}));
vi.mock("../../src/lib/hbauth-service", () => ({
  logoutOnlineClient: mocks.logout_online_client,
}));

const SESSION_KEY = "ohp-session";
const WIF_SESSION_KEY = "ohp-wif";
const WIF = "5JtestWifKeyNotReal";

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

function storage_event(key: string | null, newValue: string | null): Event {
  return Object.assign(new Event("storage"), { key, newValue });
}

async function load_store() {
  vi.resetModules();
  return import("../../src/components/auth/auth-store");
}

const wif_user = {
  username: "alice",
  privateKey: WIF,
  keyType: "posting" as const,
  loginType: "wif" as const,
};

describe("auth-store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", memory_storage());
    vi.stubGlobal("sessionStorage", memory_storage());
    mocks.logout_online_client.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("login with WIF stores the session and the key in sessionStorage", async () => {
    const store = await load_store();
    store.login(wif_user);

    expect(store.isAuthenticated()).toBe(true);
    expect(store.currentUser()?.privateKey).toBe(WIF);
    expect(sessionStorage.getItem(WIF_SESSION_KEY)).toBe(WIF);
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    expect(saved).toMatchObject({ username: "alice", loginType: "wif" });
    expect(localStorage.getItem(SESSION_KEY)).not.toContain(WIF);
    store.logout();
  });

  it("restoreSession restores a WIF session from sessionStorage", async () => {
    (await load_store()).login(wif_user);

    const store = await load_store();
    expect(store.currentUser()).toBeNull();
    const restored = store.restoreSession();

    expect(restored?.username).toBe("alice");
    expect(store.isAuthenticated()).toBe(true);
    expect(store.currentUser()).toMatchObject({
      username: "alice",
      privateKey: WIF,
      loginType: "wif",
    });
    store.logout();
  });

  it("restoreSession in a tab without the WIF key keeps the shared session for other tabs", async () => {
    (await load_store()).login(wif_user);
    const shared_session = localStorage.getItem(SESSION_KEY);
    sessionStorage.removeItem(WIF_SESSION_KEY);

    const store = await load_store();
    expect(store.restoreSession()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
    expect(store.logoutReason()).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBe(shared_session);
    expect(store.needsReauth()?.username).toBe("alice");
  });

  it("restoreSession of an expired WIF session clears the session and the key", async () => {
    (await load_store()).login(wif_user);
    vi.clearAllTimers();
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000 + 1);

    const store = await load_store();
    expect(store.restoreSession()).toBeNull();
    expect(store.logoutReason()).toBe("timeout");
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem(WIF_SESSION_KEY)).toBeNull();
  });

  it("restoreSession clears a leftover WIF key when the shared session is gone", async () => {
    (await load_store()).login(wif_user);
    localStorage.removeItem(SESSION_KEY);

    const store = await load_store();
    expect(store.restoreSession()).toBeNull();
    expect(sessionStorage.getItem(WIF_SESSION_KEY)).toBeNull();
  });

  it("restoreSession clears a leftover WIF key when the shared session is not WIF", async () => {
    (await load_store()).login(wif_user);
    const now = Date.now();
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        username: "bob",
        keyType: "posting",
        loginType: "keychain",
        lastActivity: now,
        expiresAt: now + 60_000,
      }),
    );

    const store = await load_store();
    expect(store.restoreSession()?.username).toBe("bob");
    expect(sessionStorage.getItem(WIF_SESSION_KEY)).toBeNull();
  });

  it("restoreSession does not pair another user's WIF session with this tab's key", async () => {
    (await load_store()).login(wif_user);
    const now = Date.now();
    const bob_session = JSON.stringify({
      username: "bob",
      keyType: "posting",
      loginType: "wif",
      lastActivity: now,
      expiresAt: now + 60_000,
    });
    localStorage.setItem(SESSION_KEY, bob_session);

    const store = await load_store();
    expect(store.restoreSession()).toBeNull();
    expect(store.currentUser()).toBeNull();
    expect(sessionStorage.getItem(WIF_SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBe(bob_session);
  });

  it("restoreSession rejects a WIF key without an owner", async () => {
    (await load_store()).login(wif_user);
    sessionStorage.removeItem("ohp-wif-owner");

    const store = await load_store();
    expect(store.restoreSession()).toBeNull();
    expect(sessionStorage.getItem(WIF_SESSION_KEY)).toBeNull();
  });

  it("restoreSession removes a malformed stored session", async () => {
    localStorage.setItem(SESSION_KEY, "{not json");
    const store = await load_store();

    expect(store.restoreSession()).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("logout clears the WIF key and the signal", async () => {
    const store = await load_store();
    store.login(wif_user);
    store.logout();

    expect(store.currentUser()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
    expect(store.logoutReason()).toBe("manual");
    expect(sessionStorage.getItem(WIF_SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(mocks.logout_online_client).not.toHaveBeenCalled();
  });

  it("logout of an HB-Auth session still logs out the HB-Auth client", async () => {
    const store = await load_store();
    store.login({
      username: "bob",
      privateKey: "__hbauth__",
      keyType: "posting",
      loginType: "hbauth",
    });
    store.logout();

    await vi.waitFor(() =>
      expect(mocks.logout_online_client).toHaveBeenCalledWith("bob"),
    );
  });

  describe("cross-tab storage events", () => {
    beforeEach(() => {
      vi.stubGlobal("window", new EventTarget());
    });

    it("removed shared session logs out the WIF tab and clears its key", async () => {
      const store = await load_store();
      store.login(wif_user);
      localStorage.removeItem(SESSION_KEY);
      window.dispatchEvent(storage_event(SESSION_KEY, null));

      expect(store.isAuthenticated()).toBe(false);
      expect(store.logoutReason()).toBe("cross-tab");
      expect(sessionStorage.getItem(WIF_SESSION_KEY)).toBeNull();
    });

    it("localStorage.clear() in another tab clears the WIF key", async () => {
      const store = await load_store();
      store.login(wif_user);
      localStorage.clear();
      window.dispatchEvent(storage_event(null, null));

      expect(store.isAuthenticated()).toBe(false);
      expect(sessionStorage.getItem(WIF_SESSION_KEY)).toBeNull();
    });

    it("unrelated clear event keeps the session when the shared session survives", async () => {
      const store = await load_store();
      store.login(wif_user);
      window.dispatchEvent(storage_event(null, null));

      expect(store.isAuthenticated()).toBe(true);
      expect(sessionStorage.getItem(WIF_SESSION_KEY)).toBe(WIF);
      store.logout();
    });

    it("login of a different user in another tab clears the WIF key", async () => {
      const store = await load_store();
      store.login(wif_user);
      const now = Date.now();
      const bob_session = JSON.stringify({
        username: "bob",
        keyType: "posting",
        loginType: "keychain",
        lastActivity: now,
        expiresAt: now + 60_000,
      });
      localStorage.setItem(SESSION_KEY, bob_session);
      window.dispatchEvent(storage_event(SESSION_KEY, bob_session));

      expect(store.isAuthenticated()).toBe(false);
      expect(sessionStorage.getItem(WIF_SESSION_KEY)).toBeNull();
    });

    it("same user refreshing the session in another tab keeps the WIF key", async () => {
      const store = await load_store();
      store.login(wif_user);
      const session = localStorage.getItem(SESSION_KEY);
      window.dispatchEvent(storage_event(SESSION_KEY, session));

      expect(store.isAuthenticated()).toBe(true);
      expect(sessionStorage.getItem(WIF_SESSION_KEY)).toBe(WIF);
      store.logout();
    });

    it("a new tab without the key does not log out the WIF tab", async () => {
      const wif_tab = await load_store();
      wif_tab.login(wif_user);
      const wif_tab_session_storage = sessionStorage;

      vi.stubGlobal("sessionStorage", memory_storage());
      const new_tab = await load_store();
      expect(new_tab.restoreSession()).toBeNull();

      expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
      expect(wif_tab.isAuthenticated()).toBe(true);
      expect(wif_tab_session_storage.getItem(WIF_SESSION_KEY)).toBe(WIF);
    });
  });

  it("session timeout clears the WIF key", async () => {
    const store = await load_store();
    store.login(wif_user);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 15_000);

    expect(store.logoutReason()).toBe("timeout");
    expect(sessionStorage.getItem(WIF_SESSION_KEY)).toBeNull();
  });

  it("works without browser storage (SSR)", async () => {
    vi.unstubAllGlobals();
    const store = await load_store();

    expect(store.restoreSession()).toBeNull();
    expect(() => store.login(wif_user)).not.toThrow();
    expect(() => store.logout()).not.toThrow();
  });
});
