// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  AA_RATIO,
  AAA_RATIO,
  BORDER_RATIO_MAX,
  BORDER_RATIO_MIN,
  HARMONIES,
  THEME_TOKENS,
  audit_contrast,
  contrast_ratio,
  fix_token,
  generate_palette,
  hex_to_oklch,
  shuffle_palette,
  type PaletteMode,
  type ThemeToken,
} from "../../src/components/admin/palette";
import type { ThemeColors } from "../../src/components/admin/types/theme";

const HEX = /^#[0-9a-f]{6}$/;

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

function random_accents(count: number, seed: number): string[] {
  const rng = seeded(seed);
  return Array.from(
    { length: count },
    () =>
      "#" +
      Math.floor(rng() * 0xffffff)
        .toString(16)
        .padStart(6, "0"),
  );
}

const ACCENTS = [
  ...random_accents(24, 42),
  "#000000",
  "#ffffff",
  "#808080",
  "#ff0000",
  "#ffff00",
  "#00ffff",
  "#e1ff51",
  "#ffc94b",
];

function expect_thresholds(c: ThemeColors, label: string): void {
  for (const token of THEME_TOKENS)
    expect(c[token], `${label} ${token}`).toMatch(HEX);
  expect(
    contrast_ratio(c.text, c.bg),
    `${label} text/bg`,
  ).toBeGreaterThanOrEqual(AAA_RATIO);
  for (const token of [
    "textMuted",
    "primary",
    "accent",
    "warning",
    "error",
  ] as const) {
    expect(
      contrast_ratio(c[token], c.bgCard),
      `${label} ${token}/bgCard`,
    ).toBeGreaterThanOrEqual(AA_RATIO);
  }
  expect(
    contrast_ratio(c.primaryText, c.primary),
    `${label} primaryText/primary`,
  ).toBeGreaterThanOrEqual(AA_RATIO);
  expect(
    contrast_ratio(c.primaryText, c.primaryHover),
    `${label} primaryText/primaryHover`,
  ).toBeGreaterThanOrEqual(AA_RATIO);
  expect(
    contrast_ratio(c.primaryHover, c.bgCard),
    `${label} primaryHover/bgCard`,
  ).toBeGreaterThanOrEqual(AA_RATIO);
  const border = contrast_ratio(c.border, c.bgCard);
  expect(border, `${label} border/bgCard`).toBeGreaterThanOrEqual(
    BORDER_RATIO_MIN,
  );
  expect(border, `${label} border/bgCard`).toBeLessThanOrEqual(
    BORDER_RATIO_MAX,
  );
}

describe("generate_palette", () => {
  for (const mode of ["light", "dark"] as PaletteMode[]) {
    describe(mode, () => {
      it.each(ACCENTS.map((accent, i) => [accent, i]))(
        "accent %s passes contrast thresholds",
        (accent, i) => {
          const colors = generate_palette({
            accent: accent as string,
            mode,
            seed: (i as number) + 1,
          });
          expect_thresholds(colors, `${mode} ${accent}`);
        },
      );
    });
  }

  it("produces light surfaces in light mode and dark surfaces in dark mode", () => {
    const light = generate_palette({
      accent: "#3366ff",
      mode: "light",
      seed: 1,
    });
    const dark = generate_palette({ accent: "#3366ff", mode: "dark", seed: 1 });
    expect(hex_to_oklch(light.bg).l).toBeGreaterThan(0.9);
    expect(hex_to_oklch(dark.bg).l).toBeLessThan(0.25);
  });

  it("keeps primaryHover about 8% L away from primary", () => {
    for (const mode of ["light", "dark"] as PaletteMode[]) {
      const c = generate_palette({ accent: "#2b59ff", mode, seed: 7 });
      const delta = Math.abs(
        hex_to_oklch(c.primaryHover).l - hex_to_oklch(c.primary).l,
      );
      expect(delta).toBeGreaterThan(0.06);
      expect(delta).toBeLessThan(0.1);
    }
  });

  it("is deterministic for a given seed", () => {
    for (const harmony of HARMONIES) {
      const a = generate_palette({
        accent: "#9a0002",
        mode: "light",
        seed: 123,
        harmony,
      });
      const b = generate_palette({
        accent: "#9a0002",
        mode: "light",
        seed: 123,
        harmony,
      });
      expect(a).toEqual(b);
    }
    expect(
      generate_palette({ accent: "#9a0002", mode: "dark", seed: 5 }),
    ).toEqual(generate_palette({ accent: "#9a0002", mode: "dark", seed: 5 }));
  });

  it("rotates accent hue per harmony", () => {
    const accent = "#c2410c";
    const base = hex_to_oklch(accent).h;
    const hue_distance = (h: number) => {
      const d = Math.abs(h - base) % 360;
      return d > 180 ? 360 - d : d;
    };
    const complementary = generate_palette({
      accent,
      mode: "light",
      seed: 3,
      harmony: "complementary",
    });
    const analogous = generate_palette({
      accent,
      mode: "light",
      seed: 3,
      harmony: "analogous",
    });
    expect(hue_distance(hex_to_oklch(complementary.accent).h)).toBeGreaterThan(
      150,
    );
    expect(hue_distance(hex_to_oklch(analogous.accent).h)).toBeLessThan(45);
  });

  it("accepts short hex and rejects invalid input", () => {
    expect(
      generate_palette({ accent: "#f06", mode: "light", seed: 1 }).primary,
    ).toMatch(HEX);
    expect(() =>
      generate_palette({ accent: "nope", mode: "light", seed: 1 }),
    ).toThrow();
  });
});

describe("shuffle_palette", () => {
  const base = generate_palette({ accent: "#00555a", mode: "light", seed: 11 });

  const lock_sets: ThemeToken[][] = [
    [],
    ["primary"],
    ["bg", "bgCard"],
    ["text", "accent", "border"],
    ["primary", "primaryText", "success", "info"],
    [...THEME_TOKENS],
  ];

  it.each(lock_sets.map((s) => [s.join(",") || "none", s]))(
    "keeps locked tokens verbatim (%s)",
    (_, locked) => {
      for (let seed = 1; seed <= 10; seed++) {
        const { colors } = shuffle_palette(base, {
          mode: "light",
          locked: locked as ThemeToken[],
          seed,
        });
        for (const token of locked as ThemeToken[])
          expect(colors[token]).toBe(base[token]);
      }
    },
  );

  it("unlocked tokens still pass thresholds around locked surfaces", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { colors } = shuffle_palette(base, {
        mode: "light",
        locked: ["bg", "bgCard", "primary"],
        seed,
      });
      expect_thresholds(colors, `shuffle seed ${seed}`);
    }
    const dark = generate_palette({ accent: "#e1ff51", mode: "dark", seed: 2 });
    for (let seed = 1; seed <= 20; seed++) {
      const { colors } = shuffle_palette(dark, {
        mode: "dark",
        locked: ["bgCard", "accent"],
        seed,
      });
      expect(colors.accent).toBe(dark.accent);
      expect_thresholds(colors, `dark shuffle seed ${seed}`);
    }
  });

  it("returns a harmony and is deterministic for a seed", () => {
    const a = shuffle_palette(base, {
      mode: "light",
      locked: ["bg"],
      seed: 99,
    });
    const b = shuffle_palette(base, {
      mode: "light",
      locked: ["bg"],
      seed: 99,
    });
    expect(a).toEqual(b);
    expect(HARMONIES).toContain(a.harmony);
    const seen = new Set(
      Array.from(
        { length: 30 },
        (_, i) => shuffle_palette(base, { mode: "light", seed: i }).harmony,
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });
});

// ux-brief section 3; token order: bg bgSecondary bgCard text textMuted primary primaryHover primaryText accent border success error warning info
const PRESETS: Record<string, string> = {
  Essay:
    "#fffbea #fdf3cf #ffffff #013e37 #4a5d55 #013e37 #02574d #ffefb3 #9a6b00 #e8dfb8 #1f7a3d #b42318 #9a5b00 #1d5f8a",
  Terminal:
    "#001d21 #00272c #04333a #e8f3ef #9fb8b3 #e1ff51 #ecff8a #00272c #5eead4 #12474f #4ade80 #ff7b72 #fbbf24 #67c8ff",
  Gallery:
    "#120c18 #1c1424 #231a2d #f4eef8 #b9aec4 #f15153 #ff6f70 #1a0b0d #c9a7ff #352a42 #4ade80 #ff8a8a #fbbf24 #7dd3fc",
  "Front Page":
    "#f7f1ea #efe6dd #fffdfa #1d1a17 #5f554c #9a0002 #7a0002 #ffffff #b45309 #ddd0c2 #2f7d32 #b3261e #8a5300 #1f5f99",
  Notebook:
    "#f5f0ff #ebe3fc #ffffff #2a1d47 #5b4b7a #3b2a60 #4e3a7c #ffffff #6d4fc2 #ddd2f5 #1e7b4b #b42346 #8f5a00 #2563a8",
  Poster:
    "#fff4b8 #ffd60a #ffffff #111111 #3d3d3d #d1005a #a80048 #ffffff #2b59ff #111111 #0a7a3e #c1121f #8a4b00 #1d4ed8",
  "Kitchen Table":
    "#fff7ec #fdebd3 #ffffff #432c1c #6e5644 #432c1c #5a3c27 #ffffff #a15c00 #f0dcc2 #2f7d32 #b3261e #8a5300 #1f5f99",
  "Hive Commons":
    "#f3f8f8 #e3eeee #ffffff #0f2a2b #45615f #00555a #00444a #ffffff #8a6100 #cfe0df #1e7b4b #b42318 #8a5300 #1d5f8a",
};

function to_colors(hexes: string): ThemeColors {
  const values = hexes.split(" ");
  return Object.fromEntries(
    THEME_TOKENS.map((t, i) => [t, values[i]]),
  ) as unknown as ThemeColors;
}

describe("preset palettes (ux-brief section 3)", () => {
  it.each(Object.entries(PRESETS))("%s passes AA audit", (_, hexes) => {
    const failing = audit_contrast(to_colors(hexes)).filter(
      (p) => p.status === "fail",
    );
    expect(failing.map((p) => `${p.fg}/${p.bg} ${p.ratio.toFixed(2)}`)).toEqual(
      [],
    );
  });
});

describe("audit_contrast", () => {
  it("classifies pairs as AAA / AA / fail", () => {
    const colors = to_colors(PRESETS.Essay);
    const audit = audit_contrast({
      ...colors,
      text: "#000000",
      textMuted: "#767676",
      accent: "#cccccc",
    });
    const find = (fg: ThemeToken, bg: ThemeToken) =>
      audit.find((p) => p.fg === fg && p.bg === bg);
    expect(find("text", "bgCard")?.status).toBe("AAA");
    expect(find("textMuted", "bgCard")?.status).toBe("AA");
    expect(find("accent", "bgCard")?.status).toBe("fail");
    expect(find("primaryText", "primary")).toBeDefined();
    expect(find("text", "bg")).toBeDefined();
  });
});

describe("fix_token", () => {
  it("pulls a failing token to AA without touching others", () => {
    const colors = { ...to_colors(PRESETS["Hive Commons"]), accent: "#ffc94b" };
    const fixed = fix_token(colors, "accent");
    expect(contrast_ratio(fixed.accent, fixed.bgCard)).toBeGreaterThanOrEqual(
      AA_RATIO,
    );
    for (const token of THEME_TOKENS)
      if (token !== "accent") expect(fixed[token]).toBe(colors[token]);
  });

  it("fixes primaryText against primary", () => {
    const colors = { ...to_colors(PRESETS.Poster), primaryText: "#ff4d8f" };
    const fixed = fix_token(colors, "primaryText");
    expect(
      contrast_ratio(fixed.primaryText, fixed.primary),
    ).toBeGreaterThanOrEqual(AA_RATIO);
  });

  it("fixes dark-mode muted text", () => {
    const colors = { ...to_colors(PRESETS.Terminal), textMuted: "#2a4a4f" };
    const fixed = fix_token(colors, "textMuted");
    expect(
      contrast_ratio(fixed.textMuted, fixed.bgCard),
    ).toBeGreaterThanOrEqual(AA_RATIO);
  });

  it("leaves a passing token unchanged", () => {
    const colors = to_colors(PRESETS.Essay);
    expect(fix_token(colors, "text")).toEqual(colors);
  });
});
