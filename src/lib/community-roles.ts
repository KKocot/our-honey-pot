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

const ROLE_LEVELS: Record<CommunityRole, number> = {
  owner: 6,
  admin: 5,
  mod: 4,
  member: 3,
  guest: 2,
};

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

export function can_access_admin(role: CommunityRole): boolean {
  return ROLE_LEVELS[role] >= ROLE_LEVELS.mod;
}

export function get_admin_sections(role: CommunityRole): string[] {
  if (role === "owner") {
    return [
      "Site Settings",
      "Theme",
      "Layout",
      "Community Profile",
      "Community Display",
      "Navigation",
      "Footer",
      "Social Links",
      "Post Card",
      "Author Profile",
      "Comments",
      "Sidebar",
      "Moderation",
    ];
  }
  if (role === "admin") {
    return [
      "Site Settings",
      "Theme",
      "Layout",
      "Community Display",
      "Navigation",
      "Footer",
      "Social Links",
      "Post Card",
      "Author Profile",
      "Comments",
      "Sidebar",
      "Moderation",
    ];
  }
  if (role === "mod") {
    return ["Moderation"];
  }
  return [];
}
