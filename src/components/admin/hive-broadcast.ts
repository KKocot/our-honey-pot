// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Blog config storage (ADR 6ac4a46763221e857a3b96ff): a reply with a fixed permlink under a fixed anchor post,
// both on the config account (see lib/config-account.ts). Read with bridge.get_post, never by enumerating replies.

import { BlogPostOperation, ReplyOperation } from "@hiveio/wax";
import {
  APPEARANCE_CONFIG_TYPE,
  APPEARANCE_CONFIG_PREFIX,
  LEGACY_CONFIG_APP,
  get_hive_username,
} from "../../lib/config";
import {
  ConfigAccountError,
  hive_assertion_message,
  resolve_config_account,
  with_hive_read,
  type ConfigAccount,
} from "../../lib/config-account";
import { get_broadcast_chain } from "../../lib/broadcast-chain";
import { sign_transaction } from "../../lib/transaction-signer";
import type { SettingsData } from "./types/index";
import { parse_settings_graceful } from "./types/settings-schema";
import { with_retry } from "../../lib/retry";
import { prune_settings_instance_overrides } from "../../lib/instance-overrides";

export const CONFIG_PERMLINK = "blog-config";
export const CONFIG_ANCHOR_PERMLINK = "blog-config-anchor";
const CONFIG_ANCHOR_CATEGORY = "hive-blog-config";
const CONFIG_ANCHOR_TYPE = "blog_config_anchor";

const MAX_BODY_SIZE = 64 * 1024;

const CONFIG_BLOCK = /```json[^\S\r\n]*\r?\n([\s\S]*?)\r?\n[^\S\r\n]*```/;

export type ConfigReadErrorCode = "network" | "parse";

/** Reading the config failed; never means "no config" (that is status "missing"). */
export class ConfigReadError extends Error {
  readonly code: ConfigReadErrorCode;

  constructor(
    code: ConfigReadErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ConfigReadError";
    this.code = code;
  }
}

export type StoredConfig =
  | {
      status: "found";
      account: ConfigAccount;
      permlink: string;
      settings: Partial<SettingsData>;
    }
  | { status: "missing"; account: ConfigAccount };

interface HivePost {
  body: string;
}

/** JSON with every backtick as `: still valid JSON, parses back to the same value, cannot close the ``` fence (K4). */
export function encode_config_json(
  settings: SettingsData | Record<string, unknown>,
): string {
  return JSON.stringify(settings, null, 2).replaceAll("`", "\\u0060");
}

export function build_config_body(
  account: string,
  settings: SettingsData,
  timestamp: string,
): string {
  return `${APPEARANCE_CONFIG_PREFIX}\n# Blog Configuration for @${account}\n\nLast updated: ${timestamp}\n\n\`\`\`json\n${encode_config_json(settings)}\n\`\`\``;
}

function parse_json_block(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    // Legacy bodies escaped ``` as \`\`\`, which is not valid JSON
    if (!text.includes("\\`\\`\\`")) throw error;
    return JSON.parse(text.replaceAll("\\`\\`\\`", "```"));
  }
}

/** Raw config object from a comment body (current or legacy encoding); throws ConfigReadError("parse"). */
export function parse_config_body(body: string): Record<string, unknown> {
  const match = body.match(CONFIG_BLOCK);
  if (!match) {
    throw new ConfigReadError("parse", "Config post has no ```json block");
  }
  let raw: unknown;
  try {
    raw = parse_json_block(match[1]);
  } catch (error) {
    throw new ConfigReadError("parse", "Config post contains malformed JSON", {
      cause: error,
    });
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigReadError("parse", "Config JSON must be an object");
  }
  return raw as Record<string, unknown>;
}

/**
 * Per-field validation without Zod defaults: only keys present in `raw` and valid survive.
 * Orphaned instance overrides are pruned the same way as before a save, so a saved snapshot reads back equal.
 */
export function extract_explicit_fields(
  raw: Record<string, unknown>,
): Partial<SettingsData> {
  const validated = parse_settings_graceful(raw);
  const raw_keys = new Set(Object.keys(raw));
  const explicit_fields: Partial<SettingsData> = {};
  for (const [key, value] of Object.entries(validated)) {
    if (raw_keys.has(key)) {
      Object.assign(explicit_fields, { [key]: value });
    }
  }
  return prune_settings_instance_overrides(explicit_fields);
}

function is_missing_post_error(
  error: unknown,
  author: string,
  permlink: string,
): boolean {
  const assertion = hive_assertion_message(error);
  return (
    assertion !== null &&
    assertion.includes(`${author}/${permlink}`) &&
    assertion.includes("does not exist")
  );
}

/** Post body or null when the post does not exist; throws ConfigReadError("network") on any other failure. */
async function fetch_post(
  author: string,
  permlink: string,
): Promise<HivePost | null> {
  try {
    const post = await with_hive_read((chain) =>
      chain.api.bridge.get_post({ author, permlink }),
    );
    if (!post || typeof post.body !== "string") {
      throw new Error("node returned no post body");
    }
    return { body: post.body };
  } catch (error) {
    if (is_missing_post_error(error, author, permlink)) return null;
    throw new ConfigReadError(
      "network",
      `Could not load @${author}/${permlink}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/** Config of `blog` (HIVE_USERNAME): found / missing; throws ConfigAccountError or ConfigReadError (network, parse) (K3). */
export async function load_stored_config(blog: string): Promise<StoredConfig> {
  const account = await resolve_config_account(blog);
  const post = await fetch_post(account.account, CONFIG_PERMLINK);
  if (!post) return { status: "missing", account };
  return {
    status: "found",
    account,
    permlink: CONFIG_PERMLINK,
    settings: extract_explicit_fields(parse_config_body(post.body)),
  };
}

/** Human-readable reason why the blog config could not be read (shown in the admin panel). */
export function config_error_message(error: unknown): string {
  if (error instanceof ConfigAccountError) {
    switch (error.code) {
      case "no_blog":
        return "No blog is configured (HIVE_USERNAME is empty), so there is no config to edit.";
      case "no_owner":
        return `Community ${error.blog} has no account with the owner role, so there is no account to store its configuration.`;
      case "community_not_found":
        return `Community ${error.blog} does not exist on Hive.`;
      case "network":
        return `Could not load the roles of ${error.blog} from Hive. Check the API node and reload.`;
    }
  }
  if (error instanceof ConfigReadError && error.code === "parse") {
    return `The saved configuration is malformed: ${error.message}`;
  }
  const detail = error instanceof Error ? error.message : String(error);
  return `Could not read the blog configuration from Hive: ${detail}`;
}

export interface CommentDraft {
  parent_author: string;
  parent_permlink: string;
  author: string;
  permlink: string;
  title: string;
  body: string;
  json_metadata: Record<string, unknown>;
}

export interface ConfigWritePlan {
  /** Anchor root post, only on the first save when it does not exist yet */
  anchor: CommentDraft | null;
  reply: CommentDraft;
  is_update: boolean;
}

export function plan_config_write(
  account: string,
  settings: SettingsData,
  state: { config_exists: boolean; anchor_exists: boolean },
  timestamp: string,
): ConfigWritePlan {
  const anchor: CommentDraft | null = state.anchor_exists
    ? null
    : {
        parent_author: "",
        parent_permlink: CONFIG_ANCHOR_CATEGORY,
        author: account,
        permlink: CONFIG_ANCHOR_PERMLINK,
        title: "Blog settings storage",
        body: `This is a technical post that stores the settings of the @${account} blog in the reply below. It is not an article; please do not delete it.`,
        json_metadata: {
          app: LEGACY_CONFIG_APP,
          type: CONFIG_ANCHOR_TYPE,
          tags: [CONFIG_ANCHOR_CATEGORY],
        },
      };

  const reply: CommentDraft = {
    parent_author: account,
    parent_permlink: CONFIG_ANCHOR_PERMLINK,
    author: account,
    permlink: CONFIG_PERMLINK,
    title: "",
    body: build_config_body(account, settings, timestamp),
    json_metadata: {
      app: LEGACY_CONFIG_APP,
      type: APPEARANCE_CONFIG_TYPE,
      format: "markdown",
      tags: [CONFIG_ANCHOR_CATEGORY],
      config_version: "2.0",
      updated_at: timestamp,
    },
  };

  return { anchor, reply, is_update: state.config_exists };
}

function to_operations(
  plan: ConfigWritePlan,
): Array<BlogPostOperation | ReplyOperation> {
  const operations: Array<BlogPostOperation | ReplyOperation> = [];
  if (plan.anchor) {
    operations.push(
      new BlogPostOperation({
        category: plan.anchor.parent_permlink,
        author: plan.anchor.author,
        permlink: plan.anchor.permlink,
        title: plan.anchor.title,
        body: plan.anchor.body,
        jsonMetadata: plan.anchor.json_metadata,
      }),
    );
  }
  operations.push(
    new ReplyOperation({
      parentAuthor: plan.reply.parent_author,
      parentPermlink: plan.reply.parent_permlink,
      author: plan.reply.author,
      permlink: plan.reply.permlink,
      body: plan.reply.body,
      jsonMetadata: plan.reply.json_metadata,
    }),
  );
  return operations;
}

function to_user_message(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  if (message.includes("not_enough_rc") || message.includes("RC mana")) {
    return "Not enough Resource Credits (RC). Please wait for RC to regenerate or power up more HIVE.";
  }
  if (message.includes("Not authorized") || message.includes("not unlocked")) {
    return "Session expired. Please login again.";
  }
  return message;
}

/**
 * Save settings as the config reply of the blog's config account. The first save also creates the anchor post
 * in the same transaction; later saves edit the same reply. Signing: Keychain / WIF (testnet) / HB-Auth.
 */
export async function broadcastConfigToHive(
  settings: SettingsData,
  username: string,
  privateKey: string,
): Promise<{
  success: boolean;
  txId?: string;
  permlink?: string;
  isUpdate?: boolean;
  error?: string;
}> {
  try {
    const { account } = await resolve_config_account(get_hive_username());
    if (account !== username) {
      return {
        success: false,
        error: `Only @${account} can save this blog's configuration.`,
      };
    }

    const config_exists = (await fetch_post(account, CONFIG_PERMLINK)) !== null;
    const anchor_exists =
      config_exists ||
      (await fetch_post(account, CONFIG_ANCHOR_PERMLINK)) !== null;
    const plan = plan_config_write(
      account,
      prune_settings_instance_overrides(settings),
      { config_exists, anchor_exists },
      new Date().toISOString(),
    );

    const body_size = new TextEncoder().encode(plan.reply.body).length;
    if (body_size > MAX_BODY_SIZE) {
      throw new Error(
        `Configuration too large (${Math.round(body_size / 1024)}KB). Maximum size is 64KB. Try reducing custom settings.`,
      );
    }

    const chain = await get_broadcast_chain();
    const tx = await chain.createTransaction();
    for (const operation of to_operations(plan)) {
      tx.pushOperation(operation);
    }

    await sign_transaction(tx, username, privateKey);
    await with_retry(async () => await chain.broadcast(tx), 3, 1000);

    return {
      success: true,
      txId: tx.id,
      permlink: plan.reply.permlink,
      isUpdate: plan.is_update,
    };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("Failed to broadcast config:", error);
    return { success: false, error: to_user_message(error) };
  }
}

export function getConfigUrlSync(username: string, permlink: string): string {
  return `https://peakd.com/@${username}/${permlink}`;
}
