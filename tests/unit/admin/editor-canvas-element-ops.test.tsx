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

vi.mock("../../../src/components/ui/Toast", () => ({
  Toast: () => null,
  showToast: toast.show,
  dismissToast: () => {},
}));

// The community main slot fetches its posts; only the edit chrome around it matters here.
vi.mock("../../../src/components/community/CommunityContent", () => ({
  CommunityContent: () => null,
}));

import { render as solid_render } from "solid-js/web";
import {
  EditorCanvas,
  ELEMENT_OP_LABELS,
} from "../../../src/components/admin/canvas/EditorCanvas";
import type { CanvasDataState } from "../../../src/components/admin/canvas/use_canvas_data";
import { create_editor_state } from "../../../src/components/admin/editor-state";
import type { HomeSectionOp } from "../../../src/components/admin/canvas/home-sections/HomeSectionsStack";
import {
  apply_layout_op,
  flushPendingSettings,
  getSettingsSnapshot,
  settings,
  syncSettingsToStore,
  updateSettingsImmediate,
} from "../../../src/components/admin/queries";
import {
  hasUnsavedChanges,
  setHasUnsavedChanges,
  settingsVersion,
} from "../../../src/components/admin/store";
import {
  clear_selection,
  is_selected,
} from "../../../src/components/admin/canvas/selection";
import {
  pageElementLabels,
  slotLabels,
  type ContainerName,
  type LayoutElementId,
  type PageLayoutConfig,
} from "../../../src/components/admin/types/layout";
import type { SettingsData } from "../../../src/components/admin/types/settings";
import type { HiveCommunity } from "../../../src/lib/types/community";

const COMMUNITY = {
  title: "Bees",
  about: "",
  description: "About us",
  flag_text: "Be nice\nNo spam",
  team: [["alice", "owner", ""]],
  lang: "pl",
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

const RIGHT_SECTION_ID = "page-sec-sidebar-right";

function layout(right: LayoutElementId[]): PageLayoutConfig {
  return {
    template: "sidebar-right",
    containers: {
      top: { elements: [] },
      sidebarLeft: { elements: [] },
      sidebarRight: {
        elements: right.map((id) => ({ id, active: true })),
      },
      bottom: { elements: [] },
    },
  };
}

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

/** EditorCanvas wired to an editor history the way AdminPanel does it (commit_canvas_op, undo_step). */
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

const ids_of = (container: ContainerName) =>
  (settings.pageLayoutConfig?.containers?.[container]?.elements ?? []).map(
    (element) => element.id,
  );

const label_of = (id: string) => pageElementLabels[id] ?? id;

const zone = (root: HTMLElement, id: string) =>
  root.querySelector<HTMLElement>(`[data-drop-zone="${id}"]`)!;

const element_in = (scope: HTMLElement, id: string) =>
  scope.querySelector<HTMLElement>(`[data-element-id="${id}"]`);

function button(scope: HTMLElement, name: string): HTMLButtonElement | null {
  return scope.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
}

function click(target: Element): void {
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

function choose(scope: HTMLElement, menu_label: string, item_label: string) {
  click(button(scope, menu_label)!);
  const item = [
    ...scope.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  ].find((entry) => entry.textContent === item_label);
  expect(item, item_label).toBeDefined();
  click(item!);
}

const add_label = (slot: keyof typeof slotLabels) =>
  `Add component to ${slotLabels[slot]} section`;

describe("trash removes an element as one undo step", () => {
  it("removes the selected block, clears the selection and Undo restores it", () => {
    const { root, editor } = mount({
      pageLayoutConfig: layout(["communityRules", "communityDescription"]),
    });
    const sidebar = zone(root, "sidebarRight");
    click(element_in(sidebar, "communityRules")!);
    expect(is_selected(RIGHT_SECTION_ID, "communityRules")).toBe(true);

    click(button(sidebar, `Remove ${label_of("communityRules")}`)!);

    expect(ids_of("sidebarRight")).toEqual(["communityDescription"]);
    expect(element_in(sidebar, "communityRules")).toBeNull();
    expect(is_selected(RIGHT_SECTION_ID, "communityRules")).toBe(false);
    expect(editor.history.size().undo).toBe(1);
    expect(editor.history.undo_label()).toBe(ELEMENT_OP_LABELS.remove);

    const [, type, options] = toast.show.mock.calls.at(-1)!;
    expect(type).toBe("success");
    options.action.on_click();

    expect(ids_of("sidebarRight")).toEqual([
      "communityRules",
      "communityDescription",
    ]);
    expect(
      element_in(zone(root, "sidebarRight"), "communityRules"),
    ).not.toBeNull();
    expect(editor.history.size().undo).toBe(0);
  });

  it("removing the last element hides the empty sidebar, Undo shows it again", () => {
    const { root } = mount({ pageLayoutConfig: layout(["communityRules"]) });

    click(
      button(
        zone(root, "sidebarRight"),
        `Remove ${label_of("communityRules")}`,
      )!,
    );

    expect(settings.pageLayoutConfig?.template).toBe("no-sidebar");
    expect(root.querySelector('[data-drop-zone="sidebarRight"]')).toBeNull();

    toast.show.mock.calls.at(-1)![2].action.on_click();

    expect(settings.pageLayoutConfig?.template).toBe("sidebar-right");
    expect(
      element_in(zone(root, "sidebarRight"), "communityRules"),
    ).not.toBeNull();
  });
});

describe("'+' adds a component", () => {
  it("the section menu puts the chosen element first as one undo step", () => {
    const { root, editor } = mount({
      pageLayoutConfig: layout(["communityRules"]),
    });
    const sidebar = zone(root, "sidebarRight");

    choose(sidebar, add_label("sidebar-right"), label_of("communityTeam"));

    expect(ids_of("sidebarRight")).toEqual(["communityTeam", "communityRules"]);
    const rendered = [
      ...zone(root, "sidebarRight").querySelectorAll<HTMLElement>(
        "[data-canvas-element]",
      ),
    ].map((element) => element.dataset.elementId);
    expect(rendered).toEqual(["communityTeam", "communityRules"]);
    expect(editor.history.size().undo).toBe(1);
    expect(editor.history.undo_label()).toBe(ELEMENT_OP_LABELS.add);

    editor.undo();

    expect(ids_of("sidebarRight")).toEqual(["communityRules"]);
    expect(element_in(zone(root, "sidebarRight"), "communityTeam")).toBeNull();
  });

  it("an empty slot has its own '+' and the added element renders in it", () => {
    const { root } = mount({ pageLayoutConfig: layout(["communityRules"]) });
    const top = zone(root, "top");
    expect(top.querySelector("[data-canvas-element]")).toBeNull();

    choose(top, add_label("top"), label_of("communityTeam"));

    expect(ids_of("top")).toEqual(["communityTeam"]);
    expect(element_in(zone(root, "top"), "communityTeam")).not.toBeNull();
  });

  it("the menu skips a block already placed in another slot", () => {
    const { root } = mount({ pageLayoutConfig: layout(["communityRules"]) });
    click(button(zone(root, "top"), add_label("top"))!);
    const items = [
      ...zone(root, "top").querySelectorAll('[role="menuitem"]'),
    ].map((item) => item.textContent);
    expect(items).not.toContain(label_of("communityRules"));
  });

  it("the menu skips a header already placed in top", () => {
    const config = layout(["communityRules"]);
    config.containers.top.elements = [{ id: "header", active: true }];
    const { root } = mount({ pageLayoutConfig: config });
    click(button(zone(root, "bottom"), add_label("bottom"))!);
    const items = [
      ...zone(root, "bottom").querySelectorAll('[role="menuitem"]'),
    ].map((item) => item.textContent);
    expect(items).toContain(label_of("communityTeam"));
    expect(items).not.toContain(label_of("header"));
    expect(items).not.toContain(label_of("communityRules"));
  });

  it("the main section has no '+'", () => {
    const { root } = mount({ pageLayoutConfig: layout(["communityRules"]) });
    expect(button(zone(root, "main"), add_label("main"))).toBeNull();
  });
});

describe("element controls per slot", () => {
  it("navigation and posts in main have no trash", () => {
    const { root } = mount({ pageLayoutConfig: layout(["communityRules"]) });
    const main = zone(root, "main");
    const main_ids = [...main.querySelectorAll("[data-canvas-element]")].map(
      (element) => element.getAttribute("data-element-id"),
    );
    expect(main_ids).toContain("posts");
    for (const id of ["navigation", "posts"]) {
      expect(button(main, `Remove ${label_of(id)}`)).toBeNull();
    }
    expect(main.querySelector('[data-element-action="remove"]')).toBeNull();
  });

  it("a block hidden by its flag has Show, and a click shows it", () => {
    const { root, editor } = mount({
      pageLayoutConfig: layout(["communityRules", "communityDescription"]),
      community_show_rules: false,
    });
    const sidebar = zone(root, "sidebarRight");
    const show = button(sidebar, `Show ${label_of("communityRules")}`)!;
    expect(show).not.toBeNull();
    expect(
      button(sidebar, `Show ${label_of("communityDescription")}`),
    ).toBeNull();

    click(show);

    expect(settings.community_show_rules).toBe(true);
    expect(editor.history.undo_label()).toBe(ELEMENT_OP_LABELS.show);
    expect(button(sidebar, `Show ${label_of("communityRules")}`)).toBeNull();
  });
});
