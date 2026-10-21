// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no ResizeObserver (dnd-kit needs one at import), no Popover API and no matchMedia (Popover placement).
vi.hoisted(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  // jsdom hides every [popover] (display: none), which makes its content unfocusable; "showing" overrides that.
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    this.style.display = "block";
  };
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    this.style.removeProperty("display");
  };
  // dnd-kit measures with the Web Animations API, which jsdom lacks.
  Document.prototype.getAnimations ??= () => [];
  Element.prototype.getAnimations ??= () => [];
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.IntersectionObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): [] {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
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

vi.mock("../../src/components/admin/queries", async (import_actual) => {
  const actual =
    await import_actual<typeof import("../../src/components/admin/queries")>();
  return { ...actual, apply_layout_op: vi.fn(actual.apply_layout_op) };
});

// Real DndRoot, with its onDragEnd captured: jsdom has no layout, so dnd-kit cannot resolve a drop target by itself.
const drag_end = vi.hoisted(() => ({
  handler: undefined as
    | undefined
    | ((
        event: import("../../src/components/admin/canvas/dnd/DndRoot").DndMoveEvent,
      ) => void),
}));
vi.mock(
  "../../src/components/admin/canvas/dnd/DndRoot",
  async (import_actual) => {
    const actual =
      await import_actual<
        typeof import("../../src/components/admin/canvas/dnd/DndRoot")
      >();
    return {
      ...actual,
      DndRoot: (props: Parameters<typeof actual.DndRoot>[0]) => {
        drag_end.handler = props.onDragEnd;
        return actual.DndRoot(props);
      },
    };
  },
);

import { render as solid_render } from "solid-js/web";
import { createSignal } from "solid-js";
import { CardLayoutDnd } from "../../src/components/admin/canvas/popovers/CardLayoutDnd";
import { PopoverShell } from "../../src/components/admin/canvas/popovers/PopoverShell";
import {
  apply_layout_op,
  settings,
  updateSettingsImmediate,
} from "../../src/components/admin/queries";
import type { CardLayout } from "../../src/components/admin/types/layout";
import { Toast, dismissToast } from "../../src/components/ui";

const LABELS = { title: "Title", body: "Body", votes: "Votes" };
const LAYOUT: CardLayout = {
  sections: [
    {
      id: "sec-a",
      orientation: "vertical",
      children: [
        { type: "element", id: "title" },
        { type: "element", id: "body" },
      ],
    },
    {
      id: "sec-b",
      orientation: "horizontal",
      children: [{ type: "element", id: "votes" }],
    },
  ],
};

const disposers: Array<() => void> = [];
let on_close: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  updateSettingsImmediate({ postCardLayout: structuredClone(LAYOUT) });
  vi.mocked(apply_layout_op).mockClear();
  on_close = vi.fn<() => void>();
});

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  dismissToast();
  drag_end.handler = undefined;
  document.body.innerHTML = "";
});

function mount_in_popover(): HTMLElement {
  const anchor = document.createElement("button");
  anchor.textContent = "gear";
  document.body.append(anchor);
  const container = document.createElement("div");
  document.body.append(container);
  const [open, set_open] = createSignal(true);
  disposers.push(
    solid_render(
      () => (
        <PopoverShell
          open={open()}
          anchor={anchor}
          trigger={anchor}
          onClose={() => {
            on_close();
            set_open(false);
          }}
          element_label="Posts"
        >
          <CardLayoutDnd
            layout_key="postCardLayout"
            element_labels={LABELS}
            label="Post card layout"
          />
        </PopoverShell>
      ),
      container,
    ),
  );
  const panel = document.querySelector<HTMLElement>("[popover]");
  if (!panel) throw new Error("popover panel not rendered");
  return panel;
}

/** Mounts and waits for the popover's initial focus frame, so a test's own focus is not overridden. */
async function open_popover(): Promise<HTMLElement> {
  const panel = mount_in_popover();
  await settle();
  return panel;
}

function handle(panel: HTMLElement, name: string): HTMLButtonElement {
  const element = panel.querySelector<HTMLButtonElement>(
    `button[aria-label="${name}"]`,
  );
  if (!element) throw new Error(`no handle "${name}"`);
  return element;
}

function key(
  target: EventTarget,
  code: string,
  key_name = code,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: key_name,
    code,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

const next_frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function settle(): Promise<void> {
  await Promise.resolve();
  await next_frame();
  await next_frame();
}

function element_order(): string[] {
  const first = settings.postCardLayout.sections[0];
  return first.children.map((child) =>
    child.type === "element" ? child.id : child.section.id,
  );
}

describe("CardLayoutDnd inside PopoverShell", () => {
  it("6a: a pointer drag on a handle does not light-dismiss the popover", async () => {
    const panel = await open_popover();
    const grip = handle(panel, "Move Title");
    const init = {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
    };
    grip.dispatchEvent(
      new PointerEvent("pointerdown", { ...init, clientX: 10, clientY: 10 }),
    );
    document.dispatchEvent(
      new PointerEvent("pointermove", { ...init, clientX: 10, clientY: 40 }),
    );
    document.dispatchEvent(
      new PointerEvent("pointerup", {
        ...init,
        buttons: 0,
        clientX: 10,
        clientY: 40,
      }),
    );
    await settle();

    expect(on_close).not.toHaveBeenCalled();
    expect(panel.isConnected).toBe(true);
  });

  it("6a: a pointerdown outside the panel still closes it", () => {
    mount_in_popover();
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    expect(on_close).toHaveBeenCalledTimes(1);
  });

  it("6b: Escape during a keyboard drag cancels only the drag", async () => {
    const panel = await open_popover();
    const grip = handle(panel, "Move Title");
    grip.focus();
    key(grip, "Space", " ");
    await settle();

    const overlay = document.querySelector("[data-dnd-overlay]");
    expect(overlay, "keyboard drag started").not.toBeNull();
    expect(overlay?.parentElement?.closest("[popover]")).toBe(panel);
    expect(document.activeElement).toBe(grip);

    const escape = key(grip, "Escape");
    await settle();

    expect(escape.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(grip);
    expect(on_close).not.toHaveBeenCalled();
    expect(document.querySelector("[data-dnd-overlay]")).toBeNull();
    expect(apply_layout_op).not.toHaveBeenCalled();
    expect(element_order()).toEqual(["title", "body"]);

    key(grip, "Escape");
    expect(on_close).toHaveBeenCalledTimes(1);
  });

  it("6c: a drop writes the layout key exactly once", async () => {
    const panel = mount_in_popover();
    expect(drag_end.handler).toBeTypeOf("function");

    drag_end.handler?.({
      id: "el:title",
      source: { container_id: "sec-a", index: 0 },
      target: { container_id: "sec-a", index: 1 },
    });
    await settle();

    expect(apply_layout_op).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apply_layout_op).mock.results[0]?.value).toBe(true);
    expect(element_order()).toEqual(["body", "title"]);
    expect(on_close).not.toHaveBeenCalled();
    expect(panel.isConnected).toBe(true);
  });

  it("6d: focus returns to the handle of the moved element after the drop", async () => {
    const panel = await open_popover();
    const grip = handle(panel, "Move Votes");
    grip.focus();

    drag_end.handler?.({
      id: "el:votes",
      source: { container_id: "sec-b", index: 0 },
      target: { container_id: "sec-a", index: 0 },
    });
    await settle();

    expect(grip.isConnected).toBe(false);
    expect(document.activeElement).toBe(handle(panel, "Move Votes"));
    expect(element_order()).toEqual(["votes", "title", "body"]);
  });

  it("6d: focus returns to a moved section's own handle", async () => {
    const panel = await open_popover();
    handle(panel, "Move section (horizontal)").focus();

    drag_end.handler?.({
      id: "sec:sec-b",
      source: { container_id: "__card-root", index: 1 },
      target: { container_id: "__card-root", index: 0 },
    });
    await settle();

    const node = panel.querySelector('[data-card-node="sec:sec-b"]');
    expect(
      settings.postCardLayout.sections.map((section) => section.id),
    ).toEqual(["sec-b", "sec-a"]);
    expect(document.activeElement).toBe(
      node?.querySelector('[aria-roledescription="draggable"]'),
    );
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Move section (horizontal)",
    );
  });

  it("Undo in the toast still restores a removal after the click light-dismissed the popover", async () => {
    const toast_host = document.createElement("div");
    document.body.append(toast_host);
    disposers.push(solid_render(() => <Toast />, toast_host));
    const panel = await open_popover();

    handle(panel, "Remove Votes").click();
    expect(settings.postCardLayout.sections[1]?.children).toEqual([]);

    const undo = Array.from(
      toast_host.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Undo");
    if (!undo) throw new Error("undo toast not shown");
    undo.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    await settle();
    expect(on_close).toHaveBeenCalledTimes(1);
    expect(undo.isConnected).toBe(true);

    undo.click();
    expect(settings.postCardLayout.sections[1]?.children).toEqual([
      { type: "element", id: "votes" },
    ]);
  });

  it("a rejected drop writes nothing and leaves focus alone", async () => {
    const panel = await open_popover();
    const grip = handle(panel, "Move Title");
    grip.focus();

    drag_end.handler?.({
      id: "el:title",
      source: { container_id: "sec-a", index: 0 },
      target: { container_id: "__card-root", index: 0 },
    });
    await settle();

    expect(vi.mocked(apply_layout_op).mock.results[0]?.value).toBe(false);
    expect(document.activeElement).toBe(grip);
  });
});
