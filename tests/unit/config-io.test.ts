// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  build_design_file,
  DESIGN_FORMAT,
  DESIGN_VERSION,
  design_file_name,
  DesignImportError,
  IDENTITY_KEYS,
  KNOWN_SETTINGS_KEYS,
  MAX_DESIGN_FILE_BYTES,
  parse_design_file,
  read_design_file,
  serialize_design_file,
  STYLE_KEYS,
} from "../../src/components/admin/config-io";
import {
  get_default_settings,
  MAX_INSTANCE_OVERRIDES,
  type SettingsData,
} from "../../src/components/admin/types/settings";

const PALETTE = {
  bg: "#ffffff",
  bgSecondary: "#f4f4f5",
  bgCard: "#ffffff",
  text: "#18181b",
  textMuted: "#52525b",
  primary: "#1d4ed8",
  primaryHover: "#1e40af",
  primaryText: "#ffffff",
  accent: "#7c3aed",
  border: "#e4e4e7",
  success: "#15803d",
  error: "#b91c1c",
  warning: "#a16207",
  info: "#0369a1",
};

function source_settings(): SettingsData {
  return {
    ...get_default_settings(false),
    hiveUsername: "alice",
    pinnedPostPermlinks: ["my-post"],
    siteName: "Alice Blog",
    customColors: PALETTE,
    fontHeading: "fraunces",
    radiusPx: 12,
    gridColumns: 3,
    cardHoverEffect: "lift",
    instanceOverrides: { "page-sec-main:posts": { gridColumns: 4 } },
  };
}

function envelope(settings: Record<string, unknown>, extra = {}): string {
  return JSON.stringify({
    format: DESIGN_FORMAT,
    version: DESIGN_VERSION,
    scope: "full",
    settings,
    ...extra,
  });
}

function import_error(fn: () => unknown): DesignImportError {
  try {
    fn();
  } catch (error) {
    if (error instanceof DesignImportError) return error;
    throw error;
  }
  throw new Error("expected DesignImportError");
}

describe("export", () => {
  it("omits identity fields", () => {
    const file = build_design_file(source_settings(), "full");
    for (const key of IDENTITY_KEYS)
      expect(file.settings).not.toHaveProperty(key);
    expect(file.settings.siteName).toBe("Alice Blog");
  });

  it("style scope exports only style keys", () => {
    const file = build_design_file(source_settings(), "style");
    expect(Object.keys(file.settings).sort()).toEqual(
      STYLE_KEYS.filter((key) => source_settings()[key] !== undefined).sort(),
    );
  });

  it("does not alias the source settings", () => {
    const settings = source_settings();
    const file = build_design_file(settings, "full");
    expect(file.settings.customColors).not.toBe(settings.customColors);
  });

  it("whitelist covers every default settings key", () => {
    for (const key of Object.keys(get_default_settings(true))) {
      expect(KNOWN_SETTINGS_KEYS).toContain(key);
    }
  });

  it("builds a file name from the site name", () => {
    expect(design_file_name("Alice's Blog!")).toBe("alice-s-blog-design.json");
    expect(design_file_name("  ")).toBe("blog-design.json");
  });
});

describe("round-trip", () => {
  it("full scope restores every non-identity setting", () => {
    const source = source_settings();
    const target = { ...get_default_settings(false), hiveUsername: "bob" };
    const result = parse_design_file(
      serialize_design_file(source, "full"),
      target,
    );

    expect(result.skipped).toEqual([]);
    const applied = { ...target, ...result.patch };
    for (const key of KNOWN_SETTINGS_KEYS) {
      if (IDENTITY_KEYS.includes(key)) continue;
      expect(applied[key], key).toEqual(source[key]);
    }
    expect(applied.hiveUsername).toBe("bob");
    expect(result.changed_keys.sort()).toEqual(
      Object.keys(result.patch).sort(),
    );
    expect(result.changed_keys).toEqual(
      expect.arrayContaining([
        "siteName",
        "customColors",
        "fontHeading",
        "radiusPx",
        "instanceOverrides",
      ]),
    );
  });

  it("importing the same settings changes nothing", () => {
    const source = source_settings();
    const result = parse_design_file(serialize_design_file(source), source);
    expect(result.changed_keys).toEqual([]);
    expect(result.patch).toEqual({});
  });

  it("style scope ignores non-style keys", () => {
    const text = envelope({ radiusPx: 12, siteName: "x" }, { scope: "style" });
    const result = parse_design_file(text, get_default_settings(false));
    expect(result.scope).toBe("style");
    expect(result.patch).toEqual({ radiusPx: 12 });
    expect(result.skipped).toEqual([
      { key: "siteName", reason: "out_of_scope" },
    ]);
  });
});

describe("file size", () => {
  it("rejects text over the limit before parsing", () => {
    const text = envelope({ siteName: "x".repeat(MAX_DESIGN_FILE_BYTES) });
    expect(
      import_error(() => parse_design_file(text, get_default_settings(false)))
        .code,
    ).toBe("too_large");
  });

  it("counts UTF-8 bytes, not characters", () => {
    const text = envelope({ siteName: "ą".repeat(MAX_DESIGN_FILE_BYTES / 2) });
    expect(text.length).toBeLessThan(MAX_DESIGN_FILE_BYTES);
    expect(
      import_error(() => parse_design_file(text, get_default_settings(false)))
        .code,
    ).toBe("too_large");
  });

  it("rejects a Blob by size without reading it", async () => {
    const blob = new Blob(["x"]);
    Object.defineProperty(blob, "size", { value: MAX_DESIGN_FILE_BYTES + 1 });
    blob.text = () => Promise.reject(new Error("must not be read"));
    await expect(
      read_design_file(blob, get_default_settings(false)),
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("reads a Blob within the limit", async () => {
    const result = await read_design_file(
      new Blob([envelope({ radiusPx: 12 })]),
      get_default_settings(false),
    );
    expect(result.patch).toEqual({ radiusPx: 12 });
  });
});

describe("format and version", () => {
  const current = get_default_settings(false);

  it.each([
    ["not json", "{", "invalid_json"],
    ["array", "[]", "invalid_format"],
    [
      "wrong format",
      JSON.stringify({
        format: "other",
        version: 1,
        scope: "full",
        settings: {},
      }),
      "invalid_format",
    ],
    [
      "missing format",
      JSON.stringify({ version: 1, scope: "full", settings: {} }),
      "invalid_format",
    ],
    ["future version", envelope({}, { version: 2 }), "unsupported_version"],
    ["string version", envelope({}, { version: "1" }), "unsupported_version"],
    ["bad scope", envelope({}, { scope: "layout" }), "invalid_scope"],
    ["settings array", envelope({}, { settings: [] }), "invalid_settings"],
    [
      "settings missing",
      JSON.stringify({ format: DESIGN_FORMAT, version: 1, scope: "full" }),
      "invalid_settings",
    ],
  ])("%s throws %s", (_label, text, code) => {
    const error = import_error(() => parse_design_file(text, current));
    expect(error.code).toBe(code);
    expect(error.message).not.toBe("");
  });
});

describe("per-key validation", () => {
  const current = get_default_settings(false);

  it("rejects unknown keys instead of passing them through", () => {
    const result = parse_design_file(
      envelope({ radiusPx: 12, evilKey: "x", gridColumnz: 3 }),
      current,
    );
    expect(result.patch).toEqual({ radiusPx: 12 });
    expect(result.skipped).toEqual([
      { key: "evilKey", reason: "unknown_key" },
      { key: "gridColumnz", reason: "unknown_key" },
    ]);
  });

  it("skips invalid values one by one", () => {
    const result = parse_design_file(
      envelope({
        postsLayout: "carousel",
        fontBody: "comic-sans",
        radiusPx: "12",
        cardBorder: false,
      }),
      current,
    );
    expect(result.patch).toEqual({ cardBorder: false });
    expect(result.skipped.map((item) => item.key)).toEqual([
      "postsLayout",
      "fontBody",
      "radiusPx",
    ]);
    expect(
      result.skipped.every((item) => item.reason === "invalid_value"),
    ).toBe(true);
  });

  it("clamps style tokens through the schema", () => {
    const result = parse_design_file(envelope({ radiusPx: 999 }), current);
    expect(result.patch).toEqual({ radiusPx: 24 });
  });

  it("accepts only a complete hex palette for customColors", () => {
    const injected = { ...PALETTE, bg: "red; background:url(x)" };
    const partial = { bg: "#ffffff" };
    expect(
      parse_design_file(envelope({ customColors: injected }), current).skipped,
    ).toEqual([{ key: "customColors", reason: "invalid_value" }]);
    expect(
      parse_design_file(envelope({ customColors: partial }), current).patch,
    ).toEqual({});
    const extra = parse_design_file(
      envelope({ customColors: { ...PALETTE, extra: "#000" } }),
      current,
    );
    expect(extra.patch.customColors).toEqual(PALETTE);
  });

  it("ignores identity fields", () => {
    const result = parse_design_file(
      envelope({
        hiveUsername: "mallory",
        pinnedPostPermlinks: ["x"],
        radiusPx: 12,
      }),
      { ...current, hiveUsername: "bob" },
    );
    expect(result.patch).toEqual({ radiusPx: 12 });
    expect(result.skipped).toEqual([
      { key: "hiveUsername", reason: "identity" },
      { key: "pinnedPostPermlinks", reason: "identity" },
    ]);
  });
});

describe("prototype pollution", () => {
  it.each(["__proto__", "constructor", "prototype"])(
    "strips %s at every depth",
    (forbidden) => {
      const text = `{"format":"${DESIGN_FORMAT}","version":1,"scope":"full","settings":{"${forbidden}":{"polluted":true},"radiusPx":12,"customColors":{"${forbidden}":{"polluted":true}},"instanceOverrides":{"${forbidden}":{"gridColumns":2}}}}`;
      const result = parse_design_file(text, get_default_settings(false));

      expect(result.patch).toEqual({ radiusPx: 12 });
      expect(
        result.skipped.filter((item) => item.reason === "forbidden_key"),
      ).toHaveLength(3);
      expect(Object.hasOwn(result.patch, forbidden)).toBe(false);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(Object.prototype).not.toHaveProperty("polluted");
    },
  );
});

describe("instanceOverrides", () => {
  const current = get_default_settings(false);

  it("keeps valid entries and reports invalid ones", () => {
    const result = parse_design_file(
      envelope({
        instanceOverrides: {
          "page-sec-main:posts": {
            gridColumns: 3,
            cardGapPx: 999,
            hiveUsername: 1,
          },
          "bad key!:posts": { gridColumns: 2 },
          "page-sec-top:unknownElement": { gridColumns: 2 },
          "page-sec-top:authorProfile": "big",
        },
      }),
      current,
    );
    expect(result.patch.instanceOverrides).toEqual({
      "page-sec-main:posts": { gridColumns: 3 },
    });
    expect(result.skipped).toEqual([
      {
        key: "instanceOverrides.page-sec-main:posts.cardGapPx",
        reason: "invalid_value",
      },
      {
        key: "instanceOverrides.page-sec-main:posts.hiveUsername",
        reason: "unknown_key",
      },
      { key: "instanceOverrides.bad key!:posts", reason: "invalid_value" },
      {
        key: "instanceOverrides.page-sec-top:unknownElement.gridColumns",
        reason: "unknown_key",
      },
      {
        key: "instanceOverrides.page-sec-top:authorProfile",
        reason: "invalid_value",
      },
    ]);
  });

  it(`caps entries at ${MAX_INSTANCE_OVERRIDES}`, () => {
    const overrides: Record<string, unknown> = {};
    for (let index = 0; index < MAX_INSTANCE_OVERRIDES + 3; index += 1) {
      overrides[`sec-${index}:posts`] = { gridColumns: 2 };
    }
    const result = parse_design_file(
      envelope({ instanceOverrides: overrides }),
      current,
    );
    expect(Object.keys(result.patch.instanceOverrides ?? {})).toHaveLength(
      MAX_INSTANCE_OVERRIDES,
    );
    expect(result.skipped).toEqual([
      {
        key: `instanceOverrides.sec-${MAX_INSTANCE_OVERRIDES}:posts`,
        reason: "limit_exceeded",
      },
      {
        key: `instanceOverrides.sec-${MAX_INSTANCE_OVERRIDES + 1}:posts`,
        reason: "limit_exceeded",
      },
      {
        key: `instanceOverrides.sec-${MAX_INSTANCE_OVERRIDES + 2}:posts`,
        reason: "limit_exceeded",
      },
    ]);
  });

  it("rejects a non-object value", () => {
    const result = parse_design_file(
      envelope({ instanceOverrides: [] }),
      current,
    );
    expect(result.patch).toEqual({});
    expect(result.skipped).toEqual([
      { key: "instanceOverrides", reason: "invalid_value" },
    ]);
  });
});

describe("structured layout shape", () => {
  const current = get_default_settings(false);

  function nested_section(id: string, depth: number): Record<string, unknown> {
    if (depth === 1) {
      return {
        id,
        orientation: "vertical",
        children: [{ type: "element", id: "title" }],
      };
    }
    return {
      id,
      orientation: "vertical",
      children: [
        { type: "section", section: nested_section(`${id}-n`, depth - 1) },
      ],
    };
  }

  function rejected(settings: Record<string, unknown>): string[] {
    const result = parse_design_file(envelope(settings), current);
    expect(result.patch).toEqual({});
    return result.skipped
      .filter((item) => item.reason === "invalid_value")
      .map((item) => item.key);
  }

  it("rejects an unknown card section orientation", () => {
    expect(
      rejected({
        postCardLayout: {
          sections: [{ id: "s", orientation: "diagonal", children: [] }],
        },
      }),
    ).toEqual(["postCardLayout"]);
  });

  it("rejects unknown page layout slots and layout section positions", () => {
    expect(
      rejected({
        pageLayout: {
          sections: [
            {
              id: "s",
              slot: "header",
              orientation: "vertical",
              elements: [],
              active: true,
            },
          ],
        },
        layoutSections: [{ id: "s", position: "floating", enabled: true }],
      }),
    ).toEqual(["pageLayout", "layoutSections"]);
  });

  it("rejects arrays over 64 items", () => {
    const tabs = Array.from({ length: 65 }, (_, index) => ({
      id: `tab-${index}`,
      label: "Tab",
      enabled: true,
      showCount: false,
    }));
    expect(rejected({ navigationTabs: tabs })).toEqual(["navigationTabs"]);
    const ok = parse_design_file(
      envelope({ navigationTabs: tabs.slice(0, 64) }),
      current,
    );
    expect(ok.patch.navigationTabs).toHaveLength(64);
  });

  it("rejects card layouts nested deeper than 6 levels", () => {
    expect(
      rejected({ commentCardLayout: { sections: [nested_section("r", 7)] } }),
    ).toEqual(["commentCardLayout"]);
    const ok = parse_design_file(
      envelope({ commentCardLayout: { sections: [nested_section("r", 6)] } }),
      current,
    );
    expect(ok.changed_keys).toEqual(["commentCardLayout"]);
  });

  it("rejects ids over 64 characters and texts over 200 characters", () => {
    expect(
      rejected({
        layoutSections: [
          { id: "x".repeat(65), position: "main", enabled: true },
        ],
        navigationTabs: [
          {
            id: "posts",
            label: "y".repeat(201),
            enabled: true,
            showCount: true,
          },
        ],
      }),
    ).toEqual(["layoutSections", "navigationTabs"]);
  });

  it("drops extra keys inside structured items", () => {
    const result = parse_design_file(
      envelope({
        navigationTabs: [
          {
            id: "posts",
            label: "Posts",
            enabled: true,
            showCount: true,
            onclick: "x",
          },
        ],
      }),
      current,
    );
    expect(result.patch.navigationTabs).toEqual([
      { id: "posts", label: "Posts", enabled: true, showCount: true },
    ]);
  });

  it("migrates the legacy elements: string[] card format", () => {
    const result = parse_design_file(
      envelope({
        authorProfileLayout2: {
          sections: [
            {
              id: "s",
              orientation: "horizontal",
              elements: ["avatar", "name"],
            },
          ],
        },
      }),
      current,
    );
    expect(result.patch.authorProfileLayout2).toEqual({
      sections: [
        {
          id: "s",
          orientation: "horizontal",
          children: [
            { type: "element", id: "avatar" },
            { type: "element", id: "name" },
          ],
        },
      ],
    });
  });
});
