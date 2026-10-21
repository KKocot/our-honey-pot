// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, describe, expect, it, vi } from "vitest";

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

// The settings groups are covered by their own suites; here only their placement matters.
vi.mock("../../src/components/admin/settings/SiteSettings", () => ({
  SiteSettings: () => "site-settings-stub",
}));
vi.mock("../../src/components/admin/settings/PagesSettings", () => ({
  PagesSettings: () => "pages-settings-stub",
}));
vi.mock("../../src/components/admin/settings/SocialLinksSettings", () => ({
  SocialLinksSettings: () => "social-settings-stub",
}));

import { render as solid_render } from "solid-js/web";
import { SiteTab } from "../../src/components/admin/panels/AdminPanel/tabs/SiteTab";
import {
  getSettingsSnapshot,
  updateSettingsImmediate,
} from "../../src/components/admin/queries";
import {
  USER_CONTAINER_ELEMENT_IDS,
  USER_PAGE_ELEMENT_IDS,
  type PageLayoutConfig,
} from "../../src/components/admin/types/layout";

const SIDEBAR_ELEMENT = [...USER_CONTAINER_ELEMENT_IDS].find((id) =>
  USER_PAGE_ELEMENT_IDS.has(id),
)!;

let dispose: (() => void) | undefined;

function mount(): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  dispose = solid_render(() => <SiteTab />, container);
  return container;
}

function set_layout(
  template: PageLayoutConfig["template"],
  sidebar_right_active: boolean,
): void {
  updateSettingsImmediate({
    pageLayoutConfig: {
      template,
      containers: {
        top: { elements: [] },
        sidebarLeft: { elements: [] },
        sidebarRight: {
          elements: [{ id: SIDEBAR_ELEMENT, active: sidebar_right_active }],
        },
        bottom: { elements: [] },
      },
    } as PageLayoutConfig,
  });
}

function sidebar_switch(container: HTMLElement, label: string) {
  const button = container.querySelector<HTMLButtonElement>(
    `button[role="switch"][aria-label="${label}"]`,
  );
  if (!button) throw new Error(`no switch "${label}"`);
  return button;
}

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
});

describe("SiteTab groups", () => {
  it("renders Sidebars, Site, Pages and Social links in this order", () => {
    const container = mount();
    const titles = Array.from(container.querySelectorAll("section > h3")).map(
      (heading) => heading.textContent,
    );
    expect(titles).toEqual(["Sidebars", "Site", "Pages", "Social links"]);
  });

  it("has no posts list, card structure, pinned posts or community groups", () => {
    const text = mount().textContent ?? "";
    for (const removed of [
      "Posts list",
      "Post card",
      "Pinned posts",
      "Community",
    ]) {
      expect(text).not.toContain(removed);
    }
  });
});

describe("SiteTab sidebar switches", () => {
  it("blocks showing an empty sidebar and explains why", () => {
    set_layout("no-sidebar", true);
    const container = mount();
    const left = sidebar_switch(container, "Left sidebar");

    expect(left.disabled).toBe(true);
    expect(left.getAttribute("aria-checked")).toBe("false");
    const hint = document.getElementById(
      left.getAttribute("aria-describedby") ?? "",
    );
    expect(hint?.textContent).toContain("Move a section here");

    left.click();
    expect(getSettingsSnapshot().pageLayoutConfig?.template).toBe("no-sidebar");
  });

  it("treats a sidebar with only hidden elements as empty", () => {
    set_layout("no-sidebar", false);
    expect(sidebar_switch(mount(), "Right sidebar").disabled).toBe(true);
  });

  it("shows and hides a sidebar that has elements", () => {
    set_layout("no-sidebar", true);
    const container = mount();
    const right = sidebar_switch(container, "Right sidebar");

    expect(right.disabled).toBe(false);
    right.click();
    expect(right.getAttribute("aria-checked")).toBe("true");
    const shown = getSettingsSnapshot().pageLayoutConfig?.template;
    expect(shown).not.toBe("no-sidebar");

    right.click();
    expect(right.getAttribute("aria-checked")).toBe("false");
    expect(getSettingsSnapshot().pageLayoutConfig?.template).toBe("no-sidebar");
  });
});
