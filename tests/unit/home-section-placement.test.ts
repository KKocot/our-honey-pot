// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  get_default_settings,
  type HomeSection,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import {
  settings_schema,
  validate_settings_for_save,
} from "../../src/components/admin/types/settings-schema";
import {
  SECTION_DEFINITIONS,
  get_section_definition,
  is_placement_allowed,
} from "../../src/shared/components/sections/registry";
import {
  HOME_SECTION_ID_REGEX,
  SECTION_PLACEMENT_CONTAINERS,
  type AnySectionDefinition,
} from "../../src/shared/components/sections/registry-types";

const SIDEBAR_TYPES = [
  "about",
  "links",
  "callout",
  "now",
  "quote",
  "faq",
  "text-media",
] as const;

const DEFINITIONS = SECTION_DEFINITIONS as readonly AnySectionDefinition[];

const HERO = {
  id: "hero0001",
  type: "hero",
  content: { headline: "Welcome" },
};
const QUOTE = {
  id: "quot0001",
  type: "quote",
  content: { text: "Slow is smooth." },
};
const POSTS = { id: "feed0001", type: "posts", content: {} };

function read_home(sections: unknown[]): HomeSection[] {
  const parsed = settings_schema.shape.home.safeParse({ sections });
  if (!parsed.success || parsed.data === undefined) {
    throw new Error("home was not read");
  }
  return parsed.data.sections;
}

function save_errors(sections: unknown[]): string[] {
  const settings: SettingsData = get_default_settings(false);
  settings.home = { sections: sections as HomeSection[] };
  const result = validate_settings_for_save(settings);
  return result.ok ? [] : result.errors;
}

describe("placement allowlist", () => {
  it("lets sidebar types into every container", () => {
    for (const type of SIDEBAR_TYPES) {
      for (const container of SECTION_PLACEMENT_CONTAINERS) {
        expect(is_placement_allowed(type, container)).toBe(true);
      }
    }
  });

  it.each(["hero", "cta-band"])(
    "keeps %s out of sidebars but allows top and bottom",
    (type) => {
      expect(is_placement_allowed(type, "top")).toBe(true);
      expect(is_placement_allowed(type, "bottom")).toBe(true);
      expect(is_placement_allowed(type, "sidebarLeft")).toBe(false);
      expect(is_placement_allowed(type, "sidebarRight")).toBe(false);
    },
  );

  it("keeps posts in main only", () => {
    expect(is_placement_allowed("posts", "main")).toBe(true);
    for (const container of SECTION_PLACEMENT_CONTAINERS) {
      expect(is_placement_allowed("posts", container)).toBe(false);
    }
  });

  it("allows main for every registered type and nothing for unknown types or containers", () => {
    for (const definition of DEFINITIONS) {
      expect(is_placement_allowed(definition.type, "main")).toBe(true);
      expect(is_placement_allowed(definition.type, "header")).toBe(false);
    }
    expect(is_placement_allowed("unknown", "top")).toBe(false);
  });
});

describe("tolerant reader", () => {
  it("keeps a valid placement", () => {
    const placement = { container: "sidebarLeft", index: 0 };
    const [quote] = read_home([{ ...QUOTE, placement }, POSTS]);
    expect(quote.placement).toEqual(placement);
  });

  it.each([
    ["hero in a sidebar", HERO, { container: "sidebarLeft", index: 0 }],
    ["posts outside main", POSTS, { container: "top", index: 0 }],
    ["unknown container", QUOTE, { container: "header", index: 0 }],
    ["main as a container", QUOTE, { container: "main", index: 0 }],
    ["negative index", QUOTE, { container: "top", index: -1 }],
    ["fractional index", QUOTE, { container: "top", index: 1.5 }],
    ["missing index", QUOTE, { container: "top" }],
    ["not an object", QUOTE, "sidebarLeft"],
    ["an array", QUOTE, [{ container: "top", index: 0 }]],
  ])(
    "drops the placement, not the section, for %s",
    (_name, section, placement) => {
      const others = section === POSTS ? [] : [POSTS];
      const sections = read_home([{ ...section, placement }, ...others]);
      const read = sections.find((entry) => entry.id === section.id);
      expect(read).toBeDefined();
      expect(read).not.toHaveProperty("placement");
    },
  );

  it("drops a bad placement while keeping the other valid fields", () => {
    const [quote] = read_home([
      {
        ...QUOTE,
        hidden: true,
        placement: { container: "nope", index: -3 },
        style: { variant: "centered" },
      },
      POSTS,
    ]);
    expect(quote).toMatchObject({
      hidden: true,
      content: { text: "Slow is smooth." },
      style: { variant: "centered" },
    });
    expect(quote).not.toHaveProperty("placement");
  });
});

describe("save gate", () => {
  it("rejects hero in sidebarLeft at the placement path", () => {
    const errors = save_errors([
      { ...HERO, placement: { container: "sidebarLeft", index: 0 } },
      POSTS,
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^home\.sections\.0\.placement: /);
  });

  it("rejects posts placed outside main", () => {
    const errors = save_errors([
      HERO,
      { ...POSTS, placement: { container: "bottom", index: 0 } },
    ]);
    expect(errors[0]).toMatch(/^home\.sections\.1\.placement: /);
  });

  it("rejects a malformed placement under the placement path", () => {
    const errors = save_errors([
      { ...QUOTE, placement: { container: "top", index: -1 } },
      POSTS,
    ]);
    expect(errors[0]).toMatch(/^home\.sections\.0\.placement\.index: /);
  });

  it("saves valid placements unchanged", () => {
    const settings = get_default_settings(false);
    settings.home = {
      sections: read_home([
        { ...HERO, placement: { container: "top", index: 0 } },
        { ...QUOTE, placement: { container: "sidebarRight", index: 2 } },
        POSTS,
      ]),
    };
    const result = validate_settings_for_save(settings);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.settings.home?.sections.map((section) => section.placement),
    ).toEqual([
      { container: "top", index: 0 },
      { container: "sidebarRight", index: 2 },
      undefined,
    ]);
  });
});

describe("backward compatibility", () => {
  // The section schema before placement existed: same z.object, which strips unknown keys.
  const head_section_schema = z.discriminatedUnion(
    "type",
    DEFINITIONS.map((definition) =>
      z.object({
        id: z.string().regex(HOME_SECTION_ID_REGEX),
        hidden: z.boolean().optional(),
        type: z.literal(definition.type),
        content: definition.content_schema,
        style: definition.style_schema,
      }),
    ) as unknown as [
      z.ZodDiscriminatedUnionOption<"type">,
      ...z.ZodDiscriminatedUnionOption<"type">[],
    ],
  );

  it("reads a config with placements on the old schema without losing sections", () => {
    const sections = [
      { ...HERO, placement: { container: "top", index: 0 } },
      { ...QUOTE, placement: { container: "sidebarLeft", index: 1 } },
      POSTS,
    ];
    const parsed = sections.map((section) =>
      head_section_schema.safeParse(section),
    );
    expect(parsed.every((result) => result.success)).toBe(true);
    const ids = parsed.map((result) =>
      result.success ? (result.data as { id: string }).id : null,
    );
    expect(ids).toEqual(["hero0001", "quot0001", "feed0001"]);
    for (const result of parsed) {
      if (result.success) expect(result.data).not.toHaveProperty("placement");
    }
  });

  it("still reads a config without placements on the new schema", () => {
    const sections = read_home([HERO, QUOTE, POSTS]);
    expect(sections.map((section) => section.id)).toEqual([
      "hero0001",
      "quot0001",
      "feed0001",
    ]);
    expect(get_section_definition("hero").placements).toEqual([
      "top",
      "bottom",
    ]);
  });
});
