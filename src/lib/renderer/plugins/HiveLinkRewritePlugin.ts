// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { RendererPlugin } from "./RendererPlugin";

/**
 * Domains used by Hive frontends that should be rewritten to internal links.
 */
const HIVE_DOMAINS = [
  "peakd\\.com",
  "www\\.peakd\\.com",
  "ecency\\.com",
  "www\\.ecency\\.com",
  "hive\\.blog",
  "www\\.hive\\.blog",
  "blog\\.openhive\\.network",
];

const DOMAIN_PATTERN = HIVE_DOMAINS.join("|");

/**
 * Matches an <a> tag whose href points to a known Hive frontend domain.
 * Captures the full tag so we can rewrite both href and link text.
 */
const ANCHOR_REGEX = new RegExp(
  `<a\\s([^>]*href="https?://(?:${DOMAIN_PATTERN})(/[^"]*)"[^>]*)>(.*?)</a>`,
  "gi",
);

/**
 * Matches a URL pointing to a known Hive frontend domain (used for text replacement).
 */
const URL_TEXT_REGEX = new RegExp(
  `https?://(?:${DOMAIN_PATTERN})(/[^<]*)`,
  "gi",
);

const ACCOUNT = "[a-z][a-z0-9.-]{1,15}";
const PERMLINK = "[a-z0-9][a-z0-9-]{0,255}";
const TAG = "[a-z0-9][a-z0-9-]{0,63}";
const END = "(?=[/?#]|$)";

const CATEGORY_POST_PATH = new RegExp(
  `^/${TAG}/@(${ACCOUNT})/(${PERMLINK})${END}`,
  "i",
);
const POST_PATH = new RegExp(`^/@(${ACCOUNT})/(${PERMLINK})${END}`, "i");
const PROFILE_PATH = new RegExp(`^/@(${ACCOUNT})/?$`, "i");
const COMMUNITY_PATH = new RegExp(`^/(?:c/)?(hive-\\d{1,8})${END}`, "i");
const TRENDING_PATH = new RegExp(`^/trending/(${TAG})${END}`, "i");

/**
 * Maps a Hive frontend URL path to an internal path, or null when the path
 * is not a known Hive route (such links stay external).
 *
 * - `/@username/permlink` stays as-is
 * - `/category/@username/permlink` strips the category prefix
 * - `/@username` stays as-is
 * - `/c/hive-123456` and `/hive-123456` become `/hive-123456`
 * - `/trending/tag` stays as-is
 */
function normalize_path(path: string): string | null {
  const category_post = path.match(CATEGORY_POST_PATH);
  if (category_post) {
    return `/@${category_post[1]}/${category_post[2]}`;
  }
  const post = path.match(POST_PATH);
  if (post) {
    return `/@${post[1]}/${post[2]}`;
  }
  const profile = path.match(PROFILE_PATH);
  if (profile) {
    return `/@${profile[1]}`;
  }
  const community = path.match(COMMUNITY_PATH);
  if (community) {
    return `/${community[1]}`;
  }
  const trending = path.match(TRENDING_PATH);
  if (trending) {
    return `/trending/${trending[1]}`;
  }
  return null;
}

/**
 * Removes external link attributes (target, rel, class) from an anchor tag
 * since the link is now internal.
 */
function strip_external_attrs(attrs: string): string {
  return attrs
    .replace(/\s*target="_blank"/gi, "")
    .replace(/\s*rel="[^"]*nofollow[^"]*"/gi, "")
    .replace(/\s*class="link-external"/gi, "");
}

/**
 * Plugin that rewrites links pointing to Hive frontend domains
 * (peakd.com, ecency.com, hive.blog, blog.openhive.network)
 * into internal relative links.
 *
 * Operates in postProcess phase on the final HTML string.
 */
export class HiveLinkRewritePlugin implements RendererPlugin {
  name = "hive-link-rewrite-plugin";

  postProcess(text: string): string {
    return text.replace(
      ANCHOR_REGEX,
      (anchor: string, attrs: string, path: string, link_text: string) => {
        const internal_path = normalize_path(path);
        if (!internal_path) {
          return anchor;
        }
        const cleaned_attrs = strip_external_attrs(attrs);

        // Replace href in attributes
        const new_attrs = cleaned_attrs.replace(
          /href="https?:\/\/[^"]+"/i,
          `href="${internal_path}"`,
        );

        // If link text is the bare URL, replace it with the internal path
        const new_text = URL_TEXT_REGEX.test(link_text)
          ? internal_path
          : link_text;

        // Reset regex lastIndex since we use the global flag
        URL_TEXT_REGEX.lastIndex = 0;

        return `<a ${new_attrs}>${new_text}</a>`;
      },
    );
  }
}
