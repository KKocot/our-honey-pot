// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load_stored_config: vi.fn() }));

vi.mock("../../src/components/admin/hive-broadcast", () => ({
  load_stored_config: mocks.load_stored_config,
}));
vi.mock("../../src/lib/dev-config-store", () => ({
  get_dev_config: vi.fn(() => null),
}));

import { load_config_with_status } from "../../src/lib/config-pipeline";
import { extract_explicit_fields } from "../../src/lib/config-fields";
import {
  POSTS_SECTION_FALLBACK_ID,
  SECTION_STYLE_DEFAULTS,
  type HomeSection,
} from "../../src/components/admin/types/settings";
import { validate_settings_for_save } from "../../src/components/admin/types/settings-schema";

function serve_config(raw: Record<string, unknown>): void {
  mocks.load_stored_config.mockResolvedValueOnce({
    status: "found",
    account: { blog: "alice", account: "alice", source: "personal" },
    permlink: "config",
    settings: extract_explicit_fields(raw),
  });
}

const VIRTUAL_POSTS: HomeSection = {
  id: POSTS_SECTION_FALLBACK_ID,
  type: "posts",
  content: {},
  style: { ...SECTION_STYLE_DEFAULTS.common },
};

beforeEach(() => {
  mocks.load_stored_config.mockReset();
});

describe("virtual home migration", () => {
  it.each([true, false])(
    "gives an old config without home a lone posts section (community=%s)",
    async (is_community) => {
      serve_config({ siteName: "Old blog" });
      const result = await load_config_with_status("alice", is_community);
      expect(result.status).toBe("found");
      expect(result.settings.siteName).toBe("Old blog");
      expect(result.settings.home).toEqual({ sections: [VIRTUAL_POSTS] });
      expect("pages" in result.settings).toBe(false);
    },
  );

  it("replaces an invalid home with the posts section", async () => {
    serve_config({ home: { sections: "broken" } });
    const { settings } = await load_config_with_status("alice", false);
    expect(settings.home).toEqual({ sections: [VIRTUAL_POSTS] });
  });

  it("keeps a valid home as saved", async () => {
    const sections = [
      {
        id: "hero0001",
        type: "hero",
        content: { headline: "Welcome" },
        style: { variant: "stacked" },
      },
      { id: "feed0001", type: "posts", content: { title: "Latest" } },
    ];
    serve_config({ home: { sections } });
    const { settings } = await load_config_with_status("alice", false);
    expect(settings.home?.sections.map((section) => section.id)).toEqual([
      "hero0001",
      "feed0001",
    ]);
    expect(settings.home?.sections[0]).toMatchObject({
      type: "hero",
      content: { headline: "Welcome" },
      style: { variant: "stacked", height: "auto" },
    });
  });

  it("does not share the virtual section between loads", async () => {
    serve_config({});
    const first = await load_config_with_status("alice", false);
    const first_section = first.settings.home?.sections[0];
    if (first_section) first_section.style.bg = "accent";
    serve_config({});
    const second = await load_config_with_status("alice", false);
    expect(second.settings.home?.sections[0].style.bg).toBe("none");
  });

  it("produces a config that passes the save gate", async () => {
    serve_config({ siteName: "Old blog" });
    const { settings } = await load_config_with_status("alice", false);
    expect(validate_settings_for_save(settings).ok).toBe(true);
  });

  it("keeps pages read from chain", async () => {
    serve_config({
      pages: [{ slug: "about", title: "About", body_md: "Hello" }],
    });
    const { settings } = await load_config_with_status("alice", false);
    expect(settings.pages).toEqual([
      {
        slug: "about",
        title: "About",
        body_md: "Hello",
        in_nav: false,
        in_footer: "none",
        footer_column: 0,
      },
    ]);
  });
});
