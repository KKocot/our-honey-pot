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
import { EditableElement } from "../../../src/components/admin/canvas/EditableElement";
import { EditableSection } from "../../../src/components/admin/canvas/EditableSection";
import {
  clear_selection,
  is_selected,
} from "../../../src/components/admin/canvas/selection";

const SECTION_ID = "page-sec-left";
const ELEMENT_ID = "communityRules";
const disposers: Array<() => void> = [];

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  clear_selection();
  document.body.innerHTML = "";
});

function mount_section(): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  disposers.push(
    solid_render(
      () => (
        <EditableSection
          section_id={SECTION_ID}
          slot="sidebar-left"
          element_count={1}
          add_items={[{ id: "subscribers", label: "Subscribers" }]}
          on_add={() => {}}
        >
          <EditableElement
            section_id={SECTION_ID}
            slot="sidebar-left"
            element_id={ELEMENT_ID}
            index={() => 0}
            count={() => 1}
            is_mock={false}
            has_data={true}
          >
            <p>content</p>
          </EditableElement>
        </EditableSection>
      ),
      container,
    ),
  );
  return container;
}

function z_index_of(element: Element): number {
  const token = [...element.classList].find((name) => /^z-\d+$/.test(name));
  if (!token) throw new Error(`no z-index class on ${element.outerHTML}`);
  return Number(token.slice(2));
}

describe("EditableSection stacking", () => {
  it("keeps the section chrome and its '+' menu above a selected element of the section", () => {
    const root = mount_section();
    const wrapper = root.querySelector<HTMLElement>(
      `[data-element-id="${ELEMENT_ID}"]`,
    )!;
    wrapper
      .querySelector("p")!
      .dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    expect(is_selected(SECTION_ID, ELEMENT_ID)).toBe(true);

    const section = wrapper.parentElement!;
    const section_chrome = section.querySelector(
      ":scope > [data-canvas-chrome]",
    )!;
    expect(
      section_chrome.querySelector('button[aria-haspopup="menu"]'),
    ).not.toBeNull();
    expect(z_index_of(wrapper)).toBe(20);
    expect(z_index_of(section_chrome)).toBeGreaterThan(z_index_of(wrapper));
  });

  it("reserves the toolbar band, so the first sidebar element chip ends before the section toolbar", () => {
    const root = mount_section();
    const chip_box = root.querySelector(
      `[data-element-id="${ELEMENT_ID}"] > [data-canvas-chrome]`,
    )!;
    expect(chip_box.classList.contains("right-46")).toBe(true);
    expect(chip_box.classList.contains("right-0")).toBe(false);
  });
});
