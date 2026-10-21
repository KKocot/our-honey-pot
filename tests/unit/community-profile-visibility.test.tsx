// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no Popover API (PopoverShell opens one) and no matchMedia (Popover placement).
vi.hoisted(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  HTMLElement.prototype.showPopover ??= () => {};
  HTMLElement.prototype.hidePopover ??= () => {};
  window.matchMedia ??= (query: string) =>
    ({
      matches: true,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
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
import type { ComponentProps, JSX } from "solid-js";
import { CommunityProfile } from "../../src/components/community/CommunityProfile";
import { CommunityProfilePopover } from "../../src/components/admin/canvas/popovers/CommunityProfilePopover";
import {
  getSettingsSnapshot,
  updateSettingsImmediate,
} from "../../src/components/admin/queries";
import { parse_settings_graceful } from "../../src/components/admin/types/settings-schema";
import {
  COMMUNITY_SETTINGS_KEYS,
  defaultSettings,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import {
  HIDDEN_ELEMENT_LABEL,
  community_element_empty_label,
  community_element_has_data,
} from "../../src/components/admin/canvas/EditorCanvas";
import { EditableElement } from "../../src/components/admin/canvas/EditableElement";
import { slot_element_renders } from "../../src/components/community/sidebar-blocks";
import type { HiveCommunity } from "../../src/lib/types/community";

const COMMUNITY = {
  name: "hive-174578",
  title: "OCD",
  about: "Original content curation",
  subscribers: 12_345,
  num_authors: 321,
  sum_pending: 987,
} as unknown as HiveCommunity;

const VISIBILITY_KEYS = [
  "community_show_avatar",
  "community_show_name",
  "community_show_handle",
  "community_show_about",
  "community_show_subscribers",
  "community_show_authors",
  "community_show_pending",
] as const satisfies ReadonlyArray<keyof SettingsData>;

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

type ProfileProps = Partial<ComponentProps<typeof CommunityProfile>>;

function mount_profile(props: ProfileProps = {}): HTMLElement {
  return mount(() => <CommunityProfile community={COMMUNITY} {...props} />);
}

function stats(root: HTMLElement): HTMLElement | null {
  return root.querySelector('[data-testid="community-profile-stats"]');
}

describe("community profile visibility flags: config", () => {
  it("are optional: a config without them parses to no flags", () => {
    const parsed = parse_settings_graceful({
      community_show_subscribers: true,
    });
    for (const key of VISIBILITY_KEYS.filter(
      (key) => key !== "community_show_subscribers",
    )) {
      expect(parsed).not.toHaveProperty(key);
    }
  });

  it("keep saved booleans and drop non-boolean values", () => {
    const parsed = parse_settings_graceful({
      community_show_avatar: false,
      community_show_pending: false,
      community_show_handle: "no",
    });
    expect(parsed.community_show_avatar).toBe(false);
    expect(parsed.community_show_pending).toBe(false);
    expect(parsed).not.toHaveProperty("community_show_handle");
  });

  it("are community-only keys", () => {
    for (const key of VISIBILITY_KEYS) {
      expect(COMMUNITY_SETTINGS_KEYS).toContain(key);
    }
  });
});

describe("community profile: render", () => {
  it("renders every part without flags, same markup as with all flags on", () => {
    const plain = mount_profile();
    const all_on = mount_profile(
      Object.fromEntries(
        [
          "show_avatar",
          "show_name",
          "show_handle",
          "show_about",
          "show_subscribers",
          "show_authors",
          "show_pending",
        ].map((key) => [key, true]),
      ),
    );
    expect(plain.innerHTML).toBe(all_on.innerHTML);
    expect(plain.querySelector("img")?.getAttribute("width")).toBe("48");
    expect(plain.querySelector("h2")?.textContent).toBe("OCD");
    const handle = [...plain.querySelectorAll("p")].find(
      (el) => el.textContent === "hive-174578",
    );
    expect(handle?.className).toBe("text-text-muted text-xs mt-0.5");
    expect(plain.textContent).toContain("Original content curation");
    expect(stats(plain)?.className).toBe("px-4 pb-4 flex gap-4 text-sm");
    expect(stats(plain)?.textContent).toBe(
      "12.3KSubscribers321Authors$987Pending",
    );
  });

  it.each([
    ["show_avatar", (root: HTMLElement) => root.querySelector("img")],
    ["show_name", (root: HTMLElement) => root.querySelector("h2")],
    [
      "show_handle",
      (root: HTMLElement) =>
        [...root.querySelectorAll("p")].find(
          (el) => el.textContent === "hive-174578",
        ) ?? null,
    ],
    [
      "show_about",
      (root: HTMLElement) =>
        [...root.querySelectorAll("p")].find((el) =>
          el.textContent?.includes("Original content"),
        ) ?? null,
    ],
  ] as const)("%s=false hides its part", (flag, find) => {
    const root = mount_profile({ [flag]: false });
    expect(find(root)).toBeNull();
    expect(stats(root)).not.toBeNull();
  });

  it.each([
    ["show_subscribers", "Subscribers"],
    ["show_authors", "Authors"],
    ["show_pending", "Pending"],
  ] as const)("%s=false hides the %s counter only", (flag, label) => {
    const root = mount_profile({ [flag]: false });
    const row = stats(root)?.textContent ?? "";
    expect(row).not.toContain(label);
    expect(row.length).toBeGreaterThan(0);
  });

  it("drops the stats row when all three counters are off", () => {
    const root = mount_profile({
      show_subscribers: false,
      show_authors: false,
      show_pending: false,
    });
    expect(stats(root)).toBeNull();
    expect(root.textContent).not.toContain("Authors");
  });

  it("drops the header row when avatar, name and handle are off", () => {
    const root = mount_profile({
      show_avatar: false,
      show_name: false,
      show_handle: false,
    });
    const card = root.firstElementChild;
    expect(card?.firstElementChild?.tagName).toBe("P");
    expect(card?.firstElementChild?.classList.contains("pt-4")).toBe(true);
  });

  it("pads the stats row from the top when it is the only part", () => {
    const root = mount_profile({
      show_avatar: false,
      show_name: false,
      show_handle: false,
      show_about: false,
    });
    expect(root.firstElementChild?.children).toHaveLength(1);
    expect(stats(root)?.classList.contains("pt-4")).toBe(true);
  });
});

const ALL_OFF = Object.fromEntries(
  VISIBILITY_KEYS.map((key) => [key, false]),
) as Partial<SettingsData>;

const NO_DATA = {
  ...COMMUNITY,
  about: "",
  sum_pending: 0,
} as unknown as HiveCommunity;

function blog(overrides: Partial<SettingsData> = {}): SettingsData {
  return { ...defaultSettings, ...overrides } as SettingsData;
}

describe("community profile with every part off", () => {
  const only_about_and_pending = blog({
    ...ALL_OFF,
    community_show_about: true,
    community_show_pending: true,
  });

  it("renders no card", () => {
    const root = mount_profile({
      show_avatar: false,
      show_name: false,
      show_handle: false,
      show_about: false,
      show_subscribers: false,
      show_authors: false,
      show_pending: false,
    });
    expect(root.innerHTML).toBe("");
  });

  it("renders no card when only data-less parts stay on", () => {
    const root = mount(() => (
      <CommunityProfile
        community={NO_DATA}
        show_avatar={false}
        show_name={false}
        show_handle={false}
        show_subscribers={false}
        show_authors={false}
      />
    ));
    expect(root.innerHTML).toBe("");
  });

  it("is dropped by the SSR slot filter", () => {
    expect(
      slot_element_renders("communityProfile", COMMUNITY, false, blog()),
    ).toBe(true);
    expect(
      slot_element_renders("communityProfile", COMMUNITY, false, blog(ALL_OFF)),
    ).toBe(false);
    expect(
      slot_element_renders("communityProfile", null, true, blog(ALL_OFF)),
    ).toBe(false);
    expect(slot_element_renders("communityProfile", null, true, blog())).toBe(
      true,
    );
    expect(
      slot_element_renders(
        "communityProfile",
        NO_DATA,
        false,
        only_about_and_pending,
      ),
    ).toBe(false);
    expect(
      slot_element_renders(
        "communityProfile",
        COMMUNITY,
        false,
        only_about_and_pending,
      ),
    ).toBe(true);
  });

  it("shows a one-line hidden placeholder in the canvas", () => {
    const element_settings = blog(ALL_OFF);
    expect(
      community_element_has_data("communityProfile", COMMUNITY, blog()),
    ).toBe(true);
    expect(
      community_element_has_data(
        "communityProfile",
        NO_DATA,
        only_about_and_pending,
      ),
    ).toBe(false);
    expect(
      community_element_empty_label("communityProfile", only_about_and_pending),
    ).toBeUndefined();
    const root = mount(() => (
      <EditableElement
        section_id="sidebar-right"
        slot="sidebar-right"
        element_id="communityProfile"
        index={() => 0}
        count={() => 1}
        is_mock={false}
        has_data={community_element_has_data(
          "communityProfile",
          COMMUNITY,
          element_settings,
        )}
        empty_label={community_element_empty_label(
          "communityProfile",
          element_settings,
        )}
      >
        <CommunityProfile
          community={COMMUNITY}
          show_avatar={false}
          show_name={false}
          show_handle={false}
          show_about={false}
          show_subscribers={false}
          show_authors={false}
          show_pending={false}
        />
      </EditableElement>
    ));
    expect(root.querySelector("[data-canvas-chrome]")?.textContent).toContain(
      `· ${HIDDEN_ELEMENT_LABEL}`,
    );
    expect(
      root.querySelector("[data-canvas-element] > div:last-child")?.innerHTML,
    ).toBe("");
  });
});

describe("community profile popover: global visibility toggles", () => {
  beforeEach(() => {
    updateSettingsImmediate(
      Object.fromEntries(VISIBILITY_KEYS.map((key) => [key, undefined])),
    );
  });

  function global_group(): HTMLElement {
    const heading = [...document.querySelectorAll("h3")].find(
      (el) => el.textContent === "Global",
    );
    const group = heading?.closest("section");
    if (!group) throw new Error("no Global group");
    return group;
  }

  function checkboxes(): HTMLInputElement[] {
    return [
      ...global_group().querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]',
      ),
    ];
  }

  function mount_popover(): void {
    mount(() => (
      <CommunityProfilePopover
        section_id="page-sec-2"
        element_id="communityProfile"
        slot="sidebar-left"
        anchor={undefined}
        on_close={() => {}}
      />
    ));
  }

  it("lists seven checked toggles in the Global group", () => {
    mount_popover();
    expect(global_group().textContent).toContain("Changes every instance");
    const labels = checkboxes().map(
      (input) =>
        input.parentElement?.querySelector(".font-medium")?.textContent,
    );
    expect(labels).toEqual([
      "Avatar",
      "Name",
      "Handle",
      "Description",
      "Subscriber count",
      "Authors count",
      "Pending payout",
    ]);
    expect(checkboxes().every((input) => input.checked)).toBe(true);
  });

  it("each toggle writes its own flag", () => {
    mount_popover();
    checkboxes().forEach((input, index) => {
      input.click();
      expect(getSettingsSnapshot()[VISIBILITY_KEYS[index]]).toBe(false);
      expect(input.checked).toBe(false);
    });
    checkboxes()[0].click();
    expect(getSettingsSnapshot().community_show_avatar).toBe(true);
  });
});
