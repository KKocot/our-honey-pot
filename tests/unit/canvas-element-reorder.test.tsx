// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, describe, expect, it, vi } from "vitest";

// jsdom has no ResizeObserver / IntersectionObserver; dnd-kit needs them at import and drag start.
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
      matches: true,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
});

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

import { render as solid_render } from "solid-js/web";
import { createRoot, For } from "solid-js";
import { create_move_controls } from "../../src/components/admin/canvas/PopoverHost";
import { useDragDropManager } from "@dnd-kit/solid";
import {
  canvas_element_dnd,
  canvas_section_dnd,
  move_op,
} from "../../src/components/admin/canvas/EditorCanvas";
import {
  DndRoot,
  type DndMoveEvent,
} from "../../src/components/admin/canvas/dnd/DndRoot";
import { DropZone } from "../../src/components/admin/canvas/dnd/DropZone";
import {
  EditableElement,
  PAGE_ELEMENT_DND_TYPE,
} from "../../src/components/admin/canvas/EditableElement";
import {
  EditableSection,
  PAGE_SECTION_DND_TYPE,
} from "../../src/components/admin/canvas/EditableSection";
import { page_element_ids } from "../../src/components/admin/canvas/layout-ops";
import {
  apply_layout_op,
  flushPendingSettings,
  settings,
  updateSettingsImmediate,
} from "../../src/components/admin/queries";
import type {
  ContainerName,
  LayoutElementId,
  PageLayoutConfig,
} from "../../src/components/admin/types/layout";
import { parse_settings_graceful } from "../../src/components/admin/types/settings-schema";

type Manager = NonNullable<ReturnType<typeof useDragDropManager>>;

const disposers: Array<() => void> = [];

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
  flushPendingSettings();
});

function layout(
  right: LayoutElementId[],
  left: LayoutElementId[] = [],
): PageLayoutConfig {
  const elements = (ids: LayoutElementId[]) =>
    ids.map((id) => ({ id, active: true }));
  return {
    template: "both-sidebars",
    containers: {
      top: { elements: [] },
      sidebarLeft: { elements: elements(left) },
      sidebarRight: { elements: elements(right) },
      bottom: { elements: [] },
    },
  };
}

const ids_of = (container: ContainerName) =>
  (settings.pageLayoutConfig?.containers?.[container]?.elements ?? []).map(
    (element) => element.id,
  );

/** One canvas slot wired like EditorCanvas: a drop zone, its section sortable and the element sortables. */
function Slot(props: { zone: ContainerName }) {
  const elements = () => ids_of(props.zone);
  return (
    <DropZone
      id={props.zone}
      count={elements().length}
      accept={[PAGE_ELEMENT_DND_TYPE, PAGE_SECTION_DND_TYPE]}
      claim_types={[PAGE_SECTION_DND_TYPE]}
    >
      <EditableSection
        section_id={`page-sec-${props.zone}`}
        slot="sidebar-right"
        element_count={elements().length}
        dnd={canvas_section_dnd(props.zone)}
      >
        <For each={elements()}>
          {(element_id, index) => (
            <EditableElement
              section_id={`page-sec-${props.zone}`}
              slot="sidebar-right"
              element_id={element_id}
              index={index}
              count={() => elements().length}
              dnd={canvas_element_dnd(props.zone, element_id, () => "vertical")}
              is_mock={false}
              has_data
            >
              <p>{element_id}</p>
            </EditableElement>
          )}
        </For>
      </EditableSection>
    </DropZone>
  );
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
}

function mount_canvas(config: PageLayoutConfig) {
  updateSettingsImmediate({ pageLayoutConfig: config, instanceOverrides: {} });
  let manager: Manager | null = null;
  const drops: DndMoveEvent[] = [];
  const rejects: string[] = [];
  const Probe = () => {
    manager = useDragDropManager();
    return null;
  };
  const container = document.createElement("div");
  document.body.append(container);
  disposers.push(
    solid_render(
      () => (
        <DndRoot
          onDragEnd={(event) => {
            drops.push(event);
            apply_layout_op(
              move_op(event, page_element_ids(true), (reason) =>
                rejects.push(reason),
              ),
            );
          }}
        >
          <Probe />
          <Slot zone="sidebarRight" />
          <Slot zone="sidebarLeft" />
        </DndRoot>
      ),
      container,
    ),
  );
  return {
    drops,
    rejects,
    /** Drags `element_id` of `from` over the droppable `target_id` and drops it there. */
    async drag(from: ContainerName, element_id: string, target_id: string) {
      const dnd = manager!;
      dnd.actions.start({
        source: `page-el:${from}:${element_id}`,
        coordinates: { x: 0, y: 0 },
      });
      await settle();
      await dnd.actions.setDropTarget(target_id);
      await settle();
      dnd.actions.stop();
      await settle();
    },
  };
}

describe("canvas drag reorders elements inside one slot", () => {
  it("community block dropped on communityProfile moves above it, and back below", async () => {
    const canvas = mount_canvas(
      layout(["communityProfile", "communityLanguage"]),
    );
    await settle();

    await canvas.drag(
      "sidebarRight",
      "communityLanguage",
      "page-el:sidebarRight:communityProfile",
    );
    expect(canvas.rejects).toEqual([]);
    expect(ids_of("sidebarRight")).toEqual([
      "communityLanguage",
      "communityProfile",
    ]);

    await canvas.drag(
      "sidebarRight",
      "communityProfile",
      "page-el:sidebarRight:communityLanguage",
    );
    expect(ids_of("sidebarRight")).toEqual([
      "communityProfile",
      "communityLanguage",
    ]);
  });

  it("communityLanguage of a migrated legacy communitySidebar config moves above communityProfile", async () => {
    const stored = parse_settings_graceful({
      pageLayoutConfig: layout([], ["communityProfile", "communitySidebar"]),
    });
    const canvas = mount_canvas(stored.pageLayoutConfig as PageLayoutConfig);
    await settle();
    expect(ids_of("sidebarLeft")).toEqual([
      "communityProfile",
      "communityDescription",
      "communityRules",
      "communityTeam",
      "communityLanguage",
    ]);

    await canvas.drag(
      "sidebarLeft",
      "communityLanguage",
      "page-el:sidebarLeft:communityProfile",
    );
    expect(canvas.rejects).toEqual([]);
    expect(ids_of("sidebarLeft")).toEqual([
      "communityLanguage",
      "communityProfile",
      "communityDescription",
      "communityRules",
      "communityTeam",
    ]);
  });

  it("blocks reorder among themselves", async () => {
    const canvas = mount_canvas(
      layout([
        "communityDescription",
        "communityRules",
        "communityTeam",
        "communityLanguage",
      ]),
    );
    await settle();

    await canvas.drag(
      "sidebarRight",
      "communityLanguage",
      "page-el:sidebarRight:communityDescription",
    );
    expect(ids_of("sidebarRight")).toEqual([
      "communityLanguage",
      "communityDescription",
      "communityRules",
      "communityTeam",
    ]);
  });

  it("a block dropped on another slot moves there", async () => {
    const canvas = mount_canvas(
      layout(["communityProfile", "communityLanguage"], ["communityRules"]),
    );
    await settle();

    await canvas.drag("sidebarRight", "communityLanguage", "zone:sidebarLeft");
    expect(ids_of("sidebarRight")).toEqual(["communityProfile"]);
    expect(ids_of("sidebarLeft")).toEqual([
      "communityRules",
      "communityLanguage",
    ]);
  });
});

describe("popover move controls of a community block", () => {
  function controls(element_id: string) {
    return createRoot((dispose) => {
      disposers.push(dispose);
      return create_move_controls("page-sec-sidebar-right", element_id);
    });
  }

  it("Up/Down reorder the block around communityProfile", () => {
    updateSettingsImmediate({
      pageLayoutConfig: layout(["communityProfile", "communityLanguage"]),
    });
    const language = controls("communityLanguage");
    expect(language()?.can_move_up).toBe(true);
    expect(language()?.can_move_down).toBe(false);

    language()!.onMoveUp();
    expect(ids_of("sidebarRight")).toEqual([
      "communityLanguage",
      "communityProfile",
    ]);
    expect(language()?.can_move_up).toBe(false);

    language()!.onMoveDown();
    expect(ids_of("sidebarRight")).toEqual([
      "communityProfile",
      "communityLanguage",
    ]);
  });

  it("slot select moves the block to another slot", () => {
    updateSettingsImmediate({
      pageLayoutConfig: layout(["communityProfile", "communityLanguage"]),
    });
    const language = controls("communityLanguage");
    expect(language()?.slot_options.map((option) => option.value)).toContain(
      "top",
    );

    language()!.onSlotChange("top");
    expect(ids_of("sidebarRight")).toEqual(["communityProfile"]);
    expect(ids_of("top")).toEqual(["communityLanguage"]);
  });
});
