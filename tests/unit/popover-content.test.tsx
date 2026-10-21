// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no ResizeObserver (dnd-kit needs one at import), no Popover API (PopoverHost opens one) and no matchMedia (Popover placement).
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
import type { JSX } from "solid-js";
import { EditableElement } from "../../src/components/admin/canvas/EditableElement";
import { PopoverHost } from "../../src/components/admin/canvas/PopoverHost";
import {
  BLOCK_VISIBILITY_NOTE,
  CommunitySidebarPopover,
} from "../../src/components/admin/canvas/popovers/CommunitySidebarPopover";
import {
  FOOTER_MISSING_NOTE,
  HomeSectionContentTab,
  OPEN_FOOTER_SETTINGS_LABEL,
  OPEN_POSTS_SETTINGS_LABEL,
  PRIVACY_WARNING,
} from "../../src/components/admin/canvas/popovers/HomeSectionPopover";
import { PostsPopover } from "../../src/components/admin/canvas/popovers/PostsPopover";
import { SectionPopover } from "../../src/components/admin/canvas/popovers/SectionPopover";
import {
  clear_selection,
  find_instance_anchors,
  is_popover_open,
  selection,
} from "../../src/components/admin/canvas/selection";
import {
  getSettingsSnapshot,
  updateSettingsImmediate,
} from "../../src/components/admin/queries";
import type { HomeSection } from "../../src/components/admin/types/settings";
import { get_section_definition } from "../../src/shared/components/sections/registry";

const MAIN = "page-sec-main";
const POSTS_SECTION: HomeSection = {
  id: "posts001",
  type: "posts",
  content: {},
  style: { width: "content", spacing: "md", bg: "none", overlay: "dark-50" },
};

const disposers: Array<() => void> = [];

beforeEach(() => {
  updateSettingsImmediate({
    postsLayout: "grid",
    community_show_rules: true,
    home: { sections: [POSTS_SECTION] },
  });
});

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  clear_selection();
  document.body.innerHTML = "";
});

function mount(view: () => JSX.Element): void {
  const container = document.createElement("div");
  document.body.append(container);
  disposers.push(solid_render(view, container));
}

function tab(name: string): HTMLButtonElement {
  const found = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ].find((el) => el.textContent === name);
  if (!found) throw new Error(`no tab ${name}`);
  return found;
}

function panel_text(): string {
  return document.querySelector('[role="tabpanel"]')?.textContent ?? "";
}

function mount_posts(comments_view = false): void {
  mount(() => (
    <PostsPopover
      section_id={MAIN}
      element_id="posts"
      slot="main"
      anchor={undefined}
      on_close={() => {}}
      comments_view={comments_view}
    />
  ));
}

describe("posts popover: List and Card tabs", () => {
  it("opens on List with list controls only", () => {
    mount_posts();
    expect(tab("List").getAttribute("aria-selected")).toBe("true");
    expect(
      document.querySelector('[role="tablist"]')?.getAttribute("aria-label"),
    ).toBe("Posts settings");
    const text = panel_text();
    expect(text).toContain("Card gap");
    expect(text).toContain("Columns");
    expect(text).toContain("Posts per page");
    expect(text).toContain("Masonry");
    expect(text).toContain("Pinned posts");
    expect(text).not.toContain("Thumbnail size");
    expect(text).not.toContain("structure");
  });

  it("Card holds the post card controls, not the list ones", () => {
    mount_posts();
    tab("Card").click();
    expect(tab("Card").getAttribute("aria-selected")).toBe("true");
    const text = panel_text();
    expect(text).toContain("Thumbnail size");
    expect(text).not.toContain("Card gap");
    expect(text).not.toContain("Pinned posts");
  });

  it("follows the comments view on the Card tab", () => {
    mount_posts(true);
    tab("Card").click();
    const text = panel_text();
    expect(text).toContain("Comment card");
    expect(text).toContain("Comment padding");
    expect(text).not.toContain("Thumbnail size");
  });

  it("moves between tabs with the arrow keys", () => {
    mount_posts();
    tab("List").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(tab("Card").getAttribute("aria-selected")).toBe("true");
    expect(tab("Card").tabIndex).toBe(0);
    expect(tab("List").tabIndex).toBe(-1);
    tab("Card").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(tab("List").getAttribute("aria-selected")).toBe("true");
  });

  it("End and Home jump to the last and the first tab", () => {
    mount_posts();
    const end = new KeyboardEvent("keydown", {
      key: "End",
      bubbles: true,
      cancelable: true,
    });
    tab("List").dispatchEvent(end);
    expect(end.defaultPrevented).toBe(true);
    expect(tab("Card").getAttribute("aria-selected")).toBe("true");
    expect(tab("Card").tabIndex).toBe(0);

    tab("Card").dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
    expect(tab("Card").getAttribute("aria-selected")).toBe("true");

    tab("Card").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
    expect(tab("List").getAttribute("aria-selected")).toBe("true");
    expect(tab("List").tabIndex).toBe(0);
  });

  it("has no back link to the section popover", () => {
    mount_posts();
    expect(document.body.textContent).not.toContain("Back to");
  });
});

describe("section popover", () => {
  it("lists no elements, only its sidebar controls", () => {
    mount(() => (
      <SectionPopover
        section_id={MAIN}
        slot="main"
        anchor={undefined}
        on_close={() => {}}
      />
    ));
    expect(document.body.textContent).not.toContain("Elements");
    expect(document.body.textContent).toContain("Sidebars");
  });
});

describe("home posts section: link to the posts popover", () => {
  it("opens the Posts element popover from the section Content tab", () => {
    const definition = get_section_definition("posts");
    if (!definition) throw new Error("no posts definition");
    mount(() => (
      <>
        <EditableElement
          section_id={MAIN}
          slot="main"
          element_id="posts"
          index={() => 0}
          count={() => 1}
          is_mock={false}
          has_data
        >
          <p>posts</p>
        </EditableElement>
        <HomeSectionContentTab
          section={POSTS_SECTION}
          definition={definition}
        />
        <PopoverHost />
      </>
    ));
    const button = [...document.querySelectorAll("button")].find(
      (el) => el.textContent === OPEN_POSTS_SETTINGS_LABEL,
    );
    if (!button) throw new Error("no open posts settings button");
    button.click();

    expect(selection()).toMatchObject({
      section_id: MAIN,
      element_id: "posts",
      slot: "main",
    });
    const anchors = find_instance_anchors(MAIN, "posts");
    expect(selection()?.anchor_el).toBe(anchors?.anchor_el);
    expect(selection()?.position_el).toBe(anchors?.position_el);
    expect(anchors?.position_el).toBe(
      document.querySelector('[data-element-id="posts"]'),
    );
    expect(is_popover_open()).toBe(true);
    expect(tab("List")).toBeTruthy();
  });

  it("does nothing while the posts element is not on the canvas", () => {
    const definition = get_section_definition("posts");
    if (!definition) throw new Error("no posts definition");
    mount(() => (
      <HomeSectionContentTab section={POSTS_SECTION} definition={definition} />
    ));
    [...document.querySelectorAll("button")]
      .find((el) => el.textContent === OPEN_POSTS_SETTINGS_LABEL)
      ?.click();
    expect(selection()).toBeNull();
    expect(is_popover_open()).toBe(false);
  });
});

describe("call-to-action privacy warning: link to the footer popover", () => {
  const CTA_BAND: HomeSection = {
    id: "ctaband1",
    type: "cta-band",
    content: {
      title: "Join",
      button: { label: "Subscribe", url: "https://example.com" },
      consent_mode: "notice",
    },
    style: {
      width: "content",
      spacing: "md",
      bg: "none",
      overlay: "dark-50",
      variant: "band",
      align: "center",
    },
  };
  const BOTTOM = "page-sec-bottom";

  function place_footer(state: "active" | "hidden" | "removed"): void {
    const snapshot = getSettingsSnapshot();
    const config = JSON.parse(JSON.stringify(snapshot.pageLayoutConfig));
    for (const container of Object.values(config.containers) as Array<{
      elements: Array<{ id: string; active: boolean }>;
    }>) {
      container.elements = container.elements.filter(
        (element) => element.id !== "footer",
      );
    }
    if (state !== "removed") {
      config.containers.bottom.elements.push({
        id: "footer",
        active: state === "active",
      });
    }
    updateSettingsImmediate({
      pageLayoutConfig: config,
      footer: { ...snapshot.footer, privacy: undefined },
      home: { sections: [CTA_BAND] },
    });
  }

  function mount_warning(with_footer_element: boolean): void {
    const definition = get_section_definition("cta-band");
    if (!definition) throw new Error("no cta-band definition");
    mount(() => (
      <>
        {with_footer_element ? (
          <EditableElement
            section_id={BOTTOM}
            slot="bottom"
            element_id="footer"
            index={() => 0}
            count={() => 1}
            is_mock={false}
            has_data
          >
            <p>footer</p>
          </EditableElement>
        ) : null}
        <HomeSectionContentTab section={CTA_BAND} definition={definition} />
        <PopoverHost />
      </>
    ));
  }

  function footer_button(): HTMLButtonElement | undefined {
    return [...document.querySelectorAll("button")].find(
      (el) => el.textContent === OPEN_FOOTER_SETTINGS_LABEL,
    );
  }

  function warning(): Element | null {
    return document.querySelector('[role="note"]');
  }

  it("opens the footer popover when the footer is on the page", () => {
    place_footer("active");
    mount_warning(true);
    expect(warning()?.textContent).toContain(PRIVACY_WARNING);
    expect(warning()?.textContent).not.toContain(FOOTER_MISSING_NOTE);
    const button = footer_button();
    if (!button) throw new Error("no open footer settings button");
    button.click();

    expect(selection()).toMatchObject({
      section_id: BOTTOM,
      element_id: "footer",
      slot: "bottom",
    });
    expect(is_popover_open()).toBe(true);
    expect(document.body.textContent).toContain("Privacy policy");
  });

  it.each(["hidden", "removed"] as const)(
    "promises no footer settings while the footer is %s",
    (state) => {
      place_footer(state);
      mount_warning(false);
      expect(warning()?.textContent).toContain(PRIVACY_WARNING);
      expect(warning()?.textContent).toContain(FOOTER_MISSING_NOTE);
      expect(footer_button()).toBeUndefined();
      expect(selection()).toBeNull();
    },
  );
});

describe("community sidebar popover", () => {
  function mount_block(element_id: string): void {
    mount(() => (
      <CommunitySidebarPopover
        section_id="page-sec-sidebar-right"
        element_id={element_id}
        slot="sidebar-right"
        anchor={undefined}
        on_close={() => {}}
      />
    ));
  }

  function checkboxes(): HTMLInputElement[] {
    return [
      ...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ];
  }

  it("a single block shows one visibility checkbox without the Global group header", () => {
    mount_block("communityRules");
    expect(checkboxes()).toHaveLength(1);
    expect(document.querySelector("h3")).toBeNull();
    expect(document.body.textContent).not.toContain("Changes every instance");
    expect(document.body.textContent).toContain(BLOCK_VISIBILITY_NOTE);
    expect(document.body.textContent).not.toContain("Back to");

    const checkbox = checkboxes()[0];
    expect(checkbox.checked).toBe(true);
    checkbox.click();
    expect(getSettingsSnapshot().community_show_rules).toBe(false);
  });

  it("the legacy aggregate sidebar keeps its four global toggles", () => {
    mount_block("communitySidebar");
    expect(checkboxes()).toHaveLength(4);
    expect(document.querySelector("h3")?.textContent).toBe("Global");
  });
});
