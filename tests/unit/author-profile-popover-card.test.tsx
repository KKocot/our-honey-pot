// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no ResizeObserver (dnd-kit needs one at import), no Popover API and no matchMedia (Popover placement).
vi.hoisted(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
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
import { AuthorProfilePopover } from "../../src/components/admin/canvas/popovers/AuthorProfilePopover";
import {
  getSettingsSnapshot,
  updateSettingsImmediate,
} from "../../src/components/admin/queries";
import {
  authorProfileElementLabels,
  collectAllElementIds,
  type CardLayout,
} from "../../src/components/admin/types/layout";

const LAYOUT: CardLayout = {
  sections: [
    {
      id: "sec-1",
      orientation: "horizontal",
      children: [
        { type: "element", id: "avatar" },
        { type: "element", id: "username" },
      ],
    },
  ],
};

const disposers: Array<() => void> = [];

beforeEach(() => {
  updateSettingsImmediate({
    authorProfileLayout2: structuredClone(LAYOUT),
    instanceOverrides: {},
  });
  const container = document.createElement("div");
  document.body.append(container);
  disposers.push(
    solid_render(
      () => (
        <AuthorProfilePopover
          section_id="page-sec-sidebar-left"
          element_id="authorProfile"
          slot="sidebar-left"
          anchor={undefined}
          on_close={() => {}}
        />
      ),
      container,
    ),
  );
});

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
});

function tab(name: string): HTMLButtonElement {
  const found = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ].find((el) => el.textContent === name);
  if (!found) throw new Error(`no tab ${name}`);
  return found;
}

function panel(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[role="tabpanel"]');
  if (!found) throw new Error("no tabpanel");
  return found;
}

function button(name: string): HTMLButtonElement {
  const found = [...panel().querySelectorAll<HTMLButtonElement>("button")].find(
    (el) => el.textContent === name || el.getAttribute("aria-label") === name,
  );
  if (!found) throw new Error(`no button ${name}`);
  return found;
}

function layout_ids(): string[] {
  const layout = getSettingsSnapshot().authorProfileLayout2;
  return layout ? collectAllElementIds(layout) : [];
}

describe("author profile popover: Sizes and Card tabs", () => {
  it("opens on Sizes with the presets and the size sliders", () => {
    expect(tab("Sizes").getAttribute("aria-selected")).toBe("true");
    expect(tab("Card").getAttribute("aria-selected")).toBe("false");
    expect(panel().getAttribute("aria-labelledby")).toBe(tab("Sizes").id);
    const text = panel().textContent ?? "";
    expect(text).toContain("Avatar size");
    expect(text).toContain("Username size");
    expect(text).not.toContain("Cover height");
    expect(
      panel().querySelector('[role="group"][aria-label="Profile presets"]'),
    ).not.toBeNull();
    expect(
      panel().querySelector('[aria-label="Profile card layout"]'),
    ).toBeNull();
    expect(text).not.toContain("structure");
  });

  it("applies a preset from the Sizes tab", () => {
    button("Minimal").click();
    expect(getSettingsSnapshot().authorAvatarSizePx).toBe(48);
    expect(layout_ids()).toEqual(["avatar", "username", "about"]);
    expect(button("Minimal").getAttribute("aria-pressed")).toBe("true");
  });

  it("Card renders the profile card structure editor bound to authorProfileLayout2", () => {
    tab("Card").click();
    expect(tab("Card").getAttribute("aria-selected")).toBe("true");
    expect(panel().getAttribute("aria-labelledby")).toBe(tab("Card").id);
    expect(
      panel().querySelector('[role="group"][aria-label="Profile card layout"]'),
    ).not.toBeNull();
    expect(panel().textContent).not.toContain("Avatar size");

    button(`Remove ${authorProfileElementLabels.avatar}`).click();
    expect(layout_ids()).toEqual(["username"]);
  });

  it("adds an element from the author profile ids on the Card tab", () => {
    tab("Card").click();
    const select = panel().querySelector<HTMLSelectElement>(
      'select[aria-label="Add element"]',
    );
    if (!select) throw new Error("no add element select");
    const offered = [...select.options].map((option) => option.value);
    expect(offered).toContain("coverImage");
    expect(offered).not.toContain("avatar");

    select.value = "about";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(layout_ids()).toEqual(["avatar", "username", "about"]);
  });

  it("moves between tabs with the arrow keys and Home/End", () => {
    tab("Sizes").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(tab("Card").getAttribute("aria-selected")).toBe("true");
    expect(tab("Card").tabIndex).toBe(0);
    expect(tab("Sizes").tabIndex).toBe(-1);

    tab("Card").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    expect(tab("Sizes").getAttribute("aria-selected")).toBe("true");

    const end = new KeyboardEvent("keydown", {
      key: "End",
      bubbles: true,
      cancelable: true,
    });
    tab("Sizes").dispatchEvent(end);
    expect(end.defaultPrevented).toBe(true);
    expect(tab("Card").getAttribute("aria-selected")).toBe("true");

    tab("Card").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
    expect(tab("Sizes").getAttribute("aria-selected")).toBe("true");
  });
});
