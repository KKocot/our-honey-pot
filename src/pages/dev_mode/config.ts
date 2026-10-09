// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { APIRoute } from "astro";
import {
  DEV_CONFIG_MAX_BYTES,
  delete_dev_config,
  get_dev_config,
  normalize_dev_config_blog,
  set_dev_config,
} from "../../lib/dev-config-store";

// Dev mode only (src/lib/dev-config-store.ts). Not `_dev_mode`: Astro skips `_`-prefixed files; `dev_mode` is not a valid Hive username, so it never collides with `/[author]`
export const prerender = false;

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
]);

// `{"blog":"...","config":...}` around a config of up to DEV_CONFIG_MAX_BYTES
const MAX_REQUEST_BYTES = DEV_CONFIG_MAX_BYTES + 1024;

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function is_loopback_url(value: string): boolean {
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

/**
 * 403 unless the request URL is loopback and its Origin (when sent) is exactly the app origin (scheme, host, port):
 * another dev server on a different localhost port must not write the config rendered next to the WIF in sessionStorage.
 */
function reject_foreign(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (
    !is_loopback_url(request.url) ||
    (origin !== null && origin !== new URL(request.url).origin)
  ) {
    return json(403, { error: "dev config is available on localhost only" });
  }
  return null;
}

// Media type only, so `text/plain; x=application/json` fails; a non-simple type also forces a CORS preflight
function is_json_content_type(header: string | null): boolean {
  return (
    (header ?? "").split(";")[0].trim().toLowerCase() === "application/json"
  );
}

function blog_param(request: Request): string | null {
  return normalize_dev_config_blog(
    new URL(request.url).searchParams.get("blog"),
  );
}

export const GET: APIRoute = ({ request }) => {
  if (!import.meta.env.DEV) return new Response(null, { status: 404 });
  const forbidden = reject_foreign(request);
  if (forbidden) return forbidden;
  const blog = blog_param(request);
  if (!blog) return json(400, { error: "invalid blog" });
  const entry = get_dev_config(blog);
  if (!entry) return json(404, { error: "no dev config" });
  return json(200, { blog, ...entry });
};

export const POST: APIRoute = async ({ request }) => {
  if (!import.meta.env.DEV) return new Response(null, { status: 404 });
  const forbidden = reject_foreign(request);
  if (forbidden) return forbidden;
  if (!is_json_content_type(request.headers.get("content-type"))) {
    return json(415, { error: "expected application/json" });
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_REQUEST_BYTES)
    return json(413, { error: "config too large" });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_REQUEST_BYTES) {
    return json(413, { error: "config too large" });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "malformed JSON" });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return json(400, { error: "expected a JSON object" });
  }
  const { blog, config } = body as Record<string, unknown>;
  const result = set_dev_config(blog, config, new URL(request.url).origin);
  if (result.ok) return json(200, { hash: result.hash });
  switch (result.reason) {
    case "size":
      return json(413, { error: "config too large" });
    case "blog":
      return json(400, { error: "invalid blog" });
    case "shape":
      return json(400, { error: "invalid config" });
    case "unavailable":
      return new Response(null, { status: 404 });
  }
};

export const DELETE: APIRoute = ({ request }) => {
  if (!import.meta.env.DEV) return new Response(null, { status: 404 });
  const forbidden = reject_foreign(request);
  if (forbidden) return forbidden;
  const blog = blog_param(request);
  if (!blog) return json(400, { error: "invalid blog" });
  if (delete_dev_config(blog, new URL(request.url).origin) === "foreign") {
    return json(409, { error: "dev config was pushed from another origin" });
  }
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
};
