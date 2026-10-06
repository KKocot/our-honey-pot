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
  get_hive_blog_url,
  get_hive_images_endpoint,
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

function is_internal_link(url: string): boolean {
  if (url.includes("\\")) return false;
  let resolved: URL;
  try {
    resolved = new URL(url, SELF_ORIGIN);
  } catch {
    return false;
  }
  if (resolved.origin === SELF_ORIGIN) return true;
  const images_origin = origin_of(get_hive_images_endpoint());
  return images_origin !== null && resolved.origin === images_origin;
}

let renderer: DefaultRenderer | null = null;

// Built on first render: config is runtime env, not available as a build-time constant
function get_renderer(): DefaultRenderer {
  renderer ??= create_renderer();
  return renderer;
}

function create_renderer(): DefaultRenderer {
  return new DefaultRenderer({
    baseUrl: `${get_hive_blog_url()}/`,
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
    usertagUrlFn: (account: string) => `${get_hive_blog_url()}/@${account}`,
    hashtagUrlFn: (hashtag: string) =>
      `${get_hive_blog_url()}/trending/${hashtag}`,
    communityUrlFn: (community: string) =>
      `${get_hive_blog_url()}/${community}`,
    isLinkSafeFn: is_internal_link,
    addExternalCssClassToMatchingLinksFn: (url: string) =>
      !is_internal_link(url),
  });
}

export function renderPostBody(body: string): string {
  if (!body || !body.trim()) return "";
  try {
    return get_renderer().render(body);
  } catch (error) {
    console.error("[Renderer] Error rendering post body:", error);
    return `<p>${escape_html(body)}</p>`;
  }
}
