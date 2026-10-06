// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// ============================================
// Unified config loading pipeline
// ============================================
// Single function to load config from Hive blockchain,
// apply migrations, and merge with mode-specific defaults.
// Used by SSR (prepare_user_page, prepare_community_page)
// and client-side (admin queries.ts).

import {
  get_default_settings,
  strip_community_fields,
  type SettingsData,
  type PageLayout,
  ALL_PAGE_ELEMENT_IDS,
} from "../components/admin/types/index";
import { migrateCardLayout } from "../components/admin/types/layout";
import { load_stored_config } from "../components/admin/hive-broadcast";

// ============================================
// Card layout migration (all 3 card types)
// ============================================

function migrate_card_layouts(
  raw: Partial<SettingsData>
): Partial<SettingsData> {
  const result: Partial<SettingsData> = {};

  const migrated_post = migrateCardLayout(raw.postCardLayout);
  if (migrated_post) {
    result.postCardLayout = migrated_post;
  }

  const migrated_comment = migrateCardLayout(raw.commentCardLayout);
  if (migrated_comment) {
    result.commentCardLayout = migrated_comment;
  }

  const migrated_author = migrateCardLayout(raw.authorProfileLayout2);
  if (migrated_author) {
    result.authorProfileLayout2 = migrated_author;
  }

  return result;
}

// ============================================
// Page layout migration (filter obsolete elements)
// ============================================

function migrate_page_layout(
  page_layout: PageLayout | undefined,
  defaults: SettingsData
): PageLayout {
  if (!page_layout) {
    return structuredClone(defaults.pageLayout);
  }

  const valid_element_ids = new Set(ALL_PAGE_ELEMENT_IDS);

  return {
    sections: page_layout.sections.map((section) => ({
      ...section,
      elements: section.elements.filter((el) => valid_element_ids.has(el)),
    })),
  };
}

// ============================================
// Merge raw config with mode-specific defaults
// ============================================

/**
 * Merge only the fields that were actually saved on blockchain
 * onto mode-specific defaults. This prevents Zod defaults
 * (e.g. postsLayout: "list") from overriding community defaults
 * (e.g. postsLayout: "grid") when the user never explicitly set that field.
 */
function merge_with_defaults(
  raw_fields: Partial<SettingsData>,
  defaults: SettingsData
): SettingsData {
  const final: SettingsData = structuredClone(defaults);

  const raw_record: Record<string, unknown> = { ...raw_fields };

  for (const key of Object.keys(raw_fields)) {
    const value = raw_record[key];
    if (value !== undefined && value !== null) {
      Object.assign(final, { [key]: value });
    }
  }

  return final;
}

// ============================================
// Ensure complex layouts have valid fallbacks
// ============================================

/**
 * Mutates `settings` in place; fallbacks are cloned so the result never shares
 * nested objects with `defaults` (module-level, shared by every blog in the process).
 */
function ensure_layout_fallbacks(
  settings: SettingsData,
  defaults: SettingsData
): void {
  if (!settings.layoutSections?.length) {
    settings.layoutSections = structuredClone(defaults.layoutSections);
  }
  if (!settings.postCardLayout?.sections?.length) {
    settings.postCardLayout = structuredClone(defaults.postCardLayout);
  }
  if (!settings.commentCardLayout?.sections?.length) {
    settings.commentCardLayout = structuredClone(defaults.commentCardLayout);
  }
  if (!settings.authorProfileLayout2?.sections?.length) {
    settings.authorProfileLayout2 = structuredClone(defaults.authorProfileLayout2);
  }
}

// ============================================
// Public API
// ============================================

export type ConfigLoadResult =
  | { status: "found" | "missing"; settings: SettingsData; config_account: string }
  | { status: "error"; settings: SettingsData; error: Error };

function default_settings_for(username: string, is_community: boolean): SettingsData {
  return { ...structuredClone(get_default_settings(is_community)), hiveUsername: username };
}

function prepare_settings(
  raw_config: Partial<SettingsData>,
  username: string,
  is_community: boolean
): SettingsData {
  const defaults = get_default_settings(is_community);

  const cleaned = is_community
    ? raw_config
    : strip_community_fields(raw_config);

  const migrated_cards = migrate_card_layouts(cleaned);

  // Merge raw config (without Zod defaults) with mode-specific defaults
  const merged = merge_with_defaults(cleaned, defaults);
  Object.assign(merged, migrated_cards);
  merged.pageLayout = migrate_page_layout(cleaned.pageLayout, defaults);
  ensure_layout_fallbacks(merged, defaults);
  merged.hiveUsername = username;

  return merged;
}

/**
 * Load the blog config from its config account and run the pipeline:
 * strip community fields (user mode), migrate card/page layouts, merge onto mode-specific defaults, layout fallbacks.
 * Never throws: a read failure (network, unknown community owner, malformed JSON) returns status "error"
 * with defaults, so each caller decides explicitly whether rendering defaults is acceptable.
 *
 * @param username - HIVE_USERNAME of the blog (personal account or community name)
 */
export async function load_config_with_status(
  username: string,
  is_community: boolean
): Promise<ConfigLoadResult> {
  try {
    const stored = await load_stored_config(username);
    if (stored.status === "missing") {
      return {
        status: "missing",
        settings: default_settings_for(username, is_community),
        config_account: stored.account.account,
      };
    }
    return {
      status: "found",
      settings: prepare_settings(stored.settings, username, is_community),
      config_account: stored.account.account,
    };
  } catch (error) {
    return {
      status: "error",
      settings: default_settings_for(username, is_community),
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/** Prepared config or defaults when the blog has none; throws when the config could not be read. */
export async function load_and_prepare_config(
  username: string,
  is_community: boolean
): Promise<SettingsData> {
  const result = await load_config_with_status(username, is_community);
  if (result.status === "error") throw result.error;
  return result.settings;
}
