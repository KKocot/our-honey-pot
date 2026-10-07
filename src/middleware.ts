// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { defineMiddleware } from "astro:middleware";
import islandScript from "astro/runtime/server/astro-island.prebuilt.js";
import islandScriptDev from "astro/runtime/server/astro-island.prebuilt-dev.js";
import idleDirective from "astro/runtime/client/idle.prebuilt.js";
import loadDirective from "astro/runtime/client/load.prebuilt.js";
import mediaDirective from "astro/runtime/client/media.prebuilt.js";
import onlyDirective from "astro/runtime/client/only.prebuilt.js";
import visibleDirective from "astro/runtime/client/visible.prebuilt.js";
import { generateHydrationScript } from "solid-js/web";
import "./lib/runtime-config";
import { get_hive_signer_url } from "./lib/config";

declare global {
  namespace App {
    interface Locals {
      nonce: string;
    }
  }
}

// Keep in sync with iframeWhitelist in src/lib/renderer/StaticConfig.ts
const FRAME_SRC = [
  "https://www.youtube.com",
  "https://player.vimeo.com",
  "https://w.soundcloud.com",
  "https://player.twitch.tv",
  "https://open.spotify.com",
  "https://3speak.tv",
  "https://platform.twitter.com",
];

// Only scripts Astro/Solid emit themselves get the nonce; anything else in the HTML (e.g. a sanitizer bypass) stays blocked
const TRUSTED_INLINE_SCRIPTS = new Set(
  [
    islandScript,
    islandScriptDev,
    idleDirective,
    loadDirective,
    mediaDirective,
    onlyDirective,
    visibleDirective,
    /<script[^>]*>([\s\S]*?)<\/script>/.exec(generateHydrationScript())?.[1] ??
      "",
  ]
    .map((body) => body.trim())
    .filter((body) => body !== ""),
);
const SCRIPT_ELEMENT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const SRC_ATTR = /\bsrc\s*=/gi;
const ASTRO_BUNDLE_SRC = /\bsrc="\/_astro\/[\w.-]+\.js"/;

function is_trusted_script(attrs: string, body: string): boolean {
  const src_count = attrs.match(SRC_ATTR)?.length ?? 0;
  if (src_count > 1) return false;
  if (src_count === 1) {
    return ASTRO_BUNDLE_SRC.test(attrs) && body.trim() === "";
  }
  return TRUSTED_INLINE_SCRIPTS.has(body.trim());
}

function add_nonce_to_trusted_scripts(html: string, nonce: string): string {
  return html.replace(
    SCRIPT_ELEMENT,
    (element, attrs: string, body: string) => {
      if (/\bnonce=/i.test(attrs)) return element;
      if (!import.meta.env.DEV && !is_trusted_script(attrs, body))
        return element;
      return `<script nonce="${nonce}"${attrs}>${body}</script>`;
    },
  );
}

function origin_of(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function create_nonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

// connect-src allows https: because NodeSwitcher lets the user pick any Hive API node at runtime.
function build_page_csp(nonce: string): string {
  const connect_src = ["'self'", "https:"];
  const signer_origin = origin_of(get_hive_signer_url());
  if (signer_origin?.startsWith("http:")) connect_src.push(signer_origin);
  if (import.meta.env.DEV) connect_src.push("ws:", "wss:");

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect_src.join(" ")}`,
    `frame-src ${FRAME_SRC.join(" ")}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function set_common_headers(headers: Headers): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
}

export const onRequest = defineMiddleware(async (context, next) => {
  const nonce = create_nonce();
  context.locals.nonce = nonce;

  const response = await next();

  const content_type = response.headers.get("content-type") ?? "";
  // Non-HTML responses keep their own CSP: /auth/worker.js sets the worker policy in src/pages/auth/worker.js.ts
  if (!content_type.includes("text/html")) {
    set_common_headers(response.headers);
    return response;
  }

  const html = add_nonce_to_trusted_scripts(await response.text(), nonce);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("Content-Security-Policy", build_page_csp(nonce));
  set_common_headers(headers);

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
