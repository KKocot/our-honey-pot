// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, Show, onMount, onCleanup, type Component } from "solid-js";
import { currentUser, logout } from "./auth-store";
import { hive_avatar_url } from "../../lib/config";

export const UserMenu: Component = () => {
  const [open, set_open] = createSignal(false);
  let container_ref: HTMLDivElement | undefined;

  function handle_click_outside(e: MouseEvent) {
    if (container_ref && !container_ref.contains(e.target as Node)) {
      set_open(false);
    }
  }

  function handle_keydown(e: KeyboardEvent) {
    if (e.key === "Escape") set_open(false);
  }

  onMount(() => {
    document.addEventListener("click", handle_click_outside, true);
    document.addEventListener("keydown", handle_keydown);
  });

  onCleanup(() => {
    document.removeEventListener("click", handle_click_outside, true);
    document.removeEventListener("keydown", handle_keydown);
  });

  function handle_logout() {
    set_open(false);
    logout();
  }

  const user = () => currentUser();
  const avatar_url = () => hive_avatar_url(user()?.username ?? "", "small");

  return (
    <div ref={container_ref} class="relative">
      <button
        type="button"
        onClick={() => set_open(!open())}
        class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-bg-secondary transition-colors cursor-pointer"
        aria-expanded={open()}
        aria-haspopup="menu"
      >
        <img
          src={avatar_url()}
          alt={user()?.username ?? ""}
          class="w-7 h-7 rounded-full"
        />
        <span class="text-sm text-text font-medium hidden sm:inline">
          {user()?.username}
        </span>
        <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <Show when={open()}>
        <div class="absolute right-0 top-full mt-1 w-48 bg-bg-card border border-border rounded-xl shadow-lg z-50 py-1" role="menu">
          <a
            href="/new"
            class="flex items-center gap-2 px-4 py-2 text-sm text-text hover:bg-bg-secondary transition-colors"
            role="menuitem"
            onClick={() => set_open(false)}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            New Post
          </a>
          <a
            href="/admin"
            class="flex items-center gap-2 px-4 py-2 text-sm text-text hover:bg-bg-secondary transition-colors"
            role="menuitem"
            onClick={() => set_open(false)}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Admin Panel
          </a>
          <div class="border-t border-border my-1" />
          <button
            type="button"
            onClick={handle_logout}
            class="flex items-center gap-2 w-full px-4 py-2 text-sm text-error hover:bg-bg-secondary transition-colors cursor-pointer"
            role="menuitem"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </Show>
    </div>
  );
};
