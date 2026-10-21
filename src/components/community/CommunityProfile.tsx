// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { Show, splitProps, type Component } from "solid-js";
import { CommunityLoader } from "./CommunityContent";
import type { HiveCommunity } from "../../lib/types/community";
import { hive_avatar_url } from "../../lib/config";
import { profile_part_flags, profile_renders } from "./sidebar-blocks";

// ============================================
// Types
// ============================================

interface CommunityProfilePropsCardProps {
  community: HiveCommunity;
  show_subscribers?: boolean;
  show_avatar?: boolean;
  show_name?: boolean;
  show_handle?: boolean;
  show_about?: boolean;
  show_authors?: boolean;
  show_pending?: boolean;
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

const CommunityProfileCard: Component<CommunityProfilePropsCardProps> = (
  props
) => {
  const community = () => props.community;
  const show_avatar = () => props.show_avatar !== false;
  const show_name = () => props.show_name !== false;
  const show_handle = () => props.show_handle !== false;
  const show_title_block = () => show_name() || show_handle();
  const show_header = () => show_avatar() || show_title_block();
  const show_about = () =>
    props.show_about !== false && Boolean(community().about);
  const show_subscribers = () => props.show_subscribers !== false;
  const show_authors = () => props.show_authors !== false;
  const show_pending = () =>
    props.show_pending !== false && community().sum_pending > 0;
  const show_stats = () =>
    show_subscribers() || show_authors() || show_pending();
  const show_card = () =>
    profile_renders(
      community(),
      profile_part_flags({
        community_show_avatar: props.show_avatar,
        community_show_name: props.show_name,
        community_show_handle: props.show_handle,
        community_show_about: props.show_about,
        community_show_subscribers: props.show_subscribers,
        community_show_authors: props.show_authors,
        community_show_pending: props.show_pending,
      })
    );

  return (
    <Show when={show_card()}>
      <div class="bg-bg-card rounded-token-lg shadow-sm border border-border overflow-hidden max-w-xs">
        <Show when={show_header()}>
          <div class="p-4 flex items-center gap-3">
            <Show when={show_avatar()}>
              <img
                src={get_avatar_url(community().name)}
                alt={`${community().title} avatar`}
                width={props.avatar_size_px ?? 48}
                height={props.avatar_size_px ?? 48}
                class="rounded-full flex-shrink-0"
                loading="lazy"
              />
            </Show>
            <Show when={show_title_block()}>
              <div class="min-w-0">
                <Show when={show_name()}>
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
                </Show>
                <Show when={show_handle()}>
                  <p
                    class="text-text-muted text-xs"
                    classList={{ "mt-0.5": show_name() }}
                  >
                    {community().name}
                  </p>
                </Show>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={show_about()}>
          <p
            class="px-4 pb-3 text-text-muted text-sm leading-relaxed"
            classList={{ "pt-4": !show_header() }}
            style={
              props.about_size_px
                ? { "font-size": `${props.about_size_px}px` }
                : undefined
            }
          >
            {community().about}
          </p>
        </Show>

        <Show when={show_stats()}>
          <div
            class="px-4 pb-4 flex gap-4 text-sm"
            classList={{ "pt-4": !show_header() && !show_about() }}
            data-testid="community-profile-stats"
          >
            <Show when={show_subscribers()}>
              <div class="text-center">
                <span class="block font-semibold text-text">
                  {format_number(community().subscribers)}
                </span>
                <span class="text-text-muted text-xs">Subscribers</span>
              </div>
            </Show>
            <Show when={show_authors()}>
              <div class="text-center">
                <span class="block font-semibold text-text">
                  {format_number(community().num_authors)}
                </span>
                <span class="text-text-muted text-xs">Authors</span>
              </div>
            </Show>
            <Show when={show_pending()}>
              <div class="text-center">
                <span class="block font-semibold text-text">
                  ${community().sum_pending.toFixed(0)}
                </span>
                <span class="text-text-muted text-xs">Pending</span>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
};

type CommunityProfileProps = Omit<
  CommunityProfilePropsCardProps,
  "community"
> & {
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
              {(community) => (
                <CommunityProfileCard community={community} {...card_props} />
              )}
            </CommunityLoader>
          )}
        </Show>
      }
    >
      {(community) => (
        <CommunityProfileCard community={community()} {...card_props} />
      )}
    </Show>
  );
};

export { CommunityProfile };
