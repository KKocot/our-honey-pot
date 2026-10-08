// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  create_settings_history,
} from "../../src/components/admin/history";
import {
  defaultSettings,
  type SettingsData,
} from "../../src/components/admin/types/settings";

function with_radius(radius: number): SettingsData {
  return { ...structuredClone(defaultSettings), cardBorderRadiusPx: radius };
}

function clocked(coalesce_ms = 600) {
  let time = 0;
  const history = create_settings_history({ coalesce_ms, now: () => time });
  return {
    history,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("create_settings_history", () => {
  it("starts empty and ignores no-op pushes", () => {
    const { history } = clocked();
    history.reset(with_radius(0));
    expect(history.can_undo()).toBe(false);
    expect(history.can_redo()).toBe(false);
    expect(history.push(with_radius(0), { label: "Noop" })).toBe(false);
    expect(history.can_undo()).toBe(false);
  });

  it("undoes and redoes with step labels", () => {
    const { history } = clocked();
    history.reset(with_radius(0));
    history.push(with_radius(4), { label: "Apply preset Essay" });
    history.push(with_radius(8), { label: "Changed corner radius" });

    expect(history.undo_label()).toBe("Changed corner radius");
    const first = history.undo();
    expect(first?.label).toBe("Changed corner radius");
    expect(first?.snapshot.cardBorderRadiusPx).toBe(4);

    const second = history.undo();
    expect(second?.label).toBe("Apply preset Essay");
    expect(second?.snapshot.cardBorderRadiusPx).toBe(0);
    expect(history.undo()).toBeNull();

    expect(history.redo_label()).toBe("Apply preset Essay");
    const redone = history.redo();
    expect(redone?.label).toBe("Apply preset Essay");
    expect(redone?.snapshot.cardBorderRadiusPx).toBe(4);
    expect(history.present()?.cardBorderRadiusPx).toBe(4);
  });

  it("clears redo stack after a new push", () => {
    const { history } = clocked();
    history.reset(with_radius(0));
    history.push(with_radius(4), { label: "A" });
    history.push(with_radius(8), { label: "B" });
    history.undo();
    expect(history.can_redo()).toBe(true);

    history.push(with_radius(12), { label: "C" });
    expect(history.can_redo()).toBe(false);
    expect(history.redo()).toBeNull();
    expect(history.undo()?.label).toBe("C");
    expect(history.undo()?.label).toBe("A");
  });

  it("keeps at most the configured number of steps", () => {
    const { history } = clocked();
    history.reset(with_radius(0));
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) {
      history.push(with_radius(i), { label: `Step ${i}` });
    }
    expect(history.size().undo).toBe(HISTORY_LIMIT);

    let last = null;
    while (history.can_undo()) last = history.undo();
    expect(last?.label).toBe("Step 11");
    expect(last?.snapshot.cardBorderRadiusPx).toBe(10);
  });

  it("coalesces same-key pushes inside the window into one step", () => {
    const { history, advance } = clocked(600);
    history.reset(with_radius(0));
    for (let i = 1; i <= 5; i++) {
      advance(100);
      history.push(with_radius(i), {
        label: "Changed corner radius",
        coalesce_key: "cardBorderRadiusPx",
      });
    }
    expect(history.size().undo).toBe(1);
    expect(history.undo()?.snapshot.cardBorderRadiusPx).toBe(0);
    expect(history.redo()?.snapshot.cardBorderRadiusPx).toBe(5);
  });

  it("starts a new step after the window, on another key, or after seal", () => {
    const { history, advance } = clocked(600);
    history.reset(with_radius(0));
    const opts = { label: "Radius", coalesce_key: "cardBorderRadiusPx" };

    history.push(with_radius(1), opts);
    advance(700);
    history.push(with_radius(2), opts);
    expect(history.size().undo).toBe(2);

    advance(10);
    history.push(
      { ...with_radius(2), cardGapPx: 99 },
      { label: "Gap", coalesce_key: "cardGapPx" },
    );
    expect(history.size().undo).toBe(3);

    history.seal();
    advance(10);
    history.push(
      { ...with_radius(2), cardGapPx: 100 },
      { label: "Gap", coalesce_key: "cardGapPx" },
    );
    expect(history.size().undo).toBe(4);
  });

  it("does not coalesce across undo", () => {
    const { history, advance } = clocked(600);
    history.reset(with_radius(0));
    const opts = { label: "Radius", coalesce_key: "cardBorderRadiusPx" };
    history.push(with_radius(1), opts);
    advance(50);
    history.push(with_radius(2), opts);
    history.undo();
    advance(50);
    history.push(with_radius(3), opts);
    expect(history.size()).toEqual({ undo: 1, redo: 0 });
  });

  it("reset sets a new baseline and clear drops steps but keeps present", () => {
    const { history } = clocked();
    history.reset(with_radius(0));
    history.push(with_radius(4), { label: "A" });
    history.clear();
    expect(history.can_undo()).toBe(false);
    expect(history.present()?.cardBorderRadiusPx).toBe(4);

    history.push(with_radius(6), { label: "B" });
    history.reset(with_radius(20));
    expect(history.size()).toEqual({ undo: 0, redo: 0 });
    expect(history.present()?.cardBorderRadiusPx).toBe(20);
  });

  it("isolates snapshots from caller mutations and between instances", () => {
    const a = create_settings_history();
    const b = create_settings_history();
    const base = with_radius(0);
    a.reset(base);
    b.reset(with_radius(50));
    const next = with_radius(4);
    a.push(next, { label: "A" });
    base.cardBorderRadiusPx = 999;
    next.cardBorderRadiusPx = 999;

    expect(a.present()?.cardBorderRadiusPx).toBe(4);
    expect(a.undo()?.snapshot.cardBorderRadiusPx).toBe(0);
    expect(b.can_undo()).toBe(false);
    expect(b.present()?.cardBorderRadiusPx).toBe(50);
  });

  it("treats the first push without baseline as the baseline", () => {
    const history = create_settings_history();
    expect(history.push(with_radius(3), { label: "A" })).toBe(false);
    expect(history.can_undo()).toBe(false);
    expect(history.present()?.cardBorderRadiusPx).toBe(3);
  });
});
