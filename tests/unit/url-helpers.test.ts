// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import { css_url_value, safe_url } from "../../src/shared/utils/url_helpers";

describe("safe_url", () => {
  it.each([
    ["javascript:alert(1)"],
    ["JaVaScRiPt:alert(1)"],
    [" javascript:alert(1)"],
    ["java\tscript:alert(1)"],
    ["java\nscript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["vbscript:msgbox(1)"],
    ["file:///etc/passwd"],
    ["ftp://evil.com/x"],
    ["//evil.com"],
    ["/\\evil.com"],
    ["\\\\evil.com"],
    ["https:\\\\evil.com"],
    ["https://evil.com\u0000.example"],
    ["https://"],
    ["evil.com"],
    [""],
    ["   "],
  ])("rejects %j", (raw) => {
    expect(safe_url(raw)).toBeNull();
    expect(safe_url(raw, { allow_relative: true })).toBeNull();
  });

  it.each([
    [null],
    [undefined],
    [42],
    [{}],
    [["https://a.example"]],
    [{ toString: (): string => "https://a.example" }],
  ])("rejects non-string %j", (raw) => {
    expect(safe_url(raw)).toBeNull();
  });

  it("accepts and normalizes absolute http(s) URLs", () => {
    expect(safe_url("https://a.example/x?y=1#z")).toBe(
      "https://a.example/x?y=1#z",
    );
    expect(safe_url("  HTTP://A.EXAMPLE  ")).toBe("http://a.example/");
  });

  it("percent-encodes characters that could break an attribute", () => {
    const url = safe_url(`https://a.example/"><script>`);
    expect(url).not.toBeNull();
    expect(url).not.toMatch(/["<>]/);
  });

  it("root-relative paths only with allow_relative", () => {
    expect(safe_url("/@alice/post")).toBeNull();
    expect(safe_url("/@alice/post", { allow_relative: true })).toBe(
      "/@alice/post",
    );
  });
});

describe("css_url_value", () => {
  it("encodes characters that break out of url('...')", () => {
    const value = css_url_value(
      `https://a.example/x.png'); background:url('javascript:alert(1)`,
    );
    expect(value).not.toBeNull();
    expect(value).not.toMatch(/['"()\\\s]/);
  });

  it("rejects unsafe schemes", () => {
    expect(css_url_value("javascript:alert(1)")).toBeNull();
    expect(css_url_value("//evil.com/x.png")).toBeNull();
  });
});
