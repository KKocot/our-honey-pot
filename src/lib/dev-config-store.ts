// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * Dev mode only: the local config saved in /admin, mirrored into the dev server process so SSR renders it.
 * Every entry point is gated by the literal `import.meta.env.DEV`; production builds keep no map and no endpoint.
 */

import { is_valid_hive_username } from "../components/auth/constants";
import { extract_explicit_fields } from "./config-fields";
import type { SettingsData } from "../components/admin/types/settings";

/** Same limit as the config body on chain (`check_body_size`). */
export const DEV_CONFIG_MAX_BYTES = 64 * 1024;

/** Most blogs kept at once; storing one more drops the least recently stored. */
export const DEV_CONFIG_MAX_BLOGS = 50;

/** URL of the dev config endpoint (src/pages/dev_mode/config.ts). */
export const DEV_CONFIG_ENDPOINT = "/dev_mode/config";

/** Local config of one blog as sent to the dev server. */
export interface DevConfigEntry {
  account: string;
  saved_at: string;
  settings: Partial<SettingsData>;
}

/**
 * One entry per blog, tagged with the origin that pushed it. SSR cannot pick an entry by origin (Layout loads the
 * config without the request), so two origins (localhost vs 127.0.0.1) with different local configs overwrite each
 * other; DELETE from another origin is refused, so an origin without a local config does not wipe the other's entry.
 */
interface StoredDevConfig {
  config: DevConfigEntry;
  hash: string;
  origin: string;
  ts: number;
}

export type DevConfigSetResult =
  | { ok: true; hash: string }
  | { ok: false; reason: "unavailable" | "blog" | "shape" | "size" };

export type DevConfigDeleteResult = "deleted" | "missing" | "foreign";

declare global {
  var __ohp_dev_config_store: Map<string, StoredDevConfig> | undefined;
}

// Kept on globalThis: Vite re-evaluates SSR modules on edits, a module-level map would drop every entry
const store: Map<string, StoredDevConfig> | null = import.meta.env.DEV
  ? (globalThis.__ohp_dev_config_store ??= new Map())
  : null;

/** Lowercased blog name, or null when it is not a valid Hive account / community name. */
export function normalize_dev_config_blog(blog: unknown): string | null {
  if (typeof blog !== "string") return null;
  const name = blog.trim().toLowerCase();
  return is_valid_hive_username(name) ? name : null;
}

function canonical_json(config: DevConfigEntry): string {
  return JSON.stringify({
    account: config.account,
    saved_at: config.saved_at,
    settings: config.settings,
  });
}

/** FNV-1a of the canonical JSON; the client compares it with the server entry. */
export function dev_config_hash(config: DevConfigEntry): string {
  const json = canonical_json(config);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Validated copy of an untrusted config, or null when the shape is wrong; settings are validated per field like the chain config. */
export function parse_dev_config_entry(value: unknown): DevConfigEntry | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const { account, saved_at, settings } = value as Record<string, unknown>;
  if (
    typeof account !== "string" ||
    !is_valid_hive_username(account) ||
    typeof saved_at !== "string" ||
    typeof settings !== "object" ||
    settings === null ||
    Array.isArray(settings)
  ) {
    return null;
  }
  return structuredClone({
    account,
    saved_at,
    settings: extract_explicit_fields(settings as Record<string, unknown>),
  });
}

/** Clone of the dev config of `blog`; null in production, for an invalid name or when missing. */
export function get_dev_config(blog: string): StoredDevConfig | null {
  if (!import.meta.env.DEV || !store) return null;
  const key = normalize_dev_config_blog(blog);
  const entry = key ? store.get(key) : undefined;
  return entry ? structuredClone(entry) : null;
}

/** Store the dev config of `blog` pushed from `origin`; no-op returning `unavailable` in production. */
export function set_dev_config(
  blog: unknown,
  config: unknown,
  origin: string,
): DevConfigSetResult {
  if (!import.meta.env.DEV || !store)
    return { ok: false, reason: "unavailable" };
  const key = normalize_dev_config_blog(blog);
  if (!key) return { ok: false, reason: "blog" };
  const parsed = parse_dev_config_entry(config);
  if (!parsed) return { ok: false, reason: "shape" };
  const size = new TextEncoder().encode(canonical_json(parsed)).length;
  if (size > DEV_CONFIG_MAX_BYTES) return { ok: false, reason: "size" };
  const hash = dev_config_hash(parsed);
  store.delete(key);
  store.set(key, { config: parsed, hash, origin, ts: Date.now() });
  // Map keeps insertion order and the re-set above moves `key` last, so the first key is the oldest
  if (store.size > DEV_CONFIG_MAX_BLOGS) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  return { ok: true, hash };
}

/** Remove the dev config of `blog` when `origin` pushed it. */
export function delete_dev_config(
  blog: string,
  origin: string,
): DevConfigDeleteResult {
  if (!import.meta.env.DEV || !store) return "missing";
  const key = normalize_dev_config_blog(blog);
  const entry = key ? store.get(key) : undefined;
  if (!key || !entry) return "missing";
  if (entry.origin !== origin) return "foreign";
  store.delete(key);
  return "deleted";
}

/** Browser: hash of the server entry, null when the server has none; throws on a network / HTTP error. */
export async function fetch_dev_config_hash(
  blog: string,
): Promise<string | null> {
  const response = await fetch(
    `${DEV_CONFIG_ENDPOINT}?blog=${encodeURIComponent(blog)}`,
    { cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`GET ${DEV_CONFIG_ENDPOINT}: ${response.status}`);
  const body: unknown = await response.json();
  const hash = (body as { hash?: unknown } | null)?.hash;
  if (typeof hash !== "string") {
    throw new Error(`GET ${DEV_CONFIG_ENDPOINT}: response without a hash`);
  }
  return hash;
}

/** Browser: send the local config of `blog` to the dev server; throws on a network / HTTP error. */
export async function push_dev_config(
  blog: string,
  config: DevConfigEntry,
): Promise<void> {
  const response = await fetch(DEV_CONFIG_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blog,
      config: {
        account: config.account,
        saved_at: config.saved_at,
        settings: config.settings,
      },
    }),
  });
  if (!response.ok)
    throw new Error(`POST ${DEV_CONFIG_ENDPOINT}: ${response.status}`);
}

/** Browser: drop the server entry of `blog`; throws on a network / HTTP error. */
export async function clear_dev_config_on_server(blog: string): Promise<void> {
  const response = await fetch(
    `${DEV_CONFIG_ENDPOINT}?blog=${encodeURIComponent(blog)}`,
    { method: "DELETE" },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`DELETE ${DEV_CONFIG_ENDPOINT}: ${response.status}`);
  }
}
