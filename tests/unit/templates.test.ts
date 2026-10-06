// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";

import {
  build_template_patch,
  build_undo_patch,
  designPatterns,
  websiteTemplates,
} from "../../src/components/admin/types/templates";
import {
  get_default_settings,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import type { PageLayoutConfig } from "../../src/components/admin/types/layout";
import { themePresets } from "../../src/components/admin/types/theme";

function layout_element_ids(config: PageLayoutConfig | undefined): string[] {
  if (!config) return [];
  return Object.values(config.containers).flatMap((c) =>
    c.elements.map((e) => e.id),
  );
}

function legacy_element_ids(settings: Partial<SettingsData>): string[] {
  return (settings.pageLayout?.sections ?? []).flatMap((s) => s.elements);
}

const all_presets = [
  ...websiteTemplates.map((t) => ({ name: t.id, settings: t.settings })),
  ...designPatterns,
];

describe("build_template_patch", () => {
  it("returns null when there is no template", () => {
    expect(build_template_patch(undefined, true)).toBeNull();
    expect(build_template_patch(undefined, false)).toBeNull();
  });

  it.each(all_presets.map((p) => [p.name, p.settings] as const))(
    "%s clears customColors in both modes",
    (_name, settings) => {
      expect(build_template_patch(settings, true)).toHaveProperty(
        "customColors",
        null,
      );
      expect(build_template_patch(settings, false)).toHaveProperty(
        "customColors",
        null,
      );
    },
  );

  it.each(all_presets.map((p) => [p.name, p.settings] as const))(
    "%s in community mode uses community profile elements instead of authorProfile",
    (_name, settings) => {
      const patch = build_template_patch(settings, true);
      const ids = layout_element_ids(patch?.pageLayoutConfig);
      expect(ids).toContain("communityProfile");
      expect(ids).toContain("communitySidebar");
      expect(ids).not.toContain("authorProfile");

      const legacy = legacy_element_ids(patch ?? {});
      expect(legacy).not.toContain("authorProfile");
      expect(legacy).toContain("communityProfile");
    },
  );

  it("places community elements where authorProfile was", () => {
    const template = websiteTemplates.find((t) => t.id === "developer-blog");
    const patch = build_template_patch(template?.settings, true);
    expect(patch?.pageLayoutConfig?.template).toBe("sidebar-left");
    expect(
      patch?.pageLayoutConfig?.containers.sidebarLeft.elements.map((e) => e.id),
    ).toEqual(["communityProfile", "communitySidebar"]);
  });

  it("keeps authorProfile in user mode", () => {
    const template = websiteTemplates.find((t) => t.id === "developer-blog");
    const patch = build_template_patch(template?.settings, false);
    expect(layout_element_ids(patch?.pageLayoutConfig)).toContain(
      "authorProfile",
    );
    expect(layout_element_ids(patch?.pageLayoutConfig)).not.toContain(
      "communityProfile",
    );
  });

  it("does not mutate the source template", () => {
    const template = websiteTemplates.find((t) => t.id === "developer-blog");
    const before = JSON.stringify(template?.settings);
    build_template_patch(template?.settings, true);
    expect(JSON.stringify(template?.settings)).toBe(before);
  });

  it("derives scrollAnimationEnabled from scrollAnimationType", () => {
    expect(
      build_template_patch({ scrollAnimationType: "none" }, true)
        ?.scrollAnimationEnabled,
    ).toBe(false);
    expect(
      build_template_patch({ scrollAnimationType: "fade" }, true)
        ?.scrollAnimationEnabled,
    ).toBe(true);
    expect(build_template_patch({}, true)?.scrollAnimationEnabled).toBe(false);
  });
});

describe("build_undo_patch", () => {
  it("returns null without snapshot or applied patch", () => {
    expect(build_undo_patch(null, { postsLayout: "grid" })).toBeNull();
    expect(build_undo_patch(undefined, { postsLayout: "grid" })).toBeNull();
    expect(build_undo_patch(get_default_settings(true), null)).toBeNull();
  });

  it("restores snapshot values for every key the template touched", () => {
    const snapshot: SettingsData = {
      ...get_default_settings(true),
      postsLayout: "list",
      customColors: { ...themePresets[0].colors },
    };
    const applied = build_template_patch(websiteTemplates[0].settings, true);
    const undo = build_undo_patch(snapshot, applied);

    expect(undo).not.toBeNull();
    expect(Object.keys(undo ?? {}).sort()).toEqual(
      Object.keys(applied ?? {}).sort(),
    );
    expect(undo?.customColors).toEqual(snapshot.customColors);
    expect(undo?.postsLayout).toBe("list");
    expect(undo?.pageLayoutConfig).toEqual(snapshot.pageLayoutConfig);
  });

  it("resets keys absent from the snapshot to undefined", () => {
    const snapshot = { ...get_default_settings(true) };
    delete snapshot.footer_text;
    const undo = build_undo_patch(snapshot, { footer_text: "x" });
    expect(undo).toHaveProperty("footer_text", undefined);
  });
});
