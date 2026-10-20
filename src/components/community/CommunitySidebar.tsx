// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { Show, splitProps, type Component } from "solid-js";
import { CommunityLoader } from "./CommunityContent";
import type { HiveCommunity } from "../../lib/types/community";
import { has_visible_sidebar_blocks } from "./sidebar-blocks";
import {
  CommunityDescriptionBlock,
  CommunityLanguageBlock,
  CommunityRulesBlock,
  CommunityTeamBlock,
} from "./blocks";

interface CommunitySidebarCardProps {
  community: HiveCommunity;
  /** UI locale for block labels; missing or unknown falls back to English. */
  locale?: string;
  show_description?: boolean;
  show_rules?: boolean;
  show_leadership?: boolean;
  show_language?: boolean;
}

/** Aggregate of the four community blocks; the max-w-xs cap lives here so standalone blocks can span wide slots. */
export const CommunitySidebarCard: Component<CommunitySidebarCardProps> = (
  props
) => {
  const has_blocks = () =>
    has_visible_sidebar_blocks(props.community, {
      show_description: props.show_description !== false,
      show_rules: props.show_rules !== false,
      show_leadership: props.show_leadership !== false,
      show_language: props.show_language !== false,
    });

  return (
    <Show when={has_blocks()}>
      <div class="space-y-4 max-w-xs">
        <CommunityDescriptionBlock
          community={props.community}
          locale={props.locale}
          show={props.show_description}
        />
        <CommunityRulesBlock
          community={props.community}
          locale={props.locale}
          show={props.show_rules}
        />
        <CommunityTeamBlock
          community={props.community}
          locale={props.locale}
          show={props.show_leadership}
        />
        <CommunityLanguageBlock
          community={props.community}
          locale={props.locale}
          show={props.show_language}
        />
      </div>
    </Show>
  );
};

type CommunitySidebarProps = Omit<CommunitySidebarCardProps, "community"> & {
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
              {(community) => (
                <CommunitySidebarCard community={community} {...card_props} />
              )}
            </CommunityLoader>
          )}
        </Show>
      }
    >
      {(community) => (
        <CommunitySidebarCard community={community()} {...card_props} />
      )}
    </Show>
  );
};

export { CommunitySidebar };
