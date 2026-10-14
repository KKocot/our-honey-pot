// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  MAX_BODY_SIZE,
  body_byte_size,
  config_size_level,
  measure_config_body,
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
    [900, "warn"],
    [901, "danger"],
    [1000, "danger"],
    [1001, "blocked"],
  ] as const)("%i of 1000 bytes is %s", (bytes, level) => {
    expect(config_size_level(bytes, max)).toBe(level);
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
