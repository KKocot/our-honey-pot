// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { ApiKeyAuth } from "@hiveio/wax";
import { get_broadcast_chain } from "./broadcast-chain";
import { is_valid_wif } from "./wif-signer";
import { is_valid_hive_username } from "../components/auth/constants";

export type PostingKeyFailure =
  | "empty"
  | "invalid_username"
  | "invalid_wif"
  | "account_not_found"
  | "wrong_role"
  | "not_posting_key"
  | "network";

export type PostingKeyVerification =
  | { ok: true; username: string; wif: string }
  | { ok: false; reason: PostingKeyFailure; message: string };

type NonPostingRole = "owner" | "active" | "memo";

// Compare without the address prefix (STM/TST) so the check works on mirrornet/testnet too.
function strip_prefix(public_key: string): string {
  return public_key.slice(3);
}

function has_key(auths: ReadonlyArray<ApiKeyAuth>, key: string): boolean {
  return auths.some((auth) => strip_prefix(auth[0]) === key);
}

function fail(
  reason: PostingKeyFailure,
  message: string,
): PostingKeyVerification {
  return { ok: false, reason, message };
}

/** Accepts only a key listed in the account's posting.key_auths; owner/active/memo keys are rejected. */
export async function verify_posting_key(
  raw_username: string,
  raw_wif: string,
): Promise<PostingKeyVerification> {
  const username = raw_username.trim().toLowerCase();
  const wif = raw_wif.trim();

  if (!username || !wif) return fail("empty", "Please fill in all fields");

  if (!is_valid_hive_username(username)) {
    return fail(
      "invalid_username",
      "Invalid username format. Must be 3-16 characters: lowercase letters, digits and hyphens.",
    );
  }

  if (!is_valid_wif(wif)) {
    return fail(
      "invalid_wif",
      "Invalid WIF format. Private keys start with 5 and are 51 characters",
    );
  }

  const network_error = fail(
    "network",
    "Could not verify key against the blockchain. Check your node connection and try again.",
  );

  let chain: Awaited<ReturnType<typeof get_broadcast_chain>>;
  try {
    chain = await get_broadcast_chain();
  } catch {
    return network_error;
  }

  let public_key: string;
  try {
    public_key = strip_prefix(chain.calculatePublicKey(wif));
  } catch {
    return fail("invalid_wif", "Invalid private key.");
  }

  let account;
  try {
    const { accounts } = await chain.api.database_api.find_accounts({
      accounts: [username],
    });
    account = accounts[0];
  } catch {
    return network_error;
  }

  if (!account) {
    return fail("account_not_found", `Account @${username} not found.`);
  }

  if (has_key(account.posting.key_auths, public_key)) {
    return { ok: true, username, wif };
  }

  let role: NonPostingRole | null = null;
  if (has_key(account.owner.key_auths, public_key)) role = "owner";
  else if (has_key(account.active.key_auths, public_key)) role = "active";
  else if (strip_prefix(account.memo_key) === public_key) role = "memo";

  if (role) {
    return fail(
      "wrong_role",
      `This is the ${role} key of @${username}. Only the posting key is accepted here.`,
    );
  }
  return fail(
    "not_posting_key",
    `This key does not belong to @${username}'s posting authority.`,
  );
}
