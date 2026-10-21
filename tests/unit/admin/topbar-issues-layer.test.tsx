// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, describe, expect, it, vi } from "vitest";

const show_popover = vi.hoisted(() => {
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
  window.matchMedia ??= ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  const shown = new WeakSet<Element>();
  const show = function (this: HTMLElement) {
    shown.add(this);
  };
  HTMLElement.prototype.showPopover = show;
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    shown.delete(this);
  };
  const matches = Element.prototype.matches;
  Element.prototype.matches = function (this: Element, selector: string) {
    if (selector === ":popover-open") return shown.has(this);
    return matches.call(this, selector);
  };
  return { is_shown: (element: Element) => shown.has(element) };
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
import {
  EditorTopBar,
  SaveErrorList,
  type SaveIssue,
} from "../../../src/components/admin/panels/AdminPanel/EditorTopBar";
import { FillInNotice } from "../../../src/components/admin/canvas/home-sections/HomeSectionsStack";
import type { CanvasDataState } from "../../../src/components/admin/canvas/use_canvas_data";

const SECTION_CHROME_Z = 30;
const OVERLAY_SIDE_PANEL_Z = 40;
const TOAST_Z = 50;
const disposers: Array<() => void> = [];

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
});

function mount(view: () => unknown): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  disposers.push(solid_render(view as never, container));
  return container;
}

function z_index_of(element: Element): number {
  const token = [...element.classList].find((name) => /^z-\d+$/.test(name));
  if (!token) throw new Error(`no z-index class on ${element.outerHTML}`);
  return Number(token.slice(2));
}

function issues_trigger(root: HTMLElement): HTMLButtonElement {
  const trigger = [...root.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("issue"),
  );
  if (!trigger) throw new Error("no issues trigger");
  return trigger;
}

describe("Save issues panel layer", () => {
  it("opens the issues panel in the top layer, outside the top bar stacking context", () => {
    const issues: SaveIssue[] = [
      { message: "Hero needs content", open: () => {} },
      { message: "About needs content", open: () => {} },
    ];
    const root = mount(() => <SaveErrorList issues={issues} />);
    const trigger = issues_trigger(root);
    expect(trigger.textContent).toContain("2 issues");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    trigger.click();

    const panel = document.getElementById(
      trigger.getAttribute("aria-controls")!,
    )!;
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(panel.getAttribute("popover")).toBe("manual");
    expect(show_popover.is_shown(panel)).toBe(true);
    expect(root.contains(panel)).toBe(false);
    expect(panel.textContent).toContain("Fix before saving");
    expect(panel.textContent).toContain("About needs content");
  });

  it("closes the panel and opens the chosen issue", () => {
    const open = vi.fn();
    const root = mount(() => (
      <SaveErrorList issues={[{ message: "Hero needs content", open }]} />
    ));
    const trigger = issues_trigger(root);
    trigger.click();
    const panel = document.getElementById(
      trigger.getAttribute("aria-controls")!,
    )!;

    [...panel.querySelectorAll("button")]
      .find((button) => button.textContent === "Hero needs content")!
      .click();

    expect(open).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(show_popover.is_shown(panel)).toBe(false);
  });

  it("closes the panel on Escape", () => {
    const root = mount(() => (
      <SaveErrorList
        issues={[{ message: "Hero needs content", open: () => {} }]}
      />
    ));
    const trigger = issues_trigger(root);
    trigger.click();
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("Top bar and canvas stacking", () => {
  it("stacks the top bar above canvas chrome and the overlay side panel, below the toast", () => {
    const canvas_data = {
      mode: "live",
      source: "live",
      is_loading: false,
      mock_reason: null,
      set_mode: () => {},
    } as unknown as CanvasDataState;
    const root = mount(() => (
      <EditorTopBar
        active_tab="design"
        on_tab_change={() => {}}
        show_moderation={false}
        canvas_data={canvas_data}
        is_owner={false}
        on_login={() => {}}
        on_logout={() => {}}
      />
    ));
    const header = root.querySelector("header")!;
    expect(z_index_of(header)).toBeGreaterThan(SECTION_CHROME_Z);
    expect(z_index_of(header)).toBeGreaterThan(OVERLAY_SIDE_PANEL_Z);
    expect(z_index_of(header)).toBeLessThan(TOAST_Z);
  });

  it("keeps the fill-in notice at or below section chrome", () => {
    const root = mount(() => <FillInNotice on_edit={() => {}} />);
    const notice = root.querySelector("[data-fill-in-notice]")!;
    expect(z_index_of(notice)).toBeLessThanOrEqual(SECTION_CHROME_Z);
  });
});
