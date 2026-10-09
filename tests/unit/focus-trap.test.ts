// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scroll_lock_count } from "../../src/lib/scroll-lock";
import {
  create_focus_trap,
  resolve_tab_move,
  type FocusTrap,
} from "../../src/components/ui/use-focus-trap";

const elements = ["first", "middle", "last"];

describe("resolve_tab_move", () => {
  it("wraps Tab from the last element to the first", () => {
    expect(resolve_tab_move(elements, "last", false, true, false)).toEqual({
      prevent: true,
      target: "first",
    });
  });

  it("wraps Shift+Tab from the first element to the last", () => {
    expect(resolve_tab_move(elements, "first", true, true, false)).toEqual({
      prevent: true,
      target: "last",
    });
  });

  it("leaves Tab between inner elements to the browser", () => {
    expect(resolve_tab_move(elements, "middle", false, true, true)).toEqual({
      prevent: false,
      target: null,
    });
    expect(resolve_tab_move(elements, "middle", true, true, true)).toEqual({
      prevent: false,
      target: null,
    });
  });

  it("pulls escaped focus back in when catching is enabled", () => {
    expect(resolve_tab_move(elements, "outside", false, false, true)).toEqual({
      prevent: true,
      target: "first",
    });
    expect(resolve_tab_move(elements, null, true, false, true)).toEqual({
      prevent: true,
      target: "last",
    });
  });

  it("ignores escaped focus when catching is disabled", () => {
    expect(resolve_tab_move(elements, "outside", false, false, false)).toEqual({
      prevent: false,
      target: null,
    });
  });

  it("swallows Tab in an empty container only when catching is enabled", () => {
    expect(resolve_tab_move([], null, false, false, true)).toEqual({
      prevent: true,
      target: null,
    });
    expect(resolve_tab_move([], null, false, false, false)).toEqual({
      prevent: false,
      target: null,
    });
  });

  it("keeps focus on a single element in both directions", () => {
    expect(resolve_tab_move(["only"], "only", false, true, false)).toEqual({
      prevent: true,
      target: "only",
    });
    expect(resolve_tab_move(["only"], "only", true, true, false)).toEqual({
      prevent: true,
      target: "only",
    });
  });
});

interface TrapFixture {
  container: HTMLElement;
  first: HTMLButtonElement;
  last: HTMLButtonElement;
  trap: FocusTrap;
  on_escape: ReturnType<typeof vi.fn>;
}

function add_button(parent: HTMLElement, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  parent.appendChild(button);
  return button;
}

function mount_trap(name: string): TrapFixture {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const first = add_button(container, `${name}-first`);
  const last = add_button(container, `${name}-last`);
  const on_escape = vi.fn();
  const trap = create_focus_trap(
    () => container,
    () => true,
    { on_escape },
  );
  document.addEventListener("keydown", trap.handle_key_down);
  return { container, first, last, trap, on_escape };
}

function unmount_trap(fixture: TrapFixture): void {
  document.removeEventListener("keydown", fixture.trap.handle_key_down);
  fixture.trap.release();
}

function press(key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

describe("focus trap stack", () => {
  let mounted: TrapFixture[] = [];

  const open = (name: string) => {
    const fixture = mount_trap(name);
    mounted.push(fixture);
    fixture.trap.activate();
    return fixture;
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    mounted.reverse().forEach(unmount_trap);
    mounted = [];
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("lets only the topmost of two nested traps handle Tab", () => {
    const outer = open("outer");
    const inner = open("inner");
    vi.runAllTimers();
    expect(document.activeElement).toBe(inner.first);

    inner.last.focus();
    const event = press("Tab");

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(inner.first);
    expect(outer.container.contains(document.activeElement)).toBe(false);
  });

  it("lets only the topmost trap handle Escape", () => {
    const outer = open("outer");
    const inner = open("inner");

    const event = press("Escape");

    expect(event.defaultPrevented).toBe(true);
    expect(inner.on_escape).toHaveBeenCalledTimes(1);
    expect(outer.on_escape).not.toHaveBeenCalled();
  });

  it("hands control back to the outer trap when released in reverse order", () => {
    const outer = open("outer");
    const inner = open("inner");

    unmount_trap(inner);
    press("Escape");
    expect(outer.on_escape).toHaveBeenCalledTimes(1);
    expect(inner.on_escape).not.toHaveBeenCalled();

    unmount_trap(outer);
    expect(scroll_lock_count()).toBe(0);
  });

  it("keeps the inner trap on top when the outer one is released first", () => {
    const outer = open("outer");
    const inner = open("inner");

    unmount_trap(outer);
    press("Escape");
    expect(inner.on_escape).toHaveBeenCalledTimes(1);
    expect(outer.on_escape).not.toHaveBeenCalled();
    expect(scroll_lock_count()).toBe(1);

    unmount_trap(inner);
    expect(scroll_lock_count()).toBe(0);
  });

  it("ignores keys already handled by a nested widget", () => {
    const trap = open("only");
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    event.preventDefault();
    document.dispatchEvent(event);
    expect(trap.on_escape).not.toHaveBeenCalled();
  });

  it("returns focus to the opener that is still in the DOM", () => {
    const opener = add_button(document.body, "opener");
    opener.focus();
    const trap = open("dialog");
    vi.runAllTimers();
    expect(document.activeElement).toBe(trap.first);

    trap.trap.release();
    expect(document.activeElement).toBe(opener);
  });

  it("does not return focus to an opener removed from the DOM", () => {
    const opener = add_button(document.body, "opener");
    opener.focus();
    const trap = open("dialog");
    vi.runAllTimers();
    opener.remove();
    const focus = vi.spyOn(opener, "focus");

    trap.trap.release();
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trap.first);
  });
});

describe("focus trap options used by Popover", () => {
  let container: HTMLElement;
  let anchor: HTMLButtonElement;
  let trap: FocusTrap;

  const create = (with_buttons = true) => {
    container = document.createElement("div");
    container.tabIndex = -1;
    document.body.appendChild(container);
    if (with_buttons) {
      add_button(container, "first");
      add_button(container, "last");
    }
    trap = create_focus_trap(
      () => container,
      () => true,
      {
        catch_escaped_focus: true,
        lock_scroll: false,
        focus_in_frame: true,
        initial_focus: (elements, root) => elements[0] ?? root,
        fallback_return_focus: () => anchor,
      },
    );
    container.addEventListener("keydown", trap.handle_key_down);
  };

  const press_inside = (key: string, shiftKey = false): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    (document.activeElement ?? container).dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "requestAnimationFrame",
        "cancelAnimationFrame",
      ],
    });
    anchor = add_button(document.body, "anchor");
  });

  afterEach(() => {
    trap.release(false);
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("does not lock body scroll", () => {
    create();
    trap.activate();
    expect(scroll_lock_count()).toBe(0);
  });

  it("moves initial focus in the next animation frame, not the next task", () => {
    create();
    trap.activate();
    vi.advanceTimersByTime(0);
    expect(document.activeElement).toBe(document.body);
    vi.advanceTimersToNextFrame();
    expect(document.activeElement?.textContent).toBe("first");
  });

  it("cancels the pending initial focus frame on release", () => {
    create();
    trap.activate();
    trap.release();
    vi.advanceTimersToNextFrame();
    expect(container.contains(document.activeElement)).toBe(false);
  });

  it("focuses the container when it has no focusable elements and swallows Tab", () => {
    create(false);
    trap.activate();
    vi.advanceTimersToNextFrame();
    expect(document.activeElement).toBe(container);
    expect(press_inside("Tab").defaultPrevented).toBe(true);
    expect(press_inside("Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(container);
  });

  it("wraps Tab and Shift+Tab at the panel edges", () => {
    create();
    trap.activate();
    vi.advanceTimersToNextFrame();
    const [first, last] = Array.from(container.querySelectorAll("button"));
    expect(press_inside("Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    expect(press_inside("Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it("does not handle Escape without on_escape", () => {
    create();
    trap.activate();
    vi.advanceTimersToNextFrame();
    expect(press_inside("Escape").defaultPrevented).toBe(false);
  });

  it("returns focus to the opener focused at activation", () => {
    const opener = add_button(document.body, "opener");
    opener.focus();
    create();
    trap.activate();
    vi.advanceTimersToNextFrame();
    trap.release();
    expect(document.activeElement).toBe(opener);
  });

  it("falls back to the anchor when nothing was focused at activation", () => {
    create();
    trap.activate();
    vi.advanceTimersToNextFrame();
    trap.release();
    expect(document.activeElement).toBe(anchor);
  });

  it("keeps focus in place when released with restore_focus false", () => {
    const elsewhere = add_button(document.body, "elsewhere");
    create();
    trap.activate();
    vi.advanceTimersToNextFrame();
    elsewhere.focus();
    trap.release(false);
    expect(document.activeElement).toBe(elsewhere);
  });

  it("restores focus without scrolling", () => {
    create();
    trap.activate();
    vi.advanceTimersToNextFrame();
    const focus = vi.spyOn(anchor, "focus");
    trap.release();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
