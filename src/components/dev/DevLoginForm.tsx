// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, createUniqueId, For, Show } from "solid-js";
import type { AuthUser } from "../auth/auth-store";
import { is_valid_hive_username } from "../auth/constants";
import {
  is_dev_role_allowed,
  read_dev_role_override,
  set_dev_role_override,
} from "../../lib/config-account";
import { get_hive_username, is_community } from "../../lib/config";
import type { BlogRole } from "../../lib/community-roles";

const ROLE_OPTIONS: ReadonlyArray<{ value: BlogRole; label: string }> = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "mod", label: "Moderator" },
  { value: "none", label: "No role" },
];

const FIELD_CLASS =
  "w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11";

interface DevLoginFormProps {
  /** Prefilled username, normally the blog config account (saving is allowed only as that account). */
  default_username?: string | null;
  /** Performs the login (e.g. the admin session handler); a thrown error is shown inline. */
  on_login: (user: AuthUser) => void;
  on_cancel?: () => void;
  autofocus?: boolean;
}

/** Dev mode only: keyless login as any account with an overridden blog role. */
function DevLoginFormImpl(props: DevLoginFormProps) {
  const id = createUniqueId();
  const [username, set_username] = createSignal(props.default_username ?? "");
  const [role, set_role] = createSignal<BlogRole>("owner");
  const [error, set_error] = createSignal<string | null>(null);
  const blog = get_hive_username().trim().toLowerCase();
  const personal_blog = blog !== "" && !is_community(blog);

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const name = username().trim().toLowerCase();
    if (!is_valid_hive_username(name)) {
      set_error("Enter a valid Hive username (3-16 characters: a-z, 0-9, -).");
      return;
    }
    if (!is_dev_role_allowed(blog, { username: name, role: role() })) {
      set_error(
        `On a personal blog only @${blog} is the owner. Log in as @${blog} or pick another role.`,
      );
      return;
    }
    // Stored before login: the role is read as soon as the session signal changes
    const previous = read_dev_role_override();
    if (!set_dev_role_override({ username: name, role: role() })) {
      set_error("Could not store the role override. Is dev mode enabled?");
      return;
    }
    try {
      props.on_login({
        username: name,
        privateKey: "",
        keyType: "posting",
        loginType: "dev",
      });
      set_error(null);
    } catch (err) {
      set_dev_role_override(previous);
      set_error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      class="space-y-3"
      aria-describedby={`${id}-hint`}
    >
      <p id={`${id}-hint`} class="text-xs text-text-muted">
        No key needed. Writes go to localStorage, nothing is broadcast to Hive.
      </p>
      <div class="space-y-1">
        <label
          for={`${id}-username`}
          class="block text-xs font-medium text-text"
        >
          Username
        </label>
        <input
          ref={(element) => {
            if (props.autofocus)
              requestAnimationFrame(() =>
                element.focus({ preventScroll: true }),
              );
          }}
          id={`${id}-username`}
          type="text"
          value={username()}
          onInput={(event) => {
            set_username(event.currentTarget.value);
            set_error(null);
          }}
          placeholder="hive-account"
          autocomplete="off"
          autocapitalize="none"
          spellcheck={false}
          required
          aria-invalid={error() !== null}
          aria-describedby={error() ? `${id}-error` : undefined}
          class={FIELD_CLASS}
        />
      </div>
      <div class="space-y-1">
        <label for={`${id}-role`} class="block text-xs font-medium text-text">
          Role on this blog
        </label>
        <select
          id={`${id}-role`}
          aria-describedby={personal_blog ? `${id}-role-hint` : undefined}
          value={role()}
          onChange={(event) => {
            set_role(event.currentTarget.value as BlogRole);
            set_error(null);
          }}
          class={FIELD_CLASS}
        >
          <For each={ROLE_OPTIONS}>
            {(option) => <option value={option.value}>{option.label}</option>}
          </For>
        </select>
        <Show when={personal_blog}>
          <p id={`${id}-role-hint`} class="text-xs text-text-muted">
            Personal blog: Owner is the blog account @{blog}.
          </p>
        </Show>
      </div>
      <Show when={error()}>
        {(message) => (
          <p id={`${id}-error`} role="alert" class="text-xs text-error">
            {message()}
          </p>
        )}
      </Show>
      <div class="flex justify-end gap-2">
        <Show when={props.on_cancel}>
          {(cancel) => (
            <button
              type="button"
              onClick={() => cancel()()}
              class="rounded-md px-3 py-1.5 text-sm text-text hover:bg-bg-secondary focus-visible:outline-2 focus-visible:outline-primary max-md:min-h-11"
            >
              Cancel
            </button>
          )}
        </Show>
        <button
          type="submit"
          class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-text hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary max-md:min-h-11"
        >
          Log in as @{username().trim().toLowerCase() || "..."}
        </button>
      </div>
    </form>
  );
}

/** Literal DEV gate so production bundles drop the form and its strings. */
export const DevLoginForm = import.meta.env.DEV ? DevLoginFormImpl : () => null;
