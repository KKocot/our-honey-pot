// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  compute_beside_position,
  type BesidePosition,
  type Rect,
  type Size,
} from "../../src/components/ui/popover-position";

const VIEWPORT: Size = { width: 1280, height: 800 };
const PANEL: Size = { width: 320, height: 400 };
const SPACING = { gap: 8, margin: 8 };
const DOCK: BesidePosition = { visible: true, left: 1280 - 8 - 320, top: 8 };

function rect(left: number, top: number, width: number, height: number): Rect {
  return { left, top, right: left + width, bottom: top + height };
}

function intersects(
  anchor: Rect,
  position: BesidePosition,
  panel: Size,
): boolean {
  return (
    position.left < anchor.right &&
    position.left + panel.width > anchor.left &&
    position.top < anchor.bottom &&
    position.top + panel.height > anchor.top
  );
}

function within_viewport(
  position: BesidePosition,
  panel: Size,
  viewport: Size,
): boolean {
  return (
    position.left >= SPACING.margin &&
    position.top >= SPACING.margin &&
    position.left + panel.width <= viewport.width - SPACING.margin &&
    position.top + panel.height <= viewport.height - SPACING.margin
  );
}

describe("compute_beside_position", () => {
  it("prefers the right side, aligned with the anchor top", () => {
    const anchor = rect(100, 120, 400, 200);
    const position = compute_beside_position(anchor, PANEL, VIEWPORT, SPACING);
    expect(position).toEqual({ visible: true, left: 508, top: 120 });
    expect(intersects(anchor, position, PANEL)).toBe(false);
  });

  it("falls back to the left side when the right one has no room (sidebar at the right edge)", () => {
    const anchor = rect(1000, 200, 260, 300);
    const position = compute_beside_position(anchor, PANEL, VIEWPORT, SPACING);
    expect(position.left).toBe(1000 - 8 - 320);
    expect(intersects(anchor, position, PANEL)).toBe(false);
    expect(within_viewport(position, PANEL, VIEWPORT)).toBe(true);
  });

  it("goes below a full-width anchor, clamped into the viewport", () => {
    const anchor = rect(0, 40, 1280, 200);
    const position = compute_beside_position(anchor, PANEL, VIEWPORT, SPACING);
    expect(position).toEqual({ visible: true, left: 8, top: 248 });
    expect(intersects(anchor, position, PANEL)).toBe(false);
    expect(within_viewport(position, PANEL, VIEWPORT)).toBe(true);
  });

  it("goes above a full-width anchor near the viewport bottom", () => {
    const anchor = rect(0, 600, 1280, 150);
    const position = compute_beside_position(anchor, PANEL, VIEWPORT, SPACING);
    expect(position.top).toBe(600 - 8 - 400);
    expect(intersects(anchor, position, PANEL)).toBe(false);
  });

  it("docks at the right viewport edge when no side has room (wide and tall anchor)", () => {
    const anchor = rect(0, -200, 1280, 1400);
    const position = compute_beside_position(anchor, PANEL, VIEWPORT, SPACING);
    expect(position).toEqual(DOCK);
  });

  it("clamps the side panel vertically when the anchor is taller than the viewport", () => {
    const anchor = rect(100, -500, 600, 2000);
    const position = compute_beside_position(anchor, PANEL, VIEWPORT, SPACING);
    expect(position).toEqual({ visible: true, left: 708, top: 8 });
    expect(within_viewport(position, PANEL, VIEWPORT)).toBe(true);
  });

  it("keeps a right panel inside the viewport for an anchor near the bottom", () => {
    const anchor = rect(100, 700, 300, 80);
    const position = compute_beside_position(anchor, PANEL, VIEWPORT, SPACING);
    expect(position.left).toBe(400 + 8);
    expect(position.top).toBe(800 - 8 - 400);
    expect(intersects(anchor, position, PANEL)).toBe(false);
  });

  it("works on scaled-down rects (canvas zoom 0.5 reports viewport px)", () => {
    const anchor = rect(300, 100, 450, 300);
    const position = compute_beside_position(anchor, PANEL, VIEWPORT, SPACING);
    expect(position.left).toBe(750 + 8);
    expect(intersects(anchor, position, PANEL)).toBe(false);
  });

  it("hides the panel while the anchor is scrolled out of the viewport and shows it once it is back", () => {
    for (const away of [
      rect(100, -400, 300, 200),
      rect(100, 900, 300, 200),
      rect(-500, 100, 300, 200),
      rect(1400, 100, 300, 200),
    ]) {
      expect(
        compute_beside_position(away, PANEL, VIEWPORT, SPACING).visible,
      ).toBe(false);
    }
    const partly_back = rect(100, -150, 300, 200);
    expect(
      compute_beside_position(partly_back, PANEL, VIEWPORT, SPACING).visible,
    ).toBe(true);
  });

  it("never covers the anchor while any side has room", () => {
    for (let left = 0; left <= 1200; left += 100) {
      for (let width = 80; left + width <= 1280; width += 200) {
        const anchor = rect(left, 300, width, 200);
        const position = compute_beside_position(
          anchor,
          PANEL,
          VIEWPORT,
          SPACING,
        );
        if (position.top !== DOCK.top || position.left !== DOCK.left) {
          expect(intersects(anchor, position, PANEL)).toBe(false);
        }
      }
    }
  });
});
