// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";

const state = vi.hoisted(() => ({
  settings: { hiveUsername: "" } as Record<string, unknown>,
  hive_query: {
    status: "pending" as "pending" | "error" | "success",
    data: undefined as unknown,
    error: null as unknown,
    refetch: () => Promise.resolve(),
  },
}));

vi.mock("../../../src/components/admin/queries", () => ({
  settings: state.settings,
  is_community_mode: () => false,
  useHivePreviewQuery: () => state.hive_query,
}));

vi.mock("../../../src/lib/queries", () => ({
  fetch_community: vi.fn(),
}));

vi.mock("@tanstack/solid-query", () => ({
  createQuery: () => ({
    status: "pending",
    data: undefined,
    error: null,
    refetch: () => Promise.resolve(),
  }),
}));

import {
  use_canvas_data,
  type CanvasDataState,
} from "../../../src/components/admin/canvas/use_canvas_data";
import { create_mock_hive_data } from "../../../src/components/admin/canvas/mocks";

function mount(synced: boolean): {
  canvas: CanvasDataState;
  dispose: () => void;
} {
  return createRoot((dispose) => ({
    canvas: use_canvas_data({ is_synced: () => synced }),
    dispose,
  }));
}

describe("use_canvas_data before the settings store is synced", () => {
  beforeEach(() => {
    state.settings.hiveUsername = "";
    state.hive_query.status = "pending";
    state.hive_query.data = undefined;
    state.hive_query.error = null;
  });

  it("reports loading instead of sample data while the account is still unknown", () => {
    const { canvas, dispose } = mount(false);
    expect(canvas.source).not.toBe("mock");
    expect(canvas.mock_reason).toBeNull();
    expect(canvas.is_loading).toBe(true);
    expect(canvas.data).toBeNull();
    dispose();
  });

  it("falls back to no_account sample data once the synced config has no account", () => {
    const { canvas, dispose } = mount(true);
    expect(canvas.source).toBe("mock");
    expect(canvas.mock_reason).toBe("no_account");
    expect(canvas.is_loading).toBe(false);
    expect(canvas.data?.hive).not.toBeNull();
    dispose();
  });

  it("waits for live data once the synced config has an account", () => {
    state.settings.hiveUsername = "alice";
    const { canvas, dispose } = mount(true);
    expect(canvas.source).toBe("live");
    expect(canvas.is_loading).toBe(true);
    expect(canvas.data).toBeNull();
    dispose();
  });

  it("shows live data once the synced account has loaded", () => {
    state.settings.hiveUsername = "alice";
    const hive = create_mock_hive_data("alice");
    state.hive_query.status = "success";
    state.hive_query.data = hive;
    const { canvas, dispose } = mount(true);
    expect(canvas.source).toBe("live");
    expect(canvas.is_loading).toBe(false);
    expect(canvas.data?.hive).toBe(hive);
    dispose();
  });

  it("keeps an explicit sample-data choice available before the sync", () => {
    const { canvas, dispose } = createRoot((dispose) => ({
      canvas: use_canvas_data({ initial_mode: "mock", is_synced: () => false }),
      dispose,
    }));
    expect(canvas.source).toBe("mock");
    expect(canvas.mock_reason).toBe("user_choice");
    dispose();
  });
});
