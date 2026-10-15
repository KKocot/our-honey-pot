// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { Show, For, splitProps, type Component } from "solid-js";
import { CommunityLoader } from "./CommunityContent";
import type { HiveCommunity } from "../../lib/types/community";
import { escape_html } from "../../shared/formatters";
import { get_hive_blog_url } from "../../lib/config";
import {
  has_visible_sidebar_blocks,
  parse_rules,
  parse_team,
  type TeamRole,
} from "./sidebar-blocks";

// ============================================
// Types
// ============================================

interface CommunitySidebarPropsCardProps {
  community: HiveCommunity;
  show_description?: boolean;
  show_rules?: boolean;
  show_leadership?: boolean;
  show_language?: boolean;
}

// ============================================
// Helpers
// ============================================

const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Admin",
  mod: "Moderator",
};

const ROLE_COLORS: Record<TeamRole, string> = {
  owner: "bg-primary/10 text-primary",
  admin: "bg-accent/10 text-accent",
  mod: "bg-success/10 text-success",
};

function get_language_name(code: string): string {
  const languages: Record<string, string> = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    pt: "Portuguese",
    ko: "Korean",
    ja: "Japanese",
    zh: "Chinese",
    ru: "Russian",
    pl: "Polish",
    it: "Italian",
    nl: "Dutch",
    ar: "Arabic",
    tr: "Turkish",
    hi: "Hindi",
    id: "Indonesian",
    uk: "Ukrainian",
  };
  return languages[code] || code.toUpperCase();
}

// ============================================
// Component
// ============================================

const CommunitySidebarCard: Component<CommunitySidebarPropsCardProps> = (props) => {
  const community = () => props.community;
  const team_members = () => parse_team(community().team);
  const rules = () => parse_rules(community().flag_text);
  const has_blocks = () =>
    has_visible_sidebar_blocks(community(), {
      show_description: props.show_description !== false,
      show_rules: props.show_rules !== false,
      show_leadership: props.show_leadership !== false,
      show_language: props.show_language !== false,
    });

  return (
    <Show when={has_blocks()}>
      <div class="space-y-4 max-w-xs">
        {/* Description */}
        <Show when={props.show_description !== false && community().description}>
          <div class="bg-bg-card rounded-xl shadow-sm border border-border p-4">
            <h3 class="text-text font-semibold text-sm mb-2">Description</h3>
            <div
              class="text-text-muted text-sm leading-relaxed prose prose-sm max-w-none"
              innerHTML={escape_html(community().description).replace(
                /\n/g,
                "<br />"
              )}
            />
          </div>
        </Show>

        {/* Rules */}
        <Show when={props.show_rules !== false && rules().length > 0}>
          <div class="bg-bg-card rounded-xl shadow-sm border border-border p-4">
            <h3 class="text-text font-semibold text-sm mb-2">Rules</h3>
            <ol class="list-decimal list-inside space-y-1.5">
              <For each={rules()}>
                {(rule) => (
                  <li class="text-text-muted text-sm leading-relaxed">{rule}</li>
                )}
              </For>
            </ol>
          </div>
        </Show>

        {/* Leadership */}
        <Show when={props.show_leadership !== false && team_members().length > 0}>
          <div class="bg-bg-card rounded-xl shadow-sm border border-border p-4">
            <h3 class="text-text font-semibold text-sm mb-2">Team</h3>
            <div class="space-y-2">
              <For each={team_members()}>
                {(member) => (
                  <div class="flex items-center justify-between gap-2">
                    <a
                      href={`${get_hive_blog_url()}/@${member.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-sm text-text hover:text-primary transition-colors truncate"
                    >
                      @{member.username}
                    </a>
                    <span
                      class={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${ROLE_COLORS[member.role]}`}
                    >
                      {ROLE_LABELS[member.role]}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Language */}
        <Show when={props.show_language !== false && community().lang}>
          <div class="bg-bg-card rounded-xl shadow-sm border border-border p-4">
            <h3 class="text-text font-semibold text-sm mb-2">Language</h3>
            <p class="text-text-muted text-sm">
              {get_language_name(community().lang)}
            </p>
          </div>
        </Show>
      </div>
    </Show>
  );
};

type CommunitySidebarProps = Omit<CommunitySidebarPropsCardProps, "community"> & {
  /** SSR data; null with `community_name` set means the SSR fetch failed and the island fetches it itself. */
  community: HiveCommunity | null;
  community_name?: string;
};

const CommunitySidebar: Component<CommunitySidebarProps> = (props) => {
  const [own, card_props] = splitProps(props, ["community", "community_name"]);
  return (
    <Show
      when={own.community}
      fallback={
        <Show when={own.community_name}>
          {(name) => (
            <CommunityLoader community_name={name()}>
              {(community) => <CommunitySidebarCard community={community} {...card_props} />}
            </CommunityLoader>
          )}
        </Show>
      }
    >
      {(community) => <CommunitySidebarCard community={community()} {...card_props} />}
    </Show>
  );
};

export { CommunitySidebar };
