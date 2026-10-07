// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal } from "solid-js";
import { KEYCHAIN_MANAGED_MARKER } from "./constants";
import { HBAUTH_MANAGED_MARKER } from "../../lib/wif-signer";
import { HBAUTH_SESSION_TIMEOUT_MS } from "../../lib/config";

export type LoginType = "hbauth" | "keychain" | "wif";
export type LogoutReason = "timeout" | "manual" | "cross-tab";

export interface AuthUser {
  username: string;
  privateKey: string;
  keyType: "posting" | "active";
  loginType: LoginType;
}

const SESSION_KEY = "ohp-session";
const WIF_SESSION_KEY = "ohp-wif";
const WIF_OWNER_KEY = "ohp-wif-owner";
const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;
// Log out before the HB-Auth worker locks the key, so the UI never shows a user whose signing silently fails
const HBAUTH_EXPIRY_MARGIN_MS = 60 * 1000;
const TIMEOUT_CHECK_INTERVAL_MS = 15 * 1000;

function session_timeout_for(login_type: LoginType): number {
  return login_type === "hbauth"
    ? HBAUTH_SESSION_TIMEOUT_MS - HBAUTH_EXPIRY_MARGIN_MS
    : SESSION_TIMEOUT_MS;
}

const [currentUser, setCurrentUser] = createSignal<AuthUser | null>(null);
const [isAuthenticated, setIsAuthenticated] = createSignal(false);
const [logoutReason, setLogoutReason] = createSignal<LogoutReason | null>(null);

let timeoutCheckInterval: ReturnType<typeof setInterval> | null = null;

interface StoredSession {
  username: string;
  keyType: "posting" | "active";
  loginType: LoginType;
  lastActivity: number;
  expiresAt: number;
}

const VALID_KEY_TYPES = new Set(["posting", "active"]);
const VALID_LOGIN_TYPES = new Set<string>(["hbauth", "keychain", "wif"]);

function is_stored_session(value: unknown): value is StoredSession {
  if (typeof value !== "object" || value === null) return false;
  if (
    !("username" in value) ||
    !("keyType" in value) ||
    !("loginType" in value) ||
    !("lastActivity" in value) ||
    !("expiresAt" in value)
  )
    return false;
  return (
    typeof value.username === "string" &&
    typeof value.keyType === "string" &&
    VALID_KEY_TYPES.has(value.keyType) &&
    typeof value.loginType === "string" &&
    VALID_LOGIN_TYPES.has(value.loginType) &&
    typeof value.lastActivity === "number" &&
    typeof value.expiresAt === "number"
  );
}

function get_stored_session(): StoredSession | null {
  if (typeof localStorage === "undefined") return null;

  const session = localStorage.getItem(SESSION_KEY);
  if (!session) return null;

  try {
    const parsed: unknown = JSON.parse(session);
    if (!is_stored_session(parsed)) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function is_session_valid(session: StoredSession): boolean {
  const remaining = session.expiresAt - Date.now();
  return remaining > 0 && remaining <= session_timeout_for(session.loginType);
}

function save_session(session: StoredSession) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage may be full or disabled (e.g. Safari private mode)
  }
}

function checkSessionTimeout() {
  const stored = get_stored_session();
  if (!stored) return;

  if (!is_session_valid(stored)) {
    logout("timeout");
  }
}

let last_activity_save = 0;
const ACTIVITY_THROTTLE_MS = 60 * 1000;

export function updateActivity() {
  const now = Date.now();
  if (now - last_activity_save < ACTIVITY_THROTTLE_MS) return;
  last_activity_save = now;

  const stored = get_stored_session();
  if (stored && is_session_valid(stored)) {
    save_session({ ...stored, lastActivity: now });
  }
}

function clear_wif_key() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(WIF_SESSION_KEY);
    sessionStorage.removeItem(WIF_OWNER_KEY);
  } catch {
    // sessionStorage may be disabled
  }
}

function read_wif_key(username: string): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const wif = sessionStorage.getItem(WIF_SESSION_KEY);
    const owner = sessionStorage.getItem(WIF_OWNER_KEY);
    return wif && owner === username ? wif : null;
  } catch {
    return null;
  }
}

function end_local_session(reason: LogoutReason) {
  setCurrentUser(null);
  setIsAuthenticated(false);
  setLogoutReason(reason);
  stopTimeoutChecker();
  clear_wif_key();
}

function handle_storage_event(event: StorageEvent) {
  // key === null means another tab called localStorage.clear()
  if (event.key === null) {
    if (!get_stored_session()) end_local_session("cross-tab");
    return;
  }
  if (event.key !== SESSION_KEY) return;

  if (event.newValue === null) {
    end_local_session("cross-tab");
    return;
  }

  try {
    const parsed: unknown = JSON.parse(event.newValue);
    if (!is_stored_session(parsed)) return;
    if (!is_session_valid(parsed)) return;

    const user = currentUser();
    if (user && user.username === parsed.username) {
      // Same user logged in from another tab — keep current state
      return;
    }

    // Different user or no user — require reauth
    end_local_session("cross-tab");
  } catch {
    // ignore malformed storage events
  }
}

function startTimeoutChecker() {
  if (timeoutCheckInterval) {
    clearInterval(timeoutCheckInterval);
    timeoutCheckInterval = null;
  }

  timeoutCheckInterval = setInterval(
    checkSessionTimeout,
    TIMEOUT_CHECK_INTERVAL_MS,
  );

  if (typeof window !== "undefined") {
    const activityEvents = ["mousedown", "keydown", "scroll", "touchstart"];
    activityEvents.forEach((event) => {
      window.addEventListener(event, updateActivity, { passive: true });
    });

    window.addEventListener("storage", handle_storage_event);
  }
}

function stopTimeoutChecker() {
  if (timeoutCheckInterval) {
    clearInterval(timeoutCheckInterval);
    timeoutCheckInterval = null;
  }

  if (typeof window !== "undefined") {
    const activityEvents = ["mousedown", "keydown", "scroll", "touchstart"];
    activityEvents.forEach((event) => {
      window.removeEventListener(event, updateActivity);
    });

    window.removeEventListener("storage", handle_storage_event);
  }
}

export function restoreSession(): StoredSession | null {
  const stored = get_stored_session();
  if (!stored) {
    clear_wif_key();
    return null;
  }

  if (!is_session_valid(stored)) {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(SESSION_KEY);
    }
    clear_wif_key();
    setLogoutReason("timeout");
    return null;
  }

  const marker_map: Record<string, string> = {
    keychain: KEYCHAIN_MANAGED_MARKER,
    hbauth: HBAUTH_MANAGED_MARKER,
  };

  if (stored.loginType === "wif") {
    const wif = read_wif_key(stored.username);
    if (wif) {
      setCurrentUser({
        username: stored.username,
        privateKey: wif,
        keyType: stored.keyType,
        loginType: "wif",
      });
      setIsAuthenticated(true);
      setLogoutReason(null);
      startTimeoutChecker();
      return stored;
    }
    // The key lives only in the tab that logged in; leave the shared session so other tabs stay logged in
    clear_wif_key();
    return null;
  }

  clear_wif_key();

  const marker = marker_map[stored.loginType];
  if (!marker) {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(SESSION_KEY);
    }
    return null;
  }

  setCurrentUser({
    username: stored.username,
    privateKey: marker,
    keyType: stored.keyType,
    loginType: stored.loginType,
  });
  setIsAuthenticated(true);
  setLogoutReason(null);
  startTimeoutChecker();

  return stored;
}

export function needsReauth(): StoredSession | null {
  const stored = get_stored_session();
  const user = currentUser();

  if (stored && !user && is_session_valid(stored)) {
    return stored;
  }

  return null;
}

export function login(user: AuthUser) {
  if (!user || typeof user !== "object") {
    throw new Error("Invalid user object");
  }
  if (!user.username || typeof user.username !== "string") {
    throw new Error("Invalid username");
  }
  if (!user.keyType || !["posting", "active"].includes(user.keyType)) {
    throw new Error("Invalid keyType");
  }

  setCurrentUser(user);
  setIsAuthenticated(true);
  setLogoutReason(null);

  const now = Date.now();
  const sessionInfo: StoredSession = {
    username: user.username,
    keyType: user.keyType,
    loginType: user.loginType,
    lastActivity: now,
    expiresAt: now + session_timeout_for(user.loginType),
  };
  save_session(sessionInfo);

  if (user.loginType === "wif") {
    try {
      sessionStorage.setItem(WIF_SESSION_KEY, user.privateKey);
      sessionStorage.setItem(WIF_OWNER_KEY, user.username);
    } catch {}
  } else {
    clear_wif_key();
  }

  startTimeoutChecker();
}

export function logout(reason: LogoutReason = "manual") {
  const previous_user = currentUser();
  end_local_session(reason);

  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(SESSION_KEY);
  }

  if (previous_user?.loginType === "hbauth") {
    void import("../../lib/hbauth-service").then(({ logoutOnlineClient }) =>
      logoutOnlineClient(previous_user.username),
    );
  }
}

export { currentUser, isAuthenticated, logoutReason };

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    stopTimeoutChecker();
  });
}

if (typeof import.meta !== "undefined" && import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopTimeoutChecker();
  });
}
