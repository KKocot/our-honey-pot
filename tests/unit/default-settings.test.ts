// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  defaultCommunitySettings,
  defaultSettings,
  get_default_settings,
  strip_user_fields,
} from "../../src/components/admin/types/settings";
import {
  defaultCommunityPageLayout,
  defaultCommunityPageLayoutConfig,
} from "../../src/components/home/types";
import { parse_settings_graceful } from "../../src/components/admin/types/settings-schema";
import { resolve_default_sort } from "../../src/lib/community-sort";
import { resolve_visible_sorts } from "../../src/components/community/pagination";

describe("get_default_settings", () => {
  it.each([true, false])(
    "returns a fresh deep copy (community=%s)",
    (is_community) => {
      const first = get_default_settings(is_community);
      const source = is_community ? defaultCommunitySettings : defaultSettings;
      expect(first).toEqual(source);
      expect(first).not.toBe(source);
      expect(first.layoutSections).not.toBe(source.layoutSections);

      first.siteName = "mutated";
      first.layoutSections.length = 0;
      first.pageLayout.sections.push({
        ...first.pageLayout.sections[0],
        id: "extra",
      });
      if (first.customColors) first.customColors.bg = "#000000";

      expect(get_default_settings(is_community)).toEqual(source);
      expect(source.siteName).not.toBe("mutated");
    },
  );
});

describe("home/types defaults", () => {
  it("are deeply frozen copies, not the settings singleton", () => {
    expect(defaultCommunityPageLayoutConfig).not.toBe(
      defaultCommunitySettings.pageLayoutConfig,
    );
    expect(defaultCommunityPageLayoutConfig).toEqual(
      defaultCommunitySettings.pageLayoutConfig,
    );
    expect(Object.isFrozen(defaultCommunityPageLayoutConfig)).toBe(true);
    expect(Object.isFrozen(defaultCommunityPageLayoutConfig.containers)).toBe(
      true,
    );
    expect(Object.isFrozen(defaultCommunityPageLayout.sections)).toBe(true);
    expect(() => {
      (defaultCommunityPageLayout.sections as unknown[]).push({});
    }).toThrow(TypeError);
  });
});

describe("pinned posts", () => {
  it("survive community-mode field stripping", () => {
    const stripped = strip_user_fields({ pinnedPostPermlinks: ["a-post"] });
    expect(stripped.pinnedPostPermlinks).toEqual(["a-post"]);
  });
});

describe("legacy muted community sort", () => {
  it("parses a config with muted as default and visible sort", () => {
    const parsed = parse_settings_graceful({
      community_default_sort: "muted",
      community_visible_sorts: ["muted", "hot", "created"],
    });

    expect(parsed.community_visible_sorts).toEqual(["hot", "created"]);
    expect(parsed.community_default_sort).toBeUndefined();
    expect(
      resolve_default_sort(
        parsed.community_default_sort as string | undefined,
        resolve_visible_sorts(parsed.community_visible_sorts as string[]),
      ),
    ).toBe("hot");
  });

  it("falls back to default tabs when muted was the only visible sort", () => {
    const parsed = parse_settings_graceful({
      community_default_sort: "muted",
      community_visible_sorts: ["muted"],
    });

    expect(parsed.community_visible_sorts).toBeUndefined();
    expect(
      resolve_default_sort(
        parsed.community_default_sort as string | undefined,
        resolve_visible_sorts(
          parsed.community_visible_sorts as string[] | undefined,
        ),
      ),
    ).toBe("trending");
  });

  it("still rejects unknown sort values", () => {
    const parsed = parse_settings_graceful({ community_default_sort: "bogus" });
    expect("community_default_sort" in parsed).toBe(false);
  });
});
