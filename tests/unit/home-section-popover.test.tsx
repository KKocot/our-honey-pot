// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no ResizeObserver; dnd-kit (imported through PopoverHost) needs one at import.
vi.hoisted(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

// lucide-solid runs client-only code at import; the icons are irrelevant here.
vi.mock(
  "lucide-solid",
  () =>
    new Proxy(
      {},
      {
        get: (_target, key) => (key === "then" ? undefined : () => null),
        has: () => true,
      },
    ),
);

vi.mock(
  "../../src/components/admin/canvas/home-section-ops",
  async (import_original) => {
    const original =
      await import_original<
        typeof import("../../src/components/admin/canvas/home-section-ops")
      >();
    return {
      ...original,
      update_home_section: vi.fn(original.update_home_section),
    };
  },
);

import { z } from "zod";
import { render as solid_render } from "solid-js/web";
import { createMemo, Show, type JSX } from "solid-js";
import {
  HOME_SECTION_TABS,
  HomeSectionContentTab,
  HomeSectionStyleTab,
  commit_home_section,
  content_edit_step,
  definition_style_default,
  effective_overlay,
  field_edit_target,
  find_home_section,
  home_field_key,
  home_section_id_of_key,
  needs_privacy_warning,
  POSTS_CONTENT_NOTE,
  PRIVACY_WARNING,
} from "../../src/components/admin/canvas/popovers/HomeSectionPopover";
import {
  FieldEditProvider,
  type EditedField,
} from "../../src/components/admin/canvas/popovers/field-edit";
import { home_section_of_selection } from "../../src/components/admin/canvas/PopoverHost";
import {
  home_section_popover_key,
  update_home_section,
} from "../../src/components/admin/canvas/home-section-ops";
import { HOME_SECTION_LABELS } from "../../src/components/admin/canvas/home-sections/model";
import {
  getSettingsSnapshot,
  settings,
  updateSettingsImmediate,
} from "../../src/components/admin/queries";
import type { HomeSection } from "../../src/components/admin/types/settings";
import { get_section_definition } from "../../src/shared/components/sections/registry";
import { about_definition } from "../../src/shared/components/sections/about/definition";
import { callout_definition } from "../../src/shared/components/sections/callout/definition";
import { now_definition } from "../../src/shared/components/sections/now/definition";
import {
  COMMON_STYLE_DEFAULTS,
  common_style_shape,
  define_section,
  text_schema,
  type AnySectionDefinition,
} from "../../src/shared/components/sections/registry-types";

const update_spy = vi.mocked(update_home_section);

const HERO: HomeSection = {
  id: "hero0001",
  type: "hero",
  content: { headline: "Hello" },
  style: {
    width: "content",
    spacing: "md",
    bg: "none",
    overlay: "dark-50",
    variant: "split",
    height: "auto",
    align: "start",
    image_side: "end",
  },
};

const TEXT_MEDIA: HomeSection = {
  id: "media001",
  type: "text-media",
  content: { title: "About", body_md: "Some **text**" },
  style: {
    width: "content",
    spacing: "md",
    bg: "none",
    overlay: "dark-50",
    image_side: "start",
    ratio: "4:5",
    image_shape: "rounded",
  },
};

const CTA_BAND: HomeSection = {
  id: "ctaband1",
  type: "cta-band",
  content: {
    title: "Join",
    button: { label: "Subscribe", url: "https://example.com" },
    consent_mode: "notice",
  },
  style: {
    width: "content",
    spacing: "md",
    bg: "none",
    overlay: "dark-50",
    variant: "band",
    align: "center",
  },
};

const POSTS: HomeSection = {
  id: "posts001",
  type: "posts",
  content: {},
  style: { width: "content", spacing: "md", bg: "none", overlay: "dark-50" },
};

const PRIVACY = { label: "Privacy", kind: "page" as const, target: "privacy" };

function definition_of(type: string): AnySectionDefinition {
  const definition = get_section_definition(type);
  if (!definition) throw new Error(`no definition ${type}`);
  return definition;
}

const disposers: Array<() => void> = [];
let steps: EditedField[] = [];

function record_step(field: EditedField, edit: () => void): void {
  steps.push(field);
  edit();
}

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
});

beforeEach(() => {
  updateSettingsImmediate({
    home: { sections: [HERO, TEXT_MEDIA, POSTS, CTA_BAND] },
  });
  update_spy.mockClear();
  steps = [];
});

function mount(view: () => JSX.Element): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  disposers.push(
    solid_render(
      () => <FieldEditProvider value={record_step}>{view()}</FieldEditProvider>,
      container,
    ),
  );
  return container;
}

/** Tab of a stored section, re-rendered from the settings store like the popover. */
function mount_tab(id: string, tab: "content" | "style"): HTMLDivElement {
  return mount(() => {
    const section = createMemo(() => find_home_section(settings, id));
    return (
      <Show when={section()}>
        {(current) =>
          tab === "content" ? (
            <HomeSectionContentTab
              section={current()}
              definition={definition_of(current().type)}
            />
          ) : (
            <HomeSectionStyleTab
              section={current()}
              definition={definition_of(current().type)}
            />
          )
        }
      </Show>
    );
  });
}

function control_by_label<T extends HTMLElement = HTMLInputElement>(
  root: Element,
  label: string,
): T {
  const target = [...root.querySelectorAll("label")].find(
    (el) => el.htmlFor && el.textContent?.startsWith(label),
  );
  const control = target && root.querySelector<T>(`#${target.htmlFor}`);
  if (!control) throw new Error(`no control labelled ${label}`);
  return control;
}

function labels_of(root: Element): string[] {
  return [...root.querySelectorAll("label")]
    .filter((el) => el.htmlFor)
    .map((el) => el.textContent?.replace(" (required)", "") ?? "");
}

function type_into(
  control: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  control.value = value;
  control.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

function stored(id: string): HomeSection {
  const section = find_home_section(getSettingsSnapshot(), id);
  if (!section) throw new Error(`no section ${id}`);
  return section;
}

describe("home section popover: labels and tabs", () => {
  it("offers Content and Style tabs", () => {
    expect(HOME_SECTION_TABS.map((tab) => tab.label)).toEqual([
      "Content",
      "Style",
    ]);
  });

  it("labels the section types from the registry", () => {
    expect(HOME_SECTION_LABELS).toMatchObject({
      hero: "Hero",
      "text-media": "Text + media",
      posts: "Posts",
      "cta-band": "Call to action",
    });
  });
});

describe("home section popover: Content tab from descriptors", () => {
  it("renders the hero fields of its definition through SectionFields", () => {
    const root = mount_tab("hero0001", "content");
    expect(labels_of(root)).toEqual([
      "Headline",
      "Subheadline",
      "Image URL",
      "Alt text",
    ]);
    expect(control_by_label(root, "Headline").value).toBe("Hello");
    expect(control_by_label(root, "Subheadline").tagName).toBe("TEXTAREA");
    expect(root.querySelector("[data-section-list]")).not.toBeNull();
    expect(root.querySelector("[data-list-add]")?.textContent).toContain(
      "(0/2)",
    );
    expect(
      [...root.querySelectorAll("legend")].map((el) => el.textContent),
    ).toContain("Image");
  });

  it("renders the text-media markdown body and optional button group", () => {
    const root = mount_tab("media001", "content");
    expect(control_by_label(root, "Body").tagName).toBe("TEXTAREA");
    expect(root.textContent).toContain("Bold, italic, links and lists.");
    expect(root.querySelector("[data-group-add]")?.textContent).toContain(
      "Add button",
    );
  });

  it("renders the call-to-action button, consent and privacy warning", () => {
    updateSettingsImmediate({
      footer: { ...getSettingsSnapshot().footer, privacy: undefined },
    });
    const root = mount_tab("ctaband1", "content");
    expect(labels_of(root)).toEqual([
      "Title",
      "Text",
      "Label",
      "URL",
      "Consent",
      "Consent text",
    ]);
    expect(control_by_label(root, "URL").value).toBe("https://example.com");
    expect(control_by_label<HTMLSelectElement>(root, "Consent").value).toBe(
      "notice",
    );
    expect(root.querySelector('[role="note"]')?.textContent).toContain(
      PRIVACY_WARNING,
    );
  });

  it("keeps the posts note next to the posts title", () => {
    const root = mount_tab("posts001", "content");
    expect(labels_of(root)).toEqual(["Title"]);
    expect(root.textContent).toContain(POSTS_CONTENT_NOTE);
  });
});

describe("home section popover: editing and per-field undo", () => {
  it("writes typed text through update_home_section, one undo key per field", () => {
    const root = mount_tab("hero0001", "content");
    type_into(control_by_label(root, "Headline"), "New headline");
    type_into(control_by_label(root, "Subheadline"), "Sub");
    expect(update_spy).toHaveBeenCalledWith(
      expect.objectContaining({ home: expect.anything() }),
      "hero0001",
      "hero",
      { content: { headline: "New headline" } },
    );
    expect(stored("hero0001").content).toEqual({
      headline: "New headline",
      subheadline: "Sub",
    });
    expect(steps).toEqual([
      {
        key: home_field_key("hero0001", "headline"),
        label: "Edited hero headline",
      },
      {
        key: home_field_key("hero0001", "subheadline"),
        label: "Edited hero subheadline",
      },
    ]);
  });

  it("clamps the headline and removes an emptied optional field", () => {
    const root = mount_tab("hero0001", "content");
    type_into(control_by_label(root, "Subheadline"), "Sub");
    type_into(control_by_label(root, "Subheadline"), "");
    type_into(control_by_label(root, "Headline"), "a".repeat(95));
    const content = stored("hero0001").content;
    expect(content).not.toHaveProperty("subheadline");
    expect(content).toMatchObject({ headline: "a".repeat(90) });
  });

  it("adds a hero button, edits it per field and removes it", () => {
    const root = mount_tab("hero0001", "content");
    root.querySelector<HTMLButtonElement>("[data-list-add]")?.click();
    const hero = () =>
      stored("hero0001") as Extract<HomeSection, { type: "hero" }>;
    expect(hero().content.cta).toEqual([{ label: "", url: "" }]);
    expect(steps.at(-1)).toEqual({ label: "Added hero buttons" });

    const item = root.querySelector("[data-list-item]");
    if (!item) throw new Error("no list item");
    type_into(control_by_label(item, "Label"), "Read");
    type_into(control_by_label(item, "URL"), "https://a.io");
    expect(hero().content.cta).toEqual([
      { label: "Read", url: "https://a.io" },
    ]);
    expect(steps.slice(-2)).toEqual([
      {
        key: home_field_key("hero0001", "cta.0.label"),
        label: "Edited hero primary button label",
      },
      {
        key: home_field_key("hero0001", "cta.0.url"),
        label: "Edited hero primary button url",
      },
    ]);

    root
      .querySelector<HTMLButtonElement>('[aria-label="Remove Primary button"]')
      ?.click();
    expect(hero().content).not.toHaveProperty("cta");
    expect(steps.at(-1)).toEqual({ label: "Removed hero primary button" });
  });

  it("adds and removes the optional text-media button as a whole", () => {
    const root = mount_tab("media001", "content");
    root.querySelector<HTMLButtonElement>("[data-group-add]")?.click();
    expect(stored("media001").content).toMatchObject({
      cta: { label: "", url: "" },
    });
    expect(steps.at(-1)).toEqual({ label: "Added text + media button" });
    root
      .querySelector<HTMLButtonElement>('[aria-label="Remove button"]')
      ?.click();
    expect(stored("media001").content).not.toHaveProperty("cta");
  });

  it("edits the call-to-action button link and picks consent as a discrete step", () => {
    const root = mount_tab("ctaband1", "content");
    type_into(control_by_label(root, "URL"), "https://b.io");
    expect(stored("ctaband1").content).toMatchObject({
      button: { label: "Subscribe", url: "https://b.io" },
    });
    expect(steps.at(-1)).toEqual({
      key: home_field_key("ctaband1", "button.url"),
      label: "Edited call to action button url",
    });

    const consent = control_by_label<HTMLSelectElement>(root, "Consent");
    consent.value = "checkbox";
    consent.dispatchEvent(new Event("change", { bubbles: true }));
    expect(stored("ctaband1").content).toMatchObject({
      consent_mode: "checkbox",
    });
    expect(steps.at(-1)).toEqual({ label: "Changed call to action consent" });
  });
});

describe("home section popover: Style tab from the definition", () => {
  function legends(root: Element): string[] {
    return [...root.querySelectorAll("legend")].map(
      (el) => el.textContent ?? "",
    );
  }

  it("shows the controls of each type", () => {
    expect(legends(mount_tab("hero0001", "style"))).toEqual([
      "Layout",
      "Background",
      "Width",
      "Spacing",
      "Height",
      "Alignment",
      "Image side",
    ]);
    expect(legends(mount_tab("media001", "style"))).toEqual([
      "Layout",
      "Background",
      "Width",
      "Spacing",
      "Image ratio",
      "Image shape",
    ]);
    expect(legends(mount_tab("ctaband1", "style"))).toEqual([
      "Layout",
      "Background",
      "Width",
      "Spacing",
      "Alignment",
    ]);
    expect(legends(mount_tab("posts001", "style"))).toEqual([
      "Background",
      "Width",
      "Spacing",
    ]);
  });

  it("writes the layout radio to the definition's layout key", () => {
    const root = mount_tab("media001", "style");
    const end = root.querySelector<HTMLInputElement>(
      'input[type="radio"][value="end"]',
    );
    expect(
      [...root.querySelectorAll("fieldset")[0].querySelectorAll("span")].map(
        (el) => el.textContent,
      ),
    ).toEqual(["Image left", "Image right"]);
    end?.click();
    expect(stored("media001").style).toMatchObject({ image_side: "end" });
    expect(steps.at(-1)).toEqual({ label: "Changed text + media image side" });
  });

  it("shows the hero overlay variant's overlays without an image background", () => {
    commit_home_section("hero0001", "hero", () => ({
      style: { variant: "overlay" as const, overlay: "dark-30" as const },
    }));
    const root = mount_tab("hero0001", "style");
    expect(legends(root)).toContain("Overlay");
    expect(legends(root)).not.toContain("Background image");
    const overlay = [...root.querySelectorAll("fieldset")].find(
      (el) => el.querySelector("legend")?.textContent === "Overlay",
    );
    const values = [
      ...(overlay?.querySelectorAll<HTMLInputElement>("input") ?? []),
    ];
    expect(values.map((input) => input.value)).toEqual([
      "dark-50",
      "dark-70",
      "light-50",
    ]);
    expect(values.find((input) => input.checked)?.value).toBe("dark-50");
  });

  it("falls back to the definition's style defaults", () => {
    expect(definition_style_default(definition_of("cta-band"), "align")).toBe(
      "center",
    );
    expect(definition_style_default(definition_of("hero"), "align")).toBe(
      "start",
    );
    expect(definition_style_default(definition_of("posts"), "spacing")).toBe(
      "md",
    );
    expect(effective_overlay(["dark-50", "dark-70"], "none")).toBe("dark-50");
    expect(effective_overlay(["dark-30", "dark-50"], "dark-30")).toBe(
      "dark-30",
    );
  });
});

describe("home section popover: a type known only to the registry", () => {
  const content_schema = z.object({
    quote: text_schema(1, 120),
    sources: z.array(z.object({ name: text_schema(1, 40) })).optional(),
  });
  const style_schema = z
    .object({ ...common_style_shape, variant: z.string().default("plain") })
    .default({});
  const QUOTE: AnySectionDefinition = define_section({
    type: "quote-test",
    label: "Quote",
    description: "A quote.",
    content_schema,
    style_schema,
    style_defaults: { variant: "plain" },
    text_limits: { quote_chars: 120 },
    max_per_page: 2,
    layout: {
      key: "variant",
      options: [
        { value: "plain", label: "Plain", thumb: "centered" },
        { value: "boxed", label: "Boxed", thumb: "card-button" },
      ],
    },
    fields: [
      {
        kind: "textarea",
        key: "quote",
        label: "Quote",
        max_len: 120,
        required: true,
      },
      {
        kind: "list",
        key: "sources",
        label: "Sources",
        max: 3,
        item_fields: [
          { kind: "text", key: "name", label: "Name", max_len: 40 },
        ],
      },
    ],
    defaults: () => ({
      content: { quote: "" },
      style: { ...COMMON_STYLE_DEFAULTS, variant: "plain" },
    }),
  });
  const SECTION = {
    id: "quote001",
    type: "quote-test",
    content: { quote: "Less is more", sources: [{ name: "Mies" }] },
    style: {},
  } as unknown as HomeSection;

  it("renders its fields and records per-field undo steps", () => {
    const root = mount(() => (
      <HomeSectionContentTab section={SECTION} definition={QUOTE} />
    ));
    expect(labels_of(root)).toEqual(["Quote", "Name"]);
    type_into(control_by_label(root, "Name"), "Ludwig");
    expect(steps.at(-1)).toEqual({
      key: home_field_key("quote001", "sources.0.name"),
      label: "Edited quote sources 1 name",
    });
  });

  it("renders its layout radios with the generic thumb", () => {
    const root = mount(() => (
      <HomeSectionStyleTab section={SECTION} definition={QUOTE} />
    ));
    const layout = root.querySelector("fieldset");
    expect(layout?.querySelector("legend")?.textContent).toBe("Layout");
    expect(
      [...(layout?.querySelectorAll<HTMLInputElement>("input") ?? [])].map(
        (input) => [input.value, input.checked],
      ),
    ).toEqual([
      ["plain", true],
      ["boxed", false],
    ]);
    expect(layout?.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });
});

describe("home section popover: Style tab options narrowed by the definition", () => {
  function radio_values(root: Element, legend: string): string[] {
    const fieldset = [...root.querySelectorAll("fieldset")].find(
      (el) => el.querySelector("legend")?.textContent === legend,
    );
    return [
      ...(fieldset?.querySelectorAll<HTMLInputElement>("input") ?? []),
    ].map((input) => input.value);
  }

  function checked_value(root: Element, legend: string): string | undefined {
    const fieldset = [...root.querySelectorAll("fieldset")].find(
      (el) => el.querySelector("legend")?.textContent === legend,
    );
    return [
      ...(fieldset?.querySelectorAll<HTMLInputElement>("input") ?? []),
    ].find((input) => input.checked)?.value;
  }

  function style_tab(
    definition: AnySectionDefinition,
    style: Record<string, unknown>,
  ): HTMLDivElement {
    const section = {
      id: "styl0001",
      type: definition.type,
      content: definition.defaults().content,
      style,
    } as unknown as HomeSection;
    return mount(() => (
      <HomeSectionStyleTab section={section} definition={definition} />
    ));
  }

  const TEXT_BGS = ["none", "bg", "bg-secondary", "card", "primary", "accent"];

  it.each([
    ["about", about_definition as AnySectionDefinition],
    ["callout", callout_definition as AnySectionDefinition],
    ["now", now_definition as AnySectionDefinition],
  ])("%s offers no image background", (_type, definition) => {
    const root = style_tab(definition, {});
    expect(radio_values(root, "Background")).toEqual(TEXT_BGS);
    expect(checked_value(root, "Background")).toBe("none");
  });

  it("shows a stored image background of a narrowed type as its fallback, without image controls", () => {
    const root = style_tab(now_definition as AnySectionDefinition, {
      bg: "image",
      bg_image: { url: "https://images.hive.blog/x.jpg", alt: "" },
    });
    expect(checked_value(root, "Background")).toBe("none");
    expect(radio_values(root, "Overlay")).toEqual([]);
    expect(root.textContent).not.toContain("Background image");
  });

  it("offers about only the circle and rounded image shapes", () => {
    const root = style_tab(about_definition as AnySectionDefinition, {
      image_shape: "rect",
    });
    expect(radio_values(root, "Image shape")).toEqual(["rounded", "circle"]);
    expect(checked_value(root, "Image shape")).toBe("circle");
  });

  it("keeps every option for a type without narrowing", () => {
    const root = mount_tab("media001", "style");
    expect(radio_values(root, "Background")).toEqual([...TEXT_BGS, "image"]);
    expect(radio_values(root, "Image shape")).toEqual([
      "rect",
      "rounded",
      "circle",
    ]);
  });
});

describe("home section popover: edit steps", () => {
  const hero = () => definition_of("hero");

  it("resolves descriptor titles along an edit path", () => {
    expect(field_edit_target(hero().fields, "cta.1.url").names).toEqual([
      "Secondary link",
      "URL",
    ]);
    expect(field_edit_target(hero().fields, "image").leaf?.kind).toBe("image");
    expect(field_edit_target(hero().fields, "missing").leaf).toBeUndefined();
  });

  it("makes images, selects and list operations discrete steps", () => {
    expect(
      content_edit_step(hero(), "hero0001", {
        path: "image",
        label: "Image",
        action: "edit",
      }),
    ).toEqual({ label: "Changed hero image" });
    expect(
      content_edit_step(hero(), "hero0001", {
        path: "cta.1",
        label: "Secondary link",
        action: "move",
      }),
    ).toEqual({ label: "Changed hero secondary link" });
  });
});

describe("home section popover: saving", () => {
  it("removes an optional field with an undefined patch value", () => {
    commit_home_section("hero0001", "hero", () => ({
      content: { subheadline: "Sub" },
    }));
    commit_home_section("hero0001", "hero", () => ({
      content: { subheadline: undefined },
    }));
    expect(stored("hero0001").content).not.toHaveProperty("subheadline");
  });

  it("writes style enums as a style patch", () => {
    commit_home_section("ctaband1", "cta-band", () => ({
      style: { variant: "card" as const },
    }));
    expect(update_spy).toHaveBeenLastCalledWith(
      expect.anything(),
      "ctaband1",
      "cta-band",
      { style: { variant: "card" } },
    );
    expect(stored("ctaband1").style).toMatchObject({
      variant: "card",
      align: "center",
    });
  });

  it("rejects a patch for a missing section or a wrong type", () => {
    expect(commit_home_section("missing1", "hero", () => ({}))).toBe(false);
    expect(
      commit_home_section("ctaband1", "hero", () => ({
        content: { headline: "x" },
      })),
    ).toBe(false);
    expect(update_spy).not.toHaveBeenCalled();
  });

  it("skips the write when the build returns null", () => {
    expect(commit_home_section("hero0001", "hero", () => null)).toBe(false);
    expect(update_spy).not.toHaveBeenCalled();
  });
});

describe("home section popover: privacy warning", () => {
  it("warns on a section requiring a privacy link without footer.privacy", () => {
    const footer = getSettingsSnapshot().footer;
    expect(
      needs_privacy_warning("cta-band", {
        footer: { ...footer, privacy: undefined },
      }),
    ).toBe(true);
    expect(
      needs_privacy_warning("cta-band", {
        footer: { ...footer, privacy: PRIVACY },
      }),
    ).toBe(false);
    expect(
      needs_privacy_warning("hero", {
        footer: { ...footer, privacy: undefined },
      }),
    ).toBe(false);
  });
});

describe("home section popover: host key", () => {
  it("parses only home-section keys with a valid id", () => {
    expect(home_section_id_of_key(home_section_popover_key("hero0001"))).toBe(
      "hero0001",
    );
    expect(home_section_id_of_key("page-sec-main:section")).toBeNull();
    expect(home_section_id_of_key("home-section:BAD")).toBeNull();
    expect(home_section_id_of_key(null)).toBeNull();
  });

  it("finds the home section in the selection as section or element id", () => {
    const key = home_section_popover_key("ctaband1");
    expect(
      home_section_of_selection({ section_id: key, element_id: null }),
    ).toBe("ctaband1");
    expect(
      home_section_of_selection({
        section_id: "page-sec-main",
        element_id: key,
      }),
    ).toBe("ctaband1");
    expect(
      home_section_of_selection({
        section_id: "page-sec-main",
        element_id: "posts",
      }),
    ).toBeNull();
  });
});
