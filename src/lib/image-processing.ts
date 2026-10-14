// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

// Client-side image preparation before upload to images.hive.blog.
// Ported from denser (apps/blog/features/post-editor/lib/image-processing.ts), without HEIC decoding.

export const MAX_INPUT_BYTES = 15_000_000;
export const TARGET_BYTES = 6_000_000;
export const MAX_DIMENSION = 3840;
export const JPEG_QUALITY = 0.85;
const MIN_JPEG_QUALITY = 0.6;
const QUALITY_STEP = 0.1;
const HEADER_BYTES = 12;

export type DetectedFormat =
  "jpeg" | "png" | "gif" | "webp" | "heic" | "svg" | "unknown";
export type ImageMime = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
export type ImageProcessingErrorCode =
  "unsupported_type" | "too_large" | "heic_unsupported" | "decode_failed";

export interface ProcessedImage {
  bytes: Uint8Array;
  mime: ImageMime;
  width: number;
  height: number;
  name: string;
}

export class ImageProcessingError extends Error {
  readonly code: ImageProcessingErrorCode;

  constructor(code: ImageProcessingErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ImageProcessingError";
    this.code = code;
  }
}

const MIME_BY_FORMAT: Record<"jpeg" | "png" | "gif" | "webp", ImageMime> = {
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

const EXTENSION_BY_MIME: Record<ImageMime, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "mif1",
  "msf1",
  "avif",
]);

function starts_with(
  header: Uint8Array,
  signature: number[],
  offset = 0,
): boolean {
  if (header.length < offset + signature.length) return false;
  return signature.every((byte, i) => header[offset + i] === byte);
}

/** Detects image format from the first 12 bytes; declared MIME and extension are ignored. */
export function detect_image_format(header: Uint8Array): DetectedFormat {
  if (starts_with(header, [0xff, 0xd8, 0xff])) return "jpeg";
  if (starts_with(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "png";
  if (starts_with(header, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (
    starts_with(header, [0x52, 0x49, 0x46, 0x46]) &&
    starts_with(header, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "webp";
  }
  if (
    starts_with(header, [0x66, 0x74, 0x79, 0x70], 4) &&
    header.length >= HEADER_BYTES
  ) {
    const brand = String.fromCharCode(
      header[8],
      header[9],
      header[10],
      header[11],
    );
    if (HEIF_BRANDS.has(brand)) return "heic";
  }
  const text = new TextDecoder().decode(header).replace(/^﻿/, "").trimStart();
  if (text.startsWith("<svg") || text.startsWith("<?xml")) return "svg";
  return "unknown";
}

/** Scales dimensions so the longer side fits within max_dimension, preserving aspect ratio. */
export function fit_dimensions(
  width: number,
  height: number,
  max_dimension: number = MAX_DIMENSION,
): { width: number; height: number } {
  const longer = Math.max(width, height);
  if (longer <= max_dimension) return { width, height };
  const scale = max_dimension / longer;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function replace_extension(file_name: string, extension: string): string {
  const dot = file_name.lastIndexOf(".");
  const base = dot > 0 ? file_name.slice(0, dot) : file_name || "image";
  return base + extension;
}

function read_gif_dimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} {
  if (bytes.length < 10) throw new ImageProcessingError("decode_failed");
  return {
    width: bytes[6] | (bytes[7] << 8),
    height: bytes[8] | (bytes[9] << 8),
  };
}

async function decode_bitmap(source: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== "function") {
    throw new ImageProcessingError(
      "decode_failed",
      "createImageBitmap is unavailable",
    );
  }
  try {
    return await createImageBitmap(source);
  } catch {
    throw new ImageProcessingError("decode_failed");
  }
}

async function encode_bitmap(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  mime: ImageMime,
  quality: number,
): Promise<Blob> {
  const quality_param = mime === "image/png" ? undefined : quality;
  // JPEG has no alpha; paint white first so transparent pixels do not turn black.
  const fill_white = mime === "image/jpeg";

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new ImageProcessingError("decode_failed", "2d context unavailable");
    if (fill_white) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: mime, quality: quality_param });
  }

  if (typeof document === "undefined") {
    throw new ImageProcessingError("decode_failed", "canvas is unavailable");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx)
    throw new ImageProcessingError("decode_failed", "2d context unavailable");
  if (fill_white) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new ImageProcessingError("decode_failed")),
      mime,
      quality_param,
    );
  });
}

async function encode_within_target(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  source_mime: ImageMime,
): Promise<{ blob: Blob; mime: ImageMime }> {
  if (source_mime !== "image/jpeg") {
    const blob = await encode_bitmap(
      bitmap,
      width,
      height,
      source_mime,
      JPEG_QUALITY,
    );
    if (blob.size <= TARGET_BYTES) return { blob, mime: source_mime };
  }

  let quality = JPEG_QUALITY;
  let blob = await encode_bitmap(bitmap, width, height, "image/jpeg", quality);
  while (
    blob.size > TARGET_BYTES &&
    quality - QUALITY_STEP >= MIN_JPEG_QUALITY - 1e-9
  ) {
    quality -= QUALITY_STEP;
    blob = await encode_bitmap(bitmap, width, height, "image/jpeg", quality);
  }
  return { blob, mime: "image/jpeg" };
}

/**
 * Validates and prepares an image for upload: magic-bytes whitelist, 15 MB hard limit,
 * resize to 3840 px and JPEG q0.85 compression towards ~6 MB. Browser-only for re-encoding.
 * @throws ImageProcessingError with a typed `code`
 */
export async function process_image_for_upload(
  file: File,
): Promise<ProcessedImage> {
  if (file.size > MAX_INPUT_BYTES) throw new ImageProcessingError("too_large");

  const header = new Uint8Array(
    await file.slice(0, HEADER_BYTES).arrayBuffer(),
  );
  const format = detect_image_format(header);
  if (format === "heic") throw new ImageProcessingError("heic_unsupported");
  if (format === "svg" || format === "unknown")
    throw new ImageProcessingError("unsupported_type");

  const source_mime = MIME_BY_FORMAT[format];

  // Re-encoding a GIF through canvas would drop its animation frames.
  if (format === "gif") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { width, height } = read_gif_dimensions(bytes);
    return {
      bytes,
      mime: source_mime,
      width,
      height,
      name: replace_extension(file.name, ".gif"),
    };
  }

  const bitmap = await decode_bitmap(file);
  try {
    const target = fit_dimensions(bitmap.width, bitmap.height);
    const needs_resize =
      target.width !== bitmap.width || target.height !== bitmap.height;

    if (!needs_resize && file.size <= TARGET_BYTES) {
      return {
        bytes: new Uint8Array(await file.arrayBuffer()),
        mime: source_mime,
        width: bitmap.width,
        height: bitmap.height,
        name: replace_extension(file.name, EXTENSION_BY_MIME[source_mime]),
      };
    }

    const { blob, mime } = await encode_within_target(
      bitmap,
      target.width,
      target.height,
      source_mime,
    );
    if (blob.size > MAX_INPUT_BYTES)
      throw new ImageProcessingError("too_large");

    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mime,
      width: target.width,
      height: target.height,
      name: replace_extension(file.name, EXTENSION_BY_MIME[mime]),
    };
  } finally {
    bitmap.close();
  }
}
