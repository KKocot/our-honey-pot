// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import {
  OnlineClient,
  OfflineClient,
  type ClientOptions,
} from "@hiveio/hb-auth";
import {
  HBAUTH_SESSION_TIMEOUT_MS,
  get_hive_chain_id,
  is_not_mainnet,
} from "./config";
import { get_current_endpoint, is_valid_endpoint } from "./node-endpoint";

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_SESSION_TIMEOUT = HBAUTH_SESSION_TIMEOUT_MS;

// ============================================================================
// Worker URL Resolution
// ============================================================================

/**
 * Get the worker URL with proper path handling
 * Worker is served at /auth/worker.js by the SSR endpoint src/pages/auth/worker.js.ts (own CSP)
 */
function getWorkerUrl(): string {
  // Server-side: return default path
  if (typeof window === "undefined") {
    return "/auth/worker.js";
  }

  // Client-side: same-origin path handled by the worker SSR endpoint
  return "/auth/worker.js";
}

// ============================================================================
// Client Options
// ============================================================================

/**
 * Get default client options for Hbauth
 * Uses the validated user-selected node endpoint (falls back to config default)
 */
function getDefaultClientOptions(): ClientOptions {
  return {
    sessionTimeout: DEFAULT_SESSION_TIMEOUT,
    chainId: get_hive_chain_id(),
    node: get_current_endpoint(),
    workerUrl: getWorkerUrl(),
  };
}

// ============================================================================
// Singleton Instances
// ============================================================================

let onlineClientPromise: Promise<OnlineClient> | undefined = undefined;
let onlineClient: OnlineClient | undefined = undefined;
let offlineClientPromise: Promise<OfflineClient> | undefined = undefined;

// Reset on HMR in dev mode
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    onlineClientPromise = undefined;
    onlineClient = undefined;
    offlineClientPromise = undefined;
  });
}

// ============================================================================
// Online Client (for browser with network access)
// ============================================================================

/**
 * Create and initialize an OnlineClient
 * This is intentionally non-async to prevent race conditions
 */
function setOnlineClient(
  options: Partial<ClientOptions> = {},
): Promise<OnlineClient> {
  const clientOptions = {
    ...getDefaultClientOptions(),
    ...options,
  };

  const sanitized_options = {
    ...clientOptions,
    node: clientOptions.node ? "[REDACTED]" : undefined,
  };
  console.info(
    "Creating instance of HB-Auth OnlineClient with options:",
    sanitized_options,
  );

  onlineClientPromise = new OnlineClient(clientOptions).initialize();

  return onlineClientPromise.then((client) => {
    onlineClient = client;
    return client;
  });
}

/**
 * Initialize the OnlineClient singleton
 * Use this to eagerly initialize the client on app startup
 */
export function initOnlineClient(): Promise<OnlineClient> {
  if (onlineClientPromise) {
    return onlineClientPromise;
  }

  return setOnlineClient();
}

/**
 * Get the OnlineClient singleton, creating it if necessary
 * This is the main entry point for authentication operations
 */
export function getOnlineClient(): Promise<OnlineClient> {
  if (onlineClientPromise) {
    return onlineClientPromise;
  }

  return setOnlineClient();
}

/**
 * Interface for the internal structure of OnlineClient
 * Used to access hiveChain.api.endpointUrl property
 */
interface OnlineClientWithHiveChain {
  hiveChain: {
    api: {
      endpointUrl: string;
    };
  };
}

/**
 * Type guard to check if an object has the hiveChain structure
 */
function hasHiveChainApi(client: unknown): client is OnlineClientWithHiveChain {
  if (typeof client !== "object" || client === null) return false;
  if (!("hiveChain" in client)) return false;

  const hiveChain = (client as { hiveChain: unknown }).hiveChain;
  if (typeof hiveChain !== "object" || hiveChain === null) return false;
  if (!("api" in hiveChain)) return false;

  const api = (hiveChain as { api: unknown }).api;
  return typeof api === "object" && api !== null;
}

/**
 * Update the RPC endpoint for the OnlineClient
 * Requires the client to be initialized first
 */
export function setOnlineClientRpcEndpoint(newEndpoint: string): void {
  if (!is_valid_endpoint(newEndpoint)) {
    throw new Error(
      is_not_mainnet()
        ? "RPC endpoint must be an http:// or https:// URL."
        : "RPC endpoint must be an https:// URL on mainnet.",
    );
  }

  if (!onlineClient) {
    throw new Error(
      "OnlineClient is not initialized yet. Call initOnlineClient() first.",
    );
  }

  if (!hasHiveChainApi(onlineClient)) {
    throw new Error(
      "OnlineClient does not have the expected hiveChain.api structure.",
    );
  }

  // Update the endpoint on the underlying hive chain
  onlineClient.hiveChain.api.endpointUrl = newEndpoint;
}

/** End the HB-Auth worker session so the key is locked immediately, not after sessionTimeout. Never throws. */
export async function logoutOnlineClient(username: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const client = await getOnlineClient();
    await client.logout(username);
  } catch (err) {
    console.error("HB-Auth logout failed:", err);
  }
}

// ============================================================================
// Offline Client (for signing without network)
// ============================================================================

/**
 * Create and initialize an OfflineClient
 * This is intentionally non-async to prevent race conditions
 */
function setOfflineClient(
  options: Partial<ClientOptions> = {},
): Promise<OfflineClient> {
  const clientOptions = {
    ...getDefaultClientOptions(),
    ...options,
  };

  const sanitized_options = {
    ...clientOptions,
    node: clientOptions.node ? "[REDACTED]" : undefined,
  };
  console.info(
    "Creating instance of HB-Auth OfflineClient with options:",
    sanitized_options,
  );

  offlineClientPromise = new OfflineClient(clientOptions).initialize();

  return offlineClientPromise;
}

/**
 * Get the OfflineClient singleton, creating it if necessary
 * Use this for offline signing operations
 */
export function getOfflineClient(): Promise<OfflineClient> {
  if (offlineClientPromise) {
    return offlineClientPromise;
  }

  return setOfflineClient();
}

// ============================================================================
// Type Re-exports
// ============================================================================

export type { OnlineClient, OfflineClient, ClientOptions };
