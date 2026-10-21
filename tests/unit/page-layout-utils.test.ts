// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  get_element_wrapper_class,
  get_section_wrapper_class,
  get_slot_container_class,
} from "../../src/shared/components/page-layout";
import {
  createHeaderData,
  renderHeader,
} from "../../src/shared/components/header";
import {
  createNavigationSettings,
  renderNavigation,
  renderNavigationButton,
  renderNavigationButtons,
  renderNavigationItem,
} from "../../src/shared/components/navigation";
import { renderFooter } from "../../src/shared/components/footer";
import { parse_fragment } from "./helpers/html-assert";

function classes(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

function root_classes(html: string): string[] {
  const root = parse_fragment(html).firstElementChild;
  expect(root).not.toBeNull();
  return Array.from(root!.classList);
}

const NAV_TABS = [
  { id: "posts", label: "Posts", enabled: true, showCount: false },
];

const DISABLED_ITEM = {
  id: "threads",
  label: "Threads",
  href: "/?tab=threads",
  disabled: true,
  tooltip: "Coming soon",
};

describe("element wrapper", () => {
  it("horizontal sections cap elements at the section width with a 16rem floor", () => {
    for (const slot of ["top", "bottom", "main", "sidebar-left"] as const) {
      const wrapper = classes(get_element_wrapper_class("horizontal", slot));
      expect(wrapper).toEqual(
        expect.arrayContaining(["min-w-[min(100%,16rem)]", "max-w-full"]),
      );
      expect(wrapper).not.toContain("min-w-0");
      expect(wrapper).not.toContain("flex-shrink-0");
      expect(wrapper).not.toContain("flex-1");
      expect(wrapper).not.toContain("w-full");
    }
  });

  it("vertical main/top/bottom elements span the full width", () => {
    for (const slot of ["main", "top", "bottom"] as const) {
      expect(get_element_wrapper_class("vertical", slot)).toBe(
        "w-full min-w-0",
      );
    }
  });

  it("sidebar elements keep their content width", () => {
    for (const slot of ["sidebar-left", "sidebar-right"] as const) {
      expect(get_element_wrapper_class("vertical", slot)).toBe("min-w-0");
    }
  });
});

describe("slot spacing", () => {
  it("horizontal slots wrap their elements", () => {
    expect(classes(get_slot_container_class("top", "horizontal"))).toEqual(
      expect.arrayContaining(["flex", "flex-wrap"]),
    );
  });

  it("vertical non-sidebar slots replace the former element margins with gap-6", () => {
    expect(classes(get_slot_container_class("main", "vertical"))).toContain(
      "gap-6",
    );
    expect(
      classes(get_slot_container_class("sidebar-right", "vertical")),
    ).toContain("gap-4");
  });

  it("top and bottom sections keep the former header/footer distance", () => {
    expect(get_section_wrapper_class("top")).toBe("mb-12");
    expect(get_section_wrapper_class("bottom")).toBe("mt-12");
  });
});

describe("element roots carry no outer margins", () => {
  it("header", () => {
    const html = renderHeader(
      createHeaderData("Ladies of Hive", "Long description"),
    );
    expect(root_classes(html)).not.toContain("mb-6");
  });

  it("navigation (links and buttons)", () => {
    const settings = createNavigationSettings({
      navigationTabs: NAV_TABS,
      activeTab: "posts",
    });
    expect(root_classes(renderNavigation(settings))).not.toContain("mb-6");
    expect(root_classes(renderNavigationButtons(settings))).not.toContain(
      "mb-6",
    );
  });

  it("footer", () => {
    expect(root_classes(renderFooter())).not.toContain("mt-6");
  });
});

describe("content stays inside the element", () => {
  it("header text breaks long words", () => {
    const root = parse_fragment(
      renderHeader(createHeaderData("A".repeat(200), "B".repeat(400))),
    );
    expect(root.querySelector("h1")!.classList).toContain("wrap-anywhere");
    expect(root.querySelector("p")!.classList).toContain("wrap-anywhere");
  });

  it("navigation tooltip sizes to its text and stays inside the bar", () => {
    for (const html of [
      renderNavigationItem(DISABLED_ITEM, false),
      renderNavigationButton(DISABLED_ITEM, false),
    ]) {
      const tooltip = parse_fragment(html).querySelector(
        "[data-tab='threads'] > span.absolute",
      );
      expect(tooltip).not.toBeNull();
      expect(tooltip!.classList).not.toContain("inset-x-0");
      expect(tooltip!.classList).not.toContain("whitespace-nowrap");
      expect(Array.from(tooltip!.classList)).toEqual(
        expect.arrayContaining([
          "w-max",
          "max-w-[min(16rem,100cqw)]",
          "[:first-child>&]:left-0",
          "[:last-child>&]:right-0",
        ]),
      );
    }
  });
});
