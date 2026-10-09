// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Which Hive account stores the blog config (ADR 6ac4a46763221e857a3b96ff): a personal blog stores it on
// HIVE_USERNAME itself, a community blog on the account holding the hivemind `owner` role. Runs in SSR and in the browser.

import { withRetry, type WaxExtendedChain } from "@hiveio/workerbee/blog-logic";
import { is_community } from "./config";
import { ensure_endpoints_configured } from "./hive-endpoints";
import {
  find_community_owner,
  get_user_role,
  parse_community_roles,
  to_blog_role,
  type BlogRole,
  type CommunityRoleEntry,
} from "./community-roles";
import {
  DEV_KEYS,
  dev_store_get,
  dev_store_remove,
  dev_store_set,
  is_dev_mode,
  is_dev_mode_available,
} from "./dev-mode";

export const CONFIG_ACCOUNT_CACHE_TTL_MS = 60_000;

// hivemind max page; roles come sorted owner -> admin -> mod -> member, so staff always fits in one page
const ROLES_PAGE_LIMIT = 1000;

export type ConfigAccountErrorCode =
  "no_blog" | "community_not_found" | "no_owner" | "network";

export class ConfigAccountError extends Error {
  readonly code: ConfigAccountErrorCode;
  readonly blog: string;

  constructor(
    code: ConfigAccountErrorCode,
    blog: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ConfigAccountError";
    this.code = code;
    this.blog = blog;
  }
}

export interface ConfigAccount {
  /** HIVE_USERNAME of the blog (personal account or community name) */
  blog: string;
  /** Account whose posts hold the config */
  account: string;
  source: "personal" | "community_owner";
}

/** Read-only Hive API call through workerbee; endpoints are configured on first use, not at import. */
export async function with_hive_read<T>(
  fn: (chain: WaxExtendedChain) => Promise<T>,
): Promise<T> {
  ensure_endpoints_configured();
  return withRetry(fn);
}

/** hivemind assertion text (e.g. "Post a/b does not exist") from a WaxAssertionError, or null for transport errors */
export function hive_assertion_message(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  const sources = [record.assertionData, record.message];
  for (const source of sources) {
    if (typeof source !== "string") continue;
    try {
      const parsed: unknown = JSON.parse(source);
      const expression = (
        parsed as { extension?: { assertion_expression?: unknown } }
      )?.extension?.assertion_expression;
      if (typeof expression === "string") return expression;
    } catch {
      // not a JSON assertion payload
    }
  }
  return null;
}

interface RolesCacheEntry {
  roles: CommunityRoleEntry[];
  expires_at: number;
}

const roles_cache = new Map<string, RolesCacheEntry>();
const roles_in_flight = new Map<string, Promise<CommunityRoleEntry[]>>();

async function fetch_community_roles(
  community: string,
): Promise<CommunityRoleEntry[]> {
  try {
    const raw = await with_hive_read((chain) =>
      chain.api.bridge.list_community_roles({
        community,
        limit: ROLES_PAGE_LIMIT,
      }),
    );
    return parse_community_roles(raw);
  } catch (error) {
    const assertion = hive_assertion_message(error);
    if (assertion?.includes("community name is not valid")) {
      throw new ConfigAccountError(
        "community_not_found",
        community,
        `Community ${community} does not exist on Hive`,
        { cause: error },
      );
    }
    throw new ConfigAccountError(
      "network",
      community,
      `Could not load roles of ${community}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/** Dev-mode role of one impersonated account; `none` drops its community role. */
export interface DevRoleOverride {
  username: string;
  role: BlogRole;
}

const DEV_OVERRIDE_ROLES: ReadonlySet<string> = new Set([
  "owner",
  "admin",
  "mod",
  "none",
]);

/** Stored dev-mode role override; null outside dev mode, during SSR or when missing / malformed. */
export function read_dev_role_override(): DevRoleOverride | null {
  if (!import.meta.env.DEV || typeof window === "undefined" || !is_dev_mode())
    return null;
  const value = dev_store_get<Record<string, unknown>>(DEV_KEYS.role);
  if (typeof value !== "object" || value === null) return null;
  const { username, role } = value;
  if (typeof username !== "string" || username === "") return null;
  if (typeof role !== "string" || !DEV_OVERRIDE_ROLES.has(role)) return null;
  return { username, role: role as BlogRole };
}

/** A personal blog keeps its config on the blog account, so only that account can own it; communities accept any role. */
export function is_dev_role_allowed(
  blog: string,
  override: DevRoleOverride,
): boolean {
  const name = blog.trim().toLowerCase();
  if (name === "" || is_community(name) || override.role !== "owner")
    return true;
  return override.username.trim().toLowerCase() === name;
}

/** Store (or clear with null) the dev-mode role override; false outside dev mode on localhost or when storage fails. */
export function set_dev_role_override(value: DevRoleOverride | null): boolean {
  if (!import.meta.env.DEV) return false;
  let saved: boolean;
  if (value === null) {
    dev_store_remove(DEV_KEYS.role);
    saved = is_dev_mode_available();
  } else {
    saved = dev_store_set(DEV_KEYS.role, value);
  }
  clear_config_account_cache();
  return saved;
}

// Returns a new list so the shared roles_cache (SSR, all tenants) never sees the override
function apply_dev_role_override(
  roles: CommunityRoleEntry[],
): CommunityRoleEntry[] {
  const override = read_dev_role_override();
  if (!override) return roles;
  const others = roles.filter((r) => r.account !== override.username);
  if (override.role === "none") return others;
  const title = roles.find((r) => r.account === override.username)?.title ?? "";
  return [
    { account: override.username, role: override.role, title },
    ...others,
  ];
}

/** Community roles cached per community for CONFIG_ACCOUNT_CACHE_TTL_MS; concurrent callers share one request. Errors are not cached. */
export function get_community_roles(
  community: string,
): Promise<CommunityRoleEntry[]> {
  const cached = roles_cache.get(community);
  if (cached && cached.expires_at > Date.now()) {
    return Promise.resolve(
      import.meta.env.DEV
        ? apply_dev_role_override(cached.roles)
        : cached.roles,
    );
  }
  const pending = roles_in_flight.get(community);
  if (pending)
    return import.meta.env.DEV
      ? pending.then(apply_dev_role_override)
      : pending;

  const request = fetch_community_roles(community)
    .then((roles) => {
      roles_cache.set(community, {
        roles,
        expires_at: Date.now() + CONFIG_ACCOUNT_CACHE_TTL_MS,
      });
      return roles;
    })
    .finally(() => {
      roles_in_flight.delete(community);
    });
  roles_in_flight.set(community, request);
  return import.meta.env.DEV ? request.then(apply_dev_role_override) : request;
}

/** Throws ConfigAccountError: no_blog (empty HIVE_USERNAME), community_not_found, no_owner, network. */
export async function resolve_config_account(
  blog: string,
): Promise<ConfigAccount> {
  const name = blog.trim();
  if (name === "") {
    throw new ConfigAccountError(
      "no_blog",
      name,
      "HIVE_USERNAME is empty: no blog account to read config from",
    );
  }
  if (!is_community(name)) {
    return { blog: name, account: name, source: "personal" };
  }
  const owner = find_community_owner(await get_community_roles(name));
  if (!owner) {
    throw new ConfigAccountError(
      "no_owner",
      name,
      `Community ${name} has no account with the owner role`,
    );
  }
  return { blog: name, account: owner, source: "community_owner" };
}

/** Role of `username` on the blog: personal blog -> owner only for the blog account itself. Throws ConfigAccountError on network errors. */
export async function get_blog_role(
  blog: string,
  username: string | null | undefined,
): Promise<BlogRole> {
  const name = blog.trim();
  if (!username || name === "") return "none";
  if (import.meta.env.DEV) {
    const override = read_dev_role_override();
    if (override?.username === username && is_dev_role_allowed(name, override))
      return override.role;
  }
  if (!is_community(name)) return username === name ? "owner" : "none";
  return to_blog_role(get_user_role(await get_community_roles(name), username));
}

/** Drop cached roles (all communities or one), e.g. after a role change was broadcast. */
export function clear_config_account_cache(community?: string): void {
  if (community === undefined) {
    roles_cache.clear();
  } else {
    roles_cache.delete(community);
  }
}
