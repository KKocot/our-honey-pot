// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Client-only developer mode: Hive writes go to localStorage, login without a key.
 * Every entry point is gated by the literal `import.meta.env.DEV`, so production
 * builds drop the dev branches and the `ohp-dev:` key strings.
 */

const DEV_HOSTNAMES: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

const DEV_OPS_LOG_LIMIT = 100;

/** Prefix of every dev-mode localStorage key; empty in production builds. */
export const DEV_STORAGE_PREFIX = import.meta.env.DEV ? "ohp-dev:" : "";

/** Dev-mode localStorage keys (single source for all dev-mode features). */
export const DEV_KEYS = {
  enabled: `${DEV_STORAGE_PREFIX}enabled`,
  ops: `${DEV_STORAGE_PREFIX}ops`,
  session: `${DEV_STORAGE_PREFIX}session`,
  moderation: `${DEV_STORAGE_PREFIX}moderation`,
  role: `${DEV_STORAGE_PREFIX}role`,
  impersonate: `${DEV_STORAGE_PREFIX}impersonate`,
} as const;

/** Dev-mode localStorage key holding the config overlay of one blog. */
export function dev_config_key(blog: string): string {
  return `${DEV_STORAGE_PREFIX}config:${blog}`;
}

/** Pure gate: dev build served from a loopback hostname. */
export function compute_dev_mode_available(input: {
  is_dev: boolean;
  hostname: string | undefined;
}): boolean {
  return (
    input.is_dev &&
    input.hostname !== undefined &&
    DEV_HOSTNAMES.has(input.hostname)
  );
}

/** Pure gate: dev mode available and the localStorage flag set to "1". */
export function compute_dev_mode(input: {
  is_dev: boolean;
  hostname: string | undefined;
  flag: string | null;
}): boolean {
  return compute_dev_mode_available(input) && input.flag === "1";
}

function current_hostname(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.location?.hostname;
  } catch {
    return undefined;
  }
}

function dev_storage(): Storage | null {
  if (!is_dev_mode_available()) return null;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function read_raw(key: string): string | null {
  const storage = dev_storage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** True in a dev build (`astro dev`) opened on localhost / 127.0.0.1 / ::1. */
export function is_dev_mode_available(): boolean {
  if (!import.meta.env.DEV) return false;
  return compute_dev_mode_available({
    is_dev: true,
    hostname: current_hostname(),
  });
}

/** True when dev mode is available and enabled via the `ohp-dev:enabled` flag. */
export function is_dev_mode(): boolean {
  if (!import.meta.env.DEV) return false;
  return compute_dev_mode({
    is_dev: true,
    hostname: current_hostname(),
    flag: read_raw(DEV_KEYS.enabled),
  });
}

/** Turn dev mode on/off; returns false when unavailable or storage fails. */
export function set_dev_mode_enabled(enabled: boolean): boolean {
  if (!import.meta.env.DEV) return false;
  const storage = dev_storage();
  if (!storage) return false;
  try {
    if (enabled) storage.setItem(DEV_KEYS.enabled, "1");
    else storage.removeItem(DEV_KEYS.enabled);
    return true;
  } catch {
    return false;
  }
}

/** Read and JSON-parse a dev-mode key; null when unavailable, missing or malformed. */
export function dev_store_get<T = unknown>(key: string): T | null {
  if (!import.meta.env.DEV || !key.startsWith(DEV_STORAGE_PREFIX)) return null;
  const raw = read_raw(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** JSON-serialize and store a dev-mode key; false when unavailable or storage fails. */
export function dev_store_set(key: string, value: unknown): boolean {
  if (!import.meta.env.DEV || !key.startsWith(DEV_STORAGE_PREFIX)) return false;
  const storage = dev_storage();
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value, bigint_replacer));
    return true;
  } catch {
    return false;
  }
}

/** Remove a dev-mode key; no-op when unavailable. */
export function dev_store_remove(key: string): void {
  if (!import.meta.env.DEV || !key.startsWith(DEV_STORAGE_PREFIX)) return;
  const storage = dev_storage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // storage may be disabled
  }
}

/**
 * Remove dev-mode data (ops log, overlays, session...) but keep the enabled flag.
 * Touches only `ohp-dev:` keys. Callers must also `logout()` an in-memory dev user.
 * Returns the number of removed keys.
 */
export function reset_dev_storage(): number {
  if (!import.meta.env.DEV) return 0;
  const storage = dev_storage();
  if (!storage) return 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (
        key &&
        key.startsWith(DEV_STORAGE_PREFIX) &&
        key !== DEV_KEYS.enabled
      ) {
        keys.push(key);
      }
    }
    for (const key of keys) storage.removeItem(key);
    return keys.length;
  } catch {
    return 0;
  }
}

/** Metadata of a dev login (impersonated account, no key). */
export interface DevSession {
  username: string;
  keyType: "posting";
  started_at: number;
}

function is_dev_session(value: unknown): value is DevSession {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.username === "string" &&
    v.username.length > 0 &&
    v.keyType === "posting" &&
    typeof v.started_at === "number"
  );
}

/** Stored dev session, or null when unavailable / missing / malformed. */
export function read_dev_session(): DevSession | null {
  const value = dev_store_get(DEV_KEYS.session);
  return is_dev_session(value) ? value : null;
}

/** Persist dev session metadata; false when unavailable or storage fails. */
export function write_dev_session(session: DevSession): boolean {
  return dev_store_set(DEV_KEYS.session, session);
}

/** Remove the stored dev session; no-op outside a dev build on localhost. */
export function clear_dev_session(): void {
  dev_store_remove(DEV_KEYS.session);
}

/** One intercepted broadcast; operations in wax `*_operation` format. */
export interface DevOpEntry {
  ts: number;
  tx_id: string;
  operations: unknown[];
  username?: string;
}

function bigint_replacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/** Logged dev broadcasts, oldest first. */
export function read_dev_ops(): DevOpEntry[] {
  const value = dev_store_get(DEV_KEYS.ops);
  return Array.isArray(value) ? (value as DevOpEntry[]) : [];
}

/**
 * Append a broadcast to `ohp-dev:ops`, keeping the newest entries.
 * Throws when storage fails, so the caller reports a failed broadcast.
 */
export function append_dev_op(entry: DevOpEntry): void {
  const operations: unknown[] = JSON.parse(
    JSON.stringify(entry.operations, bigint_replacer),
  );
  const next = [...read_dev_ops(), { ...entry, operations }].slice(
    -DEV_OPS_LOG_LIMIT,
  );
  if (!dev_store_set(DEV_KEYS.ops, next)) {
    throw new Error("Dev mode: failed to record the operation in localStorage");
  }
}
