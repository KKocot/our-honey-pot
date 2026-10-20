// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { Show, type Component } from "solid-js";
import { escape_html } from "../../../shared/formatters";
import { t } from "../../../lib/i18n";
import { description_block_visible } from "../sidebar-blocks";
import {
  BLOCK_CARD_CLASS,
  BLOCK_HEADING_CLASS,
  type CommunityBlockProps,
} from "./block-card";

export const CommunityDescriptionBlock: Component<
  CommunityBlockProps<"description">
> = (props) => (
  <Show when={description_block_visible(props.community, props.show !== false)}>
    <div class={BLOCK_CARD_CLASS}>
      <h3 class={BLOCK_HEADING_CLASS}>
        {t(props.locale, "community.sidebar.description")}
      </h3>
      <div
        class="text-text-muted text-sm leading-relaxed prose prose-sm max-w-none @2xl:max-w-prose"
        innerHTML={escape_html(props.community.description).replace(
          /\n/g,
          "<br />"
        )}
      />
    </div>
  </Show>
);
