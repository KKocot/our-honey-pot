// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { CommunityTeamMember } from "./types/community";

// ============================================
// Types
// ============================================

export type CommunityRole = "owner" | "admin" | "mod" | "member" | "guest";

export interface CommunityRoleEntry {
  account: string;
  role: CommunityRole;
  title: string;
}

// ============================================
// Role hierarchy
// ============================================

const VALID_ROLES = new Set<string>(["owner", "admin", "mod", "member", "guest"]);

// ============================================
// Functions
// ============================================

export function parse_community_roles(raw_roles: CommunityTeamMember[]): CommunityRoleEntry[] {
  return raw_roles
    .map((entry) => {
      const account = entry[0] ?? "";
      const role_str = entry[1] ?? "guest";
      const title = entry[2] ?? "";
      const role: CommunityRole = VALID_ROLES.has(role_str) ? (role_str as CommunityRole) : "guest";
      return { account, role, title };
    })
    .filter((e) => e.account.length > 0);
}

export function get_user_role(roles: CommunityRoleEntry[], username: string): CommunityRole {
  const entry = roles.find((r) => r.account === username);
  return entry?.role ?? "guest";
}

/** First account holding the `owner` role, or null when the community has none */
export function find_community_owner(roles: CommunityRoleEntry[]): string | null {
  return roles.find((r) => r.role === "owner")?.account ?? null;
}

/** Blog-level role: community member/guest (and personal-blog visitors) collapse to "none" */
export type BlogRole = "owner" | "admin" | "mod" | "none";

export function to_blog_role(role: CommunityRole): BlogRole {
  return role === "owner" || role === "admin" || role === "mod" ? role : "none";
}
