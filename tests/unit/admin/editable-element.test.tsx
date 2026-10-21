// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, describe, expect, it, vi } from "vitest";

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
import type { JSX } from "solid-js";
import {
  EditableElement,
  type EditableElementProps,
} from "../../../src/components/admin/canvas/EditableElement";
import { DndRoot } from "../../../src/components/admin/canvas/dnd/DndRoot";
import {
  clear_selection,
  is_popover_open,
  is_selected,
  selection,
} from "../../../src/components/admin/canvas/selection";
import { pageElementLabels } from "../../../src/components/admin/types/layout";

const SECTION_ID = "sidebar-right";
const disposers: Array<() => void> = [];

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  clear_selection();
  document.body.innerHTML = "";
});

type Options = Partial<
  Pick<
    EditableElementProps,
    "has_data" | "empty_label" | "on_remove" | "on_show"
  >
> & {
  draggable?: boolean;
  slot?: EditableElementProps["slot"];
  index?: number;
};

function mount(element_id: string, options: Options = {}): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  const view = (): JSX.Element => (
    <EditableElement
      section_id={SECTION_ID}
      slot={options.slot ?? "sidebar-right"}
      element_id={element_id}
      index={() => options.index ?? 0}
      count={() => 1}
      dnd={
        options.draggable === false
          ? undefined
          : {
              sortable_id: `${SECTION_ID}:${element_id}`,
              container_id: () => SECTION_ID,
              orientation: () => "vertical",
            }
      }
      is_mock={false}
      has_data={options.has_data ?? true}
      empty_label={options.empty_label}
      on_remove={options.on_remove}
      on_show={options.on_show}
    >
      <p data-content="">content</p>
    </EditableElement>
  );
  disposers.push(
    solid_render(
      () => <DndRoot onDragEnd={() => {}}>{view()}</DndRoot>,
      container,
    ),
  );
  return container;
}

const label_of = (element_id: string) =>
  pageElementLabels[element_id] ?? element_id;

function button(root: HTMLElement, name: string): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
}

function click(target: Element): MouseEvent {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function chip_label(root: HTMLElement): HTMLSpanElement {
  return root.querySelector<HTMLSpanElement>(
    "[data-canvas-chrome] span[title], [data-canvas-chrome] span.truncate",
  )!;
}

describe("EditableElement gear", () => {
  it("hides the gear of a block without settings and keeps it for the header", () => {
    const root = mount("communityRules");
    const header = mount("header");
    expect(
      root.querySelector('[data-element-gear="communityRules"]'),
    ).toBeNull();
    expect(header.querySelector('[data-element-gear="header"]')).not.toBeNull();
  });

  it("Enter on a block without a gear still opens its popover", () => {
    const root = mount("communityRules");
    const wrapper = root.querySelector<HTMLElement>("[data-canvas-element]")!;
    wrapper.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(is_popover_open()).toBe(true);
    expect(selection()?.anchor_el).toBe(wrapper);
  });
});

describe("EditableElement remove", () => {
  it("the trash calls on_remove and leaves the element unselected", () => {
    const on_remove = vi.fn();
    const root = mount("communityRules", { on_remove });
    const trash = button(root, `Remove ${label_of("communityRules")}`)!;

    expect(trash.closest("[data-canvas-chrome]")).not.toBeNull();
    click(trash);

    expect(on_remove).toHaveBeenCalledTimes(1);
    expect(is_selected(SECTION_ID, "communityRules")).toBe(false);
    expect(is_popover_open()).toBe(false);
  });

  it("renders no trash without on_remove or without dnd", () => {
    const without_callback = mount("communityRules");
    const fixed = mount("posts", { on_remove: vi.fn(), draggable: false });
    expect(
      without_callback.querySelector('[data-element-action="remove"]'),
    ).toBeNull();
    expect(fixed.querySelector('[data-element-action="remove"]')).toBeNull();
  });
});

describe("EditableElement empty placeholder", () => {
  it("renders a one-row placeholder whose label stays visible in a narrow chip", () => {
    const root = mount("communityRules", {
      has_data: false,
      empty_label: "Hidden — enable in settings",
    });
    const all_classes = [...root.querySelectorAll("[class]")]
      .map((node) => node.getAttribute("class") ?? "")
      .join(" ");
    const label = chip_label(root);

    expect(all_classes).not.toContain("min-h-12");
    expect(label.textContent).toBe(
      `${label_of("communityRules")} · Hidden — enable in settings`,
    );
    expect(label.getAttribute("class")).not.toContain(
      "@max-[12rem]/chip:hidden",
    );
    expect(label.classList).toContain("truncate");
  });

  it("a click on the placeholder selects the element", () => {
    const root = mount("communityRules", { has_data: false });
    click(root.querySelector("[data-canvas-element]")!);
    expect(is_selected(SECTION_ID, "communityRules")).toBe(true);
  });
});

describe("EditableElement chip placement", () => {
  const chrome_of = (root: HTMLElement) =>
    root.querySelector<HTMLElement>("[data-canvas-chrome]")!;
  const chip_of = (root: HTMLElement) =>
    root.querySelector<HTMLElement>("[data-canvas-chip]")!;
  const wrapper_of = (root: HTMLElement) =>
    root.querySelector<HTMLElement>("[data-canvas-element]")!;

  it("places the chip of a filled element above its top edge, not over the content", () => {
    const root = mount("communityRules", { index: 1 });
    const chrome = chrome_of(root);

    expect(chrome.classList).toContain("bottom-full");
    expect(chrome.classList).toContain("left-0");
    expect(chrome.classList).toContain("right-0");
    expect(chrome.classList).toContain("@container/chip");
    expect(chrome.classList).toContain("pointer-events-none");
    expect(chrome.classList).not.toContain("inset-0");
    expect(chip_of(root).classList).not.toContain("top-1");
    expect(chip_of(root).classList).not.toContain("absolute");
  });

  it("ends the chip of the first sidebar element before the section toolbar", () => {
    const first = chrome_of(mount("communityRules"));
    const main_first = chrome_of(
      mount("posts", { slot: "main", draggable: false }),
    );

    expect(first.classList).toContain("right-46");
    expect(first.classList).toContain("max-md:right-55");
    expect(first.classList).not.toContain("right-0");
    expect(main_first.classList).toContain("right-0");
  });

  it("a shown chip leaves its padding to the content below, its controls keep the pointer", () => {
    const root = mount("communityRules", { on_remove: vi.fn() });
    click(wrapper_of(root));

    expect(chip_of(root).className).not.toContain("pointer-events-auto");
    expect(
      button(root, `Remove ${label_of("communityRules")}`)!.classList,
    ).toContain("pointer-events-auto");
    expect(chip_label(root).classList).toContain("pointer-events-auto");
  });

  it("a hover-revealed chip takes the pointer across its gaps", () => {
    const root = mount("communityRules");
    expect(chip_of(root).classList).toContain(
      "group-hover/el:pointer-events-auto",
    );
  });

  it("raises a hovered or selected element above an inactive neighbour", () => {
    const root = mount("communityRules");
    const wrapper = wrapper_of(root);

    expect(wrapper.classList).not.toContain("z-20");
    expect(wrapper.classList).toContain("hover:z-20");
    expect(wrapper.classList).toContain("focus-within:z-20");

    click(wrapper);

    expect(is_selected(SECTION_ID, "communityRules")).toBe(true);
    expect(wrapper.classList).toContain("z-20");
  });

  it("a click on the chip label selects the element, a click on a chip button does not", () => {
    const on_remove = vi.fn();
    const root = mount("communityRules", { on_remove });

    click(button(root, `Remove ${label_of("communityRules")}`)!);
    expect(is_selected(SECTION_ID, "communityRules")).toBe(false);

    click(chip_label(root));
    expect(is_selected(SECTION_ID, "communityRules")).toBe(true);
  });

  it("keeps the empty placeholder chip in flow", () => {
    const root = mount("communityRules", { has_data: false });
    const chrome = chrome_of(root);

    expect(chrome.classList).toContain("relative");
    expect(chrome.classList).not.toContain("bottom-full");
    expect(chrome.classList).not.toContain("absolute");
  });
});

describe("EditableElement show", () => {
  it("the Show button calls on_show without selecting the element", () => {
    const on_show = vi.fn();
    const root = mount("communityRules", { has_data: false, on_show });
    const show = button(root, `Show ${label_of("communityRules")}`)!;

    expect(show.closest("[data-canvas-chrome]")).not.toBeNull();
    click(show);

    expect(on_show).toHaveBeenCalledTimes(1);
    expect(is_selected(SECTION_ID, "communityRules")).toBe(false);
  });

  it("renders no Show button without on_show", () => {
    const root = mount("communityRules", { has_data: false });
    expect(root.querySelector('[data-element-action="show"]')).toBeNull();
  });
});
