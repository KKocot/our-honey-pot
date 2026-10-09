// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { SettingsData } from "../components/admin/types/settings";
import { parse_settings_graceful } from "../components/admin/types/settings-schema";
import { prune_settings_instance_overrides } from "./instance-overrides";

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
