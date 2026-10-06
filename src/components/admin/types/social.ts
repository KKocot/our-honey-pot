// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { safe_url } from "../../../shared/utils/url_helpers";

// ============================================
// Social Media Integration Types
// ============================================

/**
 * Platform types for social media integrations.
 * Each platform supports embedding via profile URL or individual post URLs.
 */
export const SOCIAL_PLATFORMS = [
  "instagram",
  "x",
  "youtube",
  "tiktok",
  "threads",
  "facebook",
  "custom",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export function is_social_platform(value: unknown): value is SocialPlatform {
  return (
    typeof value === "string" &&
    (SOCIAL_PLATFORMS as readonly string[]).includes(value)
  );
}

/**
 * Platform metadata for UI display (used in social links)
 */
export interface PlatformInfo {
  id: SocialPlatform;
  name: string;
  color: string; // Brand color
  profilePlaceholder: string; // Example username
  baseUrl?: string; // Base URL for the platform (undefined for custom)
  usernamePrefix?: string; // Prefix for username (like @ for some platforms)
}

export const platformInfos: Record<SocialPlatform, PlatformInfo> = {
  instagram: {
    id: "instagram",
    name: "Instagram",
    color: "#E4405F",
    profilePlaceholder: "username",
    baseUrl: "https://instagram.com/",
  },
  x: {
    id: "x",
    name: "X (Twitter)",
    color: "#000000",
    profilePlaceholder: "username",
    baseUrl: "https://x.com/",
  },
  youtube: {
    id: "youtube",
    name: "YouTube",
    color: "#FF0000",
    profilePlaceholder: "channel",
    baseUrl: "https://youtube.com/@",
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    color: "#000000",
    profilePlaceholder: "username",
    baseUrl: "https://tiktok.com/@",
  },
  threads: {
    id: "threads",
    name: "Threads",
    color: "#000000",
    profilePlaceholder: "username",
    baseUrl: "https://threads.net/@",
  },
  facebook: {
    id: "facebook",
    name: "Facebook",
    color: "#1877F2",
    profilePlaceholder: "page",
    baseUrl: "https://facebook.com/",
  },
  custom: {
    id: "custom",
    name: "Custom Link",
    color: "#6B7280",
    profilePlaceholder: "https://example.com",
  },
};

/**
 * Social media link for author profile
 * Stores username instead of full URL (except for custom links)
 */
export interface SocialLink {
  id: string; // Unique identifier for the link (allows duplicates of same platform)
  platform: SocialPlatform;
  username: string; // Username/handle for the platform (or full URL for custom)
  url?: string; // Deprecated: kept for backward compatibility with old data
}

/**
 * Check if URL has a safe protocol (http/https)
 */
function is_safe_url(url: string): boolean {
  return safe_url(url) !== null;
}

function as_string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Build full URL from platform and username; returns "" when the result is not a safe http(s) URL
 */
export function build_social_url(link: SocialLink): string {
  if (!link || !is_social_platform(link.platform)) return "";
  const legacy_url = as_string(link.url);
  const username = as_string(link.username);

  // Backward compatibility: if old 'url' field exists and is a full URL, validate protocol
  if (/^https?:\/\//i.test(legacy_url)) {
    return safe_url(legacy_url) ?? "";
  }

  // Custom links use username as full URL
  if (link.platform === "custom") {
    const url = username || legacy_url;
    if (!url) return "";
    const full_url = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return safe_url(full_url) ?? "";
  }

  const info = platformInfos[link.platform];
  if (!info.baseUrl) return "";

  const handle = (username || legacy_url).replace(/^@/, "");
  if (!handle) return "";

  return safe_url(`${info.baseUrl}${encodeURIComponent(handle)}`) ?? "";
}

/**
 * Extract username from full URL (for backward compatibility)
 */
export function extract_username_from_url(
  url: string,
  platform: SocialPlatform,
): string {
  if (platform === "custom") return url;

  const info = platformInfos[platform];
  if (!info.baseUrl) return url;

  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.replace(/^\//, "").replace(/\/$/, "");

    // Remove @ prefix if present
    return pathname.startsWith("@") ? pathname.slice(1) : pathname;
  } catch {
    return url;
  }
}

/**
 * Validate username format (no URLs, no spaces, basic sanitization)
 */
export function is_valid_username(
  username: string,
  platform: SocialPlatform,
): boolean {
  if (!username) return true; // Empty is OK

  // Custom links can be any valid URL (check protocol safety)
  if (platform === "custom") {
    if (username.includes(" ")) return false;
    // If looks like URL, validate protocol
    if (username.startsWith("http://") || username.startsWith("https://")) {
      return is_safe_url(username);
    }
    // If no protocol, will be auto-prefixed with https:// - just check no spaces
    return true;
  }

  // Check if user accidentally pasted a full URL
  if (
    username.startsWith("http://") ||
    username.startsWith("https://") ||
    username.startsWith("www.")
  ) {
    return false;
  }

  // Block path traversal attempts
  if (username.includes("..")) {
    return false;
  }

  // Block starting with dot or dash (potential path traversal)
  if (username.startsWith(".") || username.startsWith("-")) {
    return false;
  }

  // No spaces, alphanumeric + underscore/dash/dot (but dot not allowed at start due to check above)
  // Safer regex: must start with alphanumeric or @, then can contain alphanumeric, dot, dash, underscore
  const validPattern = /^@?[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
  return validPattern.test(username);
}
