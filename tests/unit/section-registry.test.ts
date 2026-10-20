// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  HOME_SECTION_TYPES,
  type HomeSection,
} from "../../src/components/admin/types/settings";
import { HomeSectionSchema } from "../../src/components/admin/types/settings-schema";
import { render_section_html } from "../../src/shared/components/sections";
import { render_about } from "../../src/shared/components/sections/about/render";
import { render_callout } from "../../src/shared/components/sections/callout/render";
import { render_cta_band } from "../../src/shared/components/sections/cta-band/render";
import { render_faq } from "../../src/shared/components/sections/faq/render";
import {
  HERO_OVERLAY_VARIANT_OVERLAYS,
  render_hero,
} from "../../src/shared/components/sections/hero/render";
import { render_links } from "../../src/shared/components/sections/links/render";
import { render_now } from "../../src/shared/components/sections/now/render";
import { render_quote } from "../../src/shared/components/sections/quote/render";
import {
  SECTION_DEFINITIONS,
  get_section_definition,
  type SectionDefinitions,
} from "../../src/shared/components/sections/registry";
import {
  IMAGE_BG_OVERLAYS,
  content_value_at,
  placeholder_paths,
  unfilled_paths,
  type AnySectionDefinition,
  type FieldDescriptor,
  type SectionRenderers,
} from "../../src/shared/components/sections/registry-types";
import { render_text_media } from "../../src/shared/components/sections/text-media/render";
import {
  BG_IMAGE_OVERLAYS,
  create_section_context,
} from "../../src/shared/components/sections/utils";

const DEFINITIONS: readonly AnySectionDefinition[] = SECTION_DEFINITIONS;
const SECTION_ID = "abcd1234";

function new_section(
  definition: AnySectionDefinition,
): Record<string, unknown> {
  return { id: SECTION_ID, type: definition.type, ...definition.defaults() };
}

function issue_paths(
  definition: AnySectionDefinition,
  value: unknown,
): string[] {
  const parsed = definition.schema.safeParse(value);
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => issue.path.join("."));
}

function object_keys(schema: z.ZodTypeAny): string[] {
  const inner = schema instanceof z.ZodDefault ? schema._def.innerType : schema;
  return inner instanceof z.ZodObject ? Object.keys(inner.shape) : [];
}

function set_path(
  target: Record<string, unknown>,
  path: string,
  value: string,
): void {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1))
    node = node[key] as Record<string, unknown>;
  node[keys[keys.length - 1]] = value;
}

/** A valid owner value for a `must_fill` path: a date for date fields, a URL otherwise. */
function must_fill_value(
  definition: AnySectionDefinition,
  path: string,
): string {
  const field = definition.fields.find(
    (entry) => entry.key === path.split(".")[0],
  );
  return field?.kind === "date" ? "2026-10-01" : "https://example.com";
}

describe("section registry", () => {
  it("registers the 10 section types in Add section menu order", () => {
    expect(DEFINITIONS.map((definition) => definition.type)).toEqual([
      "hero",
      "text-media",
      "about",
      "links",
      "callout",
      "now",
      "quote",
      "faq",
      "posts",
      "cta-band",
    ]);
  });

  it("registers every home section type once, in HOME_SECTION_TYPES order", () => {
    const types = DEFINITIONS.map((definition) => definition.type);
    expect(types).toEqual([...HOME_SECTION_TYPES]);
    expect(new Set(types).size).toBe(types.length);
  });

  it("returns the definition of a registered type", () => {
    for (const definition of DEFINITIONS) {
      expect(get_section_definition(definition.type)).toBe(definition);
    }
    expect(get_section_definition("hero").label).toBe("Hero");
  });

  it.each([
    ["unknown"],
    [""],
    ["HERO"],
    ["__proto__"],
    ["constructor"],
    [42],
    [null],
    [undefined],
  ])("returns undefined for an unregistered type %j", (type) => {
    expect(get_section_definition(type)).toBeUndefined();
  });
});

describe("section definitions", () => {
  it.each(
    DEFINITIONS.map((definition) => [definition.type, definition] as const),
  )(
    "%s defaults pass the schema except the paths left for the owner (must_fill)",
    (_type, definition) => {
      const section = new_section(definition);
      const expected = definition.must_fill.map((path) => `content.${path}`);
      expect(issue_paths(definition, section)).toEqual(expected);
      expect(HomeSectionSchema.safeParse(section).success).toBe(
        expected.length === 0,
      );

      for (const path of definition.must_fill)
        set_path(
          section.content as Record<string, unknown>,
          path,
          must_fill_value(definition, path),
        );
      expect(issue_paths(definition, section)).toEqual([]);
      expect(HomeSectionSchema.safeParse(section).success).toBe(true);
    },
  );

  it.each(
    DEFINITIONS.map((definition) => [definition.type, definition] as const),
  )(
    "%s default style equals what the schema fills in for an empty style",
    (_type, definition) => {
      expect(definition.style_schema.parse({})).toEqual(
        definition.defaults().style,
      );
      expect(definition.defaults().style).toMatchObject(
        definition.style_defaults,
      );
    },
  );

  it("returns fresh default objects on every call", () => {
    for (const definition of DEFINITIONS) {
      const first = definition.defaults();
      (first.style as Record<string, unknown>).bg = "accent";
      (first.content as Record<string, unknown>).injected = true;
      const second = definition.defaults();
      expect((second.style as Record<string, unknown>).bg).toBe("none");
      expect(second.content).not.toHaveProperty("injected");
    }
  });

  it.each(
    DEFINITIONS.map((definition) => [definition.type, definition] as const),
  )(
    "%s declares fields, required keys and placeholders that exist in its content schema",
    (_type, definition) => {
      const keys = object_keys(definition.content_schema);
      const field_keys = definition.fields.map(
        (field: FieldDescriptor) => field.key,
      );
      expect(keys).toEqual(expect.arrayContaining(field_keys));
      expect(keys).toEqual(
        expect.arrayContaining([...definition.required_content_keys]),
      );
      const roots = [
        ...Object.keys(definition.placeholder),
        ...definition.must_fill,
      ].map((path) => path.split(".")[0]);
      expect(keys).toEqual(expect.arrayContaining(roots));
    },
  );

  it("describes a layout radio exactly for types with a layout key", () => {
    for (const definition of DEFINITIONS) {
      expect(definition.has_layout).toBe(definition.layout_key !== null);
      expect(definition.layout_options.length > 0).toBe(definition.has_layout);
      if (!definition.layout_key) continue;
      const allowed = definition.layout_options.map((option) => option.value);
      expect(allowed).toContain(
        (definition.defaults().style as Record<string, unknown>)[
          definition.layout_key
        ],
      );
    }
  });

  it("marks only posts as fixed", () => {
    expect(
      DEFINITIONS.filter((definition) => definition.fixed).map(
        (definition) => definition.type,
      ),
    ).toEqual(["posts"]);
  });
});

describe("placeholders", () => {
  it.each(
    DEFINITIONS.filter((definition) => !definition.fixed).map(
      (definition) => [definition.type, definition] as const,
    ),
  )(
    "a new %s section is recognised as unfilled until the owner replaces the placeholders",
    (_type, definition) => {
      const content = structuredClone(definition.defaults().content) as Record<
        string,
        unknown
      >;
      const unfilled = unfilled_paths(definition, content);
      expect(unfilled.length).toBeGreaterThan(0);
      expect(unfilled).toEqual(
        expect.arrayContaining([
          ...Object.keys(definition.placeholder),
          ...definition.must_fill,
        ]),
      );
      for (const [path, text] of Object.entries(definition.placeholder)) {
        expect(content_value_at(content, path)).toBe(text);
      }

      for (const path of Object.keys(definition.placeholder))
        set_path(content, path, "Owner text");
      for (const path of definition.must_fill)
        set_path(content, path, "https://example.com");
      expect(unfilled_paths(definition, content)).toEqual([]);
    },
  );

  it("treats a whitespace-only must_fill value as unfilled", () => {
    const band = get_section_definition("cta-band");
    const content = { title: "Join us", button: { label: "Go", url: "   " } };
    expect(unfilled_paths(band, content)).toEqual(["button.url"]);
  });

  it("reports the same placeholders as before the registry", () => {
    expect(get_section_definition("hero").placeholder).toEqual({
      headline: "Your headline",
    });
    expect(get_section_definition("text-media").placeholder).toEqual({
      title: "Section title",
      body_md: "Write a few sentences here.",
    });
    expect(get_section_definition("cta-band").placeholder).toEqual({
      title: "Join the newsletter",
      "button.label": "Subscribe",
    });
    expect(get_section_definition("posts").placeholder).toEqual({});
  });

  it("content_value_at ignores inherited keys and missing steps", () => {
    expect(content_value_at({ button: { url: "x" } }, "button.url")).toBe("x");
    expect(content_value_at({}, "button.url")).toBeUndefined();
    expect(content_value_at({ title: "x" }, "constructor")).toBeUndefined();
    expect(content_value_at(null, "title")).toBeUndefined();
  });

  it("content_value_at steps into list entries by index only", () => {
    const content = { items: [{ label: "A" }, { label: "B" }] };
    expect(content_value_at(content, "items.1.label")).toBe("B");
    expect(content_value_at(content, "items.2.label")).toBeUndefined();
    expect(content_value_at(content, "items.length")).toBeUndefined();
    expect(content_value_at(content, "items.-1.label")).toBeUndefined();
  });

  describe("list entry placeholders", () => {
    const definition = {
      placeholder: {
        heading: "Title",
        "items.0.label": "First example",
        "items.1.label": "Second example",
      },
      must_fill: [],
    };

    it("flags every entry still holding an example, at any position", () => {
      const content = {
        heading: "Mine",
        items: [
          { label: "Mine" },
          { label: "First example" },
          { label: "Second example" },
        ],
      };
      expect(placeholder_paths(definition, content)).toEqual([
        "items.1.label",
        "items.2.label",
      ]);
      expect(unfilled_paths(definition, content)).toEqual([
        "items.1.label",
        "items.2.label",
      ]);
    });

    it("is filled once no entry holds an example, including an empty or missing list", () => {
      expect(
        unfilled_paths(definition, {
          heading: "Mine",
          items: [{ label: "x" }],
        }),
      ).toEqual([]);
      expect(
        unfilled_paths(definition, { heading: "Mine", items: [] }),
      ).toEqual([]);
      expect(unfilled_paths(definition, { heading: "Mine" })).toEqual([]);
      expect(
        unfilled_paths(definition, { heading: "Mine", items: "junk" }),
      ).toEqual([]);
    });
  });
});

describe("editor descriptors", () => {
  it("lists Style tab controls per type and style like the popover did", () => {
    const hero = get_section_definition("hero");
    expect(hero.style_controls({})).toEqual([
      "layout",
      "background",
      "width",
      "spacing",
      "height",
      "align",
      "image_side",
    ]);
    expect(hero.style_controls({ variant: "overlay", bg: "image" })).toEqual([
      "layout",
      "background",
      "overlay",
      "width",
      "spacing",
      "height",
      "align",
    ]);
    expect(
      get_section_definition("text-media").style_controls({ bg: "image" }),
    ).toEqual([
      "layout",
      "background",
      "bg_image",
      "overlay",
      "width",
      "spacing",
      "ratio",
      "image_shape",
    ]);
    expect(get_section_definition("cta-band").style_controls({})).toEqual([
      "layout",
      "background",
      "width",
      "spacing",
      "align",
    ]);
    expect(get_section_definition("posts").style_controls({})).toEqual([
      "background",
      "width",
      "spacing",
    ]);
  });

  it("offers the overlays the renderers accept", () => {
    expect(IMAGE_BG_OVERLAYS).toEqual(BG_IMAGE_OVERLAYS);
    expect(
      get_section_definition("hero").overlay_values({ variant: "overlay" }),
    ).toEqual(HERO_OVERLAY_VARIANT_OVERLAYS);
    expect(
      get_section_definition("hero").overlay_values({ variant: "split" }),
    ).toEqual(BG_IMAGE_OVERLAYS);
    expect(get_section_definition("text-media").overlay_values({})).toEqual(
      BG_IMAGE_OVERLAYS,
    );
  });

  it("narrows no Style tab options of the registered types unless declared", () => {
    for (const type of ["hero", "text-media", "cta-band", "posts"] as const) {
      expect(get_section_definition(type).style_options).toEqual({});
    }
  });

  it("flags the consent section for the privacy warning only", () => {
    expect(
      DEFINITIONS.filter((definition) => definition.requires_privacy_link).map(
        (definition) => definition.type,
      ),
    ).toEqual(["cta-band"]);
  });
});

describe("renderer binding", () => {
  const renderers = {
    hero: render_hero,
    "text-media": render_text_media,
    about: render_about,
    links: render_links,
    callout: render_callout,
    now: render_now,
    quote: render_quote,
    faq: render_faq,
    posts: () => "",
    "cta-band": render_cta_band,
  } satisfies SectionRenderers<SectionDefinitions>;

  it.each(DEFINITIONS.map((definition) => [definition.type] as const))(
    "the %s renderer gives the public HTML for a completed new section",
    (type) => {
      const definition = get_section_definition(type)!;
      const raw = new_section(definition);
      for (const path of definition.must_fill)
        set_path(
          raw.content as Record<string, unknown>,
          path,
          must_fill_value(definition, path),
        );
      const section = HomeSectionSchema.parse(raw) as HomeSection;
      const render = renderers[section.type] as (
        section: HomeSection,
        ctx: ReturnType<typeof create_section_context>,
      ) => string;
      const html = render(section, create_section_context({}, "en"));
      expect(html).toBe(render_section_html(section, {}, "en"));
      if (!definition.fixed)
        expect(html).toContain(`data-section-type="${type}"`);
    },
  );
});

describe("module initialisation", () => {
  it.each([
    ["settings", "../../src/components/admin/types/settings"],
    ["settings-schema", "../../src/components/admin/types/settings-schema"],
    ["registry", "../../src/shared/components/sections/registry"],
    ["markdown", "../../src/shared/components/sections/markdown"],
    [
      "text-media render",
      "../../src/shared/components/sections/text-media/render",
    ],
  ])(
    "loads the section constants when %s is imported first",
    async (_name, entry) => {
      vi.resetModules();
      await import(entry);
      const settings =
        await import("../../src/components/admin/types/settings");
      expect(settings.SECTION_TEXT_LIMITS.text_media_body_bytes).toBe(1200);
      expect([...settings.HOME_SECTION_TYPES]).toEqual([...HOME_SECTION_TYPES]);
    },
  );
});
