// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, onMount, Show, type Component } from "solid-js";
import { isAuthenticated, restoreSession } from "./auth-store";
import { LoginDialog } from "./LoginDialog";
import { UserMenu } from "./UserMenu";

export const AuthHeader: Component = () => {
  const [login_open, set_login_open] = createSignal(false);

  onMount(() => {
    restoreSession();
  });

  return (
    <div class="flex items-center">
      <Show
        when={isAuthenticated()}
        fallback={
          <>
            <button
              type="button"
              onClick={() => set_login_open(true)}
              class="bg-primary hover:bg-primary-hover text-primary-text text-sm font-medium rounded-lg px-4 py-2 transition-colors cursor-pointer"
            >
              Login
            </button>
            <LoginDialog
              open={login_open}
              on_close={() => set_login_open(false)}
            />
          </>
        }
      >
        <UserMenu />
      </Show>
    </div>
  );
};
