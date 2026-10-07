// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Per-instance size overrides of home page layout elements (SettingsData.instanceOverrides).
// Pure functions: inputs are never mutated, so module-level defaults and Solid stores stay intact.

import {
  instance_key,
  instance_override_keys_for,
  is_instance_override_value,
  type InstanceOverrides,
  type InstanceSizeOverrides,
  type SettingsData,
} from "../components/admin/types/settings";
import {
  MAIN_SECTION_ID,
  pageLayoutConfigToLegacy,
  type ContainerConfig,
  type PageLayout,
  type PageLayoutConfig,
} from "../components/admin/types/layout";

/** Slider ranges for size settings edited only globally (not in INSTANCE_OVERRIDE_RANGES, so never overridable per instance). */
export const GLOBAL_ONLY_SIZE_RANGES = Object.freeze({
  authorReputationSizePx: Object.freeze({ min: 10, max: 16 }),
} satisfies Partial<Record<keyof SettingsData, { min: number; max: number }>>);

/**
 * Settings for one element instance: global values with that instance's overrides applied.
 * Only whitelisted, in-range values are applied, so the result is safe for inline styles even for unvalidated input.
 */
export function resolve_instance_settings(
  settings: SettingsData,
  section_id: string,
  element_id: string,
): SettingsData {
  const overrides = settings.instanceOverrides;
  const key = instance_key(section_id, element_id);
  if (!overrides || !Object.hasOwn(overrides, key)) return { ...settings };

  const entry: unknown = overrides[key];
  if (typeof entry !== "object" || entry === null) return { ...settings };

  const applied: InstanceSizeOverrides = {};
  const entry_values = entry as Record<string, unknown>;
  for (const setting of instance_override_keys_for(element_id)) {
    const value = entry_values[setting];
    if (is_instance_override_value(setting, value)) applied[setting] = value;
  }
  return { ...settings, ...applied };
}

/** Main section's posts instance: CommunityContent renders it and the SSR posts query key uses its postsPerPage. */
export function resolve_main_posts_settings(
  settings: SettingsData,
): SettingsData {
  return resolve_instance_settings(settings, MAIN_SECTION_ID, "posts");
}

/** Copy of `overrides` without keys whose instance is not in `page_layout` and without empty entries. */
export function prune_instance_overrides(
  overrides: InstanceOverrides,
  page_layout: PageLayout,
): InstanceOverrides {
  const live_keys = new Set(
    page_layout.sections.flatMap((section) =>
      section.elements.map((element_id) =>
        instance_key(section.id, element_id),
      ),
    ),
  );
  const pruned: InstanceOverrides = {};
  for (const [key, entry] of Object.entries(overrides)) {
    if (!live_keys.has(key) || Object.keys(entry).length === 0) continue;
    pruned[key] = { ...entry };
  }
  return pruned;
}

/** Copy of `overrides` with the element's overrides following it to another section (target entry is replaced). */
export function move_instance_override(
  overrides: InstanceOverrides,
  element_id: string,
  from_section_id: string,
  to_section_id: string,
): InstanceOverrides {
  const from_key = instance_key(from_section_id, element_id);
  const to_key = instance_key(to_section_id, element_id);
  const moved: InstanceOverrides = {};
  for (const [key, entry] of Object.entries(overrides)) {
    moved[key] = { ...entry };
  }
  if (from_key === to_key || !Object.hasOwn(overrides, from_key)) return moved;

  moved[to_key] = { ...overrides[from_key] };
  delete moved[from_key];
  return moved;
}

/**
 * Every instance the home page can render for `config`, inactive elements and sidebars hidden by the template included,
 * so toggling visibility does not discard overrides. Section ids match pageLayoutConfigToLegacy (used by index.astro).
 */
export function page_layout_for_instances(
  config: PageLayoutConfig,
): PageLayout {
  const all_active = (container: ContainerConfig | undefined) => ({
    elements: (container?.elements ?? []).map((element) => ({
      ...element,
      active: true,
    })),
  });
  return pageLayoutConfigToLegacy({
    template: "both-sidebars",
    containers: {
      top: all_active(config.containers.top),
      sidebarLeft: all_active(config.containers.sidebarLeft),
      sidebarRight: all_active(config.containers.sidebarRight),
      bottom: all_active(config.containers.bottom),
    },
  });
}

/**
 * Settings with orphaned overrides removed. Without a v3 pageLayoutConfig the rendered layout is unknown,
 * so overrides are kept as they are (the resolver ignores keys that do not match a rendered instance).
 */
export function prune_settings_instance_overrides<
  T extends Partial<SettingsData>,
>(settings: T): T {
  const config = settings.pageLayoutConfig;
  if (!settings.instanceOverrides || !config?.containers) return settings;
  return {
    ...settings,
    instanceOverrides: prune_instance_overrides(
      settings.instanceOverrides,
      page_layout_for_instances(config),
    ),
  };
}
