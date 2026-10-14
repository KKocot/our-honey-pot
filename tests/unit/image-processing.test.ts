// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ImageProcessingError,
  MAX_INPUT_BYTES,
  TARGET_BYTES,
  detect_image_format,
  fit_dimensions,
  process_image_for_upload,
} from "../../src/lib/image-processing";

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xf0, 0x00, 0, 0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
const HEIC = [0, 0, 0, 0x18, ...ascii("ftypheic")];
const HEIF = [0, 0, 0, 0x18, ...ascii("ftypmif1")];

function make_file(header: number[], name = "photo.bin", padding = 0): File {
  const bytes = new Uint8Array(header.length + padding);
  bytes.set(header);
  return new File([bytes], name);
}

function oversized_file(header: number[]): File {
  const file = make_file(header, "big.jpg");
  Object.defineProperty(file, "size", { value: MAX_INPUT_BYTES + 1 });
  return file;
}

interface CanvasMockOptions {
  width: number;
  height: number;
  blob_sizes?: number[];
}

function mock_canvas({
  width,
  height,
  blob_sizes = [1000],
}: CanvasMockOptions) {
  const close = vi.fn();
  const create_image_bitmap = vi.fn(async () => ({ width, height, close }));
  const encoded: {
    type: string;
    quality?: number;
    width: number;
    height: number;
  }[] = [];
  let call = 0;

  class FakeOffscreenCanvas {
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext() {
      return { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    }
    async convertToBlob(options: { type: string; quality?: number }) {
      encoded.push({ ...options, width: this.width, height: this.height });
      const size = blob_sizes[Math.min(call++, blob_sizes.length - 1)];
      return new Blob([new Uint8Array(size)], { type: options.type });
    }
  }

  vi.stubGlobal("createImageBitmap", create_image_bitmap);
  vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  return { create_image_bitmap, close, encoded };
}

async function expect_code(promise: Promise<unknown>, code: string) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ImageProcessingError);
  expect((error as ImageProcessingError).code).toBe(code);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detect_image_format", () => {
  it.each([
    ["jpeg", JPEG],
    ["png", PNG],
    ["gif", GIF],
    ["webp", WEBP],
    ["heic", HEIC],
    ["heic", HEIF],
    ["svg", ascii("<svg xmlns=1")],
    ["svg", ascii("  <?xml vers")],
    ["unknown", ascii("<html><body>")],
    ["unknown", [0xff, 0xd8]],
  ])("detects %s", (expected, header) => {
    expect(detect_image_format(new Uint8Array(header))).toBe(expected);
  });

  it("rejects RIFF containers that are not WEBP", () => {
    expect(
      detect_image_format(
        new Uint8Array([...WEBP.slice(0, 8), ...ascii("AVI ")]),
      ),
    ).toBe("unknown");
  });
});

describe("fit_dimensions", () => {
  it("keeps images within the limit", () => {
    expect(fit_dimensions(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it("scales the longer side to 3840 px", () => {
    expect(fit_dimensions(7680, 4320)).toEqual({ width: 3840, height: 2160 });
    expect(fit_dimensions(3000, 6000)).toEqual({ width: 1920, height: 3840 });
  });
});

describe("process_image_for_upload — rejections", () => {
  it("rejects files above 15 MB before reading content", async () => {
    const file = oversized_file(JPEG);
    const slice = vi.spyOn(file, "slice");
    const array_buffer = vi.spyOn(file, "arrayBuffer");
    await expect_code(process_image_for_upload(file), "too_large");
    expect(slice).not.toHaveBeenCalled();
    expect(array_buffer).not.toHaveBeenCalled();
  });

  it("rejects oversized GIF", async () => {
    await expect_code(
      process_image_for_upload(oversized_file(GIF)),
      "too_large",
    );
  });

  it("rejects SVG even with an image extension", async () => {
    await expect_code(
      process_image_for_upload(make_file(ascii("<svg onload="), "x.png")),
      "unsupported_type",
    );
  });

  it("rejects unknown content", async () => {
    await expect_code(
      process_image_for_upload(make_file(ascii("hello world!"), "x.jpg")),
      "unsupported_type",
    );
  });

  it("rejects HEIC and HEIF with a dedicated code", async () => {
    await expect_code(
      process_image_for_upload(make_file(HEIC, "a.heic")),
      "heic_unsupported",
    );
    await expect_code(
      process_image_for_upload(make_file(HEIF, "a.heif")),
      "heic_unsupported",
    );
  });

  it("maps decode errors to decode_failed", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => Promise.reject(new Error("bad"))),
    );
    await expect_code(
      process_image_for_upload(make_file(JPEG, "a.jpg", 100)),
      "decode_failed",
    );
  });

  it("reports decode_failed when createImageBitmap is unavailable", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    await expect_code(
      process_image_for_upload(make_file(PNG, "a.png", 100)),
      "decode_failed",
    );
  });
});

describe("process_image_for_upload — processing", () => {
  it("passes GIF through untouched with header dimensions", async () => {
    const { create_image_bitmap } = mock_canvas({ width: 1, height: 1 });
    const file = make_file(GIF, "anim.GIF", 50);
    const result = await process_image_for_upload(file);
    expect(result.mime).toBe("image/gif");
    expect(result.width).toBe(320);
    expect(result.height).toBe(240);
    expect(result.name).toBe("anim.gif");
    expect(result.bytes).toEqual(new Uint8Array(await file.arrayBuffer()));
    expect(create_image_bitmap).not.toHaveBeenCalled();
  });

  it("keeps small images within limits as original bytes", async () => {
    const { encoded, close } = mock_canvas({ width: 800, height: 600 });
    const file = make_file(PNG, "logo.png", 100);
    const result = await process_image_for_upload(file);
    expect(result).toMatchObject({
      mime: "image/png",
      width: 800,
      height: 600,
      name: "logo.png",
    });
    expect(result.bytes).toEqual(new Uint8Array(await file.arrayBuffer()));
    expect(encoded).toHaveLength(0);
    expect(close).toHaveBeenCalled();
  });

  it("resizes JPEG above 3840 px and encodes at q0.85", async () => {
    const { encoded } = mock_canvas({
      width: 8000,
      height: 4000,
      blob_sizes: [2000],
    });
    const result = await process_image_for_upload(
      make_file(JPEG, "wide.jpeg", 100),
    );
    expect(result).toMatchObject({
      mime: "image/jpeg",
      width: 3840,
      height: 1920,
      name: "wide.jpg",
    });
    expect(result.bytes.length).toBe(2000);
    expect(encoded).toEqual([
      { type: "image/jpeg", quality: 0.85, width: 3840, height: 1920 },
    ]);
  });

  it("keeps PNG format after resize when it fits the target", async () => {
    const { encoded } = mock_canvas({
      width: 5000,
      height: 5000,
      blob_sizes: [TARGET_BYTES],
    });
    const result = await process_image_for_upload(
      make_file(PNG, "big.png", 100),
    );
    expect(result.mime).toBe("image/png");
    expect(result.name).toBe("big.png");
    expect(encoded[0].type).toBe("image/png");
  });

  it("falls back to JPEG when PNG exceeds the target and lowers quality towards ~6 MB", async () => {
    const { encoded } = mock_canvas({
      width: 5000,
      height: 2500,
      blob_sizes: [TARGET_BYTES + 1, TARGET_BYTES + 1, TARGET_BYTES - 1],
    });
    const result = await process_image_for_upload(
      make_file(PNG, "shot.png", 100),
    );
    expect(result.mime).toBe("image/jpeg");
    expect(result.name).toBe("shot.jpg");
    expect(encoded.map((e) => e.type)).toEqual([
      "image/png",
      "image/jpeg",
      "image/jpeg",
    ]);
    expect(encoded[1].quality).toBe(0.85);
    expect(encoded[2].quality).toBeCloseTo(0.75);
  });

  it("re-encodes WebP within dimensions but above 6 MB", async () => {
    const { encoded } = mock_canvas({
      width: 2000,
      height: 1000,
      blob_sizes: [1000],
    });
    const file = make_file(WEBP, "pic.webp", 100);
    Object.defineProperty(file, "size", { value: TARGET_BYTES + 1 });
    const result = await process_image_for_upload(file);
    expect(result).toMatchObject({
      mime: "image/webp",
      width: 2000,
      height: 1000,
    });
    expect(encoded).toHaveLength(1);
  });

  it("rejects when even the lowest quality exceeds 15 MB", async () => {
    mock_canvas({
      width: 6000,
      height: 6000,
      blob_sizes: [MAX_INPUT_BYTES + 1],
    });
    await expect_code(
      process_image_for_upload(make_file(JPEG, "huge.jpg", 100)),
      "too_large",
    );
  });
});
