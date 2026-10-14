// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/config")>();
  return {
    ...actual,
    get_hive_images_endpoint: () => "https://img.custom-node.example",
  };
});

import {
  ContactUrlSchema,
  ImageRefSchema,
  ImageUrlSchema,
  UrlSchema,
  get_allowed_image_hosts,
  image_background_value,
  parse_image_ref,
  parse_link_url,
  safe_image_url,
  safe_link_url,
} from "../../src/lib/image-ref";

const GOOD = "https://images.hive.blog/DQm/photo.jpg";

describe("safe_image_url", () => {
  it.each([
    GOOD,
    "https://images.ecency.com/a.png",
    "https://files.peakd.com/file/x.webp",
    "https://steemitimages.com/x.jpg",
    "https://img.custom-node.example/a.png",
    "https://images.hive.blog:443/a.png",
  ])("accepts allowlisted https %s", (url) => {
    expect(safe_image_url(url)).not.toBeNull();
  });

  it.each([
    ["javascript", "javascript:alert(1)"],
    ["data", "data:image/svg+xml;base64,PHN2Zz4="],
    ["http", "http://images.hive.blog/a.png"],
    ["protocol-relative", "//images.hive.blog/a.png"],
    ["relative", "/a.png"],
    ["userinfo", "https://user@images.hive.blog/a.png"],
    ["userinfo with password", "https://u:p@images.hive.blog/a.png"],
    ["userinfo host spoof", "https://images.hive.blog@evil.example/a.png"],
    ["non-standard port", "https://images.hive.blog:8443/a.png"],
    ["backslash", "https:\\\\images.hive.blog\\a.png"],
    ["control char", "https://images.hive.blog/a\u0000.png"],
    ["newline", "https://images.hive.blog/a\n.png"],
    ["unknown host", "https://evil.example/a.png"],
    ["suffix host", "https://images.hive.blog.evil.example/a.png"],
    ["unicode homograph host", "https://imаges.hive.blog/a.png"],
    ["too long", `https://images.hive.blog/${"a".repeat(240)}`],
    ["not a string", 42],
    ["empty", ""],
  ])("rejects %s", (_label, url) => {
    expect(safe_image_url(url)).toBeNull();
  });

  it("rejects when unicode path expands past 256 bytes after encoding", () => {
    const url = `https://images.hive.blog/${"é".repeat(70)}`;
    expect(new TextEncoder().encode(url).length).toBeLessThanOrEqual(256);
    expect(safe_image_url(url)).toBeNull();
  });

  it("allowlist contains configured endpoint and static hosts", () => {
    expect(get_allowed_image_hosts()).toEqual(
      expect.arrayContaining([
        "images.hive.blog",
        "images.ecency.com",
        "files.peakd.com",
        "steemitimages.com",
        "img.custom-node.example",
      ]),
    );
  });
});

describe("safe_link_url / UrlSchema", () => {
  it("accepts https and normalizes", () => {
    expect(safe_link_url("https://example.com/path")).toBe(
      "https://example.com/path",
    );
    expect(UrlSchema.parse(" https://example.com ")).toBe(
      "https://example.com/",
    );
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://example.com",
    "//example.com",
    "https://user@example.com",
    "vbscript:msgbox(1)",
    `https://example.com/${"a".repeat(250)}`,
  ])("rejects %s", (url) => {
    expect(safe_link_url(url, { allow_contact: true })).toBeNull();
    expect(UrlSchema.safeParse(url).success).toBe(false);
  });

  it("mailto/tel only with allow_contact", () => {
    expect(safe_link_url("mailto:a@b.pl")).toBeNull();
    expect(safe_link_url("tel:+48 123 456 789")).toBeNull();
    expect(safe_link_url("mailto:a@b.pl", { allow_contact: true })).toBe(
      "mailto:a@b.pl",
    );
    expect(ContactUrlSchema.parse("tel:+48 123 456 789")).toBe(
      "tel:+48 123 456 789",
    );
  });

  it.each([
    "mailto:",
    'mailto:a@b.pl"onclick=x',
    "mailto:a@b.pl)",
    "tel:abc",
    "tel:+48\n123",
  ])("rejects malformed contact %s", (url) => {
    expect(safe_link_url(url, { allow_contact: true })).toBeNull();
  });

  it("parse_link_url returns undefined instead of throwing", () => {
    expect(parse_link_url("javascript:alert(1)")).toBeUndefined();
    expect(parse_link_url({})).toBeUndefined();
  });
});

describe("ImageRefSchema", () => {
  it("accepts a valid ref", () => {
    const ref = ImageRefSchema.parse({
      url: GOOD,
      alt: "Bees",
      w: 1200,
      h: 630,
    });
    expect(ref).toEqual({ url: GOOD, alt: "Bees", w: 1200, h: 630 });
  });

  it("requires alt unless decorative", () => {
    expect(ImageRefSchema.safeParse({ url: GOOD, alt: "" }).success).toBe(
      false,
    );
    expect(ImageRefSchema.safeParse({ url: GOOD, alt: "   " }).success).toBe(
      false,
    );
    expect(
      ImageRefSchema.safeParse({ url: GOOD, alt: "", decorative: true })
        .success,
    ).toBe(true);
  });

  it("limits alt to 125 code points", () => {
    expect(
      ImageRefSchema.safeParse({ url: GOOD, alt: "a".repeat(125) }).success,
    ).toBe(true);
    expect(
      ImageRefSchema.safeParse({ url: GOOD, alt: "a".repeat(126) }).success,
    ).toBe(false);
    expect(
      ImageRefSchema.safeParse({ url: GOOD, alt: "\u{1F41D}".repeat(125) })
        .success,
    ).toBe(true);
  });

  it.each([0, 8001, 1.5, -1, Number.NaN])("rejects dimension %s", (w) => {
    expect(ImageRefSchema.safeParse({ url: GOOD, alt: "x", w }).success).toBe(
      false,
    );
  });

  it("rejects bad url", () => {
    expect(ImageUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(
      ImageRefSchema.safeParse({
        url: "http://images.hive.blog/a.png",
        alt: "x",
      }).success,
    ).toBe(false);
  });
});

describe("parse_image_ref (tolerant read)", () => {
  it.each([
    null,
    "str",
    [],
    { url: "javascript:alert(1)", alt: "x" },
    { url: "https://evil.example/a.png", alt: "x" },
    { url: GOOD },
    { url: GOOD, alt: "a".repeat(126) },
    { url: GOOD, alt: 5 },
  ])("returns undefined for %j", (raw) => {
    expect(() => parse_image_ref(raw)).not.toThrow();
    expect(parse_image_ref(raw)).toBeUndefined();
  });

  it("drops invalid optional fields and keeps the ref", () => {
    expect(
      parse_image_ref({
        url: GOOD,
        alt: "x",
        w: 9000,
        h: "10",
        decorative: "yes",
      }),
    ).toEqual({
      url: GOOD,
      alt: "x",
    });
  });

  it("decorative ref without alt keeps empty alt", () => {
    expect(parse_image_ref({ url: GOOD, decorative: true, w: 100 })).toEqual({
      url: GOOD,
      alt: "",
      w: 100,
      decorative: true,
    });
  });

  it("strips unknown keys", () => {
    expect(
      parse_image_ref({ url: GOOD, alt: "x", onerror: "alert(1)" }),
    ).toEqual({ url: GOOD, alt: "x" });
  });
});

describe("image_background_value", () => {
  it('wraps a valid url in url("...")', () => {
    expect(image_background_value({ url: GOOD, alt: "" })).toBe(
      `url("${GOOD}")`,
    );
  });

  it.each([
    "https://images.hive.blog/a.png');background:url(https://evil.example/x",
    'https://images.hive.blog/a".png;color:red',
    "https://images.hive.blog/a (1).png",
  ])("neutralizes CSS breakout in %s", (url) => {
    const value = image_background_value(url);
    expect(value).toBeDefined();
    const inner = value!.slice('url("'.length, -'")'.length);
    expect(inner).not.toMatch(/['"()\\\s]/);
  });

  it.each([
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "http://images.hive.blog/a.png",
    "//images.hive.blog/a.png",
    "https://evil.example/a.png",
    "https://images.hive.blog\\@evil.example/a.png",
    undefined,
    null,
    { url: 1 },
  ])("returns undefined for %j", (raw) => {
    expect(image_background_value(raw)).toBeUndefined();
  });

  it("proxies through the Hive images endpoint when width is given", () => {
    const value = image_background_value(GOOD, { width: 1600 });
    expect(value).toMatch(
      /^url\("https:\/\/[^"]+\/1600x0\/https:\/\/images\.hive\.blog\/DQm\/photo\.jpg"\)$/,
    );
  });
});
