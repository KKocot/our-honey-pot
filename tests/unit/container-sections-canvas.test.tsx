// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no ResizeObserver / IntersectionObserver; dnd-kit needs them at import.
vi.hoisted(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  globalThis.IntersectionObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
  Document.prototype.elementFromPoint ??= () => null;
  Document.prototype.getAnimations ??= () => [];
  Element.prototype.getAnimations ??= () => [];
  HTMLElement.prototype.showPopover ??= () => {};
  HTMLElement.prototype.hidePopover ??= () => {};
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
});

const toast = vi.hoisted(() => ({ show: vi.fn() }));

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

vi.mock("../../src/components/ui/Toast", () => ({
  Toast: () => null,
  showToast: toast.show,
  dismissToast: () => {},
}));

vi.mock("../../src/components/community/CommunityContent", () => ({
  CommunityContent: () => null,
}));

import { render as solid_render } from "solid-js/web";
import {
  EditorCanvas,
  placed_move_op,
  placed_sortable_id,
} from "../../src/components/admin/canvas/EditorCanvas";
import type { CanvasDataState } from "../../src/components/admin/canvas/use_canvas_data";
import { create_editor_state } from "../../src/components/admin/editor-state";
import type { HomeSectionOp } from "../../src/components/admin/canvas/home-sections/HomeSectionsStack";
import { HomeSectionPopover } from "../../src/components/admin/canvas/popovers/HomeSectionPopover";
import {
  HOME_OP_LABELS,
  build_home_stack,
} from "../../src/components/admin/canvas/home-sections/model";
import { page_element_ids } from "../../src/components/admin/canvas/layout-ops";
import {
  apply_layout_op,
  flushPendingSettings,
  getSettingsSnapshot,
  settings,
  syncSettingsToStore,
  updateSettingsImmediate,
} from "../../src/components/admin/queries";
import {
  hasUnsavedChanges,
  setHasUnsavedChanges,
  settingsVersion,
} from "../../src/components/admin/store";
import {
  clear_selection,
  is_home_section_selected,
  is_popover_open,
  selection,
} from "../../src/components/admin/canvas/selection";
import type {
  ContainerName,
  LayoutElementId,
  LayoutTemplate,
  PageLayoutConfig,
} from "../../src/components/admin/types/layout";
import type {
  HomeSection,
  SettingsData,
} from "../../src/components/admin/types/settings";
import { render_section_html } from "../../src/shared/components/sections/render";
import { get_element_wrapper_class } from "../../src/shared/components/page-layout";
import type { HiveCommunity } from "../../src/lib/types/community";

// Every sidebar block has data, so SSR (slot_element_renders) renders and counts each community element.
const COMMUNITY = {
  name: "hive-100000",
  title: "Test community",
  about: "About",
  description: "Description",
  flag_text: "Be kind",
  team: [["alice", "admin", "Lead"]],
  lang: "en",
  subscribers: 1,
} as unknown as HiveCommunity;

const CANVAS_DATA: CanvasDataState = {
  data: { hive: null, community: { community: COMMUNITY, posts: [] } },
  source: "mock",
  mode: "mock",
  mock_reason: "user_choice",
  is_loading: false,
  error: null,
  retry: () => {},
  set_mode: () => {},
};

function layout(
  template: LayoutTemplate,
  elements: Partial<Record<ContainerName, LayoutElementId[]>> = {},
): PageLayoutConfig {
  const container = (name: ContainerName) => ({
    elements: (elements[name] ?? []).map((id) => ({ id, active: true })),
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

function quote(
  id: string,
  text: string,
  placement?: { container: ContainerName; index: number },
): HomeSection {
  return {
    id,
    type: "quote",
    content: { text },
    style: {},
    ...(placement ? { placement } : {}),
  } as unknown as HomeSection;
}

const POSTS = {
  id: "posts001",
  type: "posts",
  content: {},
  style: {},
} as unknown as HomeSection;

let initial: SettingsData;
const disposers: Array<() => void> = [];

beforeEach(() => {
  initial ??= getSettingsSnapshot();
  toast.show.mockClear();
});

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  clear_selection();
  document.body.innerHTML = "";
  flushPendingSettings();
  syncSettingsToStore(initial);
});

type Editor = ReturnType<typeof create_editor_state>;

/** EditorCanvas wired to an editor history the way AdminPanel does it. */
function mount(patch: Partial<SettingsData>): {
  root: HTMLElement;
  editor: Editor;
} {
  updateSettingsImmediate(patch);
  const root = document.createElement("div");
  document.body.append(root);
  let editor!: Editor;
  disposers.push(
    solid_render(() => {
      editor = create_editor_state({
        read: getSettingsSnapshot,
        apply: (snapshot) => syncSettingsToStore(snapshot),
        version: settingsVersion,
        dirty: hasUnsavedChanges,
        set_dirty: setHasUnsavedChanges,
      });
      editor.mark_loaded();
      const commit = (op: HomeSectionOp, label: string): boolean => {
        let applied = false;
        editor.apply_edit(() => {
          applied = apply_layout_op(op);
        }, label);
        editor.history.seal();
        return applied;
      };
      const undo_step = (step: number): boolean => {
        editor.record_edit();
        if (editor.history.undo_id() !== step) return false;
        return editor.undo() !== null;
      };
      return (
        <EditorCanvas
          canvas_data={CANVAS_DATA}
          on_home_op={commit}
          on_undo_step={undo_step}
          undo_step_id={editor.history.undo_id}
        />
      );
    }, root),
  );
  return { root, editor };
}

const zone = (root: HTMLElement, id: string) =>
  root.querySelector<HTMLElement>(`[data-drop-zone="${id}"]`)!;

const placed_in = (scope: HTMLElement, id: string) =>
  scope.querySelector<HTMLElement>(
    `[data-placed-section][data-home-section="${id}"]`,
  );

const stack_ids = (root: HTMLElement) =>
  [
    ...root.querySelectorAll<HTMLElement>(
      "[data-home-sections-stack] [data-home-section]",
    ),
  ].map((element) => element.dataset.homeSection);

function click(target: Element): void {
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

const section_ids = () =>
  (settings.home?.sections ?? []).map((section) => section.id);

const PARITY_SECTIONS = [
  POSTS,
  quote("topq0001", "Top line", { container: "top", index: 0 }),
  quote("side0001", "Side line", { container: "sidebarRight", index: 1 }),
];

describe("sections placed in containers render like SSR", () => {
  it("top and sidebar sections carry the render_section_html HTML", () => {
    const { root } = mount({
      pageLayoutConfig: layout("sidebar-right", {
        sidebarRight: ["communityRules"],
      }),
      home: { sections: PARITY_SECTIONS },
    });

    for (const [container, id] of [
      ["top", "topq0001"],
      ["sidebarRight", "side0001"],
    ] as const) {
      const wrapper = placed_in(zone(root, container), id);
      expect(wrapper, id).not.toBeNull();
      const content = wrapper!.querySelector("[data-home-section-content]")!;
      const section = settings.home!.sections.find((entry) => entry.id === id)!;
      const ssr = render_section_html(section, settings);
      expect(ssr).not.toBe("");
      expect(content.innerHTML).toBe(ssr);
      expect(content.querySelector("[data-canvas-chrome]")).toBeNull();
    }
  });

  it("keeps the SSR order of elements and sections inside the sidebar", () => {
    const { root } = mount({
      pageLayoutConfig: layout("sidebar-right", {
        sidebarRight: ["communityRules", "communityTeam"],
      }),
      home: { sections: PARITY_SECTIONS },
    });
    const order = [
      ...zone(root, "sidebarRight").querySelectorAll<HTMLElement>(
        "[data-canvas-element], [data-placed-section]",
      ),
    ].map(
      (element) => element.dataset.elementId ?? element.dataset.homeSection,
    );
    expect(order).toEqual(["communityRules", "side0001", "communityTeam"]);
  });

  it("shows the fill-in notice of a placeholder section only as chrome", () => {
    const { root } = mount({
      pageLayoutConfig: layout("sidebar-right"),
      home: {
        sections: [
          POSTS,
          quote("todo0001", "", { container: "sidebarRight", index: 0 }),
        ],
      },
    });
    const wrapper = placed_in(zone(root, "sidebarRight"), "todo0001")!;
    const notice = wrapper.querySelector("[data-fill-in-notice]")!;
    expect(notice).not.toBeNull();
    expect(notice.closest("[data-canvas-chrome]")).not.toBeNull();
    expect(
      wrapper.querySelector(
        "[data-home-section-content] [data-fill-in-notice]",
      ),
    ).toBeNull();
  });
});

describe("main stack holds only sections without a visible placement", () => {
  it("leaves placed sections out and keeps unplaced ones", () => {
    const { root } = mount({
      pageLayoutConfig: layout("sidebar-right"),
      home: {
        sections: [
          POSTS,
          quote("main0001", "In main"),
          quote("side0001", "In sidebar", {
            container: "sidebarRight",
            index: 0,
          }),
        ],
      },
    });
    expect(stack_ids(root)).toContain("main0001");
    expect(stack_ids(root)).not.toContain("side0001");
    expect(placed_in(zone(root, "sidebarRight"), "side0001")).not.toBeNull();
  });

  it("puts a section placed in a sidebar the template hides back in main", () => {
    const { root } = mount({
      pageLayoutConfig: layout("no-sidebar"),
      home: {
        sections: [
          POSTS,
          quote("left0001", "Hidden sidebar", {
            container: "sidebarLeft",
            index: 0,
          }),
        ],
      },
    });
    expect(stack_ids(root)).toContain("left0001");
    expect(root.querySelector("[data-placed-section]")).toBeNull();
  });

  it("numbers and moves main sections among themselves only", () => {
    const view = {
      pageLayoutConfig: layout("sidebar-right"),
      home: {
        sections: [
          quote("main0001", "A"),
          quote("side0001", "B", { container: "sidebarRight", index: 0 }),
          POSTS,
        ],
      },
    };
    const stack = build_home_stack(view);
    expect(stack.items.map((item) => item.section.id)).toEqual([
      "main0001",
      "posts001",
    ]);
    expect(stack.items[0]).toMatchObject({
      index: 0,
      total: 2,
      can_move_down: true,
    });
  });
});

describe("'+' and trash of a sidebar", () => {
  it("the sidebar '+' adds a section as one undo step; undo removes it", () => {
    const { root, editor } = mount({
      pageLayoutConfig: layout("sidebar-right"),
      home: { sections: [POSTS] },
    });
    const sidebar = zone(root, "sidebarRight");
    click(
      sidebar.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!,
    );
    const item = sidebar.querySelector<HTMLButtonElement>(
      '[role="menuitem"][data-section-type="quote"]',
    );
    expect(item).not.toBeNull();
    expect(
      sidebar.querySelector('[role="menuitem"][data-section-type="hero"]'),
    ).toBeNull();
    click(item!);

    const added = settings.home!.sections.at(-1)!;
    expect(added.type).toBe("quote");
    expect(added.placement?.container).toBe("sidebarRight");
    expect(placed_in(zone(root, "sidebarRight"), added.id)).not.toBeNull();
    expect(stack_ids(root)).not.toContain(added.id);
    expect(editor.history.size().undo).toBe(1);
    expect(editor.history.undo_label()).toBe(HOME_OP_LABELS.add);

    editor.undo();

    expect(section_ids()).toEqual(["posts001"]);
    expect(root.querySelector("[data-placed-section]")).toBeNull();
  });

  it("the trash deletes the section as one undo step; the toast Undo restores it", () => {
    const { root, editor } = mount({
      pageLayoutConfig: layout("sidebar-right", {
        sidebarRight: ["communityRules"],
      }),
      home: { sections: PARITY_SECTIONS },
    });
    const wrapper = placed_in(zone(root, "sidebarRight"), "side0001")!;
    click(wrapper.querySelector('[data-home-action="delete"]')!);

    expect(section_ids()).toEqual(["posts001", "topq0001"]);
    expect(placed_in(root, "side0001")).toBeNull();
    expect(editor.history.size().undo).toBe(1);
    expect(editor.history.undo_label()).toBe(HOME_OP_LABELS.delete);

    toast.show.mock.calls.at(-1)![2].action.on_click();

    expect(section_ids()).toEqual(["posts001", "topq0001", "side0001"]);
    expect(placed_in(zone(root, "sidebarRight"), "side0001")).not.toBeNull();
  });

  it("deleting the only content of a sidebar hides it, undo shows it again", () => {
    const { root, editor } = mount({
      pageLayoutConfig: layout("sidebar-right"),
      home: {
        sections: [
          POSTS,
          quote("side0001", "Alone", { container: "sidebarRight", index: 0 }),
        ],
      },
    });
    click(
      placed_in(zone(root, "sidebarRight"), "side0001")!.querySelector(
        '[data-home-action="delete"]',
      )!,
    );
    expect(settings.pageLayoutConfig?.template).toBe("no-sidebar");

    editor.undo();

    expect(settings.pageLayoutConfig?.template).toBe("sidebar-right");
    expect(placed_in(zone(root, "sidebarRight"), "side0001")).not.toBeNull();
  });
});

describe("popover of a sidebar section", () => {
  function mount_popover(id: string) {
    const host = document.createElement("div");
    document.body.append(host);
    const anchor = selection()?.anchor_el;
    disposers.push(
      solid_render(
        () => (
          <HomeSectionPopover
            section_id={id}
            anchor={anchor}
            on_close={() => clear_selection()}
          />
        ),
        host,
      ),
    );
    // PopoverShell portals the panel out of the mount node.
    return document.body;
  }

  it("opens from the gear beside the section wrapper; 'Move to' main moves it", () => {
    const { root, editor } = mount({
      pageLayoutConfig: layout("sidebar-right", {
        sidebarRight: ["communityRules"],
      }),
      home: { sections: PARITY_SECTIONS },
    });
    const wrapper = placed_in(zone(root, "sidebarRight"), "side0001")!;
    const gear = wrapper.querySelector<HTMLElement>(
      '[data-home-section-gear="side0001"]',
    )!;
    click(gear);

    expect(is_home_section_selected("side0001")).toBe(true);
    expect(is_popover_open()).toBe(true);
    expect(selection()?.anchor_el).toBe(gear);
    expect(selection()?.position_el).toBe(wrapper);
    expect(selection()?.slot).toBe("sidebar-right");

    const host = mount_popover("side0001");
    const targets = [
      ...host.querySelectorAll<HTMLButtonElement>("[data-move-to]"),
    ].map((button) => button.dataset.moveTo);
    expect(targets).toEqual(["main", "top", "sidebarLeft", "bottom"]);

    click(host.querySelector('[data-move-to="main"]')!);

    const moved = settings.home!.sections.find(
      (entry) => entry.id === "side0001",
    )!;
    expect(moved.placement).toBeUndefined();
    expect(stack_ids(root)).toContain("side0001");
    expect(placed_in(root, "side0001")).toBeNull();
    expect(host.querySelector("[data-section-placement]")).toBeNull();
    expect(editor.history.size().undo).toBe(1);
  });

  it("Remove deletes the section and closes the popover", () => {
    const { root } = mount({
      pageLayoutConfig: layout("sidebar-right", {
        sidebarRight: ["communityRules"],
      }),
      home: { sections: PARITY_SECTIONS },
    });
    click(
      placed_in(zone(root, "sidebarRight"), "side0001")!.querySelector(
        '[data-home-section-gear="side0001"]',
      )!,
    );
    const host = mount_popover("side0001");
    click(host.querySelector("[data-section-remove]")!);

    expect(section_ids()).toEqual(["posts001", "topq0001"]);
    expect(is_popover_open()).toBe(false);
  });

  it("a main section has no placement controls", () => {
    mount({
      pageLayoutConfig: layout("sidebar-right"),
      home: { sections: [POSTS, quote("main0001", "Main")] },
    });
    const host = mount_popover("main0001");
    expect(host.querySelector("[data-section-placement]")).toBeNull();
  });
});

describe("drag of a placed section", () => {
  const ids = page_element_ids(true);
  const sections = [
    POSTS,
    quote("side0001", "Side", { container: "sidebarRight", index: 0 }),
  ];
  const current = () =>
    ({
      ...getSettingsSnapshot(),
      pageLayoutConfig: layout("both-sidebars", {
        sidebarRight: ["communityRules", "communityTeam"],
        sidebarLeft: ["communityDescription"],
      }),
      home: { sections },
    }) as SettingsData;

  it("a drop inside its sidebar sets the index to the elements before it", () => {
    const patch = placed_move_op(
      {
        id: placed_sortable_id("sidebarRight", "side0001"),
        source: { container_id: "sidebarRight", index: 0 },
        target: { container_id: "sidebarRight", index: 2 },
      },
      ids,
      COMMUNITY,
    )(current());
    expect(patch?.home?.sections?.[1].placement).toEqual({
      container: "sidebarRight",
      index: 2,
    });
  });

  it("a drop on another sidebar moves the section there", () => {
    const patch = placed_move_op(
      {
        id: placed_sortable_id("sidebarRight", "side0001"),
        source: { container_id: "sidebarRight", index: 0 },
        target: { container_id: "sidebarLeft", index: 0 },
      },
      ids,
      COMMUNITY,
    )(current());
    expect(patch?.home?.sections?.[1].placement).toEqual({
      container: "sidebarLeft",
      index: 0,
    });
  });

  it("swaps two sections with the same index instead of rejecting the move", () => {
    const tied = {
      ...current(),
      home: {
        sections: [
          POSTS,
          quote("tieA0001", "A", { container: "sidebarRight", index: 1 }),
          quote("tieB0001", "B", { container: "sidebarRight", index: 1 }),
        ],
      },
    } as SettingsData;
    // Canvas order: communityRules, tieA0001, tieB0001, communityTeam; B dropped on A's position.
    const patch = placed_move_op(
      {
        id: placed_sortable_id("sidebarRight", "tieB0001"),
        source: { container_id: "sidebarRight", index: 2 },
        target: { container_id: "sidebarRight", index: 1 },
      },
      ids,
      COMMUNITY,
    )(tied);
    expect(patch).not.toBeNull();
    expect(patch!.home!.sections.map((section) => section.id)).toEqual([
      "posts001",
      "tieB0001",
      "tieA0001",
    ]);
    expect(
      patch!.home!.sections.map((section) => section.placement?.index),
    ).toEqual([undefined, 1, 1]);
  });

  it("counts only the elements SSR renders: an empty community block is skipped", () => {
    const no_rules = { ...COMMUNITY, flag_text: "" } as HiveCommunity;
    // communityRules has no rules, so SlotRenderer.astro drops it: a drop after communityTeam is index 1, not 2.
    const patch = placed_move_op(
      {
        id: placed_sortable_id("sidebarRight", "side0001"),
        source: { container_id: "sidebarRight", index: 0 },
        target: { container_id: "sidebarRight", index: 2 },
      },
      ids,
      no_rules,
    )(current());
    expect(patch?.home?.sections?.[1].placement).toEqual({
      container: "sidebarRight",
      index: 1,
    });
  });
});

describe("'+' and trash of a container with elements", () => {
  it("the section '+' lists the Sections group and adds one as one undo step", () => {
    const { root, editor } = mount({
      pageLayoutConfig: layout("sidebar-right", {
        sidebarRight: ["communityRules"],
      }),
      home: { sections: [POSTS] },
    });
    const sidebar = zone(root, "sidebarRight");
    const trigger = sidebar.querySelector<HTMLButtonElement>(
      '[role="group"] button[aria-haspopup="menu"]',
    )!;
    expect(trigger).not.toBeNull();
    click(trigger);
    const item = sidebar.querySelector<HTMLButtonElement>(
      '[role="menuitem"][data-section-type="quote"]',
    );
    expect(item).not.toBeNull();
    click(item!);

    const added = settings.home!.sections.at(-1)!;
    expect(added.placement).toEqual({ container: "sidebarRight", index: 1 });
    const order = [
      ...zone(root, "sidebarRight").querySelectorAll<HTMLElement>(
        "[data-canvas-element], [data-placed-section]",
      ),
    ].map(
      (element) => element.dataset.elementId ?? element.dataset.homeSection,
    );
    expect(order).toEqual(["communityRules", added.id]);
    expect(editor.history.undo_label()).toBe(HOME_OP_LABELS.add);

    editor.undo();

    expect(section_ids()).toEqual(["posts001"]);
    expect(root.querySelector("[data-placed-section]")).toBeNull();
  });

  it("trashing the last element keeps a sidebar that holds a section", () => {
    const { root } = mount({
      pageLayoutConfig: layout("sidebar-right", {
        sidebarRight: ["communityRules"],
      }),
      home: {
        sections: [
          POSTS,
          quote("side0001", "Stays", { container: "sidebarRight", index: 1 }),
        ],
      },
    });
    click(
      zone(root, "sidebarRight").querySelector(
        '[data-element-action="remove"]',
      )!,
    );

    expect(settings.pageLayoutConfig?.containers.sidebarRight.elements).toEqual(
      [],
    );
    expect(settings.pageLayoutConfig?.template).toBe("sidebar-right");
    expect(placed_in(zone(root, "sidebarRight"), "side0001")).not.toBeNull();
  });
});

describe("wrapper of a placed section", () => {
  it("uses the SSR element wrapper class of its slot", () => {
    const { root } = mount({
      pageLayoutConfig: layout("sidebar-right", {
        sidebarRight: ["communityRules"],
      }),
      home: { sections: PARITY_SECTIONS },
    });
    const top = placed_in(zone(root, "top"), "topq0001")!.parentElement!;
    expect(top.className).toBe(get_element_wrapper_class("horizontal", "top"));
    const sidebar = zone(root, "sidebarRight");
    const side = placed_in(sidebar, "side0001")!.parentElement!;
    expect(side.className).toBe(
      get_element_wrapper_class("vertical", "sidebar-right"),
    );
    const element = sidebar.querySelector(
      '[data-element-id="communityRules"]',
    )!.parentElement!;
    expect(side.className).toBe(element.className);
  });
});
