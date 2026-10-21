// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, describe, expect, it } from "vitest";
import { render as solid_render } from "solid-js/web";
import type { JSX } from "solid-js";
import {
  AdminShellSkeleton,
  CanvasSkeleton,
} from "../../../src/components/admin/canvas/EditorSkeleton";

const disposers: Array<() => void> = [];

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
});

function mount(view: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  disposers.push(solid_render(view, container));
  return container;
}

describe("AdminShellSkeleton", () => {
  it("renders the fixed editor shell marked as a skeleton", () => {
    const container = mount(() => <AdminShellSkeleton />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.hasAttribute("data-admin-skeleton")).toBe(true);
    expect(root.classList).toContain("fixed");
    expect(root.classList).toContain("inset-0");
    expect(root.classList).toContain("z-50");
    expect(root.getAttribute("aria-busy")).toBe("true");
  });

  it("announces loading to screen readers", () => {
    const container = mount(() => <AdminShellSkeleton />);
    const status = container.querySelector('[role="status"]');

    expect(status?.classList).toContain("sr-only");
    expect(status?.textContent).toContain("Loading editor");
  });

  it("disables the pulse for reduced motion", () => {
    const container = mount(() => <AdminShellSkeleton />);
    const pulsing = container.querySelectorAll(".animate-pulse");

    expect(pulsing.length).toBeGreaterThan(0);
    pulsing.forEach((block) =>
      expect(block.classList).toContain("motion-reduce:animate-none"),
    );
  });
});

describe("CanvasSkeleton", () => {
  it.each([
    ["no-sidebar", false, false],
    ["sidebar-left", true, false],
    ["sidebar-right", false, true],
    ["both-sidebars", true, true],
  ] as const)("renders sidebars for %s", (template, left, right) => {
    const container = mount(() => (
      <CanvasSkeleton template={template} sidebar_style={{}} />
    ));

    expect(container.querySelector(".sidebar-left") !== null).toBe(left);
    expect(container.querySelector(".sidebar-right") !== null).toBe(right);
  });
});
