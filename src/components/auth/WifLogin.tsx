// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createSignal, Show, onMount } from "solid-js";
import { EyeIcon, EyeOffIcon } from "../admin/editors/LayoutEditor/icons";
import { is_valid_wif } from "../../lib/wif-signer";
import { get_broadcast_chain } from "../../lib/broadcast-chain";
import type { ApiKeyAuth } from "@hiveio/wax";
import { ErrorIcon, KeychainIcon } from "./icons";
import { is_valid_hive_username } from "./constants";

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

type KeyRole = "posting" | "active" | "owner" | "memo";

// Compare without the address prefix (STM/TST) so the check works on mirrornet/testnet too.
function strip_prefix(public_key: string): string {
  return public_key.slice(3);
}

function has_key(auths: ReadonlyArray<ApiKeyAuth>, key: string): boolean {
  return auths.some((auth) => strip_prefix(auth[0]) === key);
}

async function verify_posting_key(
  username: string,
  wif: string,
): Promise<string | null> {
  const chain = await get_broadcast_chain();
  let public_key: string;
  try {
    public_key = strip_prefix(chain.calculatePublicKey(wif));
  } catch {
    return "Invalid private key.";
  }

  const { accounts } = await chain.api.database_api.find_accounts({
    accounts: [username],
  });
  const account = accounts[0];
  if (!account) return `Account @${username} not found.`;

  if (has_key(account.posting.key_auths, public_key)) return null;

  let role: KeyRole | null = null;
  if (has_key(account.owner.key_auths, public_key)) role = "owner";
  else if (has_key(account.active.key_auths, public_key)) role = "active";
  else if (strip_prefix(account.memo_key) === public_key) role = "memo";

  if (role) {
    return `This is the ${role} key of @${username}. Only the posting key is accepted here.`;
  }
  return `This key does not belong to @${username}'s posting authority.`;
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
    const user = username().trim().toLowerCase();
    const wif = private_key().trim();

    if (!user || !wif) {
      setError("Please fill in all fields");
      return;
    }

    if (!is_valid_hive_username(user)) {
      setError(
        "Invalid username format. Must be 3-16 characters: lowercase letters, digits and hyphens.",
      );
      return;
    }

    if (!is_valid_wif(wif)) {
      setError(
        "Invalid WIF format. Private keys start with 5 and are 51 characters",
      );
      return;
    }

    setError(null);
    setIsVerifying(true);
    try {
      const verification_error = await verify_posting_key(user, wif);
      if (verification_error) {
        setError(verification_error);
        return;
      }
    } catch {
      setError(
        "Could not verify key against the blockchain. Check your node connection and try again.",
      );
      return;
    } finally {
      setIsVerifying(false);
    }

    setPrivateKey("");
    props.onSuccess?.({
      username: user,
      privateKey: wif,
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
