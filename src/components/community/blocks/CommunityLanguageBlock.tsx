// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { Show, type Component } from "solid-js";
import { t } from "../../../lib/i18n";
import { get_language_name, language_block_visible } from "../sidebar-blocks";
import {
  BLOCK_CARD_CLASS,
  BLOCK_HEADING_CLASS,
  type CommunityBlockProps,
} from "./block-card";

export const CommunityLanguageBlock: Component<CommunityBlockProps<"lang">> = (
  props
) => (
  <Show when={language_block_visible(props.community, props.show !== false)}>
    <div class={BLOCK_CARD_CLASS}>
      <h3 class={BLOCK_HEADING_CLASS}>
        {t(props.locale, "community.sidebar.language")}
      </h3>
      <p class="text-text-muted text-sm">
        {get_language_name(props.community.lang, props.locale)}
      </p>
    </div>
  </Show>
);
