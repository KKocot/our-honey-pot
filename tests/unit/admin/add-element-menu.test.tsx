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
  HTMLElement.prototype.showPopover ??= () => {};
  HTMLElement.prototype.hidePopover ??= () => {};
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
import { AddElementMenu } from "../../../src/components/admin/canvas/AddElementMenu";
import { EditableSection } from "../../../src/components/admin/canvas/EditableSection";
import {
  clear_selection,
  is_popover_open,
  is_selected,
  selection,
} from "../../../src/components/admin/canvas/selection";

const SECTION_ID = "page-sec-left";
const ITEMS = [
  { id: "communityRules", label: "Community rules" },
  { id: "subscribers", label: "Subscribers" },
];
const disposers: Array<() => void> = [];

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  clear_selection();
  document.body.innerHTML = "";
});

function mount(view: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  disposers.push(solid_render(view, container));
  return container;
}

function click(target: Element): void {
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

function key(target: Element, name: string): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: name,
      bubbles: true,
      cancelable: true,
    }),
  );
}

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

function trigger_of(root: HTMLElement): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
}

function menu_items(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
}

describe("AddElementMenu", () => {
  it("a click on '+' opens the list, choosing an item calls on_add and closes the menu", async () => {
    const on_add = vi.fn();
    const root = mount(() => (
      <AddElementMenu
        items={ITEMS}
        on_add={on_add}
        label="Add component to Left"
      />
    ));
    const trigger = trigger_of(root)!;
    expect(trigger.getAttribute("aria-label")).toBe("Add component to Left");
    expect(document.querySelector('[role="menu"]')).toBeNull();

    click(trigger);
    await flush();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(menu_items().map((item) => item.textContent)).toEqual([
      "Community rules",
      "Subscribers",
    ]);
    expect(document.activeElement).toBe(menu_items()[0]);

    click(menu_items()[1]);
    expect(on_add).toHaveBeenCalledExactlyOnceWith("subscribers");
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("arrow keys move focus between items and wrap around", async () => {
    const root = mount(() => (
      <AddElementMenu items={ITEMS} on_add={() => {}} label="Add" />
    ));
    click(trigger_of(root)!);
    await flush();
    const menu = document.querySelector('[role="menu"]')!;
    key(menu, "ArrowDown");
    expect(document.activeElement).toBe(menu_items()[1]);
    key(menu, "ArrowDown");
    expect(document.activeElement).toBe(menu_items()[0]);
    key(menu, "ArrowUp");
    expect(document.activeElement).toBe(menu_items()[1]);
  });

  it("Escape closes the menu and returns focus to the trigger", async () => {
    const root = mount(() => (
      <AddElementMenu items={ITEMS} on_add={() => {}} label="Add" />
    ));
    const trigger = trigger_of(root)!;
    click(trigger);
    await flush();
    key(menu_items()[0], "Escape");
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("a pointerdown outside closes the menu without calling on_add", async () => {
    const on_add = vi.fn();
    const root = mount(() => (
      <>
        <AddElementMenu items={ITEMS} on_add={on_add} label="Add" />
        <p data-outside="">outside</p>
      </>
    ));
    click(trigger_of(root)!);
    await flush();
    root
      .querySelector("[data-outside]")!
      .dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(on_add).not.toHaveBeenCalled();
  });

  it("an empty list disables the trigger with a title and never opens the menu", () => {
    const root = mount(() => (
      <AddElementMenu items={[]} on_add={() => {}} label="Add" />
    ));
    const trigger = trigger_of(root)!;
    expect(trigger.disabled).toBe(true);
    expect(trigger.title).toBe("No components available");
    click(trigger);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
});

describe("AddElementMenu sections group", () => {
  const SECTIONS = [
    { type: "quote" as const, label: "Quote" },
    { type: "faq" as const, label: "FAQ" },
  ];

  async function open_menu(
    props: {
      items?: typeof ITEMS;
      on_add?: (id: string) => void;
      on_add_section?: (type: string) => void;
    } = {},
  ) {
    const root = mount(() => (
      <AddElementMenu
        items={props.items ?? ITEMS}
        on_add={props.on_add ?? (() => {})}
        sections={SECTIONS}
        on_add_section={props.on_add_section}
        label="Add to Left"
      />
    ));
    click(trigger_of(root)!);
    await flush();
    return root;
  }

  it("lists sections in a labelled 'Sections' group after a separator", async () => {
    await open_menu();
    const menu = document.querySelector('[role="menu"]')!;
    const separator = menu.querySelector('[role="separator"]');
    const group = menu.querySelector<HTMLElement>('[role="group"]')!;
    expect(separator).not.toBeNull();
    expect(separator!.nextElementSibling).toBe(group);
    const label_id = group.getAttribute("aria-labelledby")!;
    expect(document.getElementById(label_id)?.textContent).toBe("Sections");
    expect(
      [...group.querySelectorAll('[role="menuitem"]')].map(
        (item) => item.textContent,
      ),
    ).toEqual(["Quote", "FAQ"]);
    expect(menu_items().map((item) => item.textContent)).toEqual([
      "Community rules",
      "Subscribers",
      "Quote",
      "FAQ",
    ]);
  });

  it("choosing a section calls on_add_section, not on_add, and closes the menu", async () => {
    const on_add = vi.fn();
    const on_add_section = vi.fn();
    await open_menu({ on_add, on_add_section });
    click(menu_items()[3]);
    expect(on_add_section).toHaveBeenCalledExactlyOnceWith("faq");
    expect(on_add).not.toHaveBeenCalled();
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("choosing a component still calls on_add only", async () => {
    const on_add = vi.fn();
    const on_add_section = vi.fn();
    await open_menu({ on_add, on_add_section });
    click(menu_items()[0]);
    expect(on_add).toHaveBeenCalledExactlyOnceWith("communityRules");
    expect(on_add_section).not.toHaveBeenCalled();
  });

  it("arrow keys cross from components into sections and wrap; Home/End reach both ends", async () => {
    await open_menu();
    const menu = document.querySelector('[role="menu"]')!;
    key(menu, "ArrowDown");
    key(menu, "ArrowDown");
    expect(document.activeElement?.textContent).toBe("Quote");
    key(menu, "ArrowDown");
    key(menu, "ArrowDown");
    expect(document.activeElement?.textContent).toBe("Community rules");
    key(menu, "ArrowUp");
    expect(document.activeElement?.textContent).toBe("FAQ");
    key(menu, "ArrowUp");
    key(menu, "ArrowUp");
    expect(document.activeElement?.textContent).toBe("Subscribers");
    key(menu, "End");
    expect(document.activeElement?.textContent).toBe("FAQ");
    key(menu, "Home");
    expect(document.activeElement?.textContent).toBe("Community rules");
  });

  it("Enter on a focused section item adds it", async () => {
    const on_add_section = vi.fn();
    await open_menu({ on_add_section });
    key(document.querySelector('[role="menu"]')!, "End");
    // Native buttons turn Enter into a click; jsdom does not, so the click stands in for it.
    click(document.activeElement!);
    expect(on_add_section).toHaveBeenCalledExactlyOnceWith("faq");
  });

  it("with sections only the trigger is enabled, there is no separator and focus starts on the first section", async () => {
    await open_menu({ items: [] });
    const trigger = document.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="menu"]',
    )!;
    expect(trigger.disabled).toBe(false);
    expect(document.querySelector('[role="separator"]')).toBeNull();
    expect(document.activeElement?.textContent).toBe("Quote");
  });
});

describe("EditableSection add menu", () => {
  function mount_section(
    add_items?: typeof ITEMS,
    on_add?: (id: string) => void,
  ) {
    return mount(() => (
      <EditableSection
        section_id={SECTION_ID}
        slot="sidebar-left"
        element_count={0}
        add_items={add_items}
        on_add={on_add}
      >
        <p>content</p>
      </EditableSection>
    ));
  }

  function gear_of(root: HTMLElement): HTMLButtonElement {
    return root.querySelector<HTMLButtonElement>(
      `[data-section-gear="${SECTION_ID}"]`,
    )!;
  }

  it("renders '+' next to the section gear in the same chrome container", () => {
    const root = mount_section(ITEMS);
    const gear = gear_of(root);
    const trigger = trigger_of(root)!;
    const toolbar = gear.parentElement!;
    expect(toolbar.hasAttribute("data-canvas-chrome")).toBe(true);
    const add_root = trigger.closest("[data-canvas-chrome]")!;
    expect(add_root.parentElement).toBe(toolbar);
    expect(add_root.nextElementSibling).toBe(gear);
    expect(trigger.getAttribute("aria-label")).toContain("Add component to");
  });

  it("without add_items there is no '+'", () => {
    const root = mount_section();
    expect(gear_of(root)).not.toBeNull();
    expect(trigger_of(root)).toBeNull();
  });

  it("opening the menu and choosing an item neither selects the section nor opens SectionPopover", async () => {
    const on_add = vi.fn();
    const root = mount_section(ITEMS, on_add);
    click(trigger_of(root)!);
    await flush();
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(is_selected(SECTION_ID, null)).toBe(false);
    expect(selection()).toBeNull();
    expect(is_popover_open()).toBe(false);
    expect(gear_of(root).getAttribute("aria-expanded")).toBe("false");

    click(menu_items()[0]);
    expect(on_add).toHaveBeenCalledExactlyOnceWith("communityRules");
    expect(selection()).toBeNull();
    expect(is_popover_open()).toBe(false);
  });
});
