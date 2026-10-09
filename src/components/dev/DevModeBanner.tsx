// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { Show, createSignal, onMount } from "solid-js";
import { read_dev_config } from "../admin/hive-broadcast";
import { get_hive_username } from "../../lib/config";
import { is_dev_mode } from "../../lib/dev-mode";

interface DevModeBannerProps {
  /** `editor`: /admin shell (below its top bar); `page`: public pages (above the node switcher). */
  placement: "editor" | "page";
}

function DevModeBannerImpl(props: DevModeBannerProps) {
  const [visible, set_visible] = createSignal(false);

  onMount(() => {
    if (!is_dev_mode()) return;
    // Public pages with a local config already show the DevConfigReapply notice
    set_visible(
      props.placement === "editor" || !read_dev_config(get_hive_username()),
    );
  });

  return (
    <Show when={visible()}>
      <p
        class={`pointer-events-none fixed z-[60] rounded-full border border-warning bg-bg-card/95 px-3 py-1 text-xs font-semibold text-warning shadow-md ${
          props.placement === "editor" ? "top-14 left-3" : "bottom-16 left-4"
        }`}
      >
        DEV MODE — writes go to localStorage
      </p>
    </Show>
  );
}

/** Dev mode only: always-visible reminder that Hive writes are intercepted; the literal DEV gate empties the prod chunk. */
export const DevModeBanner = import.meta.env.DEV
  ? DevModeBannerImpl
  : () => null;
