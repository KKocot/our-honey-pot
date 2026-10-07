// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REDUCED_MOTION_QUERY,
  get_initial_scroll_style,
  get_visible_scroll_style,
  prefers_reduced_motion,
} from "../../src/shared/utils/animations";

function stub_match_media(matches: boolean) {
  const match_media = vi.fn((query: string) => ({
    matches: query === REDUCED_MOTION_QUERY && matches,
  }));
  vi.stubGlobal("window", { matchMedia: match_media });
  return match_media;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prefers_reduced_motion", () => {
  it("is false without a window (SSR)", () => {
    expect(prefers_reduced_motion()).toBe(false);
  });

  it("is false when matchMedia is unavailable", () => {
    vi.stubGlobal("window", {});
    expect(prefers_reduced_motion()).toBe(false);
  });

  it.each([true, false])("mirrors the media query (matches=%s)", (matches) => {
    const match_media = stub_match_media(matches);
    expect(prefers_reduced_motion()).toBe(matches);
    expect(match_media).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
  });
});

describe("get_initial_scroll_style", () => {
  it.each([
    ["fade", { opacity: "0" }],
    ["slide-up", { opacity: "0", transform: "translateY(20px)" }],
    ["slide-left", { opacity: "0", transform: "translateX(-20px)" }],
    ["zoom", { opacity: "0", transform: "scale(0.9)" }],
    ["flip", { opacity: "0", transform: "perspective(600px) rotateX(-10deg)" }],
    ["none", {}],
    ["unknown", {}],
  ])("returns the hidden start state for %s", (type, expected) => {
    expect(get_initial_scroll_style(type, false)).toEqual(expected);
  });

  it.each(["fade", "slide-up", "slide-left", "zoom", "flip"])(
    "skips the start state for %s with reduced motion",
    (type) => {
      expect(get_initial_scroll_style(type, true)).toEqual({});
    },
  );

  it("reads the user preference by default", () => {
    stub_match_media(true);
    expect(get_initial_scroll_style("slide-up")).toEqual({});

    stub_match_media(false);
    expect(get_initial_scroll_style("slide-up")).toEqual({
      opacity: "0",
      transform: "translateY(20px)",
    });
  });
});

describe("get_visible_scroll_style", () => {
  it("resets opacity and transform", () => {
    expect(get_visible_scroll_style()).toEqual({
      opacity: "1",
      transform: "none",
    });
  });
});
