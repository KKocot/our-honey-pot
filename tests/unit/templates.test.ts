// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";

import {
  adapt_layout_for_community,
  designPatterns,
} from "../../src/components/admin/types/templates";
import { DEVELOPER_BLOG_BASE } from "../../src/components/admin/presets/layouts";
import type { SettingsData } from "../../src/components/admin/types/settings";
import type { PageLayoutConfig } from "../../src/components/admin/types/layout";

function layout_element_ids(config: PageLayoutConfig | undefined): string[] {
  if (!config) return [];
  return Object.values(config.containers).flatMap((c) =>
    c.elements.map((e) => e.id),
  );
}

function legacy_element_ids(settings: Partial<SettingsData>): string[] {
  return (settings.pageLayout?.sections ?? []).flatMap((s) => s.elements);
}

describe("adapt_layout_for_community", () => {
  it.each(designPatterns.map((p) => [p.name, p.settings] as const))(
    "%s uses community profile elements instead of authorProfile",
    (_name, settings) => {
      const adapted = adapt_layout_for_community(settings);
      const ids = layout_element_ids(adapted.pageLayoutConfig);
      expect(ids).toContain("communityProfile");
      expect(ids).toContain("communitySidebar");
      expect(ids).not.toContain("authorProfile");

      const legacy = legacy_element_ids(adapted);
      expect(legacy).not.toContain("authorProfile");
      expect(legacy).toContain("communityProfile");
    },
  );

  it("places community elements where authorProfile was", () => {
    const adapted = adapt_layout_for_community(DEVELOPER_BLOG_BASE);
    expect(adapted.pageLayoutConfig?.template).toBe("sidebar-left");
    expect(
      adapted.pageLayoutConfig?.containers.sidebarLeft.elements.map(
        (e) => e.id,
      ),
    ).toEqual(["communityProfile", "communitySidebar"]);
  });

  it("appends the community block to the top container of full-width layouts", () => {
    const adapted = adapt_layout_for_community({
      pageLayoutConfig: {
        template: "no-sidebar",
        containers: {
          top: { elements: [{ id: "header", active: true }] },
          sidebarLeft: { elements: [] },
          sidebarRight: { elements: [] },
          bottom: { elements: [] },
        },
      },
    });
    expect(
      adapted.pageLayoutConfig?.containers.top.elements.map((e) => e.id),
    ).toEqual(["header", "communityProfile", "communitySidebar"]);
  });

  it("does not mutate the source layout", () => {
    const before = JSON.stringify(DEVELOPER_BLOG_BASE);
    adapt_layout_for_community(DEVELOPER_BLOG_BASE);
    expect(JSON.stringify(DEVELOPER_BLOG_BASE)).toBe(before);
  });
});
