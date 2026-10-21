// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { SidePanel } from "../../src/components/admin/panels/AdminPanel/SidePanel";
import type {
  EditorMode,
  EditorPanelTab,
} from "../../src/components/admin/editor-state";

const STORAGE_KEY = "ohp-admin-side-panel";

let dispose: (() => void) | undefined;
let container: HTMLDivElement;

function mount() {
  const [panel_tab, set_panel_tab] = createSignal<EditorPanelTab>("templates");
  const [mode] = createSignal<EditorMode>("design");
  dispose = render(
    () => (
      <SidePanel
        state={{ panel_tab, set_panel_tab, mode }}
        open
        on_open_change={() => {}}
        templates={<p>templates body</p>}
        theme={<p>theme body</p>}
        site={<p>site body</p>}
      />
    ),
    container,
  );
  return { panel_tab };
}

const tabs = () =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
const selected_label = () =>
  tabs()
    .find((tab) => tab.getAttribute("aria-selected") === "true")
    ?.textContent?.trim();

function press(key: string) {
  const active = tabs().find(
    (tab) => tab.getAttribute("aria-selected") === "true",
  )!;
  active.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  container.remove();
  vi.unstubAllGlobals();
});

describe("SidePanel tabs", () => {
  it("renders exactly Templates, Theme and Site", () => {
    mount();
    expect(tabs().map((tab) => tab.textContent?.trim())).toEqual([
      "Templates",
      "Theme",
      "Site",
    ]);
  });

  it.each([
    ["layout", "Site"],
    ["content", "Site"],
    ["style", "Theme"],
    ["theme", "Theme"],
    ["x", "Templates"],
  ])("restores stored tab %s as %s", (stored, label) => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tab: stored, scroll: { style: 120, layout: 40 } }),
    );
    expect(() => mount()).not.toThrow();
    expect(selected_label()).toBe(label);
  });

  it("falls back to Templates on invalid JSON without throwing", () => {
    sessionStorage.setItem(STORAGE_KEY, "{not json");
    expect(() => mount()).not.toThrow();
    expect(selected_label()).toBe("Templates");
  });

  it("drops scroll positions saved for legacy tabs", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tab: "style",
        scroll: { style: 120, layout: 40, templates: 8 },
      }),
    );
    mount();
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!);
    expect(stored.tab).toBe("theme");
    expect(stored.scroll).toEqual({ templates: 8 });
  });

  it("cycles through the three tabs with arrows, Home and End", () => {
    const { panel_tab } = mount();
    press("ArrowRight");
    expect(panel_tab()).toBe("theme");
    press("ArrowRight");
    expect(panel_tab()).toBe("site");
    press("ArrowRight");
    expect(panel_tab()).toBe("templates");
    press("ArrowLeft");
    expect(panel_tab()).toBe("site");
    press("ArrowUp");
    expect(panel_tab()).toBe("theme");
    press("ArrowDown");
    expect(panel_tab()).toBe("site");
    press("Home");
    expect(panel_tab()).toBe("templates");
    press("End");
    expect(panel_tab()).toBe("site");
    expect(document.activeElement?.textContent?.trim()).toBe("Site");
  });

  it("mounts a tab body only after its first visit", () => {
    mount();
    expect(container.textContent).toContain("templates body");
    expect(container.textContent).not.toContain("site body");
    press("End");
    expect(container.textContent).toContain("site body");
    press("Home");
    expect(container.textContent).toContain("site body");
  });

  it("lays the tabs out as a three-column bar with a top border on mobile", () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: true,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    mount();
    const classes = container
      .querySelector('[role="tablist"]')
      ?.getAttribute("class")
      ?.split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining(["grid", "grid-cols-3", "border-t"]),
    );
  });
});
