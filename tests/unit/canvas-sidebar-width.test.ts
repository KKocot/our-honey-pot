// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/components/admin/queries", () => ({
  settings: {},
  is_community_mode: () => true,
  apply_layout_op: vi.fn(),
  useHivePreviewQuery: vi.fn(),
}));

vi.mock("lucide-solid", () => ({ FlaskConical: () => null, RotateCw: () => null }));
vi.mock("../../src/shared/components/solid/SectionRenderer", () => ({ SectionRenderer: () => null }));
vi.mock("../../src/shared/components/solid/ElementRenderer", () => ({ OwnerNavBar: () => null }));
vi.mock("../../src/components/community/CommunityContent", () => ({ CommunityContent: () => null }));
vi.mock("../../src/components/ui", () => ({ Button: () => null, showToast: vi.fn() }));

import { canvas_sidebar_style } from "../../src/components/admin/canvas/EditorCanvas";
import { resolve_sidebar_width_px } from "../../src/lib/head-meta";

describe("canvas_sidebar_style", () => {
  it.each([
    [280, "280px"],
    [320.4, "320px"],
    [100, "200px"],
    [9000, "400px"],
    [Number.NaN, "280px"],
    ["300", "280px"],
    [undefined, "280px"],
  ])("%j -> %s", (raw, expected) => {
    expect(canvas_sidebar_style(raw)).toEqual({ "--sidebar-width": expected });
  });

  it("matches the public <aside> value from the shared resolver", () => {
    for (const raw of [150, 250, 333, 450]) {
      expect(canvas_sidebar_style(raw)["--sidebar-width"]).toBe(
        `${resolve_sidebar_width_px(raw)}px`,
      );
    }
  });
});
