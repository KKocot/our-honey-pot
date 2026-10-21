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
  HOME_MAX_SECTIONS,
  POSTS_SECTION_FALLBACK_ID,
  SECTION_STYLE_DEFAULTS,
  get_default_settings,
  type HomeSection,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import {
  HomeSectionSchema,
  validate_settings_for_save,
} from "../../src/components/admin/types/settings-schema";
import {
  MAX_BODY_SIZE,
  config_size_breakdown,
  largest_size_area,
  measure_config_body,
} from "../../src/components/admin/config-size";
import { URL_MAX_BYTES } from "../../src/lib/image-ref";
import { SECTION_DEFINITIONS } from "../../src/shared/components/sections/registry";
import type {
  AnySectionDefinition,
  FieldDescriptor,
} from "../../src/shared/components/sections/registry-types";

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

const NEW_SECTION_TYPES = [
  "about",
  "links",
  "callout",
  "now",
  "quote",
  "faq",
] as const;

// A 4-byte code point: the largest UTF-8 size a code-point-limited text can reach without JSON escapes.
const WIDE_CHAR = "😀";
const LINK_URL = `https://example.com/${"a".repeat(URL_MAX_BYTES - "https://example.com/".length)}`;
const IMAGE_URL = `https://images.hive.blog/${"a".repeat(URL_MAX_BYTES - "https://images.hive.blog/".length)}`;

function definition_of(type: string): AnySectionDefinition {
  const found = (SECTION_DEFINITIONS as readonly AnySectionDefinition[]).find(
    (definition) => definition.type === type,
  );
  if (!found) throw new Error(`unregistered type ${type}`);
  return found;
}

function max_value(field: FieldDescriptor): unknown {
  switch (field.kind) {
    case "text":
    case "textarea":
      return WIDE_CHAR.repeat(field.max_len);
    case "markdown":
      return "a".repeat(field.max_bytes);
    case "url":
      return LINK_URL;
    case "image":
      return { url: IMAGE_URL, alt: WIDE_CHAR.repeat(125), w: 8000, h: 8000 };
    case "select":
      return field.options[0].value;
    case "date":
      return "2026-10-01";
    case "boolean":
      return true;
    case "list":
      return Array.from({ length: field.max }, () =>
        max_object(field.item_fields),
      );
    case "group":
      return max_object(field.fields);
  }
}

function max_object(
  fields: readonly FieldDescriptor[],
): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => [field.key, max_value(field)]),
  );
}

/** The longest placement the type allows: sidebar types go to sidebarRight, full-width types to bottom. */
function max_placement(definition: AnySectionDefinition): {
  placement?: { container: string; index: number };
} {
  const container = (["sidebarRight", "bottom"] as const).find((candidate) =>
    definition.placements.includes(candidate),
  );
  return container ? { placement: { container, index: 99 } } : {};
}

/** Every field at its limit; cross-entry limits (highlights, FAQ answer total) are then trimmed to stay valid. */
function max_section(type: string, index: number): HomeSection {
  const definition = definition_of(type);
  const content = max_object(definition.fields);
  if (type === "links") {
    const highlight = definition.text_limits.highlight;
    (content.items as Record<string, unknown>[]).forEach((item, position) => {
      if (position >= highlight) delete item.highlight;
    });
  }
  if (type === "faq") {
    const items = content.items as Record<string, unknown>[];
    const per_answer = Math.floor(
      definition.text_limits.answers_total_bytes / items.length,
    );
    for (const item of items) item.a = "a".repeat(per_answer);
  }
  return HomeSectionSchema.parse({
    id: `${type.replace("-", "").slice(0, 4).padEnd(4, "x")}${String(index).padStart(4, "0")}`,
    type,
    ...max_placement(definition),
    content,
    style: {
      ...definition.defaults().style,
      bg_image: { url: IMAGE_URL, alt: "", w: 8000, h: 8000 },
    },
  });
}

function section_bytes(section: HomeSection): number {
  return new TextEncoder().encode(JSON.stringify(section)).length;
}

/** The largest home a config can hold: HOME_MAX_SECTIONS sections, the biggest types first, within max_per_page. */
function worst_case_sections(): HomeSection[] {
  const candidates: HomeSection[] = [];
  for (const definition of SECTION_DEFINITIONS as readonly AnySectionDefinition[]) {
    if (definition.fixed) continue;
    for (let copy = 0; copy < definition.max_per_page; copy += 1) {
      candidates.push(max_section(definition.type, candidates.length));
    }
  }
  candidates.sort((a, b) => section_bytes(b) - section_bytes(a));
  return [
    max_section("posts", 99),
    ...candidates.slice(0, HOME_MAX_SECTIONS - 1),
  ];
}

function typical_settings(sections: HomeSection[]): SettingsData {
  const settings = get_default_settings(false);
  settings.hiveUsername = "alice";
  settings.siteName = "Alice writes";
  settings.siteDescription = "Notes on gardens, books and slow travel.";
  settings.footer = {
    ...settings.footer,
    privacy: { label: "Privacy", kind: "page", target: "privacy" },
  };
  settings.pages = [
    {
      slug: "privacy",
      title: "Privacy",
      body_md: "We store the newsletter address only to send the newsletter.",
      in_nav: false,
      in_footer: "legal",
      footer_column: 0,
    },
  ];
  settings.home = { sections };
  return settings;
}

async function load_home(sections: unknown[]): Promise<HomeSection[]> {
  serve_config({ home: { sections } });
  const { settings } = await load_config_with_status("alice", false);
  return settings.home?.sections ?? [];
}

describe("new section types in the config pipeline", () => {
  it.each(NEW_SECTION_TYPES)(
    "%s survives parse -> serialize -> parse unchanged",
    async (type) => {
      const definition = definition_of(type);
      const fresh = {
        id: "fresh001",
        type,
        ...definition.defaults(),
        content: {
          ...definition.defaults().content,
          ...(type === "now" ? { updated_at: "2026-10-01" } : {}),
        },
      };
      const posts = { id: "feed0001", type: "posts", content: {} };
      for (const raw of [fresh, max_section(type, 1)]) {
        const first = await load_home([raw, posts]);
        expect(first.map((section) => section.type)).toEqual([type, "posts"]);
        expect(first[0]).toEqual(HomeSectionSchema.parse(raw));

        const serialized = JSON.parse(JSON.stringify(first)) as unknown[];
        const second = await load_home(serialized);
        expect(second).toEqual(first);
      }
    },
  );

  it("measures the largest valid home against the 64 KiB body limit", () => {
    const sections = worst_case_sections();
    expect(sections).toHaveLength(HOME_MAX_SECTIONS);
    const containers = sections.map((section) => section.placement?.container);
    expect(containers).toContain("sidebarRight");
    expect(containers).toContain("bottom");
    const settings = typical_settings(sections);
    expect(validate_settings_for_save(settings).ok).toBe(true);

    const body = JSON.stringify(settings);
    const size = measure_config_body(body);
    const breakdown = config_size_breakdown(settings, size.bytes);
    expect(largest_size_area(breakdown)?.id).toBe("sections");
    // Measured 2026-10-21 with placements: 44 998 bytes (69%, level ok); faq 10.3 KB, now 7.0 KB, about 5.6 KB, links 5.0 KB.
    expect(size.bytes).toBeLessThanOrEqual(MAX_BODY_SIZE);
    expect(size.bytes).toBeGreaterThan(40 * 1024);
  });

  it("warns before Save when the largest home meets fully used pages", () => {
    const settings = typical_settings(worst_case_sections());
    settings.pages = [
      ...(settings.pages ?? []),
      ...Array.from({ length: 2 }, (_, index) => ({
        slug: `essay-${index}`,
        title: "Essay",
        body_md: "a".repeat(6144),
        in_nav: true,
        in_footer: "none" as const,
        footer_column: 0,
      })),
    ];
    expect(validate_settings_for_save(settings).ok).toBe(true);
    const level = measure_config_body(JSON.stringify(settings)).level;
    expect(["warn", "danger"]).toContain(level);
  });
});
