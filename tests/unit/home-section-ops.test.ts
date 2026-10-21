// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  add_home_section,
  section_content_issues,
  can_add_section,
  count_placeholder_sections,
  duplicate_home_section,
  home_section_issues,
  generate_section_id,
  home_section_popover_key,
  home_sections_of,
  move_home_section,
  move_home_section_down,
  move_home_section_up,
  remove_home_section,
  swap_home_sections,
  toggle_home_section_hidden,
  update_home_section,
  type AddableHomeSectionType,
  type RandomSource,
} from "../../src/components/admin/canvas/home-section-ops";
import {
  SECTION_DEFINITIONS,
  get_section_definition,
} from "../../src/shared/components/sections/registry";
import {
  common_style_shape,
  define_section,
  text_schema,
  type AnySectionDefinition,
  type FieldDescriptor,
} from "../../src/shared/components/sections/registry-types";
import { ContactUrlSchema } from "../../src/lib/image-ref";
import { cta_band_definition } from "../../src/shared/components/sections/cta-band/definition";
import {
  HOME_MAX_SECTIONS,
  HOME_SECTION_ID_REGEX,
  POSTS_SECTION_FALLBACK_ID,
  SECTION_STYLE_DEFAULTS,
  type HomeSection,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import {
  HomeSectionSchema,
  create_posts_section,
  parse_settings_graceful,
} from "../../src/components/admin/types/settings-schema";

const FILLED_URL = "https://example.com/signup";
const FILLED_TEXT = "Filled in";
const FILLED_DATE = "2026-10-01";

/** Field descriptor at a content dot path; list indices are skipped. */
function field_at(
  fields: readonly FieldDescriptor[],
  path: string,
): FieldDescriptor | undefined {
  let current: readonly FieldDescriptor[] = fields;
  let found: FieldDescriptor | undefined;
  for (const key of path.split(".")) {
    if (/^\d+$/.test(key)) continue;
    found = current.find((field) => field.key === key);
    if (!found) return undefined;
    current =
      found.kind === "group"
        ? found.fields
        : found.kind === "list"
          ? found.item_fields
          : [];
  }
  return found;
}

/** A valid owner value for a field kind: a date, a URL or plain text. */
function filled_value(field: FieldDescriptor | undefined): string {
  if (field?.kind === "date") return FILLED_DATE;
  if (field?.kind === "url") return FILLED_URL;
  return FILLED_TEXT;
}

/** Deep copy of `section` with every dot path set to a valid value of its field kind (date, URL or text). */
function fill_paths(
  section: HomeSection | undefined,
  paths: readonly string[],
  definition: AnySectionDefinition,
): HomeSection {
  const copy = JSON.parse(JSON.stringify(section)) as HomeSection;
  for (const path of paths) {
    const keys = path.split(".");
    let target = copy.content as Record<string, unknown>;
    for (const key of keys.slice(0, -1)) {
      target = target[key] as Record<string, unknown>;
    }
    target[keys[keys.length - 1]] = filled_value(
      field_at(definition.fields, path),
    );
  }
  return copy;
}

function sequence_random(ids: string[]): RandomSource {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const values = ids.flatMap((id) =>
    Array.from(id).map(
      (char) => (alphabet.indexOf(char) + 0.5) / alphabet.length,
    ),
  );
  let position = 0;
  return () => values[position++ % values.length];
}

function hero(id = "hero0001"): HomeSection {
  return {
    id,
    type: "hero",
    content: { headline: "Hello" },
    style: { ...SECTION_STYLE_DEFAULTS.common, ...SECTION_STYLE_DEFAULTS.hero },
  };
}

function text_media(id: string): HomeSection {
  return {
    id,
    type: "text-media",
    content: { title: "About" },
    style: {
      ...SECTION_STYLE_DEFAULTS.common,
      ...SECTION_STYLE_DEFAULTS["text-media"],
    },
  };
}

function settings_with(sections: HomeSection[]): Pick<SettingsData, "home"> {
  return { home: { sections } };
}

function ids_of(patch: Partial<SettingsData> | null): string[] {
  return patch?.home?.sections.map((section) => section.id) ?? [];
}

const POSTS = create_posts_section("posts001");

describe("home_sections_of", () => {
  it("returns the virtual posts section when home is absent", () => {
    expect(home_sections_of({})).toEqual([create_posts_section()]);
    expect(home_sections_of({})[0].id).toBe(POSTS_SECTION_FALLBACK_ID);
  });
});

describe("generate_section_id", () => {
  it("returns an id matching the section regex", () => {
    const id = generate_section_id(new Set());
    expect(id).toMatch(HOME_SECTION_ID_REGEX);
    expect(id.startsWith("page-sec-")).toBe(false);
  });

  it("skips ids already taken", () => {
    const random = sequence_random(["aaaaaaaa", "bbbbbbbb"]);
    expect(generate_section_id(new Set(["aaaaaaaa"]), random)).toBe("bbbbbbbb");
  });

  it("terminates with a constant random source", () => {
    const taken = new Set(["aaaaaaaa", "sec00000"]);
    const id = generate_section_id(taken, () => 0);
    expect(id).toBe("sec00001");
    expect(id).toMatch(HOME_SECTION_ID_REGEX);
  });

  it("clamps out-of-range random values to the alphabet", () => {
    expect(generate_section_id(new Set(), () => 1)).toBe("99999999");
    expect(generate_section_id(new Set(), () => Number.NaN)).toMatch(
      HOME_SECTION_ID_REGEX,
    );
  });
});

describe("home_section_popover_key", () => {
  it("cannot collide with section_id[:element] keys", () => {
    expect(home_section_popover_key("abcd1234")).toBe("home-section:abcd1234");
    expect(home_section_popover_key("abcd1234")).not.toMatch(/^page-sec-/);
  });
});

describe("can_add_section", () => {
  it("reports count and limit per type", () => {
    const settings = settings_with([hero(), POSTS]);
    expect(can_add_section(settings, "hero")).toEqual({
      allowed: false,
      count: 1,
      max: 1,
    });
    expect(can_add_section(settings, "text-media")).toEqual({
      allowed: true,
      count: 0,
      max: 4,
    });
  });

  it("never allows a second posts section", () => {
    expect(can_add_section({}, "posts")).toEqual({
      allowed: false,
      count: 1,
      max: 1,
    });
  });

  it("blocks every type at the total section limit", () => {
    const sections = [
      hero(),
      POSTS,
      text_media("tm000001"),
      text_media("tm000002"),
      text_media("tm000003"),
      text_media("tm000004"),
      { ...text_media("cta00001"), type: "cta-band" } as HomeSection,
      { ...text_media("cta00002"), type: "cta-band" } as HomeSection,
    ];
    expect(sections).toHaveLength(HOME_MAX_SECTIONS);
    expect(can_add_section(settings_with(sections), "cta-band").allowed).toBe(
      false,
    );
  });
});

describe("add_home_section", () => {
  const random = sequence_random(["newsec01"]);

  it("works on the virtual posts section when home is absent", () => {
    const patch = add_home_section({}, "hero", { index: 0, random });
    expect(ids_of(patch)).toEqual(["newsec01", POSTS_SECTION_FALLBACK_ID]);
  });

  it("appends by default and inserts at a clamped index", () => {
    const settings = settings_with([POSTS]);
    expect(
      ids_of(add_home_section(settings, "text-media", { random })),
    ).toEqual(["posts001", "newsec01"]);
    expect(
      ids_of(add_home_section(settings, "text-media", { index: 99, random })),
    ).toEqual(["posts001", "newsec01"]);
    expect(
      ids_of(add_home_section(settings, "text-media", { index: -3, random })),
    ).toEqual(["newsec01", "posts001"]);
  });

  it("starts a cta-band from the definition placeholders", () => {
    const added = add_home_section({}, "cta-band", { random })?.home?.sections;
    const cta = added?.find((section) => section.type === "cta-band");
    expect(cta?.content).toMatchObject({
      title: cta_band_definition.placeholder.title,
      button: {
        label: cta_band_definition.placeholder["button.label"],
        url: "",
      },
    });
  });

  it("rejects a type at its limit", () => {
    expect(add_home_section(settings_with([hero(), POSTS]), "hero")).toBeNull();
  });

  describe.each(
    SECTION_DEFINITIONS.map(
      (definition) => [definition.type, definition] as const,
    ),
  )("per definition: %s", (type, definition) => {
    const definition_any: AnySectionDefinition = definition;

    if (definition_any.fixed) {
      it("is never added", () => {
        expect(can_add_section({}, type).allowed).toBe(false);
      });
      return;
    }

    const added = add_home_section({}, type as AddableHomeSectionType, {
      random,
    })?.home?.sections.find((section) => section.type === type);

    it("starts from the definition defaults", () => {
      const defaults = definition_any.defaults();
      expect(added?.content).toEqual(defaults.content);
      expect(added?.style).toEqual(defaults.style);
    });

    it("survives the tolerant config reader once must_fill paths are set", () => {
      const filled = fill_paths(
        added,
        definition_any.must_fill,
        definition_any,
      );
      const parsed = parse_settings_graceful({
        home: { sections: [filled, POSTS] },
      }) as Partial<SettingsData>;
      expect(parsed.home?.sections.map((section) => section.id)).toEqual([
        "newsec01",
        "posts001",
      ]);
      expect(HomeSectionSchema.safeParse(filled).success).toBe(true);
    });

    it("blocks Save exactly while must_fill paths are empty", () => {
      expect(HomeSectionSchema.safeParse(added).success).toBe(
        definition_any.must_fill.length === 0,
      );
    });

    it("blocks Save while placeholders are left and clears once every placeholder and must_fill path is set", () => {
      const issues = home_section_issues(added as HomeSection);
      expect(issues.length).toBeGreaterThanOrEqual(1);
      expect(issues.length).toBe(
        Object.keys(definition_any.placeholder).length +
          definition_any.must_fill.length,
      );
      const filled = fill_paths(
        added,
        [
          ...Object.keys(definition_any.placeholder),
          ...definition_any.must_fill,
        ],
        definition_any,
      );
      expect(home_section_issues(filled)).toEqual([]);
    });

    it("names every placeholder by its field label, not by its content path", () => {
      for (const issue of home_section_issues(added as HomeSection)) {
        expect(issue).toMatch(
          /^(replace the placeholder|add an?) [a-zA-Z ]+( (in|to) item \d+)?$/,
        );
      }
    });
  });

  it("does not mutate the input", () => {
    const sections = [POSTS];
    const settings = settings_with(sections);
    add_home_section(settings, "hero", { random });
    expect(settings.home?.sections).toBe(sections);
    expect(sections).toHaveLength(1);
  });
});

describe("remove_home_section", () => {
  it("removes a section", () => {
    const settings = settings_with([hero(), POSTS]);
    expect(ids_of(remove_home_section(settings, "hero0001"))).toEqual([
      "posts001",
    ]);
  });

  it("rejects posts and unknown ids", () => {
    const settings = settings_with([hero(), POSTS]);
    expect(remove_home_section(settings, "posts001")).toBeNull();
    expect(remove_home_section(settings, "missing1")).toBeNull();
    expect(remove_home_section({}, POSTS_SECTION_FALLBACK_ID)).toBeNull();
  });
});

describe("move operations", () => {
  const settings = settings_with([hero(), POSTS, text_media("tm000001")]);

  it("moves by index", () => {
    expect(ids_of(move_home_section(settings, 0, 2))).toEqual([
      "posts001",
      "tm000001",
      "hero0001",
    ]);
    expect(ids_of(move_home_section(settings, 2, 0))).toEqual([
      "tm000001",
      "hero0001",
      "posts001",
    ]);
  });

  it("rejects invalid and no-op moves", () => {
    expect(move_home_section(settings, 5, 0)).toBeNull();
    expect(move_home_section(settings, -1, 0)).toBeNull();
    expect(move_home_section(settings, 1, 1)).toBeNull();
    expect(move_home_section(settings, 2, 9)).toBeNull();
  });

  it("moves up and down", () => {
    expect(ids_of(move_home_section_up(settings, "posts001"))).toEqual([
      "posts001",
      "hero0001",
      "tm000001",
    ]);
    expect(ids_of(move_home_section_down(settings, "posts001"))).toEqual([
      "hero0001",
      "tm000001",
      "posts001",
    ]);
  });

  it("rejects moves past the ends and unknown ids", () => {
    expect(move_home_section_up(settings, "hero0001")).toBeNull();
    expect(move_home_section_down(settings, "tm000001")).toBeNull();
    expect(move_home_section_up(settings, "missing1")).toBeNull();
    expect(move_home_section_down(settings, "missing1")).toBeNull();
    expect(move_home_section_up({}, POSTS_SECTION_FALLBACK_ID)).toBeNull();
  });

  it("swaps two sections", () => {
    expect(
      ids_of(swap_home_sections(settings, "hero0001", "tm000001")),
    ).toEqual(["tm000001", "posts001", "hero0001"]);
    expect(swap_home_sections(settings, "hero0001", "hero0001")).toBeNull();
    expect(swap_home_sections(settings, "hero0001", "missing1")).toBeNull();
  });
});

describe("duplicate_home_section", () => {
  const random = sequence_random(["copy0001"]);

  it("inserts a deep copy with a new id after the original", () => {
    const original = text_media("tm000001");
    const settings = settings_with([original, POSTS]);
    const sections = duplicate_home_section(settings, "tm000001", random)?.home
      ?.sections;
    expect(sections?.map((section) => section.id)).toEqual([
      "tm000001",
      "copy0001",
      "posts001",
    ]);
    expect(sections?.[1].content).toEqual(original.content);
    expect(sections?.[1].content).not.toBe(original.content);
  });

  it("rejects posts, types at their limit and unknown ids", () => {
    const settings = settings_with([hero(), POSTS]);
    expect(duplicate_home_section(settings, "posts001")).toBeNull();
    expect(duplicate_home_section(settings, "hero0001")).toBeNull();
    expect(duplicate_home_section(settings, "missing1")).toBeNull();
  });

  it("rejects at the type limit for text-media", () => {
    const settings = settings_with([
      POSTS,
      text_media("tm000001"),
      text_media("tm000002"),
      text_media("tm000003"),
      text_media("tm000004"),
    ]);
    expect(duplicate_home_section(settings, "tm000001")).toBeNull();
  });
});

describe("toggle_home_section_hidden", () => {
  it("hides and shows without storing hidden: false", () => {
    const settings = settings_with([hero(), POSTS]);
    const hidden = toggle_home_section_hidden(settings, "hero0001");
    expect(hidden?.home?.sections[0].hidden).toBe(true);
    const shown = toggle_home_section_hidden(
      { home: hidden?.home },
      "hero0001",
    );
    expect(shown?.home?.sections[0]).not.toHaveProperty("hidden");
  });

  it("works on the virtual posts section and rejects unknown ids", () => {
    expect(
      toggle_home_section_hidden({}, POSTS_SECTION_FALLBACK_ID)?.home
        ?.sections[0].hidden,
    ).toBe(true);
    expect(toggle_home_section_hidden({}, "missing1")).toBeNull();
  });
});

describe("update_home_section", () => {
  it("merges content and style shallowly", () => {
    const settings = settings_with([hero(), POSTS]);
    const patch = update_home_section(settings, "hero0001", "hero", {
      content: { subheadline: "Sub" },
      style: { variant: "overlay" },
    });
    const updated = patch?.home?.sections[0];
    expect(updated?.content).toEqual({ headline: "Hello", subheadline: "Sub" });
    expect(updated?.style).toMatchObject({
      variant: "overlay",
      width: "content",
    });
    expect(settings.home?.sections[0].content).toEqual({ headline: "Hello" });
  });

  it("clears an optional field with undefined", () => {
    const settings = settings_with([
      {
        ...hero(),
        content: { headline: "Hello", subheadline: "Sub" },
      } as HomeSection,
      POSTS,
    ]);
    const patch = update_home_section(settings, "hero0001", "hero", {
      content: { subheadline: undefined },
    });
    expect(patch?.home?.sections[0].content).not.toHaveProperty("subheadline");
  });

  it("rejects a type mismatch and unknown ids", () => {
    const settings = settings_with([hero(), POSTS]);
    expect(
      update_home_section(settings, "hero0001", "text-media", {
        content: { title: "x" },
      }),
    ).toBeNull();
    expect(
      update_home_section(settings, "missing1", "hero", {
        content: { headline: "x" },
      }),
    ).toBeNull();
  });

  it("updates the virtual posts section when home is absent", () => {
    const patch = update_home_section({}, POSTS_SECTION_FALLBACK_ID, "posts", {
      content: { title: "Latest" },
    });
    expect(patch?.home?.sections).toEqual([
      { ...create_posts_section(), content: { title: "Latest" } },
    ]);
  });
});

describe("count_placeholder_sections", () => {
  const random = sequence_random(["newsec01", "newsec02", "newsec03"]);

  function add_all(): Pick<SettingsData, "home"> {
    let settings: Pick<SettingsData, "home"> = settings_with([hero(), POSTS]);
    for (const type of ["text-media", "cta-band"] as const) {
      settings = add_home_section(settings, type, { random }) ?? settings;
    }
    return settings;
  }

  it("is 0 without home and for filled-in sections", () => {
    expect(count_placeholder_sections(undefined)).toBe(0);
    expect(
      count_placeholder_sections(settings_with([hero(), POSTS]).home),
    ).toBe(0);
  });

  it("counts every new section until its placeholder text is replaced", () => {
    const settings = add_all();
    expect(count_placeholder_sections(settings.home)).toBe(2);

    const text_media_id = settings.home?.sections.find(
      (section) => section.type === "text-media",
    )?.id as string;
    const one_left = update_home_section(
      settings,
      text_media_id,
      "text-media",
      {
        content: { title: "About me" },
      },
    );
    expect(count_placeholder_sections(one_left?.home)).toBe(2);

    const filled = update_home_section(
      { home: one_left?.home },
      text_media_id,
      "text-media",
      { content: { body_md: "Real text." } },
    );
    expect(count_placeholder_sections(filled?.home)).toBe(1);
  });

  it("keeps counting a cta-band whose texts are replaced but URL is empty", () => {
    const settings = add_all();
    const cta = settings.home?.sections.find(
      (section) => section.type === "cta-band",
    ) as HomeSection;
    const renamed = update_home_section(settings, cta.id, "cta-band", {
      content: { title: "News", button: { label: "Join", url: "" } },
    });
    const renamed_cta = renamed?.home?.sections.find(
      (section) => section.id === cta.id,
    ) as HomeSection;
    expect(home_section_issues(renamed_cta)).toEqual(["add a button link"]);

    const linked = update_home_section(
      { home: renamed?.home },
      cta.id,
      "cta-band",
      {
        content: { button: { label: "Join", url: FILLED_URL } },
      },
    );
    const linked_cta = linked?.home?.sections.find(
      (section) => section.id === cta.id,
    ) as HomeSection;
    expect(home_section_issues(linked_cta)).toEqual([]);
  });
});

describe("home_section_issues: messages from the field labels", () => {
  function added_of(type: AddableHomeSectionType): HomeSection {
    return add_home_section({}, type)?.home?.sections.find(
      (section) => section.type === type,
    ) as HomeSection;
  }

  it("asks to replace each placeholder and to add a must_fill value", () => {
    expect(home_section_issues(added_of("hero"))).toEqual([
      "replace the placeholder headline",
    ]);
    expect(home_section_issues(added_of("cta-band"))).toEqual([
      "replace the placeholder title",
      "replace the placeholder button label",
      "add a button link",
    ]);
  });

  it("asks to add an emptied required field instead of replacing it", () => {
    const section = hero();
    if (section.type === "hero") section.content.headline = "  ";
    expect(home_section_issues(section)).toEqual(["add a headline"]);
  });

  it("names list entries by their item label", () => {
    const section = hero();
    if (section.type === "hero")
      section.content.cta = [{ label: "", url: "https://a.io" }];
    expect(home_section_issues(section)).toEqual([
      "add a label to the primary button",
    ]);
  });

  it("never reports the posts section", () => {
    expect(home_section_issues(POSTS)).toEqual([]);
  });
});

describe("section_content_issues: example entries of a list", () => {
  const LIST_DEFINITION: AnySectionDefinition = define_section({
    type: "list-test",
    label: "List",
    description: "A list.",
    content_schema: z.object({
      items: z.array(
        z.object({ label: text_schema(1, 40), url: ContactUrlSchema }),
      ),
    }),
    style_schema: z.object({ ...common_style_shape }).default({}),
    style_defaults: {},
    text_limits: {},
    max_per_page: 1,
    placements: [],
    placeholder: {
      "items.0.label": "Your newsletter",
      "items.0.url": "https://example.com",
      "items.1.label": "Your profile",
      "items.1.url": "https://example.com",
    },
    fields: [
      {
        kind: "list",
        key: "items",
        label: "Links",
        max: 4,
        item_fields: [
          {
            kind: "text",
            key: "label",
            label: "Label",
            max_len: 40,
            required: true,
          },
          { kind: "url", key: "url", label: "URL", allow_contact: true },
        ],
      },
    ],
    defaults: () => ({
      content: {
        items: [
          { label: "Your newsletter", url: "https://example.com" },
          { label: "Your profile", url: "https://example.com" },
        ],
      },
      style: { ...SECTION_STYLE_DEFAULTS.common },
    }),
  });

  it("names the field and the item of every example left in the list", () => {
    expect(
      section_content_issues(
        LIST_DEFINITION,
        LIST_DEFINITION.defaults().content,
      ),
    ).toEqual([
      "replace the placeholder label in item 1",
      "replace the placeholder URL in item 1",
      "replace the placeholder label in item 2",
      "replace the placeholder URL in item 2",
    ]);
  });

  it("still blocks an example moved to another position and clears once replaced", () => {
    const moved = {
      items: [
        { label: "Blog", url: FILLED_URL },
        { label: "Mine", url: FILLED_URL },
        { label: "Your newsletter", url: FILLED_URL },
      ],
    };
    expect(section_content_issues(LIST_DEFINITION, moved)).toEqual([
      "replace the placeholder label in item 3",
    ]);
    moved.items[2].label = "News";
    expect(section_content_issues(LIST_DEFINITION, moved)).toEqual([]);
  });

  it("asks to add an emptied required field of an item by its position", () => {
    expect(
      section_content_issues(LIST_DEFINITION, {
        items: [{ label: " ", url: FILLED_URL }],
      }),
    ).toEqual(["add a label to item 1"]);
  });

  it("matches home_section_issues for a registered type", () => {
    const section = hero();
    if (section.type === "hero") section.content.headline = "Your headline";
    expect(home_section_issues(section)).toEqual([
      "replace the placeholder headline",
    ]);
    expect(
      section_content_issues(get_section_definition("hero"), section.content),
    ).toEqual(home_section_issues(section));
  });
});
