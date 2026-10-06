// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { configureEndpoints } from "@hiveio/workerbee/blog-logic";
import { get_read_endpoints } from "./node-endpoint";

let endpoints_configured = false;

/** Point workerbee at the read endpoints; call before getWax()/withRetry. Later calls are no-ops. */
export function ensure_endpoints_configured(): void {
  if (endpoints_configured) return;
  configureEndpoints(get_read_endpoints());
  endpoints_configured = true;
}

/** Replace workerbee read endpoints (drops the cached chain); defaults to the current read list. */
export function reconfigure_endpoints(
  endpoints: readonly string[] = get_read_endpoints(),
): void {
  if (endpoints.length === 0) return;
  configureEndpoints([...endpoints]);
  endpoints_configured = true;
}
