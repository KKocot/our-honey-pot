// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { Match, Show, Switch, createSignal, onMount } from "solid-js";
import { read_dev_config } from "../admin/hive-broadcast";
import { get_hive_username } from "../../lib/config";
import { DEV_STORAGE_PREFIX, is_dev_mode_available } from "../../lib/dev-mode";
import {
  dev_config_hash,
  fetch_dev_config_info,
  normalize_dev_config_blog,
  plan_dev_config_sync,
  push_dev_config,
  server_only_notice,
} from "../../lib/dev-config-store";
import { X } from "lucide-solid";

type SyncState = "pending" | "synced" | "failed" | "server_only";

function reload_guard_key(blog: string): string {
  return `${DEV_STORAGE_PREFIX}config-reload:${blog}`;
}

function read_guard(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write_guard(key: string, value: string | null): boolean {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function DevConfigReapplyImpl() {
  const [saved_at, set_saved_at] = createSignal<string | null>(null);
  const [state, set_state] = createSignal<SyncState>("pending");
  const [dismissed, set_dismissed] = createSignal(false);
  const [server_origin, set_server_origin] = createSignal<string | null>(null);

  onMount(async () => {
    if (!is_dev_mode_available()) return;
    const blog = normalize_dev_config_blog(get_hive_username());
    if (!blog) return;
    // Null also when dev mode is off or after a dev data reset; the server copy is then left alone (see plan_dev_config_sync)
    const local = read_dev_config(blog);
    const local_hash = local ? dev_config_hash(local) : null;
    const guard_key = reload_guard_key(blog);
    if (local) set_saved_at(local.saved_at);

    try {
      const server = await fetch_dev_config_info(blog);
      set_server_origin(server?.origin ?? null);
      const plan = plan_dev_config_sync({
        local_hash,
        server_hash: server?.hash ?? null,
      });
      if (plan === "synced") {
        write_guard(guard_key, null);
        set_state("synced");
        return;
      }
      if (plan === "server_only" || !local || local_hash === null) {
        set_state("server_only");
        return;
      }
      await push_dev_config(blog, local);
    } catch (error) {
      console.warn(
        "Dev mode: could not sync the local config with the dev server:",
        error,
      );
      set_state("failed");
      return;
    }

    // One reload per target hash: a server that keeps disagreeing must not loop the page
    if (
      read_guard(guard_key) === local_hash ||
      !write_guard(guard_key, local_hash)
    ) {
      set_state("failed");
      return;
    }
    location.reload();
  });

  return (
    <Show
      when={
        (saved_at() || state() === "server_only") &&
        state() !== "pending" &&
        !dismissed()
      }
    >
      <aside
        aria-label="Dev mode notice"
        class="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-warning bg-bg-card p-3 text-xs text-text shadow-lg"
      >
        <Switch>
          <Match when={state() === "server_only"}>
            <p>
              <span class="font-semibold text-warning">
                Dev mode: config from another tab or origin.
              </span>{" "}
              {server_only_notice(server_origin(), location.origin)}
            </p>
          </Match>
          <Match when={state() === "synced"}>
            <p>
              <span class="font-semibold text-warning">
                Dev mode: local config.
              </span>{" "}
              This page renders the config saved in /admin (
              {new Date(saved_at() ?? "").toLocaleString()}), not the one on
              Hive.
            </p>
          </Match>
          <Match when={state() === "failed"}>
            <p>
              <span class="font-semibold text-warning">
                Dev mode: local config.
              </span>{" "}
              The dev server could not render the config saved in /admin (
              {new Date(saved_at() ?? "").toLocaleString()}); this page shows
              the config on Hive. See the console.
            </p>
          </Match>
        </Switch>
        <button
          type="button"
          onClick={() => set_dismissed(true)}
          class="shrink-0 rounded p-0.5 text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
          aria-label="Dismiss dev mode notice"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </aside>
    </Show>
  );
}

/**
 * Dev mode only: mirrors the local config saved in /admin into the dev server, so SSR renders it on public pages
 * (src/lib/dev-config-store.ts), and reloads once when the server copy was stale. Astro emits the island chunk in
 * production builds too, so the literal DEV gate keeps that chunk empty.
 */
export const DevConfigReapply = import.meta.env.DEV
  ? DevConfigReapplyImpl
  : () => null;
