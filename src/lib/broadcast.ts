// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { operation } from "@hiveio/wax";
import { get_broadcast_chain } from "./broadcast-chain";
import { sign_transaction } from "./transaction-signer";
import { currentUser } from "../components/auth/auth-store";

// ============================================
// Types
// ============================================

export interface BroadcastResult {
  success: boolean;
  transaction_id?: string;
  error?: string;
}

export interface CommentInput {
  author: string;
  permlink: string;
  parent_author: string;
  parent_permlink: string;
  title: string;
  body: string;
  json_metadata: string;
}

const HIVE_100_PERCENT = 10000;

function assert_percent(name: string, value: number, min: number): void {
  if (!Number.isInteger(value) || value < min || value > HIVE_100_PERCENT) {
    throw new RangeError(`${name} must be an integer between ${min} and ${HIVE_100_PERCENT}`);
  }
}

export function build_vote_operation(voter: string, author: string, permlink: string, weight: number): operation {
  assert_percent("Vote weight", weight, -HIVE_100_PERCENT);
  return { vote_operation: { voter, author, permlink, weight } };
}

export function build_comment_operation(input: CommentInput): operation {
  return {
    comment_operation: {
      author: input.author,
      permlink: input.permlink,
      parent_author: input.parent_author,
      parent_permlink: input.parent_permlink,
      title: input.title,
      body: input.body,
      json_metadata: input.json_metadata,
    },
  };
}

// ============================================
// Internal helpers
// ============================================

function get_authenticated_user(): { username: string; private_key: string } | null {
  const user = currentUser();
  if (!user) return null;
  return { username: user.username, private_key: user.privateKey };
}

function normalize_error(err: unknown): string {
  const message = err instanceof Error ? err.message : "Broadcast failed";

  if (message.includes("not_enough_rc") || message.includes("RC mana")) {
    return "Not enough Resource Credits (RC). Please wait or power up more HIVE.";
  }
  if (message.includes("Not authorized") || message.includes("not unlocked")) {
    return "Session expired. Please login again.";
  }
  if (message.includes("missing required posting authority")) {
    return "Missing required posting authority. Make sure you are logged in with the correct key.";
  }
  return message;
}

// ============================================
// Vote
// ============================================

export async function broadcast_vote(
  voter: string,
  author: string,
  permlink: string,
  weight: number,
): Promise<BroadcastResult> {
  const auth = get_authenticated_user();
  if (!auth) return { success: false, error: "Not logged in. Please login first." };

  try {
    const chain = await get_broadcast_chain();
    const tx = await chain.createTransaction();

    tx.pushOperation(build_vote_operation(voter, author, permlink, weight));

    await sign_transaction(tx, auth.username, auth.private_key);
    await chain.broadcast(tx);

    return { success: true, transaction_id: tx.id };
  } catch (err: unknown) {
    return { success: false, error: normalize_error(err) };
  }
}

// ============================================
// Comment
// ============================================

export async function broadcast_comment(
  author: string,
  permlink: string,
  parent_author: string,
  parent_permlink: string,
  title: string,
  body: string,
  json_metadata: string,
): Promise<BroadcastResult> {
  const auth = get_authenticated_user();
  if (!auth) return { success: false, error: "Not logged in. Please login first." };

  try {
    const chain = await get_broadcast_chain();
    const tx = await chain.createTransaction();

    tx.pushOperation(
      build_comment_operation({
        author,
        permlink,
        parent_author,
        parent_permlink,
        title,
        body,
        json_metadata,
      }),
    );

    await sign_transaction(tx, auth.username, auth.private_key);
    await chain.broadcast(tx);

    return { success: true, transaction_id: tx.id };
  } catch (err: unknown) {
    return { success: false, error: normalize_error(err) };
  }
}
