// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  CONFIG_SIZE_DANGER_RATIO,
  CONFIG_SIZE_WARN_RATIO,
  MAX_BODY_SIZE,
  body_byte_size,
  config_size_breakdown,
  config_size_level,
  largest_size_area,
  measure_config_body,
  shows_size_breakdown,
  size_area_has_editor,
} from "../../src/components/admin/config-size";

describe("body_byte_size", () => {
  it("counts UTF-8 bytes", () => {
    expect(body_byte_size("abc")).toBe(3);
    expect(body_byte_size("ż")).toBe(2);
    expect(body_byte_size("😀")).toBe(4);
  });
});

describe("config_size_level", () => {
  const max = 1000;

  it.each([
    [0, "ok"],
    [699, "ok"],
    [700, "warn"],
    [849, "warn"],
    [850, "danger"],
    [999, "danger"],
    [1000, "danger"],
    [1001, "blocked"],
  ] as const)("%i of 1000 bytes is %s", (bytes, level) => {
    expect(config_size_level(bytes, max)).toBe(level);
  });

  it("uses the 70/85/100% thresholds", () => {
    expect(CONFIG_SIZE_WARN_RATIO).toBe(0.7);
    expect(CONFIG_SIZE_DANGER_RATIO).toBe(0.85);
  });

  it("defaults to the 64KiB body limit", () => {
    expect(MAX_BODY_SIZE).toBe(64 * 1024);
    expect(config_size_level(MAX_BODY_SIZE)).toBe("danger");
    expect(config_size_level(MAX_BODY_SIZE + 1)).toBe("blocked");
  });
});

describe("measure_config_body", () => {
  it("reports bytes, ratio and level", () => {
    const body = "a".repeat(MAX_BODY_SIZE / 2);
    expect(measure_config_body(body)).toEqual({
      bytes: MAX_BODY_SIZE / 2,
      max: MAX_BODY_SIZE,
      ratio: 0.5,
      level: "ok",
    });
  });
});

describe("shows_size_breakdown", () => {
  it.each([
    ["ok", false],
    ["warn", false],
    ["danger", true],
    ["blocked", true],
  ] as const)("%s -> %s", (level, expected) => {
    expect(shows_size_breakdown(level)).toBe(expected);
  });
});

describe("config_size_breakdown", () => {
  const bytes_of = (areas: ReturnType<typeof config_size_breakdown>, id: string) =>
    areas.find((area) => area.id === id)!.bytes;

  it("splits a config into Style, Navigation, Footer, Sections, Pages and Other", () => {
    const settings = {
      siteName: "Blog",
      siteTheme: "light",
      fontBody: "inter",
      nav: { items: [] },
      footer: { columns: [] },
      home: { sections: [{ id: "posts001", type: "posts" }] },
      pages: [{ slug: "o-mnie", title: "Zażółć" }],
    };
    const total = body_byte_size(JSON.stringify(settings));
    const areas = config_size_breakdown(settings, total);

    const fragment = (...keys: (keyof typeof settings)[]) =>
      keys.reduce(
        (sum, key) => sum + body_byte_size(`"${key}":${JSON.stringify(settings[key])},`),
        0,
      );
    const named = fragment("siteTheme", "fontBody", "nav", "footer", "home", "pages");
    expect(areas).toEqual([
      { id: "style", label: "Style", bytes: fragment("siteTheme", "fontBody") },
      { id: "navigation", label: "Navigation", bytes: fragment("nav") },
      { id: "footer", label: "Footer", bytes: fragment("footer") },
      { id: "sections", label: "Sections", bytes: fragment("home") },
      { id: "pages", label: "Pages", bytes: fragment("pages") },
      { id: "other", label: "Other", bytes: total - named },
    ]);
    expect(areas.reduce((sum, area) => sum + area.bytes, 0)).toBe(total);
  });

  it("counts UTF-8 bytes of the area", () => {
    const ascii = bytes_of(config_size_breakdown({ pages: ["zazolc"] }, 100), "pages");
    const polish = bytes_of(config_size_breakdown({ pages: ["zażółć"] }, 100), "pages");
    expect(polish - ascii).toBe(4);
  });

  it("reports zero for areas missing from the config", () => {
    const areas = config_size_breakdown({ siteName: "Blog" }, 500);
    expect(areas.map((area) => area.bytes)).toEqual([0, 0, 0, 0, 0, 500]);
  });

  it("ignores inherited keys", () => {
    const inherited = Object.create({ home: { sections: [] } }) as object;
    expect(bytes_of(config_size_breakdown(inherited, 10), "sections")).toBe(0);
  });

  it("measures with the given encoder", () => {
    const settings = { home: "`" };
    const escaped = config_size_breakdown(settings, 100, (fragment) =>
      JSON.stringify(fragment).replaceAll("`", "\\u0060"),
    );
    const plain = config_size_breakdown(settings, 100);
    expect(bytes_of(escaped, "sections") - bytes_of(plain, "sections")).toBe(5);
  });

  it("never reports a negative remainder", () => {
    const areas = config_size_breakdown({ pages: ["x".repeat(50)] }, 10);
    expect(bytes_of(areas, "other")).toBe(0);
  });
});

describe("largest_size_area", () => {
  it("picks the biggest editor area, first on a tie, never Other", () => {
    expect(
      largest_size_area([
        { id: "style", label: "Style", bytes: 30 },
        { id: "sections", label: "Sections", bytes: 10 },
        { id: "pages", label: "Pages", bytes: 30 },
        { id: "other", label: "Other", bytes: 90 },
      ]),
    ).toEqual({ id: "style", label: "Style", bytes: 30 });
    expect(largest_size_area([{ id: "other", label: "Other", bytes: 90 }])).toBeNull();
    expect(largest_size_area([])).toBeNull();
  });
});

describe("size_area_has_editor", () => {
  it("opens every area with an editor, Pages included, but not Other", () => {
    for (const id of ["style", "navigation", "footer", "sections", "pages"] as const) {
      expect(size_area_has_editor(id)).toBe(true);
    }
    expect(size_area_has_editor("other")).toBe(false);
  });
});
