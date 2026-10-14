// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  USER_PRESET_STYLE_KEYS,
  USER_PRESETS_LIMIT,
  USER_PRESET_NAME_MAX_LENGTH,
  apply_user_preset,
  delete_user_preset,
  load_user_presets,
  normalize_preset_name,
  parse_user_presets,
  read_user_presets,
  rename_user_preset,
  restore_user_preset,
  save_user_preset,
  user_presets_storage_key,
  type PresetStorage,
  type UserPreset,
} from "../../src/components/admin/presets";
import {
  GLOBAL_FIELD_KEYS,
  get_default_settings,
  type SettingsData,
} from "../../src/components/admin/types/settings";
import { themePresets } from "../../src/components/admin/types/theme";

class MemoryStorage implements PresetStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

const USER = "alice";

function custom_settings(): SettingsData {
  return {
    ...get_default_settings(false),
    siteTheme: "dark",
    customColors: { ...themePresets[2].colors },
    fontHeading: "fraunces",
    contentWidthPx: 1040,
    radiusPx: 14,
    postsLayout: "grid",
    gridColumns: 3,
    instanceOverrides: { "page-sec-main:posts": { gridColumns: 2 } },
  };
}

function save(storage: PresetStorage, name: string, id?: string) {
  return save_user_preset(USER, name, custom_settings(), {
    storage,
    now: 1_000,
    id,
  });
}

function stored(storage: MemoryStorage, presets: unknown[]): void {
  storage.setItem(
    user_presets_storage_key(USER),
    JSON.stringify({ version: 1, presets }),
  );
}

describe("user preset names", () => {
  it("trims and accepts 1..40 characters", () => {
    expect(normalize_preset_name("  My look  ")).toBe("My look");
    expect(
      normalize_preset_name("x".repeat(USER_PRESET_NAME_MAX_LENGTH)),
    ).toHaveLength(40);
  });

  it.each(["", "   ", "x".repeat(41), 42, null])("rejects %j", (name) => {
    expect(normalize_preset_name(name)).toBeNull();
  });
});

describe("user preset CRUD", () => {
  it("saves layout and style without overrides or identity", () => {
    const storage = new MemoryStorage();
    const result = save(storage, "Mine", "user-one");
    expect(result.ok).toBe(true);
    const [preset] = load_user_presets(USER, storage);
    expect(preset).toMatchObject({
      id: "user-one",
      name: "Mine",
      created_at: 1_000,
    });
    expect(preset.style).toMatchObject({
      siteTheme: "dark",
      fontHeading: "fraunces",
      contentWidthPx: 1040,
      radiusPx: 14,
      customColors: themePresets[2].colors,
    });
    expect(preset.layout).toMatchObject({
      postsLayout: "grid",
      gridColumns: 3,
    });
    expect(preset.layout).not.toHaveProperty("pageLayout");
    expect(preset.layout).not.toHaveProperty("instanceOverrides");
    expect(preset.style).not.toHaveProperty("hiveUsername");
  });

  it("generates a slug-safe id when none is given", () => {
    const storage = new MemoryStorage();
    const result = save_user_preset(USER, "Auto", custom_settings(), {
      storage,
    });
    expect(result.ok && result.preset.id).toMatch(/^[a-z0-9-]{1,64}$/);
  });

  it("rejects invalid names without writing", () => {
    const storage = new MemoryStorage();
    expect(save(storage, " ")).toEqual({ ok: false, error: "invalid-name" });
    expect(storage.items.size).toBe(0);
  });

  it("enforces the limit of 12", () => {
    const storage = new MemoryStorage();
    for (let i = 0; i < USER_PRESETS_LIMIT; i += 1) {
      expect(save(storage, `P${i}`, `user-${i}`).ok).toBe(true);
    }
    expect(save(storage, "One too many", "user-x")).toEqual({
      ok: false,
      error: "limit",
    });
    expect(load_user_presets(USER, storage)).toHaveLength(12);
  });

  it("renames in place", () => {
    const storage = new MemoryStorage();
    save(storage, "A", "user-a");
    save(storage, "B", "user-b");
    const result = rename_user_preset(USER, "user-a", "  Renamed ", storage);
    expect(result.ok).toBe(true);
    expect(load_user_presets(USER, storage).map((p) => p.name)).toEqual([
      "Renamed",
      "B",
    ]);
    expect(rename_user_preset(USER, "user-a", "", storage)).toEqual({
      ok: false,
      error: "invalid-name",
    });
    expect(rename_user_preset(USER, "missing", "X", storage)).toEqual({
      ok: false,
      error: "not-found",
    });
  });

  it("deletes and restores at the same index for the Undo toast", () => {
    const storage = new MemoryStorage();
    save(storage, "A", "user-a");
    save(storage, "B", "user-b");
    save(storage, "C", "user-c");
    const removed = delete_user_preset(USER, "user-b", storage);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.index).toBe(1);
    expect(load_user_presets(USER, storage).map((p) => p.id)).toEqual([
      "user-a",
      "user-c",
    ]);
    restore_user_preset(USER, removed.preset, removed.index, storage);
    expect(load_user_presets(USER, storage).map((p) => p.id)).toEqual([
      "user-a",
      "user-b",
      "user-c",
    ]);
    expect(delete_user_preset(USER, "missing", storage)).toEqual({
      ok: false,
      error: "not-found",
    });
  });

  it("keeps presets of different blogs apart", () => {
    const storage = new MemoryStorage();
    save(storage, "Alice", "user-a");
    expect(load_user_presets("bob", storage)).toEqual([]);
    expect(user_presets_storage_key("Alice")).toBe(
      user_presets_storage_key("alice"),
    );
    expect(user_presets_storage_key("alice")).not.toBe(
      user_presets_storage_key("hive-123456"),
    );
  });
});

describe("corrupted or unavailable storage", () => {
  it.each(["{", "null", "[]", '{"version":2,"presets":[]}', '{"version":1}'])(
    "returns [] for %s",
    (raw) => {
      expect(parse_user_presets(raw)).toEqual([]);
    },
  );

  it("drops invalid entries one by one and dedupes ids", () => {
    const storage = new MemoryStorage();
    const valid = {
      id: "user-ok",
      name: "Ok",
      created_at: 5,
      layout: {},
      style: {},
    };
    stored(storage, [
      valid,
      { ...valid, name: "Duplicate" },
      { id: "BAD ID", name: "x", layout: {}, style: {} },
      { id: "user-noname", name: "", layout: {}, style: {} },
      "string",
      null,
    ]);
    expect(load_user_presets(USER, storage).map((p) => p.name)).toEqual(["Ok"]);
  });

  it("validates settings through settings_schema and drops unknown keys", () => {
    const storage = new MemoryStorage();
    stored(storage, [
      {
        id: "user-a",
        name: "A",
        created_at: "yesterday",
        layout: {
          postsLayout: "carousel",
          gridColumns: 2,
          postCardLayout: "not a layout",
          pageLayout: { sections: "evil" },
          instanceOverrides: { "a:posts": { gridColumns: 2 } },
          hiveUsername: "mallory",
        },
        style: {
          radiusPx: 999,
          fontHeading: "comic-sans",
          fontBody: "inter",
          customColors: { bg: "url(javascript:alert(1))" },
          presetId: "Not A Slug",
          siteTheme: "essay",
          unknownKey: 1,
        },
      },
    ]);
    const [preset] = load_user_presets(USER, storage);
    expect(preset.created_at).toBe(0);
    expect(preset.layout).toEqual({ gridColumns: 2 });
    expect(preset.style).toEqual({
      radiusPx: 24,
      fontBody: "inter",
      siteTheme: "essay",
    });
    for (const key of Object.keys(preset.style)) {
      expect(USER_PRESET_STYLE_KEYS).toContain(key);
    }
  });

  it.each([
    ["one non-hex token", { ...themePresets[2].colors, accent: "red" }],
    [
      "a missing token",
      (({ info: _info, ...rest }) => rest)(themePresets[2].colors),
    ],
    ["a non-object", "#ffffff"],
  ])("drops a palette with %s and keeps a valid one", (_label, bad) => {
    const storage = new MemoryStorage();
    const preset = (id: string, customColors: unknown) => ({
      id,
      name: id,
      layout: {},
      style: { customColors, radiusPx: 8 },
    });
    stored(storage, [
      preset("user-bad", bad),
      preset("user-good", themePresets[2].colors),
      preset("user-null", null),
    ]);
    const [broken, good, cleared] = load_user_presets(USER, storage);
    expect(broken.style).toEqual({ radiusPx: 8 });
    expect(good.style.customColors).toEqual(themePresets[2].colors);
    expect(cleared.style.customColors).toBeNull();
  });

  it("caps an oversized stored list at the limit", () => {
    const storage = new MemoryStorage();
    stored(
      storage,
      Array.from({ length: 20 }, (_, i) => ({
        id: `user-${i}`,
        name: `P${i}`,
        layout: {},
        style: {},
      })),
    );
    expect(load_user_presets(USER, storage)).toHaveLength(USER_PRESETS_LIMIT);
  });

  it("survives a storage that throws", () => {
    const broken: PresetStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(load_user_presets(USER, broken)).toEqual([]);
    expect(save(broken, "A")).toEqual({ ok: false, error: "storage" });
  });

  it("reports storage error when no storage exists", () => {
    expect(load_user_presets(USER, null)).toEqual([]);
    expect(
      save_user_preset(USER, "A", custom_settings(), { storage: null }),
    ).toEqual({
      ok: false,
      error: "storage",
    });
  });

  it("reports why presets could not be read", () => {
    const throwing: PresetStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => undefined,
    };
    expect(read_user_presets(USER, throwing)).toEqual({
      presets: [],
      error: "unavailable",
    });
    expect(read_user_presets(USER, null)).toEqual({
      presets: [],
      error: "unavailable",
    });

    const storage = new MemoryStorage();
    expect(read_user_presets(USER, storage)).toEqual({
      presets: [],
      error: null,
    });
    storage.setItem(user_presets_storage_key(USER), "{");
    expect(read_user_presets(USER, storage).error).toBe("corrupt");

    const valid = { id: "user-ok", name: "Ok", layout: {}, style: {} };
    stored(storage, [valid, { id: "BAD ID", name: "x" }]);
    const partial = read_user_presets(USER, storage);
    expect(partial.error).toBe("corrupt");
    expect(partial.presets.map((p) => p.name)).toEqual(["Ok"]);

    stored(storage, [valid, valid]);
    expect(read_user_presets(USER, storage).error).toBeNull();
  });

  it("uses localStorage by default and tolerates its absence in node", () => {
    expect(load_user_presets(USER)).toEqual([]);
  });
});

describe("apply_user_preset", () => {
  function saved_preset() {
    const storage = new MemoryStorage();
    save(storage, "Mine", "user-one");
    return load_user_presets(USER, storage)[0];
  }

  it("full apply restores layout and style and clears overrides", () => {
    const current = {
      ...get_default_settings(false),
      instanceOverrides: { "page-sec-main:posts": { gridColumns: 1 } },
    };
    const result = apply_user_preset(saved_preset(), current, "full", false);
    expect(result.patch).toMatchObject({
      postsLayout: "grid",
      gridColumns: 3,
      fontHeading: "fraunces",
      customColors: themePresets[2].colors,
      instanceOverrides: {},
    });
    expect(result.patch.pageLayout?.sections.length).toBeGreaterThan(0);
    expect(result.reset_overrides_count).toBe(1);
    expect(result.undo_label).toBe('Apply "Mine"');
  });

  it("style only keeps layout and overrides", () => {
    const result = apply_user_preset(
      saved_preset(),
      get_default_settings(false),
      "style",
      false,
    );
    expect(result.patch).not.toHaveProperty("postsLayout");
    expect(result.patch).not.toHaveProperty("instanceOverrides");
    expect(result.patch.fontHeading).toBe("fraunces");
    expect(result.reset_overrides_count).toBe(0);
  });

  it("adapts a user-mode preset to community mode", () => {
    const result = apply_user_preset(
      saved_preset(),
      get_default_settings(true),
      "full",
      true,
    );
    const ids = Object.values(
      result.patch.pageLayoutConfig?.containers ?? {},
    ).flatMap((c) => c.elements.map((e) => e.id));
    expect(ids).toContain("communityProfile");
    expect(ids).not.toContain("authorProfile");
    expect(result.patch).not.toHaveProperty("commentPaddingPx");
  });
});

function with_site_content(base: SettingsData): SettingsData {
  const section_style = {
    width: "content",
    spacing: "md",
    bg: "none",
    overlay: "dark-50",
  } as const;
  return {
    ...base,
    brand: { mode: "logo+text", size: "lg" },
    seo: { description: "Blog o pszczolach" },
    locale: "pl",
    topbar: { show_login: false, show_node_switcher: true },
    nav: { links: [{ label: "O mnie", kind: "page", target: "o-mnie" }] },
    footer: {
      variant: "mast",
      columns: [],
      privacy: { label: "Prywatnosc", kind: "page", target: "kontakt" },
      legal_links: [],
      show_social: false,
    },
    home: {
      sections: [
        {
          id: "hero0001",
          type: "hero",
          content: { headline: "Witaj" },
          style: section_style,
        },
        { id: "posts001", type: "posts", content: {}, style: section_style },
        {
          id: "ctaband1",
          type: "cta-band",
          content: {
            title: "Newsletter",
            button: { label: "Zapisz", url: "https://e.com/news" },
          },
          style: section_style,
        },
      ],
    } as SettingsData["home"],
    pages: [
      { slug: "o-mnie", title: "O mnie", body_md: "Pszczelarz." },
      { slug: "kontakt", title: "Kontakt", body_md: "Napisz." },
    ] as SettingsData["pages"],
  };
}

const HOSTILE_CONTENT = {
  home: { sections: [{ id: "evil0001", type: "posts", content: {} }] },
  pages: [{ slug: "evil", title: "Evil", body_md: "<script>x</script>" }],
  footer: {
    variant: "inline",
    columns: [],
    legal_links: [],
    show_social: false,
  },
  nav: {
    links: [{ label: "Evil", kind: "url", target: "https://evil.example/" }],
  },
  brand: { mode: "text", size: "sm" },
  seo: { description: "evil" },
  locale: "en",
  topbar: { show_login: true, show_node_switcher: true },
};

describe("user presets never touch site content", () => {
  it.each([
    ["full", false],
    ["full", true],
    ["style", false],
    ["style", true],
  ] as const)(
    "%s apply (community=%s) keeps content keys out of the patch and intact after merge",
    (scope, is_community) => {
      const storage = new MemoryStorage();
      save(storage, "Mine", "user-one");
      const [preset] = load_user_presets(USER, storage);
      const current = with_site_content(get_default_settings(is_community));
      const snapshot = structuredClone(current);
      const { patch } = apply_user_preset(preset, current, scope, is_community);
      const merged: SettingsData = { ...current, ...patch };

      for (const key of GLOBAL_FIELD_KEYS) {
        expect(patch).not.toHaveProperty(key);
        expect(merged[key]).toEqual(snapshot[key]);
      }
      expect(current).toEqual(snapshot);
    },
  );

  it("saving does not capture content keys", () => {
    const storage = new MemoryStorage();
    const result = save_user_preset(
      USER,
      "Mine",
      with_site_content(custom_settings()),
      { storage, now: 1_000, id: "user-one" },
    );
    if (!result.ok) throw new Error("save failed");
    for (const key of GLOBAL_FIELD_KEYS) {
      expect(result.preset.layout).not.toHaveProperty(key);
      expect(result.preset.style).not.toHaveProperty(key);
    }
    const raw = storage.getItem(user_presets_storage_key(USER)) ?? "";
    for (const content_text of [
      "Pszczelarz",
      "Witaj",
      "Prywatnosc",
      "o-mnie",
    ]) {
      expect(raw).not.toContain(content_text);
    }
  });

  it("ignores hostile content keys injected through localStorage", () => {
    const storage = new MemoryStorage();
    stored(storage, [
      {
        id: "user-evil",
        name: "Evil",
        ...HOSTILE_CONTENT,
        layout: { postsLayout: "grid", ...HOSTILE_CONTENT },
        style: { fontHeading: "fraunces", ...HOSTILE_CONTENT },
      },
    ]);
    const [preset] = load_user_presets(USER, storage);
    expect(preset.layout).toEqual({ postsLayout: "grid" });
    expect(preset.style).toEqual({ fontHeading: "fraunces" });
    expect(preset).not.toHaveProperty("home");
    expect(preset).not.toHaveProperty("pages");

    const current = with_site_content(get_default_settings(false));
    const snapshot = structuredClone(current);
    for (const scope of ["full", "style"] as const) {
      const { patch } = apply_user_preset(preset, current, scope, false);
      const merged: SettingsData = { ...current, ...patch };
      for (const key of GLOBAL_FIELD_KEYS) {
        expect(patch).not.toHaveProperty(key);
        expect(merged[key]).toEqual(snapshot[key]);
      }
    }
  });

  it("restore re-sanitizes a preset carrying content keys", () => {
    const storage = new MemoryStorage();
    const hostile = {
      id: "user-evil",
      name: "Evil",
      created_at: 1,
      layout: { postsLayout: "list", ...HOSTILE_CONTENT },
      style: { ...HOSTILE_CONTENT },
    } as unknown as UserPreset;
    const result = restore_user_preset(USER, hostile, 0, storage);
    if (!result.ok) throw new Error("restore failed");
    for (const key of GLOBAL_FIELD_KEYS) {
      expect(result.preset.layout).not.toHaveProperty(key);
      expect(result.preset.style).not.toHaveProperty(key);
    }
  });
});
