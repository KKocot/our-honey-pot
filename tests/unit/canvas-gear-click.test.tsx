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
  HTMLElement.prototype.showPopover ??= () => {};
  HTMLElement.prototype.hidePopover ??= () => {};
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
import type { JSX } from "solid-js";
import { EditableElement } from "../../src/components/admin/canvas/EditableElement";
import { EditableSection } from "../../src/components/admin/canvas/EditableSection";
import { DndRoot } from "../../src/components/admin/canvas/dnd/DndRoot";
import { HomeSectionsStack } from "../../src/components/admin/canvas/home-sections/HomeSectionsStack";
import { home_section_popover_key } from "../../src/components/admin/canvas/home-section-ops";
import { PopoverHost } from "../../src/components/admin/canvas/PopoverHost";
import {
  clear_selection,
  close_popover,
  find_instance_anchors,
  is_popover_open,
  is_selected,
  selection,
} from "../../src/components/admin/canvas/selection";
import {
  SECTION_STYLE_DEFAULTS,
  defaultSettings,
  type HomeSection,
  type SettingsData,
} from "../../src/components/admin/types/settings";

const SECTION_ID = "page-sec-main";
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

function element(
  element_id: string,
  children: JSX.Element,
  has_data = true,
): JSX.Element {
  return (
    <EditableElement
      section_id={SECTION_ID}
      slot="main"
      element_id={element_id}
      index={() => 0}
      count={() => 1}
      is_mock={false}
      has_data={has_data}
    >
      {children}
    </EditableElement>
  );
}

function wrapper_of(root: HTMLElement, element_id: string): HTMLElement {
  return root.querySelector<HTMLElement>(`[data-element-id="${element_id}"]`)!;
}

function gear_of(
  root: HTMLElement,
  element_id: string,
): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(
    `[data-element-gear="${element_id}"]`,
  );
}

function click(target: Element): void {
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

describe("EditableElement gear", () => {
  it("renders a gear only for registry elements with settings, also without data", () => {
    const root = mount(() => (
      <>
        {element("posts", <p>posts</p>)}
        {element("header", <p>header</p>, false)}
        {element("communityRules", <p>rules</p>)}
        {element("unknownBlock", <p>unknown</p>)}
      </>
    ));
    expect(gear_of(root, "posts")).not.toBeNull();
    expect(gear_of(root, "header")).not.toBeNull();
    expect(gear_of(root, "communityRules")).toBeNull();
    expect(gear_of(root, "unknownBlock")).toBeNull();
    expect(
      gear_of(root, "posts")!.closest("[data-canvas-chrome]"),
    ).not.toBeNull();
  });

  it("a click on a post card selects the element without opening its popover", () => {
    const root = mount(() =>
      element(
        "posts",
        <article>
          <a href="/post">Post title</a>
        </article>,
      ),
    );
    const link = root.querySelector("a")!;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(is_selected(SECTION_ID, "posts")).toBe(true);
    expect(is_popover_open()).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it("the gear toggles the popover placed beside the wrapper and focus returns to the gear", () => {
    const root = mount(() => element("posts", <article>Post</article>));
    const gear = gear_of(root, "posts")!;

    click(gear);
    expect(is_popover_open()).toBe(true);
    expect(selection()?.anchor_el).toBe(gear);
    expect(selection()?.position_el).toBe(wrapper_of(root, "posts"));
    expect(gear.getAttribute("aria-expanded")).toBe("true");

    close_popover();
    expect(is_popover_open()).toBe(false);
    expect(document.activeElement).toBe(gear);
    expect(is_selected(SECTION_ID, "posts")).toBe(true);

    click(gear);
    click(gear);
    expect(is_popover_open()).toBe(false);
  });

  it("Enter on the wrapper opens the popover, a later content click only keeps the selection", () => {
    const root = mount(() => element("posts", <article>Post</article>));
    const wrapper = wrapper_of(root, "posts");

    wrapper.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(is_popover_open()).toBe(true);
    expect(selection()?.anchor_el).toBe(gear_of(root, "posts"));
    expect(selection()?.position_el).toBe(wrapper);

    click(root.querySelector("article")!);
    expect(is_popover_open()).toBe(false);
    expect(is_selected(SECTION_ID, "posts")).toBe(true);
  });

  it("an element without a gear is anchored on its wrapper", () => {
    const root = mount(() => element("unknownBlock", <p>unknown</p>));
    const wrapper = wrapper_of(root, "unknownBlock");
    click(root.querySelector("p")!);
    expect(selection()?.anchor_el).toBe(wrapper);
    expect(selection()?.position_el).toBe(wrapper);
    expect(find_instance_anchors(SECTION_ID, "unknownBlock")).toEqual({
      anchor_el: wrapper,
      position_el: wrapper,
    });
  });

  it("an unselected gear is tappable on devices without hover", () => {
    const root = mount(() => element("posts", <p>posts</p>));
    const gear = gear_of(root, "posts")!;
    expect(is_selected(SECTION_ID, "posts")).toBe(false);
    expect(gear.classList).toContain(
      "[@media(hover:none)]:pointer-events-auto",
    );
    expect(gear.parentElement!.classList).toContain(
      "[@media(hover:none)]:opacity-100",
    );
  });

  it("find_instance_anchors returns the gear of an element that has one and its wrapper", () => {
    const root = mount(() => element("posts", <p>posts</p>));
    expect(find_instance_anchors(SECTION_ID, "posts")).toEqual({
      anchor_el: gear_of(root, "posts"),
      position_el: wrapper_of(root, "posts"),
    });
    expect(find_instance_anchors(SECTION_ID, "missing")).toBeNull();
  });
});

describe("element popover placement", () => {
  const WRAPPER_RECT = { top: 100, right: 400, bottom: 300, left: 100 };

  function stub_viewport(width: number, height: number): void {
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: width,
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      value: height,
    });
  }

  afterEach(() => {
    delete (document.documentElement as { clientWidth?: number }).clientWidth;
    delete (document.documentElement as { clientHeight?: number }).clientHeight;
    vi.unstubAllGlobals();
  });

  it("opens beside the wrapper rect, not on the gear; Escape returns focus to the gear", () => {
    stub_viewport(1200, 800);
    const root = mount(() => (
      <>
        {element("posts", <article>Post</article>)}
        <PopoverHost />
      </>
    ));
    const wrapper = wrapper_of(root, "posts");
    const gear = gear_of(root, "posts")!;
    wrapper.getBoundingClientRect = () =>
      ({ ...WRAPPER_RECT, width: 300, height: 200, x: 100, y: 100 }) as DOMRect;
    gear.getBoundingClientRect = () =>
      ({ top: 104, right: 130, bottom: 124, left: 110 }) as DOMRect;

    gear.focus();
    click(gear);
    const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(panel.style.left).toBe(`${WRAPPER_RECT.right + 8}px`);
    expect(panel.style.top).toBe(`${WRAPPER_RECT.top}px`);

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(is_popover_open()).toBe(false);
    expect(document.activeElement).toBe(gear);
  });

  it("follows the wrapper when its size changes while the popover is open", async () => {
    stub_viewport(1200, 800);
    let notify_resize = (): void => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notify_resize = callback;
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    const root = mount(() => (
      <>
        {element("posts", <article>Post</article>)}
        <PopoverHost />
      </>
    ));
    const wrapper = wrapper_of(root, "posts");
    let rect = { ...WRAPPER_RECT };
    wrapper.getBoundingClientRect = () => rect as DOMRect;

    click(gear_of(root, "posts")!);
    const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(panel.style.left).toBe("408px");

    rect = { ...WRAPPER_RECT, right: 600 };
    notify_resize();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(panel.style.left).toBe("608px");
  });

  it("hides the panel while the wrapper is scrolled out of the viewport, without closing it", async () => {
    stub_viewport(1200, 800);
    const root = mount(() => (
      <>
        {element("posts", <article>Post</article>)}
        <PopoverHost />
      </>
    ));
    const wrapper = wrapper_of(root, "posts");
    let rect = { ...WRAPPER_RECT };
    wrapper.getBoundingClientRect = () => rect as DOMRect;
    const next_frame = () =>
      new Promise((resolve) => requestAnimationFrame(resolve));

    click(gear_of(root, "posts")!);
    const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(panel.style.visibility).toBe("");

    rect = { top: -500, right: 400, bottom: -300, left: 100 };
    window.dispatchEvent(new Event("scroll"));
    await next_frame();
    expect(panel.style.visibility).toBe("hidden");
    expect(is_popover_open()).toBe(true);

    rect = { ...WRAPPER_RECT };
    window.dispatchEvent(new Event("scroll"));
    await next_frame();
    expect(panel.style.visibility).toBe("");
    expect(panel.style.left).toBe("408px");
  });
});

describe("popover light dismiss", () => {
  function pointer_down(target: Element): void {
    target.dispatchEvent(
      new Event("pointerdown", { bubbles: true, cancelable: true }),
    );
  }

  it("a pointerdown inside the wrapper but outside the panel and the gear closes the element popover; the gear still toggles", () => {
    const root = mount(() => (
      <>
        {element(
          "posts",
          <article>
            <button type="button" data-inner="">
              Inner
            </button>
          </article>,
        )}
        <PopoverHost />
      </>
    ));
    const gear = gear_of(root, "posts")!;

    click(gear);
    expect(is_popover_open()).toBe(true);
    pointer_down(root.querySelector("[data-inner]")!);
    expect(is_popover_open()).toBe(false);

    pointer_down(gear);
    click(gear);
    expect(is_popover_open()).toBe(true);
    pointer_down(document.querySelector('[role="dialog"]')!);
    expect(is_popover_open()).toBe(true);
    pointer_down(gear);
    click(gear);
    expect(is_popover_open()).toBe(false);
  });

  it("a pointerdown on the home section toolbar closes its popover; its gear still toggles", () => {
    const root = mount(() => (
      <DndRoot onDragEnd={() => {}}>
        <HomeSectionsStack
          view={() => ({
            ...defaultSettings,
            home: {
              sections: [
                {
                  id: "hero0001",
                  type: "hero",
                  content: { headline: "Welcome" },
                  style: {
                    ...SECTION_STYLE_DEFAULTS.common,
                    ...SECTION_STYLE_DEFAULTS.hero,
                  },
                } as HomeSection,
              ],
            },
          })}
          posts={<p>posts</p>}
          commit={() => false}
          undo_step={() => false}
          last_step={() => null}
        />
        <PopoverHost />
      </DndRoot>
    ));
    const gear = root.querySelector<HTMLButtonElement>(
      '[data-home-section-gear="hero0001"]',
    )!;
    const chrome = [
      ...root.querySelectorAll<HTMLElement>(
        '[data-home-section="hero0001"] [role="toolbar"] button',
      ),
    ].find((button) => button !== gear && !button.contains(gear));
    if (!chrome) throw new Error("no toolbar button besides the gear");

    click(gear);
    expect(is_popover_open()).toBe(true);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    pointer_down(chrome);
    expect(is_popover_open()).toBe(false);

    pointer_down(gear);
    click(gear);
    expect(is_popover_open()).toBe(true);
    pointer_down(gear);
    click(gear);
    expect(is_popover_open()).toBe(false);
  });
});

describe("EditableSection gear", () => {
  it("a click in the section gap selects it, the gear opens its popover", () => {
    const root = mount(() => (
      <EditableSection section_id={SECTION_ID} slot="main" element_count={0}>
        <p data-gap="">gap</p>
      </EditableSection>
    ));
    const gear = root.querySelector<HTMLButtonElement>(
      `[data-section-gear="${SECTION_ID}"]`,
    )!;

    click(root.querySelector("[data-gap]")!);
    expect(is_selected(SECTION_ID, null)).toBe(true);
    expect(is_popover_open()).toBe(false);

    click(gear);
    expect(is_popover_open()).toBe(true);
    expect(selection()?.anchor_el).toBe(gear);
    expect(selection()?.position_el).toBe(root.querySelector('[role="group"]'));
  });
});

describe("HomeSectionsStack gear", () => {
  const common = SECTION_STYLE_DEFAULTS.common;
  const sections: HomeSection[] = [
    {
      id: "hero0001",
      type: "hero",
      content: { headline: "Welcome to the hive" },
      style: { ...common, ...SECTION_STYLE_DEFAULTS.hero },
    } as HomeSection,
    {
      id: "posts001",
      type: "posts",
      content: {},
      style: { ...common },
    } as HomeSection,
  ];
  const view = (): SettingsData => ({
    ...defaultSettings,
    home: { sections },
  });

  function mount_stack(): HTMLElement {
    return mount(() => (
      <DndRoot onDragEnd={() => {}}>
        <HomeSectionsStack
          view={view}
          posts={<p data-posts="">posts</p>}
          commit={() => false}
          undo_step={() => false}
          last_step={() => null}
        />
      </DndRoot>
    ));
  }

  it("every section renders a gear, the posts section included", () => {
    const root = mount_stack();
    expect(
      root.querySelector('[data-home-section-gear="hero0001"]'),
    ).not.toBeNull();
    expect(
      root.querySelector('[data-home-section-gear="posts001"]'),
    ).not.toBeNull();
  });

  it("an unselected section toolbar is visible and tappable on devices without hover", () => {
    const root = mount_stack();
    const toolbar = root.querySelector<HTMLElement>(
      '[data-home-section="hero0001"] [role="toolbar"]',
    )!;
    expect(toolbar.classList).toContain("pointer-events-none");
    expect(toolbar.classList).toContain(
      "[@media(hover:none)]:pointer-events-auto",
    );
    expect(toolbar.classList).toContain("[@media(hover:none)]:opacity-100");
  });

  it("a click on section content selects it; the gear opens the popover", () => {
    const root = mount_stack();
    const content = root.querySelector<HTMLElement>(
      '[data-home-section="hero0001"] [data-home-section-content]',
    )!;
    click(content.firstElementChild ?? content);
    expect(is_selected(home_section_popover_key("hero0001"), null)).toBe(true);
    expect(is_popover_open()).toBe(false);

    const gear = root.querySelector<HTMLButtonElement>(
      '[data-home-section-gear="posts001"]',
    )!;
    click(gear);
    expect(is_selected(home_section_popover_key("posts001"), null)).toBe(true);
    expect(is_popover_open()).toBe(true);
    expect(selection()?.anchor_el).toBe(gear);
    expect(selection()?.position_el).toBe(
      root.querySelector('[data-home-section="posts001"]'),
    );
    expect(gear.getAttribute("aria-expanded")).toBe("true");
  });
});
