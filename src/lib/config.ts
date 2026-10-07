// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// One Docker image serves N blogs, so per-blog settings are read at runtime (ADR 6ac4a46763221e857a3b96ff).
// Server: env via the reader registered by runtime-config.ts (astro:env/server). Client: JSON block rendered by Layout.astro.
// This module is bundled for the client too, so it must not import astro:env/server.

const MAINNET_CHAIN_ID =
  "beeab0de00000000000000000000000000000000000000000000000000000000";

const DEFAULTS = {
  hive_api_endpoint: "https://api.openhive.network",
  hive_chain_id: MAINNET_CHAIN_ID,
  hive_images_endpoint: "https://images.hive.blog",
  beeyard_url: "https://beeyard.bard-dev.com",
  hive_signer_url: import.meta.env.DEV
    ? "http://localhost:5174"
    : "https://signer.bard-dev.com",
} as const;

export const RUNTIME_CONFIG_ELEMENT_ID = "ohp-runtime-config";

/** Public per-blog settings; everything here is shipped to the browser. */
export interface RuntimeConfig {
  hive_username: string;
  hive_api_endpoint: string;
  hive_chain_id: string;
  hive_images_endpoint: string;
  beeyard_url: string;
  hive_blog_url: string;
  hive_signer_url: string;
}

export type EnvReader = (key: string) => string | undefined;

export class RuntimeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeConfigError";
  }
}

// Hive account rules: 3-16 chars, dot-separated segments of >= 3 chars, each starting with a letter, no "--"
const HIVE_ACCOUNT_SEGMENT = /^[a-z][a-z0-9-]*[a-z0-9]$/;

/** Validate a Hive account name (communities like hive-123456 are accounts too) */
export function is_valid_hive_account(name: string): boolean {
  if (name.length < 3 || name.length > 16) return false;
  return name
    .split(".")
    .every(
      (segment) =>
        segment.length >= 3 &&
        HIVE_ACCOUNT_SEGMENT.test(segment) &&
        !segment.includes("--"),
    );
}

const COMMUNITY_PATTERN = /^hive-\d+$/;

/** Validate that a Hive account name is a community */
export function is_community(name: string): boolean {
  return COMMUNITY_PATTERN.test(name);
}

/** Empty means "no blog owner configured"; anything else must be a valid Hive account. */
export function validate_hive_username(raw: string): string {
  const name = raw.trim();
  if (name === "" || is_valid_hive_account(name)) return name;
  throw new RuntimeConfigError(
    `Invalid HIVE_USERNAME ${JSON.stringify(raw)}: expected a Hive account name ` +
      `(3-16 chars, a-z 0-9 . -, e.g. "hive-123456" for a community).`,
  );
}

function pick(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed === "" ? fallback : trimmed;
}

function normalize_runtime_config(
  raw: Partial<Record<keyof RuntimeConfig, unknown>>,
): RuntimeConfig {
  const beeyard_url = pick(raw.beeyard_url, DEFAULTS.beeyard_url);
  return {
    hive_username: validate_hive_username(pick(raw.hive_username, "")),
    hive_api_endpoint: pick(raw.hive_api_endpoint, DEFAULTS.hive_api_endpoint),
    hive_chain_id: pick(raw.hive_chain_id, DEFAULTS.hive_chain_id),
    hive_images_endpoint: pick(
      raw.hive_images_endpoint,
      DEFAULTS.hive_images_endpoint,
    ),
    beeyard_url,
    hive_blog_url: pick(raw.hive_blog_url, beeyard_url),
    hive_signer_url: pick(raw.hive_signer_url, DEFAULTS.hive_signer_url),
  };
}

/** Build the public config from env; throws RuntimeConfigError on an invalid HIVE_USERNAME. */
export function build_runtime_config(read: EnvReader): RuntimeConfig {
  return normalize_runtime_config({
    hive_username: read("HIVE_USERNAME"),
    hive_api_endpoint: read("PUBLIC_HIVE_API_ENDPOINT"),
    hive_chain_id: read("PUBLIC_HIVE_CHAIN_ID"),
    hive_images_endpoint: read("PUBLIC_HIVE_IMAGES_ENDPOINT"),
    beeyard_url: read("PUBLIC_BEEYARD_URL"),
    hive_blog_url: read("PUBLIC_HIVE_BLOG_URL"),
    hive_signer_url: read("PUBLIC_HIVE_SIGNER_URL"),
  });
}

/** JSON for the inline application/json block; "<", ">" and "&" escaped so "</script>" cannot close it. */
export function serialize_client_runtime_config(config: RuntimeConfig): string {
  const public_config: RuntimeConfig = {
    hive_username: config.hive_username,
    hive_api_endpoint: config.hive_api_endpoint,
    hive_chain_id: config.hive_chain_id,
    hive_images_endpoint: config.hive_images_endpoint,
    beeyard_url: config.beeyard_url,
    hive_blog_url: config.hive_blog_url,
    hive_signer_url: config.hive_signer_url,
  };
  return JSON.stringify(public_config)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/** Parse the client JSON block; throws RuntimeConfigError when it is missing or malformed. */
export function parse_client_runtime_config(
  text: string | null | undefined,
): RuntimeConfig {
  if (typeof text !== "string" || text.trim() === "") {
    throw new RuntimeConfigError(
      `Missing #${RUNTIME_CONFIG_ELEMENT_ID} block (page not rendered by Layout.astro?)`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RuntimeConfigError(
      `Malformed JSON in #${RUNTIME_CONFIG_ELEMENT_ID}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RuntimeConfigError(
      `#${RUNTIME_CONFIG_ELEMENT_ID} must contain a JSON object`,
    );
  }
  return normalize_runtime_config(
    parsed as Partial<Record<keyof RuntimeConfig, unknown>>,
  );
}

function is_server(): boolean {
  return typeof window === "undefined";
}

function read_process_env(key: string): string | undefined {
  return typeof process !== "undefined" ? process.env?.[key] : undefined;
}

let server_env_reader: EnvReader = read_process_env;
let cached_config: RuntimeConfig | null = null;

function read_client_runtime_config(): RuntimeConfig {
  const text =
    typeof document !== "undefined"
      ? document.getElementById(RUNTIME_CONFIG_ELEMENT_ID)?.textContent
      : undefined;
  try {
    return parse_client_runtime_config(text);
  } catch (error) {
    console.warn(
      `[config] ${error instanceof Error ? error.message : String(error)}; using defaults (mainnet, no blog owner).`,
    );
    return normalize_runtime_config({});
  }
}

/** Current runtime config: server env on the server, the Layout JSON block in the browser (cached after first read). */
export function get_runtime_config(): RuntimeConfig {
  cached_config ??= is_server()
    ? build_runtime_config(server_env_reader)
    : read_client_runtime_config();
  return cached_config;
}

/** Server-only: swap the env source (runtime-config.ts registers astro:env/server); re-validates immediately. */
export function set_server_env_reader(reader: EnvReader): void {
  server_env_reader = reader;
  cached_config = null;
  get_runtime_config();
}

function read_server_value(key: string, fallback: string): string {
  return is_server() ? pick(server_env_reader(key), fallback) : fallback;
}

export function get_hive_username(): string {
  return get_runtime_config().hive_username;
}

export function get_hive_api_endpoint(): string {
  return get_runtime_config().hive_api_endpoint;
}

export function get_hive_chain_id(): string {
  return get_runtime_config().hive_chain_id;
}

export function get_hive_images_endpoint(): string {
  return get_runtime_config().hive_images_endpoint;
}

export function get_beeyard_url(): string {
  return get_runtime_config().beeyard_url;
}

export function get_hive_blog_url(): string {
  return get_runtime_config().hive_blog_url;
}

export function get_hive_signer_url(): string {
  return get_runtime_config().hive_signer_url;
}

/** True on mirrornet/testnet: HB-Auth is mainnet-only and http nodes are allowed (WIF login works on every chain) */
export function is_not_mainnet(): boolean {
  return get_hive_chain_id() !== MAINNET_CHAIN_ID;
}

// Fallback API endpoints for retry logic (ordered by preference)
// NOTE: Keep in sync with mainnet_domains in astro.config.mjs (CSP connect-src)
const MAINNET_FALLBACK_ENDPOINTS = [
  "https://api.openhive.network",
  "https://api.hive.blog",
  "https://api.deathwing.me",
  "https://hive-api.arcange.eu",
  "https://api.syncad.com",
];

/** A non-mainnet endpoint (mirrornet/testnet) is used alone, without mainnet fallbacks */
export function get_hive_api_endpoints(): string[] {
  const endpoint = get_hive_api_endpoint();
  return MAINNET_FALLBACK_ENDPOINTS.includes(endpoint)
    ? [...MAINNET_FALLBACK_ENDPOINTS]
    : [endpoint];
}

/** Server-only canonical origin; "" when unset or in the browser */
export function get_site_url(): string {
  return read_server_value("PUBLIC_SITE_URL", "");
}

// HB-Auth worker keeps the decrypted key unlocked this long; short window limits exposure on shared/unattended devices (audit A3)
export const HBAUTH_SESSION_TIMEOUT_MS = 20 * 60 * 1000;

/** Server-only: log an invalid runtime config; in production stop the process so a misconfigured container fails visibly. */
export function report_fatal_config_error(error: unknown): void {
  console.error(
    `[config] ${error instanceof Error ? error.message : String(error)}`,
  );
  if (import.meta.env.PROD && typeof process !== "undefined") process.exit(1);
}

// Fail fast on an invalid HIVE_USERNAME; scripts/start.mjs preloads the middleware so this runs before the server listens
try {
  get_runtime_config();
} catch (error) {
  if (!is_server()) throw error;
  report_fatal_config_error(error);
}

// Config comment identification
export const APPEARANCE_CONFIG_PREFIX = "!hive-blog-appearance";
export const APPEARANCE_CONFIG_TYPE = "blog_appearance_config";
export const LEGACY_CONFIG_APP = "hive-blog-config/1.0";

// Layout Constants
export const LAYOUT_CONSTANTS = {
  SIDEBAR_WIDTH_PX: { min: 200, max: 400, default: 280 },
  CARD_GAP_PX: { min: 0, max: 64, default: 24 },
  CARD_PADDING_PX: { min: 0, max: 64, default: 24 },
  CARD_BORDER_RADIUS_PX: { min: 0, max: 48, default: 16 },
  TITLE_SIZE_PX: { min: 12, max: 48, default: 20 },
  THUMBNAIL_SIZE_PX: { min: 32, max: 400, default: 96 },
  AVATAR_SIZE_PX: { min: 32, max: 128, default: 64 },
  GRID_COLUMNS: { min: 1, max: 4, default: 2 },
  POSTS_PER_PAGE: { min: 5, max: 50, default: 20 },
  SUMMARY_MAX_LENGTH: { min: 50, max: 500, default: 150 },
  MAX_TAGS: { min: 1, max: 10, default: 5 },
} as const;

// Comment Settings Constants
export const COMMENT_CONSTANTS = {
  AVATAR_SIZE_PX: { min: 24, max: 64, default: 40 },
  PADDING_PX: { min: 8, max: 32, default: 16 },
  GAP_PX: { min: 0, max: 64, default: 16 },
  MAX_LENGTH: { min: 0, max: 1000, default: 0 },
} as const;

// Hive Image Helpers

/** Build avatar URL for a Hive user */
export function hive_avatar_url(
  username: string,
  size: "small" | "medium" | "large" = "medium",
): string {
  return `${get_hive_images_endpoint()}/u/${encodeURIComponent(username)}/avatar${size !== "medium" ? `/${size}` : ""}`;
}

/** Proxy an image URL through Hive image CDN with resize; returns "" for non-http(s) sources */
export function hive_image_proxy(
  url: string,
  width: number,
  height: number = 0,
): string {
  if (typeof url !== "string") return "";
  let normalized = url.trim();

  if (normalized.startsWith("ipfs://")) {
    normalized = `https://ipfs.io/ipfs/${normalized.slice(7)}`;
  } else if (normalized.startsWith("/ipfs/")) {
    normalized = `https://ipfs.io${normalized}`;
  }

  if (normalized.includes("steemitimages.com")) {
    normalized = normalized.replace(/steemitimages\.com/g, "images.hive.blog");
  }

  let source: string;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    source = parsed.href;
  } catch {
    return "";
  }
  // URL.href leaves these unescaped; they could break out of attributes or CSS url()
  source = source.replace(
    /['"()\\]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  const safe_width = Number.isFinite(width)
    ? Math.max(0, Math.round(width))
    : 0;
  const safe_height = Number.isFinite(height)
    ? Math.max(0, Math.round(height))
    : 0;
  const is_gif = /\.gif(\?.*)?$/i.test(source);
  const size = is_gif ? "0x0" : `${safe_width}x${safe_height}`;

  return `${get_hive_images_endpoint()}/${size}/${source}`;
}
