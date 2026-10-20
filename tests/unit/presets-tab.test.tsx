// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../../src/components/ui/Toast", async (import_original) => {
  const original =
    await import_original<typeof import("../../src/components/ui/Toast")>();
  return { ...original, showToast: vi.fn() };
});

vi.mock("../../src/components/admin/presets/apply", async (import_original) => {
  const original =
    await import_original<
      typeof import("../../src/components/admin/presets/apply")
    >();
  return { ...original, apply_blog_preset: vi.fn(original.apply_blog_preset) };
});

// Pins every preset to the same three home sections so assertions do not track catalog content.
vi.mock(
  "../../src/components/admin/presets/catalog",
  async (import_original) => {
    const original =
      await import_original<
        typeof import("../../src/components/admin/presets/catalog")
      >();
    return {
      ...original,
      list_blog_presets: (is_community: boolean) =>
        original.list_blog_presets(is_community).map((preset) => ({
          ...preset,
          home: { sections: ["hero", "cta-band", "posts"] },
        })),
    };
  },
);

import { render as solid_render } from "solid-js/web";
import { PresetsTab } from "../../src/components/admin/panels/AdminPanel/tabs/PresetsTab";
import { showToast } from "../../src/components/ui/Toast";
import { apply_blog_preset } from "../../src/components/admin/presets/apply";
import {
  defaultSettings,
  type HomeSection,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import { create_posts_section } from "../../src/components/admin/types/settings-schema";
import { get_section_definition } from "../../src/shared/components/sections/registry";
import type { PresetSectionsMode } from "../../src/components/admin/presets/keys";

const show_toast = vi.mocked(showToast);
const apply_spy = vi.mocked(apply_blog_preset);

function label_of(type: string): string {
  const label = get_section_definition(type)?.label;
  if (!label) throw new Error(`No section definition for ${type}`);
  return label;
}

function hero_section(own_text: boolean): HomeSection {
  const defaults = get_section_definition("hero")!.defaults();
  const content: Record<string, unknown> = structuredClone(defaults.content);
  if (own_text) {
    const key = Object.keys(content).find(
      (k) => typeof content[k] === "string",
    );
    if (!key) throw new Error("hero has no text field");
    content[key] = "Words I wrote myself";
  }
  return {
    id: "ownhero1",
    type: "hero",
    content,
    style: structuredClone(defaults.style),
  } as HomeSection;
}

function settings_with(sections: HomeSection[] | null): SettingsData {
  const settings = structuredClone(defaultSettings) as SettingsData;
  if (sections) settings.home = { sections } as SettingsData["home"];
  return settings;
}

interface Mounted {
  container: HTMLElement;
  on_apply: ReturnType<typeof vi.fn>;
}

let dispose: (() => void) | undefined;

function mount(settings: SettingsData): Mounted {
  const container = document.createElement("div");
  document.body.append(container);
  const on_apply = vi.fn();
  dispose = solid_render(
    () => (
      <PresetsTab
        settings={() => settings}
        is_community={() => false}
        hive_username={() => "alice"}
        on_apply={on_apply}
        on_undo={() => {}}
        storage={null}
      />
    ),
    container,
  );
  return { container, on_apply };
}

function first_apply_button(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    'button[aria-label^="Apply \\""]',
  );
  if (!button) throw new Error("no Apply button");
  return button;
}

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[role="dialog"][aria-modal="true"]',
  );
}

function choice(label: string): HTMLButtonElement {
  const button = Array.from(
    dialog()?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((b) => b.textContent?.includes(label));
  if (!button) throw new Error(`no choice "${label}"`);
  return button;
}

function last_sections_mode(): PresetSectionsMode | undefined {
  return apply_spy.mock.calls.at(-1)?.[4]?.sections_mode;
}

beforeEach(() => {
  show_toast.mockClear();
  apply_spy.mockClear();
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
});

describe("PresetsTab cards", () => {
  it("lists the home sections a preset brings", () => {
    const { container } = mount(settings_with(null));
    const summary = `3 sections: ${["hero", "cta-band", "posts"].map(label_of).join(", ")}`;
    const card = first_apply_button(container).closest("li");
    expect(card?.textContent).toContain(summary);
  });
});

describe("PresetsTab applying a preset with sections", () => {
  it("applies without asking when the owner has no sections yet", () => {
    const { container, on_apply } = mount(settings_with(null));
    first_apply_button(container).click();

    expect(dialog()).toBeNull();
    expect(on_apply).toHaveBeenCalledTimes(1);
    expect(last_sections_mode()).toBe("append-missing");
    const patch = on_apply.mock.calls[0][0] as Partial<SettingsData>;
    expect(patch.home?.sections.map((s) => s.type)).toEqual([
      "hero",
      "cta-band",
      "posts",
    ]);
    expect(show_toast.mock.calls[0][0]).toContain(
      "2 new sections to fill in on the canvas",
    );
  });

  it("applies without asking when the owner's sections are untouched placeholders", () => {
    const { container, on_apply } = mount(
      settings_with([hero_section(false), create_posts_section()]),
    );
    first_apply_button(container).click();

    expect(dialog()).toBeNull();
    expect(on_apply).toHaveBeenCalledTimes(1);
  });

  it("asks first when the owner wrote section content, and applies nothing yet", () => {
    const { container, on_apply } = mount(
      settings_with([hero_section(true), create_posts_section()]),
    );
    first_apply_button(container).click();

    expect(dialog()).not.toBeNull();
    expect(on_apply).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain("Undo brings it back");
  });

  it("focuses Add missing sections as the default choice", async () => {
    const { container } = mount(
      settings_with([hero_section(true), create_posts_section()]),
    );
    first_apply_button(container).click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(document.activeElement).toBe(choice("Add missing sections"));
  });

  it.each([
    ["Add missing sections", "append-missing"],
    ["Replace my sections", "replace"],
    ["Keep my sections", "skip"],
  ] as const)("%s applies with sections mode %s", (label, mode) => {
    const { container, on_apply } = mount(
      settings_with([hero_section(true), create_posts_section()]),
    );
    first_apply_button(container).click();
    choice(label).click();

    expect(dialog()).toBeNull();
    expect(on_apply).toHaveBeenCalledTimes(1);
    expect(last_sections_mode()).toBe(mode);
  });

  it("keeps the owner's own hero with Add missing and drops it with Replace", () => {
    const settings = settings_with([
      hero_section(true),
      create_posts_section(),
    ]);
    const hero_text = (patch: Partial<SettingsData>) =>
      JSON.stringify(patch.home?.sections.find((s) => s.type === "hero"));

    const first = mount(settings);
    first_apply_button(first.container).click();
    choice("Add missing sections").click();
    expect(hero_text(first.on_apply.mock.calls[0][0])).toContain(
      "Words I wrote myself",
    );
    dispose?.();
    document.body.innerHTML = "";

    const second = mount(settings);
    first_apply_button(second.container).click();
    choice("Replace my sections").click();
    expect(hero_text(second.on_apply.mock.calls[0][0])).not.toContain(
      "Words I wrote myself",
    );
  });

  it("Keep my sections leaves home out of the patch", () => {
    const { container, on_apply } = mount(
      settings_with([hero_section(true), create_posts_section()]),
    );
    first_apply_button(container).click();
    choice("Keep my sections").click();

    expect(on_apply.mock.calls[0][0]).not.toHaveProperty("home");
  });

  it("closing the dialog with Escape applies nothing", () => {
    const { container, on_apply } = mount(
      settings_with([hero_section(true), create_posts_section()]),
    );
    first_apply_button(container).click();
    dialog()?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(dialog()).toBeNull();
    expect(on_apply).not.toHaveBeenCalled();
  });
});
