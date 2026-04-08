// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal } from "solid-js";

export type LoginType = "hbauth" | "keychain" | "wif";
export type LogoutReason = "timeout" | "manual" | "cross-tab";

export interface AuthUser {
  username: string;
  privateKey: string;
  keyType: "posting" | "active";
  loginType: LoginType;
}

const SESSION_KEY = "ohp-session";
const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

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
  return Date.now() < session.expiresAt;
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

function handle_storage_event(event: StorageEvent) {
  if (event.key !== SESSION_KEY) return;

  if (event.newValue === null) {
    setCurrentUser(null);
    setIsAuthenticated(false);
    setLogoutReason("cross-tab");
    stopTimeoutChecker();
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
    setCurrentUser(null);
    setIsAuthenticated(false);
    setLogoutReason("cross-tab");
  } catch {
    // ignore malformed storage events
  }
}

function startTimeoutChecker() {
  if (timeoutCheckInterval) {
    clearInterval(timeoutCheckInterval);
    timeoutCheckInterval = null;
  }

  timeoutCheckInterval = setInterval(checkSessionTimeout, 60 * 1000);

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
  if (!stored) return null;

  if (!is_session_valid(stored)) {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(SESSION_KEY);
    }
    setLogoutReason("timeout");
    return null;
  }

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
    expiresAt: now + SESSION_TIMEOUT_MS,
  };
  save_session(sessionInfo);

  startTimeoutChecker();
}

export function logout(reason: LogoutReason = "manual") {
  setCurrentUser(null);
  setIsAuthenticated(false);
  setLogoutReason(reason);
  stopTimeoutChecker();

  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(SESSION_KEY);
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
