// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For, Show, type Component } from "solid-js";
import { t, type I18nKey } from "../../../lib/i18n";
import { get_hive_blog_url } from "../../../lib/config";
import {
  parse_team,
  team_block_visible,
  type TeamRole,
} from "../sidebar-blocks";
import {
  BLOCK_CARD_CLASS,
  BLOCK_HEADING_CLASS,
  type CommunityBlockProps,
} from "./block-card";

const ROLE_LABEL_KEYS: Record<TeamRole, I18nKey> = {
  owner: "community.role.owner",
  admin: "community.role.admin",
  mod: "community.role.mod",
};

const ROLE_COLORS: Record<TeamRole, string> = {
  owner: "bg-primary/10 text-primary",
  admin: "bg-accent/10 text-accent",
  mod: "bg-success/10 text-success",
};

export const CommunityTeamBlock: Component<CommunityBlockProps<"team">> = (
  props
) => {
  const members = () => parse_team(props.community.team ?? []);
  return (
    <Show when={team_block_visible(props.community, props.show !== false)}>
      <div class={BLOCK_CARD_CLASS}>
        <h3 class={BLOCK_HEADING_CLASS}>
          {t(props.locale, "community.sidebar.team")}
        </h3>
        <div class="grid gap-2 @md:grid-cols-2 @md:gap-x-6 @2xl:grid-cols-3">
          <For each={members()}>
            {(member) => (
              <div class="flex items-center justify-between gap-2 min-w-0">
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
                  {t(props.locale, ROLE_LABEL_KEYS[member.role])}
                </span>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
};
