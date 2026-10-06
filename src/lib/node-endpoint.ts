// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { HIVE_API_ENDPOINT } from "./config";

export function is_valid_endpoint(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Get current API endpoint from localStorage (user-selected node, https:// only) or config fallback.
 * Used by broadcast-chain, signer-relay, and hbauth-service.
 */
export function get_current_endpoint(): string {
  if (typeof window === 'object' && window.localStorage) {
    const stored = window.localStorage.getItem('hive-node-endpoint');
    if (stored) {
      try {
        const parsed: unknown = JSON.parse(stored);
        if (is_valid_endpoint(parsed)) return parsed;
      } catch {
        // Ignore malformed value
      }
    }
  }
  return HIVE_API_ENDPOINT;
}
