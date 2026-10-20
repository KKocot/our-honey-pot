// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { For, Show, type Component } from "solid-js";
import { t } from "../../../lib/i18n";
import { parse_rules, rules_block_visible } from "../sidebar-blocks";
import {
  BLOCK_CARD_CLASS,
  BLOCK_HEADING_CLASS,
  type CommunityBlockProps,
} from "./block-card";

export const CommunityRulesBlock: Component<
  CommunityBlockProps<"flag_text">
> = (props) => {
  const rules = () => parse_rules(props.community.flag_text ?? "");
  return (
    <Show when={rules_block_visible(props.community, props.show !== false)}>
      <div class={BLOCK_CARD_CLASS}>
        <h3 class={BLOCK_HEADING_CLASS}>
          {t(props.locale, "community.sidebar.rules")}
        </h3>
        <ol class="list-decimal list-inside space-y-1.5 @xl:columns-2 @xl:gap-8">
          <For each={rules()}>
            {(rule) => (
              <li class="text-text-muted text-sm leading-relaxed break-inside-avoid">
                {rule}
              </li>
            )}
          </For>
        </ol>
      </div>
    </Show>
  );
};
