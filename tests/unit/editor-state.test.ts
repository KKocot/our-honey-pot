// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import { createRoot, createSignal } from "solid-js";
import {
  DEVICE_WIDTHS,
  changed_keys,
  create_editor_state,
  history_label,
} from "../../src/components/admin/editor-state";
import {
  defaultSettings,
  type SettingsData,
} from "../../src/components/admin/types/settings";

function setup() {
  let store: SettingsData = structuredClone(defaultSettings);
  let time = 0;
  const [version, set_version] = createSignal(0);
  const [dirty, set_dirty] = createSignal(false);
  const editor = createRoot(() =>
    create_editor_state({
      read: () => structuredClone(store),
      apply: (snapshot) => {
        store = structuredClone(snapshot);
      },
      version,
      dirty,
      set_dirty,
      history: { now: () => time },
    }),
  );
  const edit = (patch: Partial<SettingsData>) => {
    store = { ...store, ...patch };
    set_dirty(true);
    set_version((value) => value + 1);
    return editor.record_edit();
  };
  return {
    editor,
    edit,
    dirty,
    set_dirty,
    current: () => store,
    write: (patch: Partial<SettingsData>) => {
      store = { ...store, ...patch };
    },
    patch: (patch: Partial<SettingsData>) => {
      store = { ...store, ...patch };
      set_dirty(true);
      set_version((value) => value + 1);
    },
    load: (data: SettingsData) => {
      store = structuredClone(data);
      editor.mark_loaded();
    },
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("create_editor_state", () => {
  it("starts with the brief defaults", () => {
    const { editor } = setup();
    expect(editor.zoom()).toBe("fit");
    expect(editor.device()).toBe("desktop");
    expect(editor.device_width()).toBe(1280);
    expect(editor.panel_tab()).toBe("templates");
    expect(editor.mode()).toBe("design");
    expect(editor.save_status()).toBe("saved");
    expect(editor.history.can_undo()).toBe(false);
  });

  it("switches zoom, device, panel tab and mode", () => {
    const { editor } = setup();
    editor.set_zoom(0.75);
    editor.set_device("tablet");
    editor.set_panel_tab("layout");
    editor.set_mode("moderation");
    expect(editor.zoom()).toBe(0.75);
    expect(editor.device_width()).toBe(DEVICE_WIDTHS.tablet);
    editor.set_device("mobile");
    expect(editor.device_width()).toBe(390);
    expect(editor.panel_tab()).toBe("layout");
    expect(editor.mode()).toBe("moderation");
  });

  it("does not share state between instances", () => {
    const a = setup();
    const b = setup();
    a.editor.set_device("mobile");
    a.edit({ cardBorderRadiusPx: 4 });
    expect(b.editor.device()).toBe("desktop");
    expect(b.editor.history.can_undo()).toBe(false);
  });

  it("restarts history from the loaded baseline", () => {
    const { editor, edit, load, current } = setup();
    edit({ cardBorderRadiusPx: 3 });
    load({ ...structuredClone(defaultSettings), cardBorderRadiusPx: 10 });
    expect(editor.history.can_undo()).toBe(false);

    edit({ cardBorderRadiusPx: 12 });
    expect(editor.history.undo_label()).toBe("Changed card border radius px");
    editor.undo();
    expect(current().cardBorderRadiusPx).toBe(10);
  });

  it("coalesces edits of one field and seals the step after save", () => {
    const { editor, edit, load, set_dirty } = setup();
    load(structuredClone(defaultSettings));
    edit({ cardBorderRadiusPx: 1 });
    edit({ cardBorderRadiusPx: 2 });
    expect(editor.history.size().undo).toBe(1);

    expect(editor.begin_save()).toBe(true);
    expect(editor.begin_save()).toBe(false);
    expect(editor.save_status()).toBe("saving");
    set_dirty(false);
    editor.end_save("saved");
    expect(editor.save_status()).toBe("saved");

    edit({ cardBorderRadiusPx: 3 });
    expect(editor.history.size().undo).toBe(2);
  });

  it("keeps history across save and reports failed saves", () => {
    const { editor, edit, load } = setup();
    load(structuredClone(defaultSettings));
    edit({ footer_text: "a" });
    editor.begin_save();
    editor.end_save("failed");
    expect(editor.save_status()).toBe("error");
    expect(editor.history.can_undo()).toBe(true);
  });

  it("undo back to the baseline clears dirty, redo marks it again", () => {
    const { editor, edit, load, dirty, current } = setup();
    load(structuredClone(defaultSettings));
    edit({ footer_text: "hello" });
    expect(editor.undo()?.label).toBe("Changed footer text");
    expect(current().footer_text).toBe(defaultSettings.footer_text);
    expect(dirty()).toBe(false);
    editor.redo();
    expect(current().footer_text).toBe("hello");
    expect(dirty()).toBe(true);
  });

  it("records a caller label instead of the computed one", () => {
    const { editor, write, load } = setup();
    load(structuredClone(defaultSettings));
    write({ footer_text: "a" });
    expect(editor.record_edit("Typed footer")).toBe(true);
    expect(editor.history.undo_label()).toBe("Typed footer");
    write({ footer_text: "b" });
    editor.record_edit();
    expect(editor.history.undo_label()).toBe("Changed footer text");
  });

  it("applies a multi-key edit as one labelled step", () => {
    const { editor, patch, load, current, advance } = setup();
    load(structuredClone(defaultSettings));
    advance(1000);
    expect(
      editor.apply_edit(() => {
        patch({ footer_text: "x" });
        patch({ cardBorderRadiusPx: 7 });
      }, 'Applied "Essay"'),
    ).toBe(true);
    expect(editor.history.size().undo).toBe(1);
    expect(editor.history.undo_label()).toBe('Applied "Essay"');
    editor.undo();
    expect(current().footer_text).toBe(defaultSettings.footer_text);
    expect(current().cardBorderRadiusPx).toBe(defaultSettings.cardBorderRadiusPx);
  });

  it("keeps a pending edit as its own step before a labelled one", () => {
    const { editor, patch, load } = setup();
    load(structuredClone(defaultSettings));
    editor.apply_edit(() => patch({ footer_text: "x" }), "Imported design");
    editor.apply_edit(() => patch({ cardBorderRadiusPx: 9 }), "Changed corner radius");
    expect(editor.history.size().undo).toBe(2);
    expect(editor.undo()?.label).toBe("Changed corner radius");
  });

  it("ignores edits that change nothing", () => {
    const { editor, edit, load } = setup();
    load(structuredClone(defaultSettings));
    expect(edit({})).toBe(false);
    expect(editor.history.can_undo()).toBe(false);
  });
});

describe("history helpers", () => {
  it("lists changed top-level keys", () => {
    expect(changed_keys({ a: 1, b: [1] }, { a: 1, b: [2], c: true })).toEqual([
      "b",
      "c",
    ]);
  });

  it("labels single and multi-field steps", () => {
    expect(history_label(["postsLayout"])).toBe("Changed posts layout");
    expect(history_label(["a", "b"])).toBe("Changed 2 settings");
  });
});
