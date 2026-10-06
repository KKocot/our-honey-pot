// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Server-only: imported by src/middleware.ts so astro:env/server never reaches the client bundle.
// astro:env/server also reads .env in dev, where process.env alone would miss it.
import { getSecret } from "astro:env/server";
import { report_fatal_config_error, set_server_env_reader } from "./config";

try {
  set_server_env_reader((key) => getSecret(key));
} catch (error) {
  report_fatal_config_error(error);
  throw error;
}
