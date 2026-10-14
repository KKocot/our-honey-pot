// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { describe, expect, it } from "vitest";
import {
  KEYCHAIN_UPLOAD_MESSAGE,
  UPLOAD_ACCEPT,
  UPLOAD_MAX_MB,
  alt_issue,
  field_alt_issue,
  build_image_ref,
  effective_mode,
  image_error_message,
  image_warnings,
  is_local_preview_url,
  precheck_file,
  resolve_pasted_url,
  upload_availability,
  upload_error_code,
} from "../../src/components/admin/canvas/popovers/ImageField";
import {
  ImageProcessingError,
  MAX_INPUT_BYTES,
} from "../../src/lib/image-processing";
import { ImageUploadError } from "../../src/lib/image-upload";

describe("upload_availability", () => {
  it("hides upload for roles without config write access", () => {
    expect(upload_availability({ can_upload: false, login_type: "wif" })).toBe(
      "hidden",
    );
  });

  it.each([
    ["hbauth", "available"],
    ["wif", "available"],
    ["dev", "available"],
    ["keychain", "keychain"],
    [null, "signed_out"],
  ] as const)("login %s -> %s", (login_type, expected) => {
    expect(upload_availability({ can_upload: true, login_type })).toBe(
      expected,
    );
  });
});

describe("effective_mode", () => {
  it("keeps the requested mode only when upload is available", () => {
    expect(effective_mode("upload", "available")).toBe("upload");
    expect(effective_mode("paste", "available")).toBe("paste");
  });

  it.each(["keychain", "signed_out", "hidden"] as const)(
    "falls back to paste for %s",
    (availability) => {
      expect(effective_mode("upload", availability)).toBe("paste");
    },
  );
});

describe("precheck_file", () => {
  it.each(["image/jpeg", "image/png", "image/webp", "image/gif", ""])(
    "accepts %j within the size limit",
    (type) => {
      expect(precheck_file({ type, size: 1024 })).toBeNull();
    },
  );

  it("offers the same formats in the file picker", () => {
    expect(UPLOAD_ACCEPT.split(",").sort()).toEqual([
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  it("rejects SVG", () => {
    expect(precheck_file({ type: "image/svg+xml", size: 10 })).toBe(
      "unsupported_type",
    );
  });

  it("flags HEIC separately", () => {
    expect(precheck_file({ type: "image/heic", size: 10 })).toBe(
      "heic_unsupported",
    );
  });

  it("lets an 8 MB photo through to compression", () => {
    expect(
      precheck_file({ type: "image/jpeg", size: 8 * 1024 * 1024 }),
    ).toBeNull();
  });

  it("uses the image-processing input limit", () => {
    expect(
      precheck_file({ type: "image/png", size: MAX_INPUT_BYTES }),
    ).toBeNull();
    expect(
      precheck_file({ type: "image/png", size: MAX_INPUT_BYTES + 1 }),
    ).toBe("too_large");
  });
});

describe("error mapping", () => {
  it("maps typed errors to their code", () => {
    expect(upload_error_code(new ImageUploadError("quota_exceeded"))).toBe(
      "quota_exceeded",
    );
    expect(upload_error_code(new ImageProcessingError("decode_failed"))).toBe(
      "decode_failed",
    );
    expect(upload_error_code(new TypeError("fetch failed"))).toBe("network");
  });

  it("gives every code a readable English message", () => {
    const codes = [
      "unsupported_type",
      "too_large",
      "heic_unsupported",
      "decode_failed",
      "invalid_signature",
      "payload_too_large",
      "file_missing",
      "no_such_account",
      "blacklisted",
      "quota_exceeded",
      "deplorable",
      "invalid_image",
      "invalid_username",
      "invalid_endpoint",
      "signing_unsupported",
      "signing_failed",
      "timeout",
      "aborted",
      "network",
      "http_error",
      "invalid_response",
    ] as const;
    for (const code of codes) {
      const message = image_error_message(code);
      expect(message).not.toBe(code);
      expect(message).toMatch(/^[A-Z]/);
    }
  });

  it("tells Keychain users to paste a URL", () => {
    expect(image_error_message("signing_unsupported")).toBe(
      KEYCHAIN_UPLOAD_MESSAGE,
    );
  });

  it("states the image-processing size limit and formats", () => {
    expect(UPLOAD_MAX_MB).toBe(MAX_INPUT_BYTES / 1_000_000);
    expect(image_error_message("too_large")).toContain(`${UPLOAD_MAX_MB} MB`);
    expect(image_error_message("unsupported_type")).toContain(
      "JPG, PNG, GIF or WebP",
    );
  });
});

describe("resolve_pasted_url", () => {
  it("accepts an allowlisted https URL", () => {
    expect(resolve_pasted_url(" https://images.hive.blog/DQm/a.jpg ")).toEqual({
      ok: true,
      url: "https://images.hive.blog/DQm/a.jpg",
    });
  });

  it.each([
    "",
    "http://images.hive.blog/a.jpg",
    "https://evil.example/a.jpg",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "blob:https://localhost/abc",
    `https://images.hive.blog/${"a".repeat(260)}`,
  ])("rejects %j", (raw) => {
    expect(resolve_pasted_url(raw).ok).toBe(false);
  });
});

describe("is_local_preview_url", () => {
  it("detects dev-mode blob URLs", () => {
    expect(is_local_preview_url("blob:http://localhost:4321/x")).toBe(true);
    expect(is_local_preview_url("https://images.hive.blog/a.jpg")).toBe(false);
  });
});

describe("alt_issue", () => {
  it("requires alt unless decorative", () => {
    expect(alt_issue("  ", false)).toBe("Alt text is required.");
    expect(alt_issue("", true)).toBeNull();
    expect(alt_issue("A cat", false)).toBeNull();
  });

  it("limits alt to 125 code points", () => {
    expect(alt_issue("🐝".repeat(125), false)).toBeNull();
    expect(alt_issue("a".repeat(126), true)).toMatch(/too long/);
  });
});

describe("field_alt_issue", () => {
  const base = { alt: "", decorative: false, hide_alt: false, has_image: true };

  it("requires alt on a visible alt field with an image", () => {
    expect(field_alt_issue(base)).toBe("Alt text is required.");
  });

  it("skips validation when the alt field is hidden or empty", () => {
    expect(field_alt_issue({ ...base, hide_alt: true })).toBeNull();
    expect(
      field_alt_issue({ ...base, hide_alt: true, alt: "a".repeat(200) }),
    ).toBeNull();
    expect(field_alt_issue({ ...base, has_image: false })).toBeNull();
  });
});

describe("build_image_ref", () => {
  it("trims alt and keeps valid dimensions", () => {
    expect(
      build_image_ref({ url: "https://x", alt: " Cat ", w: 1200, h: 630 }),
    ).toEqual({ url: "https://x", alt: "Cat", w: 1200, h: 630 });
  });

  it("drops out-of-range or partial dimensions and false decorative", () => {
    expect(
      build_image_ref({
        url: "https://x",
        alt: "a",
        w: 9000,
        h: 100,
        decorative: false,
      }),
    ).toEqual({ url: "https://x", alt: "a" });
    expect(build_image_ref({ url: "https://x", alt: "a", w: 10 })).toEqual({
      url: "https://x",
      alt: "a",
    });
  });

  it("sets decorative only when true", () => {
    expect(
      build_image_ref({ url: "https://x", alt: "", decorative: true }),
    ).toEqual({ url: "https://x", alt: "", decorative: true });
  });
});

describe("image_warnings", () => {
  const recommended = { ratio: 16 / 9, ratio_label: "16:9", min_width: 1600 };

  it("is silent without dimensions or recommendation", () => {
    expect(image_warnings({}, recommended)).toEqual([]);
    expect(image_warnings({ w: 10, h: 10 }, undefined)).toEqual([]);
  });

  it("accepts ratio within 10%", () => {
    expect(image_warnings({ w: 2400, h: 1350 }, recommended)).toEqual([]);
    expect(image_warnings({ w: 2400, h: 1450 }, recommended)).toEqual([]);
  });

  it("warns about ratio and width", () => {
    const warnings = image_warnings({ w: 800, h: 800 }, recommended);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("16:9");
    expect(warnings[1]).toContain("1600");
  });
});
