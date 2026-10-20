// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type {
  HiveCommunity,
  CommunityTeamMember,
} from "../../lib/types/community";
import type { SettingsData } from "../admin/types/settings";
import { intl_locale } from "../../lib/i18n";

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

export function description_block_visible(
  community: Pick<SidebarCommunity, "description">,
  show: boolean
): boolean {
  return show && !!community.description;
}

export function rules_block_visible(
  community: Pick<SidebarCommunity, "flag_text">,
  show: boolean
): boolean {
  return show && parse_rules(community.flag_text ?? "").length > 0;
}

export function team_block_visible(
  community: Pick<SidebarCommunity, "team">,
  show: boolean
): boolean {
  return show && parse_team(community.team ?? []).length > 0;
}

export function language_block_visible(
  community: Pick<SidebarCommunity, "lang">,
  show: boolean
): boolean {
  return show && !!community.lang;
}

/** True when at least one sidebar block is both enabled and backed by community data. */
export function has_visible_sidebar_blocks(
  community: SidebarCommunity,
  flags: SidebarBlockFlags
): boolean {
  return (
    description_block_visible(community, flags.show_description) ||
    rules_block_visible(community, flags.show_rules) ||
    team_block_visible(community, flags.show_leadership) ||
    language_block_visible(community, flags.show_language)
  );
}

/**
 * SSR slot filter (SlotRenderer.astro): false for a community sidebar or block element that would render nothing.
 * Elements outside the community sidebar family always pass. Single blocks have no SSR-failure loader, so they need data.
 */
export function slot_element_renders(
  element_id: string,
  community: SidebarCommunity | null | undefined,
  community_failed: boolean,
  settings: SidebarSettings
): boolean {
  const flags = sidebar_block_flags(settings);
  switch (element_id) {
    case "communitySidebar":
      if (community) return has_visible_sidebar_blocks(community, flags);
      return community_failed && !all_sidebar_blocks_disabled(flags);
    case "communityDescription":
      return (
        !!community &&
        description_block_visible(community, flags.show_description)
      );
    case "communityRules":
      return !!community && rules_block_visible(community, flags.show_rules);
    case "communityTeam":
      return (
        !!community && team_block_visible(community, flags.show_leadership)
      );
    case "communityLanguage":
      return (
        !!community && language_block_visible(community, flags.show_language)
      );
    default:
      return true;
  }
}

/** Localized language name for a community `lang` code; unknown or invalid codes fall back to the upper-cased code. */
export function get_language_name(code: string, locale: unknown): string {
  try {
    const name = new Intl.DisplayNames([intl_locale(locale)], {
      type: "language",
      fallback: "none",
    }).of(code);
    if (name) return name;
  } catch {
    // Intl.DisplayNames throws RangeError for malformed language tags.
  }
  return code.toUpperCase();
}
