// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, Show, For, onMount, onCleanup } from "solid-js";
import { get_hive_api_endpoints } from "../../lib/config";
import { setOnlineClientRpcEndpoint } from "../../lib/hbauth-service";
import { reset_broadcast_chain } from "../../lib/broadcast-chain";
import { reconfigure_endpoints } from "../../lib/hive-endpoints";
import {
  build_read_endpoints,
  is_valid_endpoint,
  read_stored_endpoint,
  store_endpoint,
} from "../../lib/node-endpoint";

const CUSTOM_VALUE = "__custom__";

/** Save endpoint and point HB-Auth, broadcast and workerbee reads at it; false for an invalid URL */
function apply_endpoint(url: string): boolean {
  if (!is_valid_endpoint(url)) return false;
  // Without storage the choice still applies to this page's read endpoints.
  store_endpoint(url);

  try {
    setOnlineClientRpcEndpoint(url);
  } catch {
    // Client may not be initialized yet -- ignore
  }

  reset_broadcast_chain();
  reconfigure_endpoints(build_read_endpoints(url, get_hive_api_endpoints()));
  return true;
}

/** Extract hostname from a URL for display */
function display_name(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function NodeSwitcher() {
  const endpoints = get_hive_api_endpoints();
  const default_endpoint = read_stored_endpoint() || endpoints[0];
  const is_known = endpoints.includes(default_endpoint);

  const [open, set_open] = createSignal(false);
  const [selected, set_selected] = createSignal(
    is_known ? default_endpoint : CUSTOM_VALUE,
  );
  const [custom_url, set_custom_url] = createSignal(
    is_known ? "" : default_endpoint,
  );
  const [custom_error, set_custom_error] = createSignal("");

  let container_ref: HTMLDivElement | undefined;

  /** Close dropdown when clicking outside */
  function handle_click_outside(e: MouseEvent) {
    if (container_ref && !container_ref.contains(e.target as Node)) {
      set_open(false);
    }
  }

  /** Close dropdown on Escape key */
  function handle_keydown(e: KeyboardEvent) {
    if (e.key === "Escape") set_open(false);
  }

  onMount(() => {
    document.addEventListener("mousedown", handle_click_outside);
    document.addEventListener("keydown", handle_keydown);
  });

  onCleanup(() => {
    if (typeof document !== "undefined") {
      document.removeEventListener("mousedown", handle_click_outside);
      document.removeEventListener("keydown", handle_keydown);
    }
  });

  function handle_select(value: string) {
    set_selected(value);
    set_custom_error("");

    if (value !== CUSTOM_VALUE) {
      set_custom_url("");
      apply_endpoint(value);
    }
  }

  function handle_custom_submit() {
    const url = custom_url().trim();
    if (!apply_endpoint(url)) {
      set_custom_error("Enter a valid https:// URL");
      return;
    }
    set_custom_error("");
  }

  /** Current active endpoint for display */
  function active_endpoint(): string {
    if (selected() === CUSTOM_VALUE) {
      const url = custom_url().trim();
      return url || "Custom";
    }
    return selected();
  }

  return (
    <div ref={container_ref} class="relative">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => set_open(!open())}
        class="flex items-center gap-1.5 rounded-lg bg-bg-secondary border border-border px-2.5 py-1.5 text-xs text-text-muted hover:text-text transition-colors cursor-pointer"
        title={`Node: ${display_name(active_endpoint())}`}
        aria-label="Change API node"
      >
        {/* Server icon */}
        <svg
          class="size-3.5 shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="2" y="1.5" width="12" height="4" rx="1" />
          <rect x="2" y="6.5" width="12" height="4" rx="1" />
          <circle cx="5" cy="3.5" r="0.5" fill="currentColor" />
          <circle cx="5" cy="8.5" r="0.5" fill="currentColor" />
          <line x1="8" y1="11.5" x2="8" y2="14" />
          <line x1="5" y1="14" x2="11" y2="14" />
        </svg>

        <Show when={open()}>
          <span class="max-w-32 truncate">
            {display_name(active_endpoint())}
          </span>
        </Show>
      </button>

      {/* Dropdown panel */}
      <Show when={open()}>
        <div class="absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-border bg-bg-secondary shadow-lg">
          <div class="p-2">
            <p class="text-xs font-medium text-text-muted mb-2 px-1">
              API Node
            </p>

            {/* Node list */}
            <div class="flex flex-col gap-0.5">
              <For each={endpoints}>
                {(endpoint) => (
                  <button
                    type="button"
                    onClick={() => handle_select(endpoint)}
                    class={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors cursor-pointer ${
                      selected() === endpoint
                        ? "bg-primary/15 text-primary font-medium"
                        : "text-text-muted hover:bg-bg hover:text-text"
                    }`}
                  >
                    {display_name(endpoint)}
                  </button>
                )}
              </For>

              {/* Custom option */}
              <button
                type="button"
                onClick={() => handle_select(CUSTOM_VALUE)}
                class={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors cursor-pointer ${
                  selected() === CUSTOM_VALUE
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-text-muted hover:bg-bg hover:text-text"
                }`}
              >
                Custom...
              </button>
            </div>

            {/* Custom URL input */}
            <Show when={selected() === CUSTOM_VALUE}>
              <div class="mt-2 flex flex-col gap-1.5">
                <input
                  type="url"
                  placeholder="https://..."
                  value={custom_url()}
                  onInput={(e) => set_custom_url(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handle_custom_submit();
                  }}
                  class="w-full rounded border border-border bg-bg px-2 py-1.5 text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Show when={custom_error()}>
                  <p class="text-xs text-error px-1">{custom_error()}</p>
                </Show>
                <button
                  type="button"
                  onClick={handle_custom_submit}
                  class="self-end rounded bg-primary px-3 py-1 text-xs font-medium text-primary-text hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Apply
                </button>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
