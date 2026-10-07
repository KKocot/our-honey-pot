// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { Show, splitProps, type Component } from "solid-js";
import { CommunityLoader } from "./CommunityContent";
import type { HiveCommunity } from "../../lib/types/community";
import { hive_avatar_url } from "../../lib/config";

// ============================================
// Types
// ============================================

interface CommunityProfilePropsCardProps {
  community: HiveCommunity;
  show_subscribers?: boolean;
  avatar_size_px?: number;
  title_size_px?: number;
  about_size_px?: number;
}

// ============================================
// Helpers
// ============================================

function get_avatar_url(community_name: string): string {
  return hive_avatar_url(community_name, "medium");
}

function format_number(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return String(num);
}

// ============================================
// Component
// ============================================

const CommunityProfileCard: Component<CommunityProfilePropsCardProps> = (props) => {
  const community = () => props.community;

  return (
    <div class="bg-bg-card rounded-xl shadow-sm border border-border overflow-hidden max-w-xs">
      {/* Avatar + Title */}
      <div class="p-4 flex items-center gap-3">
        <img
          src={get_avatar_url(community().name)}
          alt={`${community().title} avatar`}
          width={props.avatar_size_px ?? 48}
          height={props.avatar_size_px ?? 48}
          class="rounded-full flex-shrink-0"
          loading="lazy"
        />
        <div class="min-w-0">
          <h2
            class="text-text font-semibold text-base leading-tight truncate"
            style={
              props.title_size_px
                ? { "font-size": `${props.title_size_px}px` }
                : undefined
            }
          >
            {community().title}
          </h2>
          <p class="text-text-muted text-xs mt-0.5">{community().name}</p>
        </div>
      </div>

      {/* About */}
      <Show when={community().about}>
        <p
          class="px-4 pb-3 text-text-muted text-sm leading-relaxed"
          style={
            props.about_size_px
              ? { "font-size": `${props.about_size_px}px` }
              : undefined
          }
        >
          {community().about}
        </p>
      </Show>

      {/* Stats */}
      <div class="px-4 pb-4 flex gap-4 text-sm">
        <Show when={props.show_subscribers !== false}>
          <div class="text-center">
            <span class="block font-semibold text-text">
              {format_number(community().subscribers)}
            </span>
            <span class="text-text-muted text-xs">Subscribers</span>
          </div>
        </Show>
        <div class="text-center">
          <span class="block font-semibold text-text">
            {format_number(community().num_authors)}
          </span>
          <span class="text-text-muted text-xs">Authors</span>
        </div>
        <Show when={community().sum_pending > 0}>
          <div class="text-center">
            <span class="block font-semibold text-text">
              ${community().sum_pending.toFixed(0)}
            </span>
            <span class="text-text-muted text-xs">Pending</span>
          </div>
        </Show>
      </div>
    </div>
  );
};

type CommunityProfileProps = Omit<CommunityProfilePropsCardProps, "community"> & {
  /** SSR data; null with `community_name` set means the SSR fetch failed and the island fetches it itself. */
  community: HiveCommunity | null;
  community_name?: string;
};

const CommunityProfile: Component<CommunityProfileProps> = (props) => {
  const [own, card_props] = splitProps(props, ["community", "community_name"]);
  return (
    <Show
      when={own.community}
      fallback={
        <Show when={own.community_name}>
          {(name) => (
            <CommunityLoader community_name={name()}>
              {(community) => <CommunityProfileCard community={community} {...card_props} />}
            </CommunityLoader>
          )}
        </Show>
      }
    >
      {(community) => <CommunityProfileCard community={community()} {...card_props} />}
    </Show>
  );
};

export { CommunityProfile };
