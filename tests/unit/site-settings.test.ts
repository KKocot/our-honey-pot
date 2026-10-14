// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it, vi } from "vitest";

// lucide-solid runs client-only code at import; the icons are irrelevant for this pure logic.
vi.mock(
  "lucide-solid",
  () =>
    new Proxy(
      {},
      {
        get: (_target, key) => (key === "then" ? undefined : () => null),
        has: () => true,
      },
    ),
);

import {
  config_size_message,
  config_size_tone,
  format_config_size,
  measure_settings_body,
  save_status_text,
} from "../../src/components/admin/panels/AdminPanel/EditorTopBar";
import {
  brand_falls_back_to_text,
  can_write_config,
  char_count,
  clamp_chars,
  counter_tone,
  FAVICON_FIELD,
  patch_group,
} from "../../src/components/admin/settings/SiteSettings";
import {
  MAX_BODY_SIZE,
  measure_config_body,
} from "../../src/components/admin/config-size";
import { build_config_body } from "../../src/components/admin/hive-broadcast";
import { get_default_settings } from "../../src/components/admin/types/settings";

describe("format_config_size", () => {
  it("formats bytes as KB with one decimal against the limit", () => {
    expect(format_config_size({ bytes: 23_962, max: MAX_BODY_SIZE })).toBe(
      "23.4 / 64 KB",
    );
  });

  it("shows zero and values over the limit", () => {
    expect(format_config_size({ bytes: 0, max: MAX_BODY_SIZE })).toBe(
      "0.0 / 64 KB",
    );
    expect(format_config_size({ bytes: 66_765, max: MAX_BODY_SIZE })).toBe(
      "65.2 / 64 KB",
    );
  });

  it("keeps a fractional limit readable", () => {
    expect(format_config_size({ bytes: 512, max: 1536 })).toBe("0.5 / 1.5 KB");
  });
});

describe("config size level mapping", () => {
  const level_at = (ratio: number) =>
    measure_config_body("a".repeat(Math.ceil(MAX_BODY_SIZE * ratio))).level;

  it("maps the thresholds to levels", () => {
    expect(level_at(0.5)).toBe("ok");
    expect(level_at(0.7)).toBe("warn");
    expect(level_at(0.95)).toBe("danger");
    expect(level_at(1)).toBe("danger");
    expect(measure_config_body("a".repeat(MAX_BODY_SIZE + 1)).level).toBe(
      "blocked",
    );
  });

  it("gives every level a theme tone and a message", () => {
    expect(config_size_tone("ok").text).toBe("text-text-muted");
    expect(config_size_tone("warn")).toEqual({
      text: "text-warning",
      bar: "bg-warning",
    });
    expect(config_size_tone("danger").text).toBe("text-error");
    expect(config_size_tone("blocked").bar).toBe("bg-error");
    expect(
      config_size_message({ level: "warn", max: MAX_BODY_SIZE }),
    ).toContain("getting large");
    expect(config_size_message({ level: "blocked", max: MAX_BODY_SIZE })).toBe(
      "Config exceeds 64 KB. Shorten pages or remove sections.",
    );
  });
});

describe("measure_settings_body", () => {
  it("measures the same body that is broadcast", () => {
    const settings = get_default_settings(true);
    const expected = measure_config_body(
      build_config_body("alice", settings, new Date(0).toISOString()),
    );
    expect(measure_settings_body("alice", settings)).toEqual(expected);
  });

  it("counts multi-byte characters as UTF-8 bytes", () => {
    const settings = get_default_settings(true);
    const ascii = measure_settings_body("alice", {
      ...settings,
      siteName: "zazolc",
    }).bytes;
    const polish = measure_settings_body("alice", {
      ...settings,
      siteName: "zażółć",
    }).bytes;
    expect(polish - ascii).toBe(4);
  });
});

describe("save_status_text with a size block", () => {
  const base = {
    status: "dirty" as const,
    unsaved_count: 1,
    blocked_message: null,
    loading: false,
    authenticated: true,
    is_owner: true,
  };

  it("explains why Save is disabled", () => {
    expect(
      save_status_text({
        ...base,
        size_blocked_message: "Config exceeds 64 KB.",
      }),
    ).toBe("Can't save: Config exceeds 64 KB.");
  });

  it("keeps the permission message first", () => {
    expect(
      save_status_text({
        ...base,
        is_owner: false,
        blocked_message: "Only @bob",
        size_blocked_message: "x",
      }),
    ).toBe("Preview only");
  });

  it("is unchanged without a size block", () => {
    expect(save_status_text(base)).toBe("1 unsaved change");
  });
});

describe("can_write_config", () => {
  const ok = { username: "alice", config_account: "alice", load_error: null };

  it("allows only the config account", () => {
    expect(can_write_config(ok)).toBe(true);
    expect(can_write_config({ ...ok, username: "bob" })).toBe(false);
    expect(can_write_config({ ...ok, username: null })).toBe(false);
    expect(can_write_config({ ...ok, config_account: null })).toBe(false);
  });

  it("is denied when the stored config could not be read", () => {
    expect(can_write_config({ ...ok, load_error: "network" })).toBe(false);
  });
});

describe("patch_group", () => {
  it("merges a patch and drops cleared optional keys", () => {
    const logo = { url: "https://images.hive.blog/a.png", alt: "Brand" };
    expect(
      patch_group({ mode: "logo", size: "md", logo }, { size: "lg" }),
    ).toEqual({ mode: "logo", size: "lg", logo });
    expect(
      patch_group({ mode: "logo", size: "md", logo }, { logo: undefined }),
    ).toEqual({ mode: "logo", size: "md" });
  });

  it("does not mutate the source group", () => {
    const seo = { description: "Old" };
    patch_group(seo, { description: undefined });
    expect(seo).toEqual({ description: "Old" });
  });
});

describe("description counter", () => {
  it("counts code points", () => {
    expect(char_count("zażółć")).toBe(6);
    expect(char_count("😀a")).toBe(2);
  });

  it("clamps to the limit without splitting surrogate pairs", () => {
    expect(clamp_chars("😀😀😀", 2)).toBe("😀😀");
    expect(clamp_chars("short", 160)).toBe("short");
  });

  it("turns amber from 90% and red at the limit", () => {
    expect(counter_tone(143, 160)).toBe("normal");
    expect(counter_tone(144, 160)).toBe("warn");
    expect(counter_tone(160, 160)).toBe("limit");
  });
});

describe("brand_falls_back_to_text", () => {
  it("falls back when a logo mode has no image", () => {
    expect(brand_falls_back_to_text({ mode: "logo" })).toBe(true);
    expect(
      brand_falls_back_to_text({
        mode: "logo+text",
        logo: { url: "https://images.hive.blog/a.png", alt: "B" },
      }),
    ).toBe(false);
    expect(brand_falls_back_to_text({ mode: "text" })).toBe(false);
  });
});

describe("FAVICON_FIELD", () => {
  it("hides the alt input because the favicon stores only a URL", () => {
    expect(FAVICON_FIELD.hide_alt).toBe(true);
    expect(FAVICON_FIELD.recommended.ratio).toBe(1);
  });
});
