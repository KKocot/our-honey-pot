// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import { parse_settings_graceful } from "../../src/components/admin/types/settings-schema";
import {
  COMMUNITY_BLOCK_ELEMENT_IDS,
  LAYOUT_ELEMENT_IDS,
} from "../../src/components/admin/types/layout";

const empty = { elements: [] };

function layout_with(
  containers: Record<string, unknown>,
  template = "sidebar-right",
) {
  return {
    pageLayoutConfig: {
      template,
      containers: {
        top: empty,
        sidebarLeft: empty,
        sidebarRight: empty,
        bottom: empty,
        ...containers,
      },
    },
  };
}

function read_layout(raw: Record<string, unknown>) {
  return parse_settings_graceful(raw).pageLayoutConfig as
    | {
        template: string;
        containers: Record<
          string,
          { elements: Array<{ id: string; active: boolean }> }
        >;
      }
    | undefined;
}

describe("pageLayoutConfig tolerant reader", () => {
  it("drops only the unknown element and keeps the rest of the layout", () => {
    const layout = read_layout(
      layout_with({
        top: { elements: [{ id: "header", active: true }] },
        sidebarRight: {
          elements: [
            { id: "authorProfile", active: false },
            { id: "xyz", active: true },
            { id: "footer", active: true },
          ],
        },
      }),
    );

    expect(layout?.template).toBe("sidebar-right");
    expect(layout?.containers.top.elements).toEqual([
      { id: "header", active: true },
    ]);
    expect(layout?.containers.sidebarRight.elements).toEqual([
      { id: "authorProfile", active: false },
      { id: "footer", active: true },
    ]);
  });

  it("drops elements with a malformed active flag or a non-object entry", () => {
    const layout = read_layout(
      layout_with({
        bottom: {
          elements: [
            null,
            "footer",
            { id: "header", active: "yes" },
            { id: "footer", active: true },
          ],
        },
      }),
    );

    expect(layout?.containers.bottom.elements).toEqual([
      { id: "footer", active: true },
    ]);
  });

  it("still rejects a layout with an unknown template or a non-array container", () => {
    expect(read_layout(layout_with({}, "three-columns"))).toBeUndefined();
    expect(
      read_layout(layout_with({ top: { elements: "header" } })),
    ).toBeUndefined();
  });

  it("reads only a bounded window of a hostile 10k element list", () => {
    let id_reads = 0;
    const hostile = Array.from({ length: 10_000 }, () => ({
      get id() {
        id_reads += 1;
        return "xyz";
      },
      active: true,
    }));
    hostile.push({ id: "header", active: true } as (typeof hostile)[number]);

    const layout = read_layout(
      layout_with({ sidebarLeft: { elements: hostile } }),
    );

    expect(layout?.containers.sidebarLeft.elements).toEqual([]);
    expect(id_reads).toBeGreaterThan(0);
    expect(id_reads).toBeLessThanOrEqual(LAYOUT_ELEMENT_IDS.length * 4 * 2);
  });

  it("caps kept elements per container", () => {
    const many = Array.from({ length: 50 }, () => ({
      id: "header",
      active: true,
    }));

    const layout = read_layout(layout_with({ top: { elements: many } }));

    expect(layout?.containers.top.elements).toHaveLength(
      LAYOUT_ELEMENT_IDS.length,
    );
  });

  it("expands legacy communitySidebar into the four blocks next to a dropped element", () => {
    const layout = read_layout(
      layout_with({
        sidebarRight: {
          elements: [
            { id: "communityProfile", active: true },
            { id: "xyz", active: true },
            { id: "communitySidebar", active: false },
          ],
        },
      }),
    );

    expect(layout?.containers.sidebarRight.elements).toEqual([
      { id: "communityProfile", active: true },
      ...COMMUNITY_BLOCK_ELEMENT_IDS.map((id) => ({ id, active: false })),
    ]);
  });
});
