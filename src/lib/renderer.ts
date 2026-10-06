// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import {
  DefaultRenderer,
  TablePlugin,
  HiveLinkRewritePlugin,
  ImagePlaceholderPlugin,
} from "./renderer/index";
import { escape_html } from "../shared/formatters/html";
import {
  HIVE_IMAGES_ENDPOINT,
  HIVE_BLOG_URL,
  hive_image_proxy,
} from "./config";

// The blog origin is unknown in SSR (one image, N blogs), so relative links resolve against a sentinel origin.
const SELF_ORIGIN = "https://self.invalid";

function origin_of(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const IMAGES_ORIGIN = origin_of(HIVE_IMAGES_ENDPOINT);

function is_internal_link(url: string): boolean {
  if (url.includes("\\")) return false;
  let resolved: URL;
  try {
    resolved = new URL(url, SELF_ORIGIN);
  } catch {
    return false;
  }
  return (
    resolved.origin === SELF_ORIGIN ||
    (IMAGES_ORIGIN !== null && resolved.origin === IMAGES_ORIGIN)
  );
}

const renderer = new DefaultRenderer({
  baseUrl: `${HIVE_BLOG_URL}/`,
  breaks: true,
  skipSanitization: false,
  allowInsecureScriptTags: false,
  addNofollowToLinks: true,
  addTargetBlankToLinks: true,
  cssClassForInternalLinks: "",
  cssClassForExternalLinks: "link-external",
  doNotShowImages: false,
  ipfsPrefix: "https://ipfs.io/ipfs/",
  assetsWidth: 640,
  assetsHeight: 480,
  plugins: [
    new TablePlugin(),
    new HiveLinkRewritePlugin(),
    new ImagePlaceholderPlugin(),
  ],
  imageProxyFn: (url: string) => hive_image_proxy(url, 768),
  usertagUrlFn: (account: string) => `${HIVE_BLOG_URL}/@${account}`,
  hashtagUrlFn: (hashtag: string) => `${HIVE_BLOG_URL}/trending/${hashtag}`,
  communityUrlFn: (community: string) => `${HIVE_BLOG_URL}/${community}`,
  isLinkSafeFn: is_internal_link,
  addExternalCssClassToMatchingLinksFn: (url: string) => !is_internal_link(url),
});

export function renderPostBody(body: string): string {
  if (!body || !body.trim()) return "";
  try {
    return renderer.render(body);
  } catch (error) {
    console.error("[Renderer] Error rendering post body:", error);
    return `<p>${escape_html(body)}</p>`;
  }
}
