// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  build_runtime_config,
  get_hive_api_endpoints,
  get_hive_blog_url,
  get_runtime_config,
  hive_avatar_url,
  hive_image_proxy,
  is_not_mainnet,
  parse_client_runtime_config,
  RuntimeConfigError,
  serialize_client_runtime_config,
  set_server_env_reader,
  validate_hive_username,
  type EnvReader,
} from "../../src/lib/config";
import * as config_module from "../../src/lib/config";
import { renderPostBody } from "../../src/lib/renderer";

const reader_of =
  (values: Record<string, string>): EnvReader =>
  (key) =>
    values[key];

afterEach(() => {
  set_server_env_reader(() => undefined);
  vi.unstubAllEnvs();
});

describe("HIVE_USERNAME fail-fast", () => {
  it.each(["barddev", "hive-123", "hive-198753", "foo.bar", "abc"])(
    "accepts %s",
    (name) => {
      expect(validate_hive_username(name)).toBe(name);
    },
  );

  it.each([
    "ab",
    "Barddev",
    "under_score",
    "1abc",
    "abc-",
    "a--bc",
    "foo.ba",
    "averyveryverylongname",
    "evil</script>",
  ])("rejects %s with a readable error", (name) => {
    expect(() => validate_hive_username(name)).toThrow(RuntimeConfigError);
    expect(() => validate_hive_username(name)).toThrow(/Invalid HIVE_USERNAME/);
  });

  it("treats a missing username as no blog owner", () => {
    expect(build_runtime_config(() => undefined).hive_username).toBe("");
  });

  it("throws when the server reader yields an invalid username", () => {
    expect(() =>
      set_server_env_reader(reader_of({ HIVE_USERNAME: "Not Valid" })),
    ).toThrow(RuntimeConfigError);
  });
});

describe("runtime values", () => {
  it("falls back to defaults when env is empty", () => {
    const config = build_runtime_config(
      reader_of({ PUBLIC_HIVE_BLOG_URL: "  " }),
    );
    expect(config.hive_api_endpoint).toBe("https://api.openhive.network");
    expect(config.hive_images_endpoint).toBe("https://images.hive.blog");
    expect(config.hive_blog_url).toBe(config.beeyard_url);
  });

  it("reads overrides at runtime, not at import time", () => {
    set_server_env_reader(
      reader_of({
        HIVE_USERNAME: "hive-123",
        PUBLIC_HIVE_API_ENDPOINT: "https://mirror.example",
        PUBLIC_HIVE_CHAIN_ID: "42",
        PUBLIC_HIVE_IMAGES_ENDPOINT: "https://img.example",
        PUBLIC_HIVE_BLOG_URL: "https://blog.example",
      }),
    );
    expect(get_runtime_config().hive_username).toBe("hive-123");
    expect(is_not_mainnet()).toBe(true);
    expect(get_hive_api_endpoints()).toEqual(["https://mirror.example"]);
    expect(hive_avatar_url("alice")).toBe("https://img.example/u/alice/avatar");
    expect(hive_image_proxy("https://x.example/a.png", 10)).toBe(
      "https://img.example/10x0/https://x.example/a.png",
    );
    expect(get_hive_blog_url()).toBe("https://blog.example");
    expect(config_module.get_hive_username()).toBe("hive-123");
    expect(renderPostBody("@alice")).toContain("https://blog.example/@alice");
  });

  it("uses mainnet fallbacks for a mainnet endpoint", () => {
    set_server_env_reader(() => undefined);
    expect(is_not_mainnet()).toBe(false);
    expect(get_hive_api_endpoints().length).toBeGreaterThan(1);
  });

  it("registers astro:env/server as the reader in runtime-config", async () => {
    vi.stubEnv("HIVE_USERNAME", "hive-777");
    await import("../../src/lib/runtime-config");
    expect(get_runtime_config().hive_username).toBe("hive-777");
  });
});

describe("client JSON block", () => {
  const config = build_runtime_config(
    reader_of({ HIVE_USERNAME: "hive-123", PUBLIC_HIVE_CHAIN_ID: "42" }),
  );

  it("round-trips through serialize and parse", () => {
    expect(
      parse_client_runtime_config(serialize_client_runtime_config(config)),
    ).toEqual(config);
  });

  it("escapes </script> so the block cannot be closed early", () => {
    const json = serialize_client_runtime_config({
      ...config,
      hive_blog_url: "https://x.example/</script><script>alert(1)</script>&",
    });
    expect(json).not.toContain("<");
    expect(json).not.toContain(">");
    expect(json).not.toContain("&");
    expect(parse_client_runtime_config(json).hive_blog_url).toBe(
      "https://x.example/</script><script>alert(1)</script>&",
    );
  });

  it("applies defaults to missing fields", () => {
    const parsed = parse_client_runtime_config('{"hive_username":"hive-123"}');
    expect(parsed.hive_api_endpoint).toBe("https://api.openhive.network");
  });

  it.each([null, undefined, "", "not json", "[]", "42"])(
    "rejects missing or malformed block %s with a readable error",
    (text) => {
      expect(() => parse_client_runtime_config(text)).toThrow(
        RuntimeConfigError,
      );
    },
  );

  it("rejects an invalid username from the block", () => {
    expect(() =>
      parse_client_runtime_config('{"hive_username":"BAD NAME"}'),
    ).toThrow(/Invalid HIVE_USERNAME/);
  });
});
