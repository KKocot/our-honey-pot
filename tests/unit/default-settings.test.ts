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
import {
  parse_settings_graceful,
  settings_schema,
} from "../../src/components/admin/types/settings-schema";
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

describe("style token defaults", () => {
  it("community defaults inherit the user style tokens", () => {
    for (const key of [
      "fontHeading",
      "fontBody",
      "radiusPx",
      "density",
      "contentWidthPx",
      "baseFontSizePx",
      "headingScale",
      "presetId",
    ] as const) {
      expect(defaultCommunitySettings[key]).toEqual(defaultSettings[key]);
    }
  });
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

describe("muted community sort", () => {
  it("is not a default visible tab", () => {
    expect(defaultCommunitySettings.community_visible_sorts).not.toContain(
      "muted",
    );
    expect(resolve_visible_sorts(undefined)).not.toContain("muted");
  });

  it("keeps configs without muted free of the muted tab", () => {
    const parsed = parse_settings_graceful({
      community_visible_sorts: ["trending", "hot"],
    });
    expect(
      resolve_visible_sorts(parsed.community_visible_sorts as string[]),
    ).toEqual(["trending", "hot"]);
  });

  it("parses a config with muted as visible and default sort", () => {
    const parsed = parse_settings_graceful({
      community_default_sort: "muted",
      community_visible_sorts: ["hot", "muted"],
    });

    expect(parsed.community_visible_sorts).toEqual(["hot", "muted"]);
    expect(parsed.community_default_sort).toBe("muted");
    expect(
      resolve_default_sort(
        parsed.community_default_sort as string | undefined,
        resolve_visible_sorts(parsed.community_visible_sorts as string[]),
      ),
    ).toBe("muted");
  });

  it("keeps muted when it is the only visible sort", () => {
    const parsed = parse_settings_graceful({
      community_visible_sorts: ["muted"],
    });
    const visible = resolve_visible_sorts(
      parsed.community_visible_sorts as string[],
    );
    expect(visible).toEqual(["muted"]);
    expect(resolve_default_sort("trending", visible)).toBe("muted");
  });

  it("falls back when the default sort points at a hidden muted tab", () => {
    expect(resolve_default_sort("muted", ["trending", "hot"])).toBe("trending");
  });

  it("still rejects unknown sort values", () => {
    const parsed = parse_settings_graceful({ community_default_sort: "bogus" });
    expect("community_default_sort" in parsed).toBe(false);
  });
});

describe("global field defaults", () => {
  it.each([true, false])(
    "keep today's behaviour and are fresh copies (community=%s)",
    (is_community) => {
      const first = get_default_settings(is_community);
      expect(first.brand).toEqual({ mode: "text", size: "md" });
      expect(first.seo).toEqual({});
      expect(first.locale).toBe("en");
      expect(first.topbar).toEqual({
        show_login: true,
        show_node_switcher: true,
      });
      expect(first.nav).toEqual({ links: [] });
      expect(first.footer).toEqual({
        variant: "inline",
        columns: [],
        legal_links: [],
        show_social: false,
      });

      first.nav.links.push({ label: "x", kind: "tag", target: "x" });
      first.footer.columns.push({ title: "t", links: [] });
      first.topbar.show_login = false;
      const second = get_default_settings(is_community);
      expect(second.nav.links).toEqual([]);
      expect(second.footer.columns).toEqual([]);
      expect(second.topbar.show_login).toBe(true);
    },
  );

  it("schema defaults match the settings defaults", () => {
    const parsed = parse_settings_graceful({});
    expect(parsed).toEqual({});
    for (const key of [
      "brand",
      "seo",
      "locale",
      "topbar",
      "nav",
      "footer",
    ] as const) {
      expect(
        settings_schema.shape[key].parse(undefined) as unknown,
        key,
      ).toEqual(defaultSettings[key]);
    }
  });
});
