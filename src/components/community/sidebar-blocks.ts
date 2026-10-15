// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type {
  HiveCommunity,
  CommunityTeamMember,
} from "../../lib/types/community";
import type { SettingsData } from "../admin/types/settings";

export type TeamRole = "owner" | "admin" | "mod";

export interface ParsedTeamMember {
  username: string;
  role: TeamRole;
  title: string;
}

export interface SidebarBlockFlags {
  show_description: boolean;
  show_rules: boolean;
  show_leadership: boolean;
  show_language: boolean;
}

type SidebarSettings = Pick<
  SettingsData,
  | "community_show_description"
  | "community_show_rules"
  | "community_show_leadership"
  | "community_show_language"
>;

type SidebarCommunity = Pick<
  HiveCommunity,
  "description" | "flag_text" | "team" | "lang"
>;

const LEADERSHIP_ROLES: ReadonlySet<string> = new Set([
  "owner",
  "admin",
  "mod",
]);

function is_team_role(value: string): value is TeamRole {
  return LEADERSHIP_ROLES.has(value);
}

export function parse_team(team: CommunityTeamMember[]): ParsedTeamMember[] {
  const result: ParsedTeamMember[] = [];
  for (const member of team) {
    if (!Array.isArray(member) || member.length < 2) continue;
    const role = member[1];
    if (!is_team_role(role)) continue;
    result.push({ username: member[0], role, title: member[2] || "" });
  }
  return result;
}

export function parse_rules(flag_text: string): string[] {
  if (!flag_text.trim()) return [];
  return flag_text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Missing settings count as visible, like every other community toggle. */
export function sidebar_block_flags(
  settings: SidebarSettings
): SidebarBlockFlags {
  return {
    show_description: settings.community_show_description !== false,
    show_rules: settings.community_show_rules !== false,
    show_leadership: settings.community_show_leadership !== false,
    show_language: settings.community_show_language !== false,
  };
}

/** True when the flags leave nothing to render, whatever the community data. */
export function all_sidebar_blocks_disabled(flags: SidebarBlockFlags): boolean {
  return (
    !flags.show_description &&
    !flags.show_rules &&
    !flags.show_leadership &&
    !flags.show_language
  );
}

/** True when at least one sidebar block is both enabled and backed by community data. */
export function has_visible_sidebar_blocks(
  community: SidebarCommunity,
  flags: SidebarBlockFlags
): boolean {
  return (
    (flags.show_description && !!community.description) ||
    (flags.show_rules && parse_rules(community.flag_text ?? "").length > 0) ||
    (flags.show_leadership && parse_team(community.team ?? []).length > 0) ||
    (flags.show_language && !!community.lang)
  );
}
