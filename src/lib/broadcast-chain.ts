// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { createHiveChain } from "@hiveio/wax";
import { get_hive_chain_id } from "./config";
import { get_current_endpoint } from "./node-endpoint";
import { append_dev_op, is_dev_mode } from "./dev-mode";

type BroadcastChain = Awaited<ReturnType<typeof createHiveChain>>;
type BroadcastInput = Parameters<BroadcastChain["broadcast"]>[0];

/**
 * Singleton chain for broadcast operations.
 * Uses createHiveChain directly (with chainId) instead of workerbee getWax()
 * because workerbee does not propagate chainId to createHiveChain,
 * causing wrong sigDigest on mirrornet/testnet.
 */
let broadcast_chain_promise: ReturnType<typeof createHiveChain> | undefined;

/**
 * Chain used for signing and broadcasting. In dev mode returns a wrapper whose
 * `broadcast` logs to `ohp-dev:ops` instead of sending; reads stay live.
 */
export function get_broadcast_chain(): ReturnType<typeof createHiveChain> {
  const chain_promise = get_live_chain();
  return import.meta.env.DEV && is_dev_mode()
    ? chain_promise.then(wrap_dev_chain)
    : chain_promise;
}

function get_live_chain(): ReturnType<typeof createHiveChain> {
  if (!broadcast_chain_promise) {
    broadcast_chain_promise = createHiveChain({
      apiEndpoint: get_current_endpoint(),
      chainId: get_hive_chain_id(),
    }).catch((error) => {
      // Reset on failure so next call retries instead of returning rejected promise
      broadcast_chain_promise = undefined;
      throw error;
    });
  }
  return broadcast_chain_promise;
}

// Dynamic import: a static one would pull auth-store (and beekeeper) into every page that resets the chain
async function record_dev_broadcast(
  chain: BroadcastChain,
  input: BroadcastInput,
): Promise<void> {
  const tx =
    "transaction" in input ? input : chain.createTransactionFromJson(input);
  const { currentUser } = await import("../components/auth/auth-store");
  append_dev_op({
    ts: Date.now(),
    tx_id: tx.id,
    operations: tx.transaction.operations,
    username: currentUser()?.username,
  });
}

function wrap_dev_chain(chain: BroadcastChain): BroadcastChain {
  const broadcast = (input: BroadcastInput): Promise<void> =>
    record_dev_broadcast(chain, input);
  return new Proxy(chain, {
    get(target, prop) {
      if (prop === "broadcast") return broadcast;
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** Reset the singleton chain, forcing re-creation with the current endpoint on next call */
export function reset_broadcast_chain(): void {
  broadcast_chain_promise = undefined;
}

// Reset singleton on HMR to prevent stale connections in dev mode
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    broadcast_chain_promise = undefined;
  });
}
