// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, Show, onMount } from "solid-js";
import {
  verify_posting_key,
  type PostingKeyVerification,
} from "../../lib/verify-posting-key";
import { ErrorIcon, EyeIcon, EyeOffIcon, KeychainIcon } from "./icons";

interface WifLoginProps {
  onSuccess?: (user: {
    username: string;
    privateKey: string;
    keyType: "posting" | "active";
    loginType: "hbauth" | "keychain" | "wif";
  }) => void;
  onError?: (error: Error) => void;
  class?: string;
}

export function WifLogin(props: WifLoginProps) {
  const [username, setUsername] = createSignal("");
  const [private_key, setPrivateKey] = createSignal("");
  const key_type: "posting" | "active" = "posting";
  const [show_key, setShowKey] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [is_verifying, setIsVerifying] = createSignal(false);

  let username_ref: HTMLInputElement | undefined;

  onMount(() => {
    username_ref?.focus();
  });

  function is_submit_disabled(): boolean {
    return is_verifying() || !username().trim() || !private_key().trim();
  }

  async function handle_wif_login() {
    if (is_verifying()) return;
    setError(null);
    setIsVerifying(true);
    let result: PostingKeyVerification;
    try {
      result = await verify_posting_key(username(), private_key());
    } finally {
      setIsVerifying(false);
    }
    if (!result.ok) {
      setError(result.message);
      return;
    }

    setPrivateKey("");
    props.onSuccess?.({
      username: result.username,
      privateKey: result.wif,
      keyType: key_type,
      loginType: "wif",
    });
  }

  return (
    <div class={`w-full max-w-sm ${props.class ?? ""}`}>
      <div class="space-y-4">
        {/* Username */}
        <div>
          <label
            for="wif-username"
            class="block text-sm font-medium mb-1.5 text-text"
          >
            Username
          </label>
          <input
            id="wif-username"
            ref={username_ref}
            type="text"
            value={username()}
            onInput={(e) => setUsername(e.currentTarget.value.toLowerCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handle_wif_login();
              }
            }}
            placeholder="Enter your username"
            class="w-full px-3 py-2.5 rounded-lg border border-border bg-bg-card text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>

        {/* WIF Key */}
        <div>
          <label
            for="wif-private-key"
            class="block text-sm font-medium mb-1.5 text-text"
          >
            Posting Key (WIF)
          </label>
          <div class="relative">
            <input
              id="wif-private-key"
              type={show_key() ? "text" : "password"}
              value={private_key()}
              onInput={(e) => setPrivateKey(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handle_wif_login();
                }
              }}
              placeholder="5..."
              class="w-full px-3 py-2.5 pr-10 rounded-lg border border-border bg-bg-card text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowKey(!show_key())}
              class="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text"
            >
              {show_key() ? (
                <EyeOffIcon class="h-4 w-4" />
              ) : (
                <EyeIcon class="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Error Message */}
        <Show when={error()}>
          <div class="flex items-center gap-2 text-sm text-error">
            <ErrorIcon class="h-4 w-4 flex-shrink-0" />
            {error()}
          </div>
        </Show>

        {/* Submit */}
        <button
          onClick={() => handle_wif_login()}
          disabled={is_submit_disabled()}
          class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-primary-text font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          <KeychainIcon class="h-5 w-5" />
          {is_verifying() ? "Verifying key..." : "Login with WIF"}
        </button>

        {/* Info note */}
        <div class="rounded-lg border border-info/20 bg-info/5 p-3">
          <p class="text-xs text-info">
            <strong>Direct Key:</strong> Posting key only. It is kept in this
            tab's session storage until you log out or close the tab. For
            testnet/mirrornet use.
          </p>
        </div>
      </div>
    </div>
  );
}

export default WifLogin;
