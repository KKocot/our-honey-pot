// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import { is_hex_color } from "../../src/shared/utils/color";

describe("is_hex_color", () => {
  it("accepts 3, 4, 6 and 8 digit hex colors", () => {
    for (const value of ["#fA0", "#fA08", "#ffAA00", "#ffAA0080"]) {
      expect(is_hex_color(value)).toBe(true);
    }
  });

  it("rejects hex lengths that are not valid CSS colors", () => {
    for (const value of ["#12", "#12345", "#1234567", "#123456789"]) {
      expect(is_hex_color(value)).toBe(false);
    }
  });

  it("rejects non-hex and non-string values", () => {
    for (const value of [
      "",
      "#",
      "#12345g",
      "red",
      "ffaa00",
      " #fff",
      123,
      null,
      undefined,
    ]) {
      expect(is_hex_color(value)).toBe(false);
    }
  });
});
