// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import {
  get_hive_api_endpoint,
  get_hive_api_endpoints,
  is_not_mainnet,
} from "./config";

export const NODE_ENDPOINT_STORAGE_KEY = "hive-node-endpoint";

/** Node URL must be absolute https://; plain http:// only off mainnet (local mirrornet/testnet nodes). */
export function is_valid_endpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value || value === "") {
    return false;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username !== "" || url.password !== "") return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && is_not_mainnet();
}

function get_storage(): Storage | null {
  if (typeof window !== "object") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** User-selected node from localStorage; null on the server, without storage, or when the value is invalid. */
export function read_stored_endpoint(): string | null {
  const storage = get_storage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(NODE_ENDPOINT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return is_valid_endpoint(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Persist the user-selected node; returns false for an invalid URL or unavailable storage. */
export function store_endpoint(url: string): boolean {
  if (!is_valid_endpoint(url)) return false;
  const storage = get_storage();
  if (!storage) return false;
  try {
    storage.setItem(NODE_ENDPOINT_STORAGE_KEY, JSON.stringify(url));
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current API endpoint from localStorage (user-selected node) or config fallback.
 * Used by broadcast-chain, signer-relay, and hbauth-service.
 */
export function get_current_endpoint(): string {
  return read_stored_endpoint() ?? get_hive_api_endpoint();
}

/** Selected node first, then the runtime list as fallback, without duplicates. */
export function build_read_endpoints(
  selected: string | null,
  base: readonly string[],
): string[] {
  const ordered =
    selected && is_valid_endpoint(selected) ? [selected, ...base] : [...base];
  return [...new Set(ordered)];
}

/** Read endpoints for workerbee: the server uses only the runtime config, the browser puts the user's node first. */
export function get_read_endpoints(): string[] {
  const base = get_hive_api_endpoints();
  if (typeof window === "undefined") return base;
  return build_read_endpoints(read_stored_endpoint(), base);
}
