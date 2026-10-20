// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, describe, expect, it } from "vitest";
import { render as solid_render } from "solid-js/web";
import type { JSX } from "solid-js";
import { ElementRenderer } from "../../src/shared/components/solid/ElementRenderer";
import { COMMUNITY_BLOCK_ELEMENT_IDS } from "../../src/components/admin/types/layout";
import type { PageSlotPosition } from "../../src/components/admin/types/layout";
import type { SettingsData } from "../../src/components/admin/types/settings";
import { slot_element_renders } from "../../src/components/community/sidebar-blocks";
import type { HiveCommunity } from "../../src/lib/types/community";

const FULL = {
  description: "About us",
  flag_text: "Be nice",
  team: [["alice", "owner", ""]],
  lang: "pl",
} as unknown as HiveCommunity;

const EMPTY = {
  description: "",
  flag_text: "",
  team: [],
  lang: "",
} as unknown as HiveCommunity;

const LABELS = {
  communityDescription: ["Description", "Opis", "community_show_description"],
  communityRules: ["Rules", "Zasady", "community_show_rules"],
  communityTeam: ["Team", "Zespół", "community_show_leadership"],
  communityLanguage: ["Language", "Język", "community_show_language"],
} as const;

const SLOTS: PageSlotPosition[] = [
  "top",
  "sidebar-left",
  "sidebar-right",
  "bottom",
];

const disposers: Array<() => void> = [];

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
});

function render(view: () => JSX.Element): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  disposers.push(solid_render(view, container));
  return container;
}

function settings(extra: Partial<SettingsData> = {}): SettingsData {
  return { locale: "en", ...extra } as SettingsData;
}

function headings(root: Element): string[] {
  return [...root.querySelectorAll("h3")].map((h) => h.textContent ?? "");
}

function render_element(
  element_id: string,
  community: HiveCommunity | null,
  instance_settings: SettingsData,
  slot: PageSlotPosition = "sidebar-left",
): HTMLDivElement {
  return render(() => (
    <ElementRenderer
      elementId={element_id}
      community={community}
      settings={instance_settings}
      slot={slot}
    />
  ));
}

describe.each(COMMUNITY_BLOCK_ELEMENT_IDS)("%s element", (element_id) => {
  const [en_label, pl_label, flag] = LABELS[element_id];

  it.each(SLOTS)("renders its block in the %s container", (slot) => {
    const root = render_element(element_id, FULL, settings(), slot);
    expect(headings(root)).toEqual([en_label]);
  });

  it("uses the blog locale for its label", () => {
    expect(
      headings(render_element(element_id, FULL, settings({ locale: "pl" }))),
    ).toEqual([pl_label]);
  });

  it("renders nothing when its toggle is off", () => {
    const root = render_element(
      element_id,
      FULL,
      settings({ [flag]: false } as Partial<SettingsData>),
    );
    expect(root.innerHTML).toBe("");
  });

  it("renders nothing without community data", () => {
    expect(render_element(element_id, EMPTY, settings()).innerHTML).toBe("");
    expect(render_element(element_id, null, settings()).innerHTML).toBe("");
  });
});

describe("communitySidebar element", () => {
  it("localizes every block label for the pl blog", () => {
    expect(
      headings(
        render_element("communitySidebar", FULL, settings({ locale: "pl" })),
      ),
    ).toEqual(["Opis", "Zasady", "Zespół", "Język"]);
  });

  it("keeps English for the en blog", () => {
    expect(
      headings(render_element("communitySidebar", FULL, settings())),
    ).toEqual(["Description", "Rules", "Team", "Language"]);
  });
});

const block_renders = (
  element_id: string,
  community: HiveCommunity | null,
  instance_settings: SettingsData,
  community_failed = false,
): boolean =>
  slot_element_renders(
    element_id,
    community,
    community_failed,
    instance_settings,
  );

describe("SSR slot filter (slot_element_renders)", () => {
  const PAGE_ELEMENTS = [
    "header",
    "navigation",
    "posts",
    "authorProfile",
    "communityProfile",
    "comments",
    "footer",
  ];

  it("keeps every non-community element on a blog without community", () => {
    for (const element_id of PAGE_ELEMENTS) {
      expect(block_renders(element_id, null, settings())).toBe(true);
    }
  });

  it("keeps every non-community element when the community fetch failed", () => {
    for (const element_id of PAGE_ELEMENTS) {
      expect(block_renders(element_id, null, settings(), true)).toBe(true);
    }
  });

  it("drops single blocks without community data, even after a failed fetch", () => {
    for (const element_id of COMMUNITY_BLOCK_ELEMENT_IDS) {
      expect(block_renders(element_id, null, settings())).toBe(false);
      expect(block_renders(element_id, null, settings(), true)).toBe(false);
    }
  });

  it("keeps the aggregate sidebar loader only after a failed fetch", () => {
    expect(block_renders("communitySidebar", null, settings())).toBe(false);
    expect(block_renders("communitySidebar", null, settings(), true)).toBe(
      true,
    );
    expect(block_renders("communitySidebar", FULL, settings())).toBe(true);
    expect(block_renders("communitySidebar", EMPTY, settings())).toBe(false);
  });
});

describe("empty slot detection", () => {
  const all_off = settings({
    community_show_description: false,
    community_show_rules: false,
    community_show_leadership: false,
    community_show_language: false,
  });

  it("treats empty or disabled blocks as not rendering, matching the DOM", () => {
    for (const element_id of COMMUNITY_BLOCK_ELEMENT_IDS) {
      for (const [community, instance_settings] of [
        [EMPTY, settings()],
        [FULL, all_off],
      ] as const) {
        expect(block_renders(element_id, community, instance_settings)).toBe(
          false,
        );
        expect(
          render_element(element_id, community, instance_settings).innerHTML,
        ).toBe("");
      }
      expect(block_renders(element_id, FULL, settings())).toBe(true);
    }
  });
});
