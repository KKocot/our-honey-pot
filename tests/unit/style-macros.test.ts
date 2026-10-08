// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  density_patch,
  parse_hex,
  radius_patch,
} from "../../src/components/admin/settings/ThemeSettings/style-macros";
import type { Density } from "../../src/components/admin/types/settings";

const spacing = (density: Density | string, px: number, comment = 16) => ({
  density: density as Density,
  cardPaddingPx: px,
  cardGapPx: px,
  commentPaddingPx: comment,
});

describe("radius_patch", () => {
  it("moves the radius token and the card radius together", () => {
    expect(radius_patch(12)).toEqual({ radiusPx: 12, cardBorderRadiusPx: 12 });
  });

  it("snaps to the slider step and clamps to the token range", () => {
    expect(radius_patch(7).radiusPx).toBe(8);
    expect(radius_patch(30)).toEqual({ radiusPx: 24, cardBorderRadiusPx: 24 });
    expect(radius_patch(-5)).toEqual({ radiusPx: 0, cardBorderRadiusPx: 0 });
  });

  it("falls back to 0 for a non-finite value", () => {
    expect(radius_patch(Number.NaN)).toEqual({
      radiusPx: 0,
      cardBorderRadiusPx: 0,
    });
  });

  it("never touches instanceOverrides", () => {
    expect(radius_patch(10)).not.toHaveProperty("instanceOverrides");
  });
});

describe("density_patch", () => {
  it("rescales spacing by the ratio of the multipliers", () => {
    expect(density_patch(spacing("comfortable", 24), "compact")).toEqual({
      density: "compact",
      cardPaddingPx: 19,
      cardGapPx: 19,
      commentPaddingPx: 13,
    });
  });

  it("is a no-op scale when the density does not change", () => {
    expect(density_patch(spacing("spacious", 30, 20), "spacious")).toEqual({
      density: "spacious",
      cardPaddingPx: 30,
      cardGapPx: 30,
      commentPaddingPx: 20,
    });
  });

  it("clamps the scaled values to the instance override ranges", () => {
    const up = density_patch(spacing("compact", 60, 30), "spacious");
    expect(up.cardPaddingPx).toBe(64);
    expect(up.cardGapPx).toBe(64);
    expect(up.commentPaddingPx).toBe(32);

    const down = density_patch(spacing("comfortable", 0, 8), "compact");
    expect(down.cardPaddingPx).toBe(0);
    expect(down.commentPaddingPx).toBe(8);
  });

  it("treats an unknown stored density as comfortable", () => {
    expect(density_patch(spacing("huge", 20), "spacious").cardPaddingPx).toBe(
      25,
    );
  });

  it("never touches instanceOverrides", () => {
    expect(
      density_patch(spacing("comfortable", 24), "compact"),
    ).not.toHaveProperty("instanceOverrides");
  });
});

describe("parse_hex", () => {
  it("normalizes 6 digit colors to lower case with a hash", () => {
    expect(parse_hex("#AABBCC")).toBe("#aabbcc");
    expect(parse_hex("aabbcc")).toBe("#aabbcc");
    expect(parse_hex("  #123456 ")).toBe("#123456");
  });

  it("expands 3 digit colors", () => {
    expect(parse_hex("#fA0")).toBe("#ffaa00");
  });

  it("rejects anything that is not a 3/6 digit hex", () => {
    for (const value of [
      "",
      "#",
      "#12",
      "#1234",
      "#12345g",
      "red",
      "#1234567",
    ]) {
      expect(parse_hex(value)).toBeNull();
    }
  });
});
