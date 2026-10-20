// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, describe, expect, it, vi } from "vitest";

// jsdom has no ResizeObserver; dnd-kit (imported through the canvas) needs one at import.
vi.hoisted(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

// lucide-solid runs client-only code at import; the icons are irrelevant here.
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

// The native Popover API shell is covered elsewhere; here only the toggles inside it matter.
vi.mock("../../src/components/admin/canvas/popovers/PopoverShell", () => ({
  slot_label: (slot: string) => slot,
  PopoverShell: (props: { children?: unknown }) => props.children,
}));
vi.mock("../../src/components/admin/canvas/popovers/PostCardPopover", () => ({
  BackToSection: () => null,
}));

import { render as solid_render } from "solid-js/web";
import type { Component, JSX } from "solid-js";
import {
  CanvasCommunityElement,
  HIDDEN_ELEMENT_LABEL,
  community_element_empty_label,
  community_element_has_data,
  is_canvas_community_element,
} from "../../src/components/admin/canvas/EditorCanvas";
import { EditableElement } from "../../src/components/admin/canvas/EditableElement";
import { CommunitySidebarPopover } from "../../src/components/admin/canvas/popovers/CommunitySidebarPopover";
import { CommunitySidebar } from "../../src/components/community/CommunitySidebar";
import {
  CommunityDescriptionBlock,
  CommunityLanguageBlock,
  CommunityRulesBlock,
  CommunityTeamBlock,
} from "../../src/components/community/blocks";
import {
  flushPendingSettings,
  settings,
  updateSettingsImmediate,
} from "../../src/components/admin/queries";
import {
  defaultSettings,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import type { HiveCommunity } from "../../src/lib/types/community";

const FULL = {
  description: "About us",
  flag_text: "Be nice\nNo spam",
  team: [
    ["alice", "owner", ""],
    ["bob", "mod", ""],
  ],
  lang: "pl",
} as unknown as HiveCommunity;

const EMPTY = {
  description: "",
  flag_text: "",
  team: [],
  lang: "",
} as unknown as HiveCommunity;

type BlockComponent = Component<{
  community: HiveCommunity;
  locale?: string;
  show?: boolean;
}>;

const BLOCKS: ReadonlyArray<
  [string, BlockComponent, keyof SettingsData, string]
> = [
  [
    "communityDescription",
    CommunityDescriptionBlock,
    "community_show_description",
    "Opis",
  ],
  ["communityRules", CommunityRulesBlock, "community_show_rules", "Zasady"],
  ["communityTeam", CommunityTeamBlock, "community_show_leadership", "Zespół"],
  [
    "communityLanguage",
    CommunityLanguageBlock,
    "community_show_language",
    "Język",
  ],
];

const FLAGS = [
  "community_show_description",
  "community_show_rules",
  "community_show_leadership",
  "community_show_language",
] as const;

const disposers: Array<() => void> = [];

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
  flushPendingSettings();
  updateSettingsImmediate(
    Object.fromEntries(FLAGS.map((flag) => [flag, true])),
  );
});

function render(view: () => JSX.Element): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  disposers.push(solid_render(view, container));
  return container;
}

function blog(overrides: Partial<SettingsData> = {}): SettingsData {
  return { ...defaultSettings, locale: "pl", ...overrides } as SettingsData;
}

function canvas_element(
  element_id: string,
  community: HiveCommunity,
  element_settings: SettingsData,
): HTMLDivElement {
  return render(() => (
    <EditableElement
      section_id="sidebar-right"
      slot="sidebar-right"
      element_id={element_id}
      index={() => 0}
      count={() => 1}
      is_mock={false}
      has_data={community_element_has_data(
        element_id,
        community,
        element_settings,
      )}
      empty_label={community_element_empty_label(element_id, element_settings)}
    >
      <CanvasCommunityElement
        element_id={element_id}
        community={community}
        settings={element_settings}
      />
    </EditableElement>
  ));
}

const chrome_text = (root: Element) =>
  root.querySelector("[data-canvas-chrome]")?.textContent ?? "";

const content_of = (root: Element) =>
  root.querySelector("[data-canvas-element] > div:last-child")!;

describe("canvas renders community elements like the public page", () => {
  it.each(BLOCKS)(
    "%s uses the public block with the blog locale",
    (element_id, Block, _flag, pl_heading) => {
      expect(is_canvas_community_element(element_id)).toBe(true);
      const canvas = render(() => (
        <CanvasCommunityElement
          element_id={element_id}
          community={FULL}
          settings={blog()}
        />
      ));
      const ssr = render(() => <Block community={FULL} locale="pl" />);
      expect(canvas.innerHTML).not.toBe("");
      expect(canvas.innerHTML).toBe(ssr.innerHTML);
      expect(canvas.querySelector("h3")?.textContent).toBe(pl_heading);
    },
  );

  it("passes the blog locale and flags to the aggregate sidebar", () => {
    const element_settings = blog({ community_show_rules: false });
    const canvas = render(() => (
      <CanvasCommunityElement
        element_id="communitySidebar"
        community={FULL}
        settings={element_settings}
      />
    ));
    const ssr = render(() => (
      <CommunitySidebar community={FULL} locale="pl" show_rules={false} />
    ));
    expect(canvas.innerHTML).toBe(ssr.innerHTML);
    expect(
      [...canvas.querySelectorAll("h3")].map((h) => h.textContent),
    ).toEqual(["Opis", "Zespół", "Język"]);
  });

  it("leaves other elements to the shared ElementRenderer", () => {
    expect(is_canvas_community_element("communityProfile")).toBe(false);
    expect(is_canvas_community_element("posts")).toBe(false);
  });
});

describe("empty or hidden community element chip", () => {
  it.each(BLOCKS)(
    "%s without data shows 'No data' only in the chrome",
    (element_id) => {
      const root = canvas_element(element_id, EMPTY, blog());
      expect(chrome_text(root)).toMatch(/· No data$/);
      expect(content_of(root).innerHTML).toBe("");
    },
  );

  it.each(BLOCKS)(
    "%s with its flag off shows the hidden hint only in the chrome",
    (element_id, _block, flag) => {
      const root = canvas_element(
        element_id,
        FULL,
        blog({ [flag]: false } as Partial<SettingsData>),
      );
      expect(chrome_text(root)).toMatch(`· ${HIDDEN_ELEMENT_LABEL}`);
      expect(content_of(root).textContent).toBe("");
      expect(content_of(root).textContent).not.toContain(HIDDEN_ELEMENT_LABEL);
    },
  );

  it("a visible block keeps the plain label", () => {
    const root = canvas_element("communityRules", FULL, blog());
    expect(chrome_text(root)).not.toContain("·");
    expect(content_of(root).querySelectorAll("li")).toHaveLength(2);
  });

  it("aggregate sidebar is hidden only with every flag off", () => {
    const all_off = blog(
      Object.fromEntries(
        FLAGS.map((flag) => [flag, false]),
      ) as Partial<SettingsData>,
    );
    expect(
      chrome_text(canvas_element("communitySidebar", FULL, all_off)),
    ).toContain(HIDDEN_ELEMENT_LABEL);
    expect(
      community_element_has_data(
        "communitySidebar",
        FULL,
        blog({ community_show_rules: false }),
      ),
    ).toBe(true);
    expect(
      chrome_text(canvas_element("communitySidebar", EMPTY, blog())),
    ).toMatch(/· No data$/);
  });

  it("no community counts as no data", () => {
    expect(community_element_has_data("communityRules", null, blog())).toBe(
      false,
    );
  });
});

function popover(element_id: string): HTMLDivElement {
  return render(() => (
    <CommunitySidebarPopover
      section_id="sidebar-right"
      element_id={element_id}
      slot="sidebar-right"
      anchor={undefined}
      on_close={() => {}}
    />
  ));
}

const checkboxes = (root: Element) => [
  ...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
];

// The popover writes through the debounced updateSettings.
const flag_values = () => {
  flushPendingSettings();
  return FLAGS.map((flag) => settings[flag] !== false);
};

describe("community popover toggles", () => {
  it.each(BLOCKS)(
    "%s popover shows and changes only its own flag",
    (element_id, _block, flag) => {
      const root = popover(element_id);
      const boxes = checkboxes(root);
      expect(boxes).toHaveLength(1);
      expect(boxes[0]!.checked).toBe(true);

      boxes[0]!.click();

      expect(flag_values().filter((value) => !value)).toHaveLength(1);
      expect(settings[flag]).toBe(false);
    },
  );

  it("aggregate sidebar popover keeps all four toggles", () => {
    const root = popover("communitySidebar");
    const boxes = checkboxes(root);
    expect(boxes).toHaveLength(4);
    expect(
      [...root.querySelectorAll("label")].map(
        (label) => label.querySelector("span span")?.textContent,
      ),
    ).toEqual(["Description", "Rules", "Team", "Language"]);

    boxes[3]!.click();

    expect(flag_values()).toEqual([true, true, true, false]);
  });
});
