// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { beforeEach, describe, expect, it, vi } from "vitest";

const serializer = vi.hoisted(() => ({ hero: vi.fn(), quote: vi.fn() }));

vi.mock(
  "../../src/shared/components/sections/hero/render",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../src/shared/components/sections/hero/render")
      >();
    serializer.hero.mockImplementation(actual.render_hero);
    return { ...actual, render_hero: serializer.hero };
  },
);
vi.mock(
  "../../src/shared/components/sections/quote/render",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../src/shared/components/sections/quote/render")
      >();
    serializer.quote.mockImplementation(actual.render_quote);
    return { ...actual, render_quote: serializer.quote };
  },
);
import {
  pageLayoutConfigToLegacy,
  type ContainerName,
  type LayoutTemplate,
  type PageLayoutConfig,
} from "../../src/components/admin/types/layout";
import type { HomeSection } from "../../src/components/admin/types/settings";
import { template_after_move } from "../../src/components/admin/canvas/layout-ops";
import {
  home_hero_shown,
  home_lead_section_ids,
  home_priority_section_id,
  home_section_containers,
  memoize_home_render,
  render_section_html,
  resolve_section_container,
  split_home_containers,
  split_home_sections,
} from "../../src/shared/components/sections/render";
import type {
  HomeContainersSplit,
  HomeSectionContainer,
  SectionRenderSettings,
} from "../../src/shared/components/sections/types";

const TEMPLATES: readonly LayoutTemplate[] = [
  "no-sidebar",
  "sidebar-left",
  "sidebar-right",
  "both-sidebars",
];
const CONTAINERS: readonly ContainerName[] = [
  "top",
  "sidebarLeft",
  "sidebarRight",
  "bottom",
];
const PLACEMENTS: readonly HomeSectionContainer[] = ["main", ...CONTAINERS];

const CONTENT: Record<string, Record<string, unknown>> = {
  hero: { headline: "Welcome" },
  quote: { text: "Slow is smooth." },
  "text-media": {
    title: "About me",
    image: { url: "https://images.hive.blog/photo.jpg", alt: "Me" },
  },
};
const EDGE_ONLY = new Set(["hero"]);

function layout(
  template: LayoutTemplate,
  elements: Partial<Record<ContainerName, string[]>> = {},
): PageLayoutConfig {
  const container = (name: ContainerName) => ({
    elements: (elements[name] ?? []).map((id) => ({
      id: id as PageLayoutConfig["containers"]["top"]["elements"][number]["id"],
      active: true,
    })),
  });
  return {
    template,
    containers: {
      top: container("top"),
      sidebarLeft: container("sidebarLeft"),
      sidebarRight: container("sidebarRight"),
      bottom: container("bottom"),
    },
  };
}

const DEFAULT_ELEMENTS: Partial<Record<ContainerName, string[]>> = {
  top: ["header"],
  sidebarLeft: ["authorProfile"],
  bottom: ["footer"],
};

function section(
  id: string,
  type: string,
  placement?: { container: string; index: number },
  extra: Record<string, unknown> = {},
): HomeSection {
  return {
    id,
    type,
    content: CONTENT[type] ?? {},
    style: {},
    ...(placement ? { placement } : {}),
    ...extra,
  } as unknown as HomeSection;
}

function settings_of(
  template: LayoutTemplate,
  sections: HomeSection[],
  elements = DEFAULT_ELEMENTS,
): SectionRenderSettings {
  return { pageLayoutConfig: layout(template, elements), home: { sections } };
}

function shown(template: LayoutTemplate, container: HomeSectionContainer) {
  if (container === "sidebarLeft")
    return template === "sidebar-left" || template === "both-sidebars";
  if (container === "sidebarRight")
    return template === "sidebar-right" || template === "both-sidebars";
  return true;
}

function expected_container(
  template: LayoutTemplate,
  type: string,
  placement: HomeSectionContainer,
): HomeSectionContainer {
  if (placement === "main") return "main";
  const sidebar = placement === "sidebarLeft" || placement === "sidebarRight";
  if (sidebar && EDGE_ONLY.has(type)) return "main";
  return shown(template, placement) ? placement : "main";
}

function ids_in(split: HomeContainersSplit, container: HomeSectionContainer) {
  if (container === "main") return split.main.map((entry) => entry.id);
  return split.containers[container].flatMap((item) =>
    item.kind === "section" ? [item.section.id] : [],
  );
}

function order_of(split: HomeContainersSplit, container: ContainerName) {
  return split.containers[container].map((item) =>
    item.kind === "section" ? item.section.id : item.element.id,
  );
}

describe("split_home_containers matrix", () => {
  const types = Object.keys(CONTENT);
  const sections = types.flatMap((type, type_index) =>
    PLACEMENTS.map((placement, placement_index) =>
      section(
        `s${type_index}p${placement_index}aaaa`.slice(0, 8),
        type,
        placement === "main" ? undefined : { container: placement, index: 0 },
      ),
    ),
  );

  it.each(TEMPLATES)(
    "%s: every section lands exactly once in its expected container",
    (template) => {
      const settings = settings_of(template, sections);
      const split = split_home_containers(settings);
      const all = PLACEMENTS.flatMap((container) => ids_in(split, container));
      expect(all.slice().sort()).toEqual(sections.map((s) => s.id).sort());

      types.forEach((type, type_index) => {
        PLACEMENTS.forEach((placement, placement_index) => {
          const id =
            sections[type_index * PLACEMENTS.length + placement_index].id;
          const expected = expected_container(template, type, placement);
          expect(ids_in(split, expected)).toContain(id);
          expect(
            resolve_section_container(
              sections[type_index * PLACEMENTS.length + placement_index],
              settings,
            ),
          ).toBe(expected);
        });
      });

      for (const container of CONTAINERS) {
        if (!shown(template, container))
          expect(split.containers[container]).toEqual([]);
      }
    },
  );

  it.each(TEMPLATES)(
    "%s: the rendered page holds each section's HTML exactly once",
    (template) => {
      const settings = settings_of(template, sections);
      const split = split_home_containers(settings);
      const { lead, before, after } = split_home_sections(settings.home, {
        sidebars: template !== "no-sidebar",
        settings,
      });
      const page = [
        ...lead,
        ...before,
        ...after,
        ...CONTAINERS.flatMap((container) =>
          split.containers[container].flatMap((item) =>
            item.kind === "section" ? [item.section] : [],
          ),
        ),
      ]
        .map((entry) => render_section_html(entry, settings))
        .join("");
      for (const entry of sections) {
        expect(page.split(`id="s-${entry.id}"`).length - 1).toBe(1);
      }
    },
  );

  it("sends an invalid container or a placement without a layout to main", () => {
    const odd = section("odd00001", "quote", { container: "header", index: 0 });
    const left = section("left0001", "quote", {
      container: "sidebarLeft",
      index: 0,
    });
    const split = split_home_containers({ home: { sections: [odd, left] } });
    expect(split.main.map((entry) => entry.id)).toEqual([
      "odd00001",
      "left0001",
    ]);
  });
});

describe("container order", () => {
  const elements = { sidebarLeft: ["authorProfile", "communityProfile"] };

  it("puts a section after `index` rendered elements and clamps a too large index", () => {
    const sections = [
      section("late0001", "quote", { container: "sidebarLeft", index: 99 }),
      section("mid00001", "quote", { container: "sidebarLeft", index: 1 }),
      section("first001", "quote", { container: "sidebarLeft", index: 0 }),
    ];
    const split = split_home_containers(
      settings_of("sidebar-left", sections, elements),
    );
    expect(order_of(split, "sidebarLeft")).toEqual([
      "first001",
      "authorProfile",
      "mid00001",
      "communityProfile",
      "late0001",
    ]);
  });

  it("breaks an index tie by home.sections order", () => {
    const sections = [
      section("bbbb0001", "quote", { container: "sidebarLeft", index: 1 }),
      section("aaaa0001", "quote", { container: "sidebarLeft", index: 1 }),
      section("cccc0001", "quote", { container: "sidebarLeft", index: 7 }),
      section("dddd0001", "quote", { container: "sidebarLeft", index: 2 }),
    ];
    const split = split_home_containers(
      settings_of("sidebar-left", sections, elements),
    );
    expect(order_of(split, "sidebarLeft")).toEqual([
      "authorProfile",
      "bbbb0001",
      "aaaa0001",
      "communityProfile",
      "cccc0001",
      "dddd0001",
    ]);
  });

  it("counts only rendered elements towards the index", () => {
    const sections = [
      section("only0001", "quote", { container: "sidebarLeft", index: 1 }),
    ];
    const split = split_home_containers(
      settings_of("sidebar-left", sections, elements),
      { is_element_rendered: (element) => element.id !== "communityProfile" },
    );
    expect(order_of(split, "sidebarLeft")).toEqual([
      "authorProfile",
      "only0001",
    ]);
  });
});

describe("hero and text-media in containers", () => {
  it("treats a hero in top as the page H1 and LCP candidate", () => {
    const hero = section("hero0001", "hero", { container: "top", index: 1 });
    const quote = section("quot0001", "quote");
    const settings = settings_of("sidebar-left", [quote, hero]);
    expect(home_hero_shown(settings)).toBe(true);
    expect(home_priority_section_id(settings)).toBe("hero0001");

    const split = split_home_containers(settings);
    const html = [
      ...split.main,
      ...split.containers.top.flatMap((item) =>
        item.kind === "section" ? [item.section] : [],
      ),
    ]
      .map((entry) => render_section_html(entry, settings))
      .join("");
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it("does not let a hero in bottom take the LCP priority", () => {
    const hero = section("hero0001", "hero", { container: "bottom", index: 0 });
    const settings = settings_of("no-sidebar", [hero]);
    expect(home_hero_shown(settings)).toBe(true);
    expect(home_priority_section_id(settings)).toBeNull();
  });

  it("keeps placed sections out of the leading full-width run", () => {
    const full = { style: { width: "full" } };
    const settings = settings_of("sidebar-left", [
      section("topq0001", "quote", { container: "top", index: 0 }, full),
      section("lead0001", "quote", undefined, full),
      section(
        "side0001",
        "quote",
        { container: "sidebarLeft", index: 0 },
        full,
      ),
      section("lead0002", "quote", undefined, full),
    ]);
    expect(home_lead_section_ids(settings)).toEqual(["lead0001", "lead0002"]);
    const placed_html = render_section_html(
      section("topq0001", "quote", { container: "top", index: 0 }, full),
      settings,
    );
    expect(placed_html).not.toContain("section-full");
    expect(placed_html).toContain("section-in-container");
  });

  it("stacks text-media in a sidebar and keeps the side layout in main", () => {
    const side = section(
      "tmside01",
      "text-media",
      { container: "sidebarRight", index: 0 },
      { style: { image_side: "end" } },
    );
    const main = section("tmmain01", "text-media", undefined, {
      style: { image_side: "end" },
    });
    const settings = settings_of("sidebar-right", [side, main]);
    const side_html = render_section_html(side, settings);
    expect(side_html).toContain("section-tm-stacked");
    expect(side_html).not.toContain("section-tm-has-media");
    expect(side_html.indexOf("section-tm-media")).toBeLessThan(
      side_html.indexOf("section-tm-text"),
    );
    expect(render_section_html(main, settings)).toContain(
      "section-tm-has-media section-media-end",
    );

    const hidden_sidebar = settings_of("no-sidebar", [side]);
    expect(render_section_html(side, hidden_sidebar)).toContain(
      "section-tm-has-media",
    );
  });
});

describe("home render memo of one SSR request", () => {
  const SLOTS = 5;
  const MAIN_INSTANCES = 3;

  function request_settings(): SectionRenderSettings {
    return settings_of("sidebar-left", [
      section("quot0001", "quote"),
      section("hero0001", "hero", { container: "top", index: 1 }),
      section("side0001", "quote", { container: "sidebarLeft", index: 0 }),
    ]);
  }

  // The calls index.astro makes: legacy slots, then every SlotRenderer and HomeSections instance.
  function render_page(settings: SectionRenderSettings): string {
    home_section_containers(settings);
    const html: string[] = [];
    const split = split_home_containers(settings);
    for (let slot = 0; slot < SLOTS; slot++) {
      html.push(String(home_hero_shown(settings)));
      const priority_id = home_priority_section_id(settings);
      const container = CONTAINERS[slot];
      for (const item of container ? split.containers[container] : []) {
        if (item.kind !== "section") continue;
        html.push(
          render_section_html(item.section, settings, settings.locale, {
            priority: item.section.id === priority_id,
          }),
        );
      }
    }
    for (let instance = 0; instance < MAIN_INSTANCES; instance++) {
      const priority_id = home_priority_section_id(settings);
      for (const entry of split.main) {
        html.push(
          render_section_html(entry, settings, settings.locale, {
            priority: entry.id === priority_id,
          }),
        );
      }
    }
    return html.join("");
  }

  beforeEach(() => {
    serializer.hero.mockClear();
    serializer.quote.mockClear();
  });

  it("serializes each section once per request, the LCP hero once more with priority", () => {
    const settings = request_settings();
    memoize_home_render(settings);
    render_page(settings);
    expect(serializer.quote).toHaveBeenCalledTimes(2);
    expect(serializer.hero).toHaveBeenCalledTimes(2);
  });

  it("returns the same HTML as the unmemoized render", () => {
    const plain = render_page(request_settings());
    const plain_quote_calls = serializer.quote.mock.calls.length;
    const settings = request_settings();
    memoize_home_render(settings);
    expect(render_page(settings)).toBe(plain);
    expect(plain_quote_calls).toBeGreaterThan(2);
  });

  it("re-renders settings that were not memoized after an in-place change", () => {
    const settings = request_settings();
    const quote = settings.home?.sections?.[0] as HomeSection;
    expect(render_section_html(quote, settings)).toContain("Slow is smooth.");
    (quote as unknown as { content: { text: string } }).content = {
      text: "Edited quote.",
    };
    expect(render_section_html(quote, settings)).toContain("Edited quote.");
  });
});

describe("containers holding only sections", () => {
  const quote_in = (container: ContainerName, id = "quot0001") =>
    section(id, "quote", { container, index: 0 });

  it.each(CONTAINERS)("keeps the %s legacy slot for its sections", (name) => {
    const settings = settings_of("both-sidebars", [quote_in(name)], {});
    const occupied = home_section_containers(settings);
    expect([...occupied]).toEqual([name]);

    const config = settings.pageLayoutConfig as PageLayoutConfig;
    const slots = pageLayoutConfigToLegacy(config, occupied).sections;
    const legacy_id = {
      top: "page-sec-top",
      sidebarLeft: "page-sec-sidebar-left",
      sidebarRight: "page-sec-sidebar-right",
      bottom: "page-sec-bottom",
    }[name];
    const slot = slots.find((entry) => entry.id === legacy_id);
    expect(slot?.elements).toEqual([]);
    expect(pageLayoutConfigToLegacy(config).sections.map((s) => s.id)).toEqual([
      "page-sec-main",
    ]);
  });

  it("does not count hidden sections unless asked to", () => {
    const hidden = section(
      "hide0001",
      "quote",
      { container: "sidebarLeft", index: 0 },
      { hidden: true },
    );
    const settings = settings_of("sidebar-left", [hidden], {});
    expect(home_section_containers(settings).size).toBe(0);
    expect([
      ...home_section_containers(settings, { include_hidden: true }),
    ]).toEqual(["sidebarLeft"]);
  });

  it("keeps a sidebar with sections shown after its last element moves out", () => {
    const settings = settings_of("sidebar-left", [quote_in("sidebarLeft")], {
      top: ["header"],
    });
    const state = {
      pageLayoutConfig: settings.pageLayoutConfig as PageLayoutConfig,
      instanceOverrides: {},
    };
    const occupied = home_section_containers(settings);
    expect(template_after_move(state, "sidebarLeft", "top")).toBe("no-sidebar");
    expect(
      template_after_move(
        state,
        "sidebarLeft",
        "top",
        (element) => element.active,
        occupied,
      ),
    ).toBe("sidebar-left");
  });

  it("keeps a target sidebar with sections shown even when it receives no element", () => {
    const settings = settings_of("both-sidebars", [quote_in("sidebarRight")], {
      top: ["header"],
      sidebarLeft: ["authorProfile"],
    });
    const state = {
      pageLayoutConfig: settings.pageLayoutConfig as PageLayoutConfig,
      instanceOverrides: {},
    };
    const occupied = home_section_containers(settings);
    expect(template_after_move(state, "top", "sidebarRight")).toBe(
      "sidebar-left",
    );
    expect(
      template_after_move(
        state,
        "top",
        "sidebarRight",
        (element) => element.active,
        occupied,
      ),
    ).toBe("both-sidebars");
  });
});
