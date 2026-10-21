// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no ResizeObserver (dnd-kit needs one at import), no Popover API, no Web Animations API and no matchMedia.
vi.hoisted(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  HTMLElement.prototype.showPopover ??= () => {};
  HTMLElement.prototype.hidePopover ??= () => {};
  Document.prototype.getAnimations ??= () => [];
  Element.prototype.getAnimations ??= () => [];
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

const community = vi.hoisted(() => ({ mode: false }));
vi.mock("../../src/components/admin/queries", async (import_actual) => {
  const actual =
    await import_actual<typeof import("../../src/components/admin/queries")>();
  return { ...actual, is_community_mode: () => community.mode };
});

import { render as solid_render } from "solid-js/web";
import { PostsPopover } from "../../src/components/admin/canvas/popovers/PostsPopover";
import {
  flushPendingSettings,
  settings,
  updateSettingsImmediate,
} from "../../src/components/admin/queries";
import {
  collectAllElementIds,
  type CardLayout,
} from "../../src/components/admin/types/layout";

const POST_LAYOUT: CardLayout = {
  sections: [
    {
      id: "sec-post",
      orientation: "vertical",
      children: [
        { type: "element", id: "title" },
        { type: "element", id: "summary" },
      ],
    },
  ],
};

const COMMENT_LAYOUT: CardLayout = {
  sections: [
    {
      id: "sec-comment",
      orientation: "vertical",
      children: [
        { type: "element", id: "author" },
        { type: "element", id: "body" },
      ],
    },
  ],
};

const disposers: Array<() => void> = [];

beforeEach(() => {
  community.mode = false;
  updateSettingsImmediate({
    postsLayout: "grid",
    postCardLayout: structuredClone(POST_LAYOUT),
    commentCardLayout: structuredClone(COMMENT_LAYOUT),
  });
});

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
});

function mount_posts(comments_view = false): void {
  const container = document.createElement("div");
  document.body.append(container);
  disposers.push(
    solid_render(
      () => (
        <PostsPopover
          section_id="page-sec-main"
          element_id="posts"
          slot="main"
          anchor={undefined}
          on_close={() => {}}
          comments_view={comments_view}
        />
      ),
      container,
    ),
  );
}

function tab(name: string): HTMLButtonElement {
  const found = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ].find((el) => el.textContent === name);
  if (!found) throw new Error(`no tab ${name}`);
  return found;
}

function panel(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[role="tabpanel"]');
  if (!found) throw new Error("no tabpanel");
  return found;
}

function editor(label: string): HTMLElement | null {
  return panel().querySelector<HTMLElement>(
    `[role="group"][aria-label="${label}"]`,
  );
}

function click_button(root: HTMLElement, label: string): void {
  const button = root.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!button) throw new Error(`no button ${label}`);
  button.click();
}

function layout_switch(name: string): HTMLButtonElement {
  const found = [
    ...panel().querySelectorAll<HTMLButtonElement>(
      '[role="group"][aria-label="List layout"] button',
    ),
  ].find((el) => el.textContent === name);
  if (!found) throw new Error(`no layout option ${name}`);
  return found;
}

describe("posts popover Card tab: card structure editor", () => {
  it("edits postCardLayout outside the comments view", () => {
    mount_posts();
    tab("Card").click();

    const post_editor = editor("Post card layout");
    expect(post_editor).not.toBeNull();
    expect(editor("Comment card layout")).toBeNull();
    expect(post_editor?.textContent).toContain("Title");
    expect(panel().textContent).toContain("Thumbnail size");

    click_button(post_editor!, "Remove Title");
    expect(collectAllElementIds(settings.postCardLayout)).toEqual(["summary"]);
    expect(collectAllElementIds(settings.commentCardLayout)).toEqual([
      "author",
      "body",
    ]);
  });

  it("edits commentCardLayout in the comments view", () => {
    mount_posts(true);
    tab("Card").click();

    const comment_editor = editor("Comment card layout");
    expect(comment_editor).not.toBeNull();
    expect(editor("Post card layout")).toBeNull();
    expect(comment_editor?.textContent).toContain("Comment Body");
    expect(panel().textContent).toContain("Comment padding");

    click_button(comment_editor!, "Remove Comment Body");
    expect(collectAllElementIds(settings.commentCardLayout)).toEqual([
      "author",
    ]);
    expect(collectAllElementIds(settings.postCardLayout)).toEqual([
      "title",
      "summary",
    ]);
  });

  it("has no link to the side panel card structure", () => {
    mount_posts();
    tab("Card").click();
    expect(panel().textContent).not.toContain("structure");
  });

  it("keeps the structure editor off the List tab", () => {
    mount_posts();
    expect(editor("Post card layout")).toBeNull();
  });
});

describe("posts popover List tab", () => {
  it("holds card gap, posts per page and the layout switch; Columns only in grid", () => {
    mount_posts();
    const text = panel().textContent ?? "";
    expect(text).toContain("Card gap");
    expect(text).toContain("Posts per page");
    expect(text).toContain("Columns");

    layout_switch("Masonry").click();
    flushPendingSettings();
    expect(settings.postsLayout).toBe("masonry");
    expect(layout_switch("Masonry").getAttribute("aria-pressed")).toBe("true");
    expect(panel().textContent).not.toContain("Columns");

    layout_switch("List").click();
    flushPendingSettings();
    expect(settings.postsLayout).toBe("list");
    expect(panel().textContent).not.toContain("Columns");

    layout_switch("Grid").click();
    flushPendingSettings();
    expect(panel().textContent).toContain("Columns");
  });

  it("hides the community sort settings outside community mode", () => {
    mount_posts();
    expect(panel().textContent).not.toContain("Visible sort tabs");
    expect(panel().textContent).not.toContain("Default sort");
  });

  it("shows the community sort settings in community mode", () => {
    community.mode = true;
    mount_posts();
    expect(panel().textContent).toContain("Visible sort tabs");
    expect(panel().querySelector("select")).not.toBeNull();

    tab("Card").click();
    expect(panel().textContent).not.toContain("Visible sort tabs");
  });
});
